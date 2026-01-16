const OneSignal = require("@onesignal/node-onesignal");

// OneSignal Configuration
const ONESIGNAL_APP_ID =
  process.env.ONESIGNAL_APP_ID || "c2149a7f-6c68-4edf-9ebe-7293c5aaeb36";
const ONESIGNAL_API_KEY = process.env.ONESIGNAL_API_KEY;

let client;

try {
  if (ONESIGNAL_API_KEY) {
    const configuration = OneSignal.createConfiguration({
      restApiKey: ONESIGNAL_API_KEY,
    });
    client = new OneSignal.DefaultApi(configuration);
    console.log("[OneSignal] Client initialized with REST API Key");
  } else {
    console.warn(
      "[OneSignal] API Key missing. Push notifications will not work."
    );
  }
} catch (error) {
  console.error("[OneSignal] Error initializing client:", error);
}

// Register user's OneSignal subscription with their external_id
// This links the browser's push subscription to our user
exports.registerSubscription = async (req, res) => {
  try {
    const { subscriptionId, onesignalId } = req.body;
    const userId = req.user._id.toString();

    if (!subscriptionId && !onesignalId) {
      return res.status(400).json({
        success: false,
        message: "subscriptionId or onesignalId is required",
      });
    }

    console.log(`[OneSignal] Registering user ${userId} with subscription:`, {
      subscriptionId,
      onesignalId,
    });

    // Use direct REST API call since the SDK might not have this method
    const fetch = (await import("node-fetch")).default;

    let apiUrl;
    if (subscriptionId) {
      // Use subscription ID to add alias
      apiUrl = `https://api.onesignal.com/apps/${ONESIGNAL_APP_ID}/subscriptions/${subscriptionId}/user/identity`;
    } else {
      // Use onesignal_id to add alias
      apiUrl = `https://api.onesignal.com/apps/${ONESIGNAL_APP_ID}/users/by/onesignal_id/${onesignalId}/identity`;
    }

    const response = await fetch(apiUrl, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${ONESIGNAL_API_KEY}`,
      },
      body: JSON.stringify({
        identity: {
          external_id: userId,
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("[OneSignal] Failed to register subscription:", data);
      return res.status(response.status).json({
        success: false,
        message: data.errors?.[0] || "Failed to register subscription",
        details: data,
      });
    }

    console.log("[OneSignal] User registered successfully:", data);

    // Also add role tag
    try {
      const userRole = req.user.role;
      // Add tag via a separate API call if needed
      // For now, tags are handled on frontend
    } catch (tagError) {
      console.warn("[OneSignal] Failed to add role tag:", tagError);
    }

    res.status(200).json({
      success: true,
      message: "Subscription registered successfully",
      data: data,
    });
  } catch (error) {
    console.error("[OneSignal] Error registering subscription:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Send push notification to specific users
exports.sendNotification = async (userIds, payload) => {
  try {
    if (!client) {
      console.warn("[OneSignal] Client not initialized, skipping notification");
      return { success: 0, failed: 0 };
    }

    console.log("[OneSignal] Sending notification to users:", userIds);

    // Convert user IDs to strings
    const externalUserIds = userIds.map((id) => id.toString());

    const notification = new OneSignal.Notification();
    notification.app_id = ONESIGNAL_APP_ID;

    // Use include_aliases for external user IDs (new OneSignal format)
    notification.include_aliases = {
      external_id: externalUserIds,
    };
    notification.target_channel = "push";

    // Content
    notification.headings = { en: payload.title || "New Notification" };
    notification.contents = { en: payload.body || payload.content || "" };

    // Data
    if (payload.data) {
      notification.data = payload.data;
    }

    // URL
    if (payload.url || (payload.data && payload.data.url)) {
      notification.url = payload.url || payload.data.url;
    }

    const response = await client.createNotification(notification);
    console.log("[OneSignal] Notification sent successfully:", response);

    return { success: userIds.length, failed: 0 };
  } catch (error) {
    console.error("[OneSignal] Error sending notification:", error);
    // Don't throw, just return failure
    return { success: 0, failed: userIds.length };
  }
};

// Send notification to all users with specific role
exports.sendToRole = async (role, payload) => {
  try {
    const User = require("../models/User");
    const users = await User.find({ role: role }).select("_id");
    const userIds = users.map((u) => u._id);

    if (userIds.length === 0) {
      return { success: 0, failed: 0 };
    }

    return await exports.sendNotification(userIds, payload);
  } catch (error) {
    console.error("[OneSignal] Error sending to role:", error);
    throw error;
  }
};

// Deprecated endpoints - kept for compatibility but do nothing
exports.subscribe = async (req, res) => {
  res.status(200).json({ success: true, message: "Handled by OneSignal" });
};

exports.unsubscribe = async (req, res) => {
  res.status(200).json({ success: true, message: "Handled by OneSignal" });
};

exports.checkSubscription = async (req, res) => {
  res.status(200).json({ success: true, hasValidSubscription: true });
};

exports.getVapidPublicKey = async (req, res) => {
  res.status(200).json({ success: true, publicKey: "ONESIGNAL_HANDLED" });
};

exports.getSubscriptions = async (req, res) => {
  res.status(200).json({ success: true, data: [] });
};

exports.debugSubscription = async (req, res) => {
  res.status(200).json({ success: true, data: {} });
};

exports.testNotification = async (req, res) => {
  try {
    const userId = req.user._id;
    await exports.sendNotification([userId], {
      title: "Test Notification",
      body: "This is a test notification from OneSignal",
      data: { type: "test" },
    });
    res.status(200).json({ success: true, message: "Test notification sent" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
