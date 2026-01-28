/**
 * Equity Bank API Request Logger Middleware
 *
 * Logs all incoming requests and responses from Equity Bank
 * Useful for debugging, monitoring, and reconciliation
 */

const EquityAPILog = require("../models/EquityAPILog");

/**
 * Middleware to log all Equity Bank API requests and responses
 */
const logEquityRequest = async (req, res, next) => {
  const startTime = Date.now();

  // Capture original res.json to intercept response
  const originalJson = res.json.bind(res);

  // Override res.json to capture response data
  res.json = function (body) {
    const processingTime = Date.now() - startTime;

    // Log to database asynchronously (don't block response)
    EquityAPILog.create({
      endpoint: req.path,
      method: req.method,
      requestBody: req.body,
      responseBody: body,
      responseCode: res.statusCode,
      ipAddress: req.ip || req.connection.remoteAddress,
      processingTime: processingTime,
      userAgent: req.headers["user-agent"],
      errorMessage: body.error || body.responseMessage || null,
    }).catch((err) => {
      console.error("❌ Failed to log Equity API request:", err.message);
    });

    // Log to console for immediate visibility
    const statusEmoji = res.statusCode >= 400 ? "❌" : "✅";
    console.log(
      `${statusEmoji} Equity API: ${req.method} ${req.path} - ${res.statusCode} (${processingTime}ms)`,
    );

    // Call original res.json with the body
    return originalJson(body);
  };

  next();
};

/**
 * Middleware to add request start time to req object
 * Useful for tracking processing time in controllers
 */
const addRequestTimestamp = (req, res, next) => {
  req.startTime = Date.now();
  next();
};

/**
 * Error logging middleware specifically for Equity Bank routes
 */
const logEquityError = (err, req, res, next) => {
  const processingTime = Date.now() - (req.startTime || Date.now());

  // Log error to database
  EquityAPILog.create({
    endpoint: req.path,
    method: req.method,
    requestBody: req.body,
    responseBody: { error: err.message },
    responseCode: 500,
    ipAddress: req.ip || req.connection.remoteAddress,
    processingTime: processingTime,
    userAgent: req.headers["user-agent"],
    errorMessage: err.message,
  }).catch((logErr) => {
    console.error("❌ Failed to log error:", logErr.message);
  });

  // Log to console
  console.error(`❌ Equity API Error: ${req.method} ${req.path}`, err);

  // Send error response
  res.status(500).json({
    responseCode: "500",
    responseMessage: "Internal server error",
  });
};

module.exports = {
  logEquityRequest,
  addRequestTimestamp,
  logEquityError,
};
