const express = require("express");
const router = express.Router();
const pushController = require("../controllers/pushController");
const { protect } = require("../middlewares/auth");

// All routes require authentication
router.use(protect);

// Subscribe to push notifications
router.post("/subscribe", pushController.subscribe);

// Unsubscribe from push notifications
router.post("/unsubscribe", pushController.unsubscribe);

// Get user's subscriptions
router.get("/subscriptions", pushController.getSubscriptions);

// Debug subscription data
router.get("/debug", pushController.debugSubscription);

// Test push notification
router.post("/test", pushController.testNotification);

module.exports = router;
