const mongoose = require("mongoose");

/**
 * WhatsApp Message Status Schema
 * Tracks delivery, read receipts, and failures for WhatsApp messages
 */
const whatsAppMessageStatusSchema = new mongoose.Schema(
  {
    // Meta's message ID
    messageId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Recipient phone number (in E.164 format)
    recipient: {
      type: String,
      required: true,
      index: true,
    },

    // Current status of the message
    status: {
      type: String,
      enum: ["queued", "sent", "delivered", "read", "failed", "deleted"],
      default: "queued",
      index: true,
    },

    // Message type (invoice, attendance, notice, etc.)
    messageType: {
      type: String,
      enum: [
        "invoice",
        "attendance",
        "notice",
        "payment_confirmation",
        "admission",
        "general",
        "other",
      ],
      default: "general",
    },

    // Related entity references
    relatedEntity: {
      entityType: {
        type: String,
        enum: ["Student", "User", "Invoice", "Notice", "Admission", "Other"],
      },
      entityId: {
        type: mongoose.Schema.Types.ObjectId,
      },
    },

    // Timestamp tracking
    timestamps: {
      queued: { type: Date, default: Date.now },
      sent: { type: Date },
      delivered: { type: Date },
      read: { type: Date },
      failed: { type: Date },
    },

    // Error details (if failed)
    error: {
      code: { type: Number },
      title: { type: String },
      message: { type: String },
      details: { type: String },
    },

    // Webhook event data
    webhookEvents: [
      {
        status: { type: String },
        timestamp: { type: Date },
        eventData: { type: mongoose.Schema.Types.Mixed },
      },
    ],

    // Pricing information (from Meta API)
    pricing: {
      pricingModel: { type: String },
      billable: { type: Boolean },
      category: { type: String },
    },

    // Conversation tracking
    conversation: {
      id: { type: String },
      origin: {
        type: { type: String },
      },
      expirationTimestamp: { type: Date },
    },

    // Retry attempts (if message failed and was retried)
    retryCount: {
      type: Number,
      default: 0,
    },

    // Meta's WhatsApp Business Account ID
    businessAccountId: {
      type: String,
    },

    // Additional metadata
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
  },
);

// Indexes for efficient querying
whatsAppMessageStatusSchema.index({ recipient: 1, createdAt: -1 });
whatsAppMessageStatusSchema.index({ status: 1, createdAt: -1 });
whatsAppMessageStatusSchema.index({ messageType: 1, status: 1 });
whatsAppMessageStatusSchema.index({ "relatedEntity.entityId": 1 });

// Instance method to update status
whatsAppMessageStatusSchema.methods.updateStatus = function (
  newStatus,
  eventData = {},
) {
  this.status = newStatus;
  this.timestamps[newStatus] = new Date();

  // Add to webhook events history
  this.webhookEvents.push({
    status: newStatus,
    timestamp: new Date(),
    eventData: eventData,
  });

  return this.save();
};

// Static method to get delivery statistics
whatsAppMessageStatusSchema.statics.getDeliveryStats = async function (
  filter = {},
) {
  const match = { ...filter };

  return await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
    {
      $project: {
        status: "$_id",
        count: 1,
        _id: 0,
      },
    },
  ]);
};

// Static method to get message timeline
whatsAppMessageStatusSchema.statics.getMessageTimeline = async function (
  messageId,
) {
  const message = await this.findOne({ messageId });
  if (!message) return null;

  const timeline = [];

  if (message.timestamps.queued) {
    timeline.push({ status: "queued", timestamp: message.timestamps.queued });
  }
  if (message.timestamps.sent) {
    timeline.push({ status: "sent", timestamp: message.timestamps.sent });
  }
  if (message.timestamps.delivered) {
    timeline.push({
      status: "delivered",
      timestamp: message.timestamps.delivered,
    });
  }
  if (message.timestamps.read) {
    timeline.push({ status: "read", timestamp: message.timestamps.read });
  }
  if (message.timestamps.failed) {
    timeline.push({ status: "failed", timestamp: message.timestamps.failed });
  }

  return {
    messageId: message.messageId,
    recipient: message.recipient,
    currentStatus: message.status,
    timeline: timeline.sort((a, b) => a.timestamp - b.timestamp),
  };
};

module.exports = mongoose.model(
  "WhatsAppMessageStatus",
  whatsAppMessageStatusSchema,
);
