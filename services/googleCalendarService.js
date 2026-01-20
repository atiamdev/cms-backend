const { google } = require("googleapis");
const { LiveSession } = require("../models/elearning");

class GoogleCalendarService {
  constructor() {
    this.calendar = google.calendar("v3");
  }

  /**
   * Get OAuth2 client for a user
   * @param {Object} tokens - OAuth tokens for the user
   * @returns {OAuth2Client}
   */
  getOAuth2Client(tokens) {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI ||
        `${
          process.env.BACKEND_URL || "http://localhost:5000"
        }/api/auth/google/callback`,
    );

    oauth2Client.setCredentials(tokens);
    return oauth2Client;
  }

  /**
   * Create a Google Calendar event with Meet conference
   * @param {Object} params
   * @param {Object} params.tokens - User's OAuth tokens
   * @param {string} params.userId - User ID for token refresh
   * @param {string} params.summary - Event title
   * @param {string} params.description - Event description
   * @param {Date} params.startTime - Start time
   * @param {Date} params.endTime - End time
   * @param {string} params.timezone - Timezone
   * @param {Array} params.attendees - Array of attendee emails
   * @returns {Object} - Created event data
   */
  async createMeetEvent({
    tokens,
    userId,
    summary,
    description = "",
    startTime,
    endTime,
    timezone = "UTC",
    attendees = [],
  }) {
    const oauth2Client = this.getOAuth2Client(tokens);

    const event = {
      summary,
      description,
      start: {
        dateTime: startTime.toISOString(),
        timeZone: timezone,
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: timezone,
      },
      attendees: attendees.map((email) => ({ email })),
      conferenceData: {
        createRequest: {
          requestId: `meet-${Date.now()}-${Math.random()
            .toString(36)
            .substr(2, 9)}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    };

    try {
      const response = await this.calendar.events.insert({
        auth: oauth2Client,
        calendarId: "primary",
        resource: event,
        conferenceDataVersion: 1,
      });

      return {
        eventId: response.data.id,
        meetLink:
          response.data.hangoutLink ||
          response.data.conferenceData?.entryPoints?.find(
            (ep) => ep.entryPointType === "video",
          )?.uri,
        htmlLink: response.data.htmlLink,
        eventData: response.data,
      };
    } catch (error) {
      // If token is invalid/expired, try to refresh it
      if (
        (error.message.includes("invalid_grant") ||
          error.message.includes("access_denied") ||
          error.message.includes("invalid_token") ||
          error.code === 401) &&
        userId &&
        tokens.refresh_token
      ) {
        try {
          const refreshedTokens = await this.refreshTokens(tokens);

          // Update user's tokens in database
          const User = require("../models/User");
          await User.findByIdAndUpdate(userId, {
            googleTokens: refreshedTokens,
          });

          // Retry with refreshed tokens
          const newOauth2Client = this.getOAuth2Client(refreshedTokens);
          const retryResponse = await this.calendar.events.insert({
            auth: newOauth2Client,
            calendarId: "primary",
            resource: event,
            conferenceDataVersion: 1,
          });

          return {
            eventId: retryResponse.data.id,
            meetLink:
              retryResponse.data.hangoutLink ||
              retryResponse.data.conferenceData?.entryPoints?.find(
                (ep) => ep.entryPointType === "video",
              )?.uri,
            htmlLink: retryResponse.data.htmlLink,
            eventData: retryResponse.data,
          };
        } catch (refreshError) {
          console.error("Error refreshing tokens and retrying:", refreshError);
          throw new Error(
            `Failed to create Google Meet event: Token refresh failed`,
          );
        }
      }

      console.error("Error creating Google Meet event:", error);
      throw new Error(`Failed to create Google Meet event: ${error.message}`);
    }
  }

  /**
   * Update an existing Google Calendar event
   * @param {Object} params
   * @param {Object} params.tokens - User's OAuth tokens
   * @param {string} params.eventId - Google event ID
   * @param {Object} params.updates - Fields to update
   * @returns {Object} - Updated event data
   */
  async updateMeetEvent({ tokens, userId, eventId, updates }) {
    const oauth2Client = this.getOAuth2Client(tokens);

    try {
      const response = await this.calendar.events.patch({
        auth: oauth2Client,
        calendarId: "primary",
        eventId,
        resource: updates,
        conferenceDataVersion: 1,
      });

      return {
        eventId: response.data.id,
        meetLink:
          response.data.hangoutLink ||
          response.data.conferenceData?.entryPoints?.find(
            (ep) => ep.entryPointType === "video",
          )?.uri,
        htmlLink: response.data.htmlLink,
        eventData: response.data,
      };
    } catch (error) {
      // If token is invalid/expired, try to refresh it
      if (
        (error.message.includes("invalid_grant") ||
          error.message.includes("access_denied") ||
          error.message.includes("invalid_token") ||
          error.code === 401) &&
        userId &&
        tokens.refresh_token
      ) {
        try {
          const refreshedTokens = await this.refreshTokens(tokens);

          // Update user's tokens in database
          const User = require("../models/User");
          await User.findByIdAndUpdate(userId, {
            googleTokens: refreshedTokens,
          });

          // Retry with refreshed tokens
          const newOauth2Client = this.getOAuth2Client(refreshedTokens);
          const retryResponse = await this.calendar.events.patch({
            auth: newOauth2Client,
            calendarId: "primary",
            eventId,
            resource: updates,
            conferenceDataVersion: 1,
          });

          return {
            eventId: retryResponse.data.id,
            meetLink:
              retryResponse.data.hangoutLink ||
              retryResponse.data.conferenceData?.entryPoints?.find(
                (ep) => ep.entryPointType === "video",
              )?.uri,
            htmlLink: retryResponse.data.htmlLink,
            eventData: retryResponse.data,
          };
        } catch (refreshError) {
          console.error("Error refreshing tokens for update:", refreshError);
          throw new Error(
            `Failed to update Google Meet event after token refresh: ${refreshError.message}`,
          );
        }
      }

      console.error("Error updating Google Meet event:", error);
      throw new Error(`Failed to update Google Meet event: ${error.message}`);
    }
  }

  /**
   * Delete a Google Calendar event
   * @param {Object} params
   * @param {Object} params.tokens - User's OAuth tokens
   * @param {string} params.eventId - Google event ID
   */
  async deleteMeetEvent({ tokens, userId, eventId }) {
    const oauth2Client = this.getOAuth2Client(tokens);

    try {
      await this.calendar.events.delete({
        auth: oauth2Client,
        calendarId: "primary",
        eventId,
      });
    } catch (error) {
      // If token is invalid/expired, try to refresh it
      if (
        (error.message.includes("invalid_grant") ||
          error.message.includes("access_denied") ||
          error.message.includes("invalid_token") ||
          error.code === 401) &&
        userId &&
        tokens.refresh_token
      ) {
        try {
          const refreshedTokens = await this.refreshTokens(tokens);

          // Update user's tokens in database
          const User = require("../models/User");
          await User.findByIdAndUpdate(userId, {
            googleTokens: refreshedTokens,
          });

          // Retry with refreshed tokens
          const newOauth2Client = this.getOAuth2Client(refreshedTokens);
          await this.calendar.events.delete({
            auth: newOauth2Client,
            calendarId: "primary",
            eventId,
          });
        } catch (refreshError) {
          console.error("Error refreshing tokens for delete:", refreshError);
          throw new Error(
            `Failed to delete Google Meet event after token refresh: ${refreshError.message}`,
          );
        }
      } else {
        console.error("Error deleting Google Meet event:", error);
        throw new Error(`Failed to delete Google Meet event: ${error.message}`);
      }
    }
  }

  /**
   * Get event details
   * @param {Object} params
   * @param {Object} params.tokens - User's OAuth tokens
   * @param {string} params.eventId - Google event ID
   * @returns {Object} - Event data
   */
  async getEvent({ tokens, eventId }) {
    const oauth2Client = this.getOAuth2Client(tokens);

    try {
      const response = await this.calendar.events.get({
        auth: oauth2Client,
        calendarId: "primary",
        eventId,
      });

      return response.data;
    } catch (error) {
      console.error("Error getting Google Calendar event:", error);
      throw new Error(`Failed to get Google Calendar event: ${error.message}`);
    }
  }

  /**
   * Refresh OAuth tokens if needed
   * @param {Object} tokens - Current tokens
   * @returns {Object} - Refreshed tokens
   */
  async refreshTokens(tokens) {
    const oauth2Client = this.getOAuth2Client(tokens);

    try {
      // Use the newer refreshToken method instead of deprecated refreshAccessToken
      const { credentials } = await oauth2Client.refreshToken(
        tokens.refresh_token,
      );
      return {
        ...tokens,
        access_token: credentials.access_token,
        refresh_token: credentials.refresh_token || tokens.refresh_token, // Refresh token might be rotated
        expiry_date: credentials.expiry_date,
        token_type: credentials.token_type || tokens.token_type,
        scope: credentials.scope || tokens.scope,
      };
    } catch (error) {
      console.error("Error refreshing tokens:", error);
      throw new Error(
        `Failed to refresh Google OAuth tokens: ${error.message}`,
      );
    }
  }
}

module.exports = new GoogleCalendarService();
