/**
 * Equity Bank Biller API Routes
 *
 * Defines all endpoints for Equity Bank integration:
 * - /auth - Authentication
 * - /refresh - Token refresh
 * - /validation - Student validation
 * - /notification - Payment notification
 */

const express = require("express");
const router = express.Router();

// Controllers
const {
  authenticateEquity,
  refreshAccessToken,
  validateStudent,
  processPaymentNotification,
} = require("../controllers/equityBankController");

// Middleware
const { verifyEquityToken } = require("../middlewares/equityAuthMiddleware");
const {
  logEquityRequest,
  addRequestTimestamp,
  logEquityError,
} = require("../middlewares/equityRequestLogger");
const {
  equityIPWhitelist,
  logIPAddress,
} = require("../middlewares/equityIPWhitelist");

// Apply logging to all routes
router.use(addRequestTimestamp);
router.use(logEquityRequest);
router.use(logIPAddress);

// Apply IP whitelist to all routes (configurable via env)
router.use(equityIPWhitelist);

/**
 * @route   POST /api/equity/auth
 * @desc    Authenticate and get JWT tokens
 * @access  Public (with valid credentials)
 * @body    { username: string, password: string }
 * @returns { access: string, refresh: string }
 */
router.post("/auth", authenticateEquity);

/**
 * @route   POST /api/equity/refresh
 * @desc    Refresh access token using refresh token
 * @access  Public (with valid refresh token)
 * @body    { refresh: string }
 * @returns { access: string }
 */
router.post("/refresh", refreshAccessToken);

/**
 * @route   POST /api/equity/validation
 * @desc    Validate student ID and return details
 * @access  Private (requires JWT access token)
 * @body    { billNumber: string, amount: string }
 * @returns { customerName: string, billNumber: string, amount: string, description: string }
 */
router.post("/validation", verifyEquityToken, validateStudent);

/**
 * @route   POST /api/equity/notification
 * @desc    Receive payment notification from Equity Bank
 * @access  Private (requires JWT access token)
 * @body    { billNumber: string, amount: string, bankReference: string, transactionDate: string }
 * @returns { responseCode: string, responseMessage: string }
 */
router.post("/notification", verifyEquityToken, processPaymentNotification);

// Error handling middleware (must be last)
router.use(logEquityError);

module.exports = router;
