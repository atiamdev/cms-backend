const express = require("express");
const webpush = require("web-push");
const PushSubscription = require("../models/pushSubscription");
const auth = require("../middlewares/auth");

const router = express.Router();

// Get VAPID public key
router.get("/vapid-public-key", (req, res) => {
  // In production, this should be from env
  const publicKey = process.env.VAPID_PUBLIC_KEY || "BDefaultKeyForDev";
  res.json({ publicKey });
});

// Save push subscription
router.post("/subscribe", auth.protect, async (req, res) => {
  try {
    const { subscription } = req.body;
    const userId = req.user.id;

    // Check if subscription already exists
    const existing = await PushSubscription.findOne({
      userId,
      "subscription.endpoint": subscription.endpoint,
    });

    if (existing) {
      return res.json({ success: true, message: "Already subscribed" });
    }

    const newSubscription = new PushSubscription({
      userId,
      subscription,
    });

    await newSubscription.save();

    res.json({ success: true, message: "Subscribed to push notifications" });
  } catch (error) {
    console.error("Push subscription error:", error);
    res.status(500).json({ success: false, message: "Failed to subscribe" });
  }
});

// Unsubscribe
router.post("/unsubscribe", auth.protect, async (req, res) => {
  try {
    const { endpoint } = req.body;
    const userId = req.user.id;

    await PushSubscription.deleteOne({
      userId,
      "subscription.endpoint": endpoint,
    });

    res.json({ success: true, message: "Unsubscribed" });
  } catch (error) {
    console.error("Push unsubscribe error:", error);
    res.status(500).json({ success: false, message: "Failed to unsubscribe" });
  }
});

// Send notification to user (for testing)
router.post("/send/:userId", auth.protect, async (req, res) => {
  try {
    const { userId } = req.params;
    const { title, body } = req.body;

    const subscriptions = await PushSubscription.find({ userId });

    const payload = JSON.stringify({
      title: title || "Test Notification",
      body: body || "This is a test push notification",
      icon: "/android-chrome-512x512.png",
      badge: "/android-chrome-512x512.png",
    });

    const promises = subscriptions.map((sub) =>
      webpush.sendNotification(sub.subscription, payload)
    );

    await Promise.all(promises);

    res.json({
      success: true,
      message: `Sent to ${subscriptions.length} devices`,
    });
  } catch (error) {
    console.error("Send push error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to send notification" });
  }
});

module.exports = router;
