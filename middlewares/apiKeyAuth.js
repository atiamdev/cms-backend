const User = require("../models/User");
const jwt = require("jsonwebtoken");

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

    try {
      const decoded = jwt.verify(apiToken, process.env.JWT_SECRET);

      // Check if this is a sync token with embedded user data
      if (decoded.user && decoded.user.purpose === "attendance-sync") {
        // This is a sync token with superadmin privileges
        // Create a minimal user object for authorization
        const syncUser = {
          _id: decoded.user.id,
          email: decoded.user.email,
          roles: decoded.user.roles || ["superadmin"],
          status: "active",
          isSyncToken: true,
          tokenName: decoded.user.tokenName,
          generatedBy: decoded.user.generatedBy,
        };

        // If token has superadmin role, allow cross-branch access
        if (syncUser.roles.includes("superadmin")) {
          // Superadmin sync tokens can work across all branches
          req.user = syncUser;
          req.isCrossBranchSync = true;
          return next();
        }

        // Legacy branch-specific tokens
        if (decoded.user.branchId) {
          syncUser.branchId = decoded.user.branchId;
          req.user = syncUser;
          return next();
        }

        return res.status(403).json({
          success: false,
          message: "Invalid sync token configuration",
        });
      }

      // Regular user token - validate against database
      const user = await User.findById(decoded.id).select("-password");

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Invalid API token - user not found",
        });
      }

      // Check if user has permission to sync (admin, secretary, or superadmin)
      if (
        !user.roles.includes("admin") &&
        !user.roles.includes("secretary") &&
        !user.roles.includes("superadmin")
      ) {
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
      console.error("JWT verification error:", jwtError.message);
      return res.status(401).json({
        success: false,
        message: "Invalid or expired API token",
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
