const mongoose = require("mongoose");

const pushSubscriptionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  endpoint: {
    type: String,
    required: true,
  },
  keys: {
    p256dh: {
      type: String,
      required: true,
    },
    auth: {
      type: String,
      required: true,
    },
  },
  expirationTime: {
    type: Number,
    default: null,
  },
  userAgent: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  lastUsed: {
    type: Date,
    default: Date.now,
  },
});

// Index for faster lookups
pushSubscriptionSchema.index({ user: 1 });
pushSubscriptionSchema.index({ endpoint: 1 }, { unique: true });

// Update lastUsed timestamp when subscription is used
pushSubscriptionSchema.methods.updateLastUsed = function () {
  this.lastUsed = Date.now();
  return this.save();
};

module.exports = mongoose.model("PushSubscription", pushSubscriptionSchema);
