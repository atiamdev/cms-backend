const express = require("express");
const router = express.Router();
const pushController = require("../controllers/pushController");
const { protect } = require("../middlewares/auth");

// Get VAPID public key (no auth required for subscription)
router.get("/vapid-public-key", pushController.getVapidPublicKey);

// All routes below require authentication
router.use(protect);

// Register OneSignal subscription with user's external_id
router.post("/register", pushController.registerSubscription);

// Subscribe to push notifications
router.post("/subscribe", pushController.subscribe);

// Unsubscribe from push notifications
router.post("/unsubscribe", pushController.unsubscribe);

// Check if user has valid subscription
router.get("/check-subscription", pushController.checkSubscription);

// Get user's subscriptions
router.get("/subscriptions", pushController.getSubscriptions);

// Debug subscription data
router.get("/debug", pushController.debugSubscription);

// Test push notification
router.post("/test", pushController.testNotification);

module.exports = router;
