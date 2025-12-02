const express = require("express");
const router = express.Router();
const aiAnalyticsController = require("../controllers/aiAnalyticsController");
const { protect, requireBranchAdmin } = require("../middlewares/auth");

// Route to ask AI about branch reports
// Protected route, accessible by Admin and Branch Admin
router.post(
  "/ask-ai",
  protect,
  requireBranchAdmin,
  aiAnalyticsController.askAi
);

module.exports = router;
