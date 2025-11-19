const mongoose = require("mongoose");

const pushSubscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  subscription: {
    endpoint: { type: String, required: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Compound index to prevent duplicate subscriptions per user
pushSubscriptionSchema.index(
  { userId: 1, "subscription.endpoint": 1 },
  { unique: true }
);

module.exports = mongoose.model("PushSubscription", pushSubscriptionSchema);
