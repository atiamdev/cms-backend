const express = require("express");
const router = express.Router();
const {
  generateReceipt,
  emailReceipt,
  getReceiptDownloadUrl,
} = require("../controllers/receiptController");
const { protect } = require("../middlewares/auth");

// Apply authentication middleware to all routes
router.use(protect);

// @route   GET /api/receipts/:paymentId
// @desc    Generate and download payment receipt PDF
// @access  Private (Admin, Secretary, Student - own receipt)
router.get("/:paymentId", generateReceipt);

// @route   POST /api/receipts/:paymentId/email
// @desc    Email receipt to student
// @access  Private (Admin, Secretary, Student - own receipt)
router.post("/:paymentId/email", emailReceipt);

// @route   GET /api/receipts/:paymentId/download
// @desc    Get receipt download URL
// @access  Private (Admin, Secretary, Student - own receipt)
router.get("/:paymentId/download", getReceiptDownloadUrl);

module.exports = router;
