/**
 * WhatsApp Service - Meta Cloud API Implementation
 *
 * Core service for sending WhatsApp messages using Meta's official
 * WhatsApp Business Cloud API (direct integration, no third-party wrapper).
 * Handles message sending, phone number formatting, rate limiting,
 * and error handling with retry logic.
 */

require("dotenv").config();
const axios = require("axios");
const WhatsAppMessageStatus = require("../models/WhatsAppMessageStatus");

class WhatsAppService {
  constructor() {
    this.isEnabled = process.env.WHATSAPP_ENABLED === "true";

    // Meta API credentials
    this.phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
    this.accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
    this.apiVersion = process.env.META_WHATSAPP_API_VERSION || "v21.0";
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;

    // Rate limiting (same as before)
    this.rateLimitDelay =
      parseInt(process.env.WHATSAPP_RATE_LIMIT_DELAY) || 100;
    this.maxRetries = parseInt(process.env.WHATSAPP_MAX_RETRIES) || 3;

    if (this.isEnabled) {
      this.initialize();
    }
  }

  /**
   * Initialize the WhatsApp service
   */
  initialize() {
    try {
      // Validate Meta API credentials
      if (!this.phoneNumberId || !this.accessToken) {
        throw new Error(
          "Meta WhatsApp API credentials missing. Please set META_WHATSAPP_PHONE_NUMBER_ID and META_WHATSAPP_ACCESS_TOKEN",
        );
      }
      console.log(
        "✅ WhatsApp service initialized successfully (Meta Cloud API)",
      );
    } catch (error) {
      console.error("❌ Failed to initialize WhatsApp service:", error.message);
      this.isEnabled = false;
    }
  }

  /**
   * Send a WhatsApp message
   * @param {string} phoneNumber - Recipient phone number
   * @param {string} message - Message content
   * @param {object} options - Additional options
   * @returns {Promise<object>} Result object with success status
   */
  async sendMessage(phoneNumber, message, options = {}) {
    if (!this.isEnabled) {
      console.log("WhatsApp service disabled or not initialized");
      return { success: false, reason: "service_disabled" };
    }

    // Format phone number (ensure international format)
    const formattedNumber = this.formatPhoneNumber(phoneNumber);
    if (!formattedNumber) {
      return { success: false, reason: "invalid_phone" };
    }

    // Retry logic
    let lastError = null;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await this.sendWithMetaAPI(
          formattedNumber,
          message,
          options,
        );

        // Rate limiting delay
        await this.delay(this.rateLimitDelay);

        return result;
      } catch (error) {
        lastError = error;
        console.error(
          `WhatsApp send error (attempt ${attempt}/${this.maxRetries}):`,
          error.message,
        );

        // Wait before retry (exponential backoff)
        if (attempt < this.maxRetries) {
          const backoffMs = Math.pow(2, attempt) * 1000;
          await this.delay(backoffMs);
        }
      }
    }

    return {
      success: false,
      error: lastError?.message || "Failed after retries",
      attempts: this.maxRetries,
    };
  }

  /**
   * Send message using Meta Cloud API
   * @private
   */
  async sendWithMetaAPI(phoneNumber, message, options = {}) {
    const url = `${this.baseUrl}/${this.phoneNumberId}/messages`;

    // Build message payload
    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: phoneNumber,
      type: "text",
      text: {
        preview_url: false,
        body: message,
      },
    };

    // Send request
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      timeout: 30000, // 30 second timeout
    });

    // Parse response
    if (
      response.data &&
      response.data.messages &&
      response.data.messages.length > 0
    ) {
      const result = {
        success: true,
        messageId: response.data.messages[0].id,
        waId: response.data.contacts?.[0]?.wa_id || phoneNumber,
        provider: "meta",
      };

      // Save message status to database for tracking
      try {
        await WhatsAppMessageStatus.create({
          messageId: result.messageId,
          recipient: phoneNumber,
          status: "sent",
          messageType: options.messageType || "general",
          relatedEntity: options.relatedEntity || {},
          timestamps: {
            queued: options.queuedAt || new Date(),
            sent: new Date(),
          },
          metadata: options.metadata || {},
        });
      } catch (dbError) {
        // Log but don't fail the message send if DB save fails
        console.error(
          "⚠️ Failed to save message status to DB:",
          dbError.message,
        );
      }

      return result;
    } else {
      throw new Error("Invalid response from Meta API");
    }
  }

  /**
   * Format phone number to international format
   * Supports international phone numbers from any country
   * @param {string} phone - Phone number to format
   * @returns {string|null} Formatted phone number or null if invalid
   */
  formatPhoneNumber(phone) {
    if (!phone) return null;

    // Ensure phone is a string (handle objects, numbers, etc.)
    let phoneStr = phone;
    if (typeof phone !== "string") {
      // If it's an object with phoneNumber property
      if (phone.phoneNumber) {
        phoneStr = String(phone.phoneNumber);
      } else {
        // Convert to string
        phoneStr = String(phone);
      }
    }

    // Remove all non-numeric characters except +
    let cleaned = phoneStr.replace(/[^\d+]/g, "");

    // Handle different formats
    if (cleaned.startsWith("+")) {
      // Already in international format: +1234567890 -> 1234567890
      cleaned = cleaned.substring(1);
    } else if (cleaned.startsWith("00")) {
      // International format with 00 prefix: 001234567890 -> 1234567890
      cleaned = cleaned.substring(2);
    }

    // Validate the cleaned number
    if (!cleaned || cleaned.length < 7 || cleaned.length > 15) {
      return null;
    }

    // Handle Kenyan phone numbers specifically (before general validation)
    if (cleaned.length === 9 && cleaned.startsWith("7")) {
      // Kenyan number without country code: 712345678 → 254712345678
      return "254" + cleaned;
    }

    if (cleaned.length === 10 && cleaned.startsWith("07")) {
      // Kenyan number with leading 0: 0712345678 → 254712345678
      return "254" + cleaned.substring(1);
    }

    // Check if it looks like a valid international number
    // Should start with country code (1-3 digits) followed by subscriber number
    const countryCodeMatch = cleaned.match(/^(\d{1,3})(\d{6,12})$/);
    if (!countryCodeMatch) {
      return null;
    }

    const countryCode = countryCodeMatch[1];
    const subscriberNumber = countryCodeMatch[2];

    // Basic validation of country codes (allow common international codes)
    // Country codes are typically 1-3 digits, followed by 6-12 digit subscriber numbers
    const validCountryCodeLengths = [1, 2, 3]; // 1, 2, or 3 digit country codes
    const validSubscriberLengths = [6, 7, 8, 9, 10, 11, 12]; // 6-12 digit subscriber numbers

    if (!validCountryCodeLengths.includes(countryCode.length)) {
      return null;
    }

    if (!validSubscriberLengths.includes(subscriberNumber.length)) {
      return null;
    }

    // Additional validation: country code should not start with 0
    if (countryCode.startsWith("0")) {
      return null;
    }

    // Basic country code validation - reject obviously invalid codes
    const countryCodeNum = parseInt(countryCode);
    if (countryCodeNum < 1 || countryCodeNum > 999) {
      return null;
    }

    return cleaned;
  }

  /**
   * Utility function for delays (rate limiting)
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} Promise that resolves after delay
   */
  async delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get service status
   * @returns {object} Service status information
   */
  getStatus() {
    return {
      enabled: this.isEnabled,
      provider: "meta",
      initialized: !!this.phoneNumberId && !!this.accessToken,
      rateLimitDelay: this.rateLimitDelay,
      maxRetries: this.maxRetries,
      apiVersion: this.apiVersion,
    };
  }

  /**
   * Verify webhook request from Meta
   * @param {string} mode - Hub mode
   * @param {string} token - Verify token
   * @param {string} challenge - Challenge string
   * @returns {string|null} Challenge if valid, null otherwise
   */
  static verifyWebhook(mode, token, challenge) {
    const VERIFY_TOKEN = process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN;

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return challenge;
    }

    return null;
  }
}

module.exports = new WhatsAppService();
