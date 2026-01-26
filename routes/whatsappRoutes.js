const express = require("express");
const { protect, requireAdmin } = require("../middlewares/auth");
const whatsAppService = require("../services/whatsappService");

const router = express.Router();

/**
 * @route   GET /api/whatsapp/status
 * @desc    Get WhatsApp service status
 * @access  Admin only
 */
router.get("/status", protect, requireAdmin, (req, res) => {
  try {
    const status = {
      enabled: whatsAppService.isEnabled,
      initialized: whatsAppService.wasender !== null,
      integrationEnabled: process.env.WHATSAPP_ENABLED === "true",
      rateLimitDelay: whatsAppService.rateLimitDelay,
      maxRetries: whatsAppService.maxRetries,
      timestamp: new Date().toISOString(),
    };

    res.json({
      success: true,
      message: "WhatsApp service status retrieved successfully",
      data: status,
    });
  } catch (error) {
    console.error("Error getting WhatsApp status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve WhatsApp service status",
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/whatsapp/test
 * @desc    Send a test WhatsApp message
 * @access  Admin only
 */
router.post("/test", protect, requireAdmin, async (req, res) => {
  try {
    const { phoneNumber, message } = req.body;

    // Validate required fields
    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required",
      });
    }

    if (!message) {
      return res.status(400).json({
        success: false,
        message: "Message is required",
      });
    }

    // Send test message
    const result = await whatsAppService.sendMessage(phoneNumber, message, {
      testMode: true,
    });

    if (result.success) {
      res.json({
        success: true,
        message: "Test WhatsApp message sent successfully",
        data: {
          messageId: result.messageId,
          rateLimit: result.rateLimit,
          phoneNumber: whatsAppService.formatPhoneNumber(phoneNumber),
        },
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Failed to send test WhatsApp message",
        error: result.error || result.reason,
      });
    }
  } catch (error) {
    console.error("Error sending test WhatsApp message:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while sending test message",
      error: error.message,
    });
  }
});

module.exports = router;
