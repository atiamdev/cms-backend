/**
 * Equity Bank JWT Authentication Middleware
 *
 * Verifies JWT tokens for protected Equity Bank API endpoints
 */

const jwt = require("jsonwebtoken");

/**
 * Middleware to verify Equity Bank JWT access token
 * Protects routes that require authentication
 */
const verifyEquityToken = (req, res, next) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        responseCode: "401",
        responseMessage: "No token provided",
      });
    }

    // Get token (remove "Bearer " prefix)
    const token = authHeader.substring(7);

    // Verify token
    try {
      const decoded = jwt.verify(token, process.env.EQUITY_JWT_SECRET);

      // Check if it's an access token
      if (decoded.type !== "access") {
        return res.status(401).json({
          responseCode: "401",
          responseMessage: "Invalid token type",
        });
      }

      // Attach user info to request
      req.equityUser = decoded;

      // Proceed to next middleware/controller
      next();
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        return res.status(401).json({
          responseCode: "401",
          responseMessage: "Token expired",
        });
      }

      if (error.name === "JsonWebTokenError") {
        return res.status(401).json({
          responseCode: "401",
          responseMessage: "Invalid token",
        });
      }

      throw error;
    }
  } catch (error) {
    console.error("Token verification error:", error);
    return res.status(500).json({
      responseCode: "500",
      responseMessage: "Internal server error",
    });
  }
};

/**
 * Optional middleware to verify token but not fail if missing
 * Useful for endpoints that work with or without authentication
 */
const verifyEquityTokenOptional = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      req.equityUser = null;
      return next();
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, process.env.EQUITY_JWT_SECRET);
      req.equityUser = decoded;
    } catch (error) {
      req.equityUser = null;
    }

    next();
  } catch (error) {
    console.error("Optional token verification error:", error);
    req.equityUser = null;
    next();
  }
};

module.exports = {
  verifyEquityToken,
  verifyEquityTokenOptional,
};
