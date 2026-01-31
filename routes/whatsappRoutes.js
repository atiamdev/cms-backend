const express = require("express");
const { protect, requireAdmin } = require("../middlewares/auth");
const whatsAppService = require("../services/whatsappService");
const whatsAppQueueService = require("../services/whatsappQueueService");

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

/**
 * @route   GET /api/whatsapp/queue/status
 * @desc    Get WhatsApp queue status and statistics
 * @access  Admin only
 */
router.get("/queue/status", protect, requireAdmin, (req, res) => {
  try {
    const stats = whatsAppQueueService.getStats();
    const queueStatus = whatsAppQueueService.getQueueStatus();

    res.json({
      success: true,
      message: "Queue status retrieved successfully",
      data: {
        stats,
        queue: queueStatus,
      },
    });
  } catch (error) {
    console.error("Error getting queue status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve queue status",
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/whatsapp/queue/pause
 * @desc    Pause the WhatsApp message queue
 * @access  Admin only
 */
router.post("/queue/pause", protect, requireAdmin, (req, res) => {
  try {
    whatsAppQueueService.pause();

    res.json({
      success: true,
      message: "Queue paused successfully",
    });
  } catch (error) {
    console.error("Error pausing queue:", error);
    res.status(500).json({
      success: false,
      message: "Failed to pause queue",
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/whatsapp/queue/resume
 * @desc    Resume the WhatsApp message queue
 * @access  Admin only
 */
router.post("/queue/resume", protect, requireAdmin, (req, res) => {
  try {
    whatsAppQueueService.resume();

    res.json({
      success: true,
      message: "Queue resumed successfully",
    });
  } catch (error) {
    console.error("Error resuming queue:", error);
    res.status(500).json({
      success: false,
      message: "Failed to resume queue",
      error: error.message,
    });
  }
});

/**
 * @route   DELETE /api/whatsapp/queue
 * @desc    Clear the WhatsApp message queue (emergency stop)
 * @access  Admin only
 */
router.delete("/queue", protect, requireAdmin, (req, res) => {
  try {
    const count = whatsAppQueueService.clearQueue();

    res.json({
      success: true,
      message: `Queue cleared successfully - ${count} messages removed`,
      data: { messagesCleared: count },
    });
  } catch (error) {
    console.error("Error clearing queue:", error);
    res.status(500).json({
      success: false,
      message: "Failed to clear queue",
      error: error.message,
    });
  }
});

module.exports = router;
