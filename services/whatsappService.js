/**
 * WhatsApp Service
 *
 * Core service for sending WhatsApp messages using WasenderAPI.
 * Handles message sending, phone number formatting, rate limiting,
 * and error handling with graceful degradation.
 */

require("dotenv").config();
const { createWasender } = require("wasenderapi");

// Import fetch for Node.js environment (use global fetch if available, fallback to node-fetch)
let fetchImpl;
try {
  fetchImpl = global.fetch || require("node-fetch");
} catch (error) {
  fetchImpl = require("node-fetch");
}

class WhatsAppService {
  constructor() {
    this.isEnabled = process.env.WHATSAPP_ENABLED === "true";
    this.wasender = null;
    this.rateLimitDelay =
      parseInt(process.env.WHATSAPP_RATE_LIMIT_DELAY) || 1000;
    this.maxRetries = parseInt(process.env.WHATSAPP_MAX_RETRIES) || 3;

    if (this.isEnabled) {
      this.initialize();
    }
  }

  /**
   * Initialize the WasenderAPI SDK
   */
  initialize() {
    try {
      this.wasender = createWasender(
        process.env.WASENDER_API_KEY,
        process.env.WASENDER_PERSONAL_ACCESS_TOKEN,
        process.env.WASENDER_BASE_URL || "https://www.wasenderapi.com/api",
        fetchImpl, // Pass fetch implementation
        {
          enabled: true,
          maxRetries: this.maxRetries,
        },
        process.env.WASENDER_WEBHOOK_SECRET,
      );
      console.log("✅ WhatsApp service initialized successfully");
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
    if (!this.isEnabled || !this.wasender) {
      console.log("WhatsApp service disabled or not initialized");
      return { success: false, reason: "service_disabled" };
    }

    // Format phone number (ensure international format)
    const formattedNumber = this.formatPhoneNumber(phoneNumber);
    if (!formattedNumber) {
      return { success: false, reason: "invalid_phone" };
    }

    try {
      const payload = {
        messageType: "text",
        to: formattedNumber,
        text: message,
      };

      const result = await this.wasender.send(payload);

      // Rate limiting delay
      await this.delay(this.rateLimitDelay);

      return {
        success: true,
        messageId: result.response?.message?.id,
        rateLimit: result.rateLimit,
      };
    } catch (error) {
      console.error("WhatsApp send error:", error.message);
      return { success: false, error: error.message };
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

    // Remove all non-numeric characters except +
    let cleaned = phone.replace(/[^\d+]/g, "");

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
      initialized: this.wasender !== null,
      rateLimitDelay: this.rateLimitDelay,
      maxRetries: this.maxRetries,
    };
  }
}

module.exports = new WhatsAppService();
