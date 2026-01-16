const express = require("express");
const { protect } = require("../middlewares/auth");

const router = express.Router();

// Placeholder routes
router.get("/", protect, (req, res) => {
  res.json({ success: true, message: "Admin routes - Coming soon" });
});

module.exports = router;
