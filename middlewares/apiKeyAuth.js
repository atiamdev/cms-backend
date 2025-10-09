const User = require("../models/User");

// API Key authentication for automated sync operations
const apiKeyAuth = async (req, res, next) => {
  try {
    const apiToken = req.headers.authorization?.replace("Bearer ", "");

    if (!apiToken) {
      return res.status(401).json({
        success: false,
        message: "API key required for sync operations",
      });
    }

    // For sync operations, we need to validate the API token
    // This could be a special sync token or we can validate against user tokens
    // For now, let's check if it's a valid JWT token and the user has sync permissions

    const jwt = require("jsonwebtoken");

    try {
      const decoded = jwt.verify(apiToken, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select("-password");

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Invalid API token - user not found",
        });
      }

      // Check if user has permission to sync (admin, secretary, or special sync role)
      if (!user.roles.includes("admin") && !user.roles.includes("secretary")) {
        return res.status(403).json({
          success: false,
          message: "Insufficient permissions for sync operations",
        });
      }

      // Check if user account is active
      if (user.status !== "active") {
        return res.status(401).json({
          success: false,
          message: "Account is not active",
        });
      }

      // Add user to request object
      req.user = user;
      next();
    } catch (jwtError) {
      // If JWT verification fails, check if it's a special sync API key
      // For now, return error - in production you might have a separate API key table
      return res.status(401).json({
        success: false,
        message: "Invalid API token format",
      });
    }
  } catch (error) {
    console.error("API key auth error:", error);
    res.status(500).json({
      success: false,
      message: "Authentication error",
    });
  }
};

module.exports = { apiKeyAuth };
