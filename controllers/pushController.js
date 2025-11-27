const webPush = require("web-push");
const PushSubscription = require("../models/PushSubscription");

// VAPID keys configuration
const VAPID_PUBLIC_KEY =
  "BBr0VkdehxZ3eefpocvLQI2uRsTHt-QH5yj-4ode9imj1bkwcvIXK4LcljZq83B6eNieBFd0Ij-S6VMSmXtLQu4";
const VAPID_PRIVATE_KEY = "0PYfLTNYNm26OsA2n3ou7Oi4NS4zEPvEz0PXQUAWDMw";

// Set VAPID details for web-push
webPush.setVapidDetails(
  "mailto:admin@atiamcollege.edu",
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

console.log("[Push] VAPID Configuration:");
console.log("[Push] Public Key:", VAPID_PUBLIC_KEY);
console.log("[Push] Public Key (first 20):", VAPID_PUBLIC_KEY.substring(0, 20));

// Subscribe to push notifications
exports.subscribe = async (req, res) => {
  try {
    const userId = req.user._id;
    const subscription = req.body;

    console.log("[Push] Received subscription request for user:", userId);

    // Validate subscription object
    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({
        success: false,
        message: "Invalid subscription object",
      });
    }

    // Use findOneAndUpdate with upsert to handle race conditions atomically
    const savedSubscription = await PushSubscription.findOneAndUpdate(
      { endpoint: subscription.endpoint },
      {
        $set: {
          user: userId,
          endpoint: subscription.endpoint,
          keys: subscription.keys,
          expirationTime: subscription.expirationTime,
          userAgent: req.headers["user-agent"],
          lastUsed: new Date(),
        },
      },
      {
        upsert: true, // Create if doesn't exist
        new: true, // Return updated document
        setDefaultsOnInsert: true,
      }
    );

    console.log("[Push] Saved/updated subscription");

    res.status(201).json({
      success: true,
      message: "Subscription saved successfully",
      data: savedSubscription,
    });
  } catch (error) {
    console.error("[Push] Error saving subscription:", error);
    res.status(500).json({
      success: false,
      message: "Failed to save subscription",
      error: error.message,
    });
  }
};

// Unsubscribe from push notifications
exports.unsubscribe = async (req, res) => {
  try {
    const userId = req.user._id;

    console.log("[Push] Unsubscribe request for user:", userId);

    // Delete all subscriptions for this user
    const result = await PushSubscription.deleteMany({ user: userId });

    console.log("[Push] Deleted subscriptions:", result.deletedCount);

    res.status(200).json({
      success: true,
      message: "Unsubscribed successfully",
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("[Push] Error unsubscribing:", error);
    res.status(500).json({
      success: false,
      message: "Failed to unsubscribe",
      error: error.message,
    });
  }
};

// Get user's subscriptions
exports.getSubscriptions = async (req, res) => {
  try {
    const userId = req.user._id;

    const subscriptions = await PushSubscription.find({ user: userId });

    res.status(200).json({
      success: true,
      data: subscriptions,
    });
  } catch (error) {
    console.error("[Push] Error getting subscriptions:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get subscriptions",
      error: error.message,
    });
  }
};

// Send push notification to specific users
exports.sendNotification = async (userIds, payload) => {
  try {
    console.log("[Push] ==========================================");
    console.log("[Push] Sending notifications to users:", userIds.length);
    console.log("[Push] User IDs:", userIds);
    console.log("[Push] Payload:", payload);

    // Get all subscriptions for these users
    const subscriptions = await PushSubscription.find({
      user: { $in: userIds },
    });

    console.log("[Push] Found subscriptions:", subscriptions.length);

    if (subscriptions.length > 0) {
      console.log(
        "[Push] First subscription endpoint:",
        subscriptions[0].endpoint.substring(0, 80)
      );
    }

    if (subscriptions.length === 0) {
      console.log("[Push] No subscriptions found for users");
      return { success: 0, failed: 0 };
    }

    // Send notifications to all subscriptions
    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          const pushSubscription = {
            endpoint: sub.endpoint,
            keys: sub.keys,
          };

          console.log(
            "[Push] Sending to endpoint:",
            sub.endpoint.substring(0, 80)
          );
          console.log("[Push] Keys present:", {
            p256dh: !!sub.keys.p256dh,
            auth: !!sub.keys.auth,
          });

          const result = await webPush.sendNotification(
            pushSubscription,
            JSON.stringify(payload),
            {
              timeout: 10000, // 10 second timeout
              TTL: 3600, // 1 hour time to live
            }
          );

          console.log("[Push] Send result status:", result.statusCode);

          // Update last used timestamp
          sub.lastUsed = Date.now();
          await sub.save();

          console.log(
            "[Push] Notification sent successfully to:",
            sub.endpoint.substring(0, 50)
          );
          return { success: true };
        } catch (error) {
          console.error("[Push] Failed to send to subscription:");
          console.error("[Push] Error message:", error.message);
          console.error("[Push] Error status code:", error.statusCode);
          console.error("[Push] Error body:", error.body);
          console.error("[Push] Error code:", error.code);
          console.error("[Push] Endpoint:", sub.endpoint.substring(0, 80));

          // If subscription is invalid (410, 404) or network timeout, remove it
          if (
            error.statusCode === 410 ||
            error.statusCode === 404 ||
            error.code === "ETIMEDOUT" ||
            error.code === "ECONNREFUSED"
          ) {
            console.log("[Push] Removing invalid/unreachable subscription");
            await PushSubscription.deleteOne({ _id: sub._id });
          }

          return { success: false, error: error.message };
        }
      })
    );

    const successCount = results.filter(
      (r) => r.status === "fulfilled" && r.value.success
    ).length;
    const failedCount = results.length - successCount;

    console.log("[Push] Notification results:", { successCount, failedCount });

    return { success: successCount, failed: failedCount };
  } catch (error) {
    console.error("[Push] Error sending notifications:", error);
    throw error;
  }
};

// Send notification to all users with specific role
exports.sendToRole = async (role, payload) => {
  try {
    const User = require("../models/User");
    const users = await User.find({ role: role }).select("_id");
    const userIds = users.map((u) => u._id);

    return await exports.sendNotification(userIds, payload);
  } catch (error) {
    console.error("[Push] Error sending to role:", error);
    throw error;
  }
};

// Debug: Inspect subscription data
exports.debugSubscription = async (req, res) => {
  try {
    const userId = req.user._id;
    const subscriptions = await PushSubscription.find({ user: userId });

    if (subscriptions.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No subscriptions found for user",
      });
    }

    const sub = subscriptions[0];

    res.status(200).json({
      success: true,
      data: {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.keys.p256dh
            ? `${sub.keys.p256dh.substring(0, 20)}...`
            : null,
          auth: sub.keys.auth ? `${sub.keys.auth.substring(0, 20)}...` : null,
        },
        keysLength: {
          p256dh: sub.keys.p256dh?.length || 0,
          auth: sub.keys.auth?.length || 0,
        },
        userAgent: sub.userAgent,
        createdAt: sub.createdAt,
        lastUsed: sub.lastUsed,
      },
    });
  } catch (error) {
    console.error("[Push] Error debugging subscription:", error);
    res.status(500).json({
      success: false,
      message: "Failed to debug subscription",
      error: error.message,
    });
  }
};

// Test push notification endpoint (for testing)
exports.testNotification = async (req, res) => {
  try {
    const userId = req.user._id;

    const result = await exports.sendNotification([userId], {
      title: "Test Notification",
      body: "This is a test push notification",
      icon: "/logo.png",
      tag: "test",
    });

    res.status(200).json({
      success: true,
      message: "Test notification sent",
      result,
    });
  } catch (error) {
    console.error("[Push] Error sending test notification:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send test notification",
      error: error.message,
    });
  }
};
