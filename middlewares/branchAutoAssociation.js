// middlewares/branchAutoAssociation.js
const {
  isSuperAdmin,
  hasAdminPrivileges,
  canPerformBranchOperation,
} = require("../utils/accessControl");

/**
 * Middleware to automatically associate created records with the correct branch
 * This ensures branch admins can only create records in their own branch
 */
const autoAssociateBranch = (req, res, next) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // For superadmin, allow them to specify branchId or use their default
    if (isSuperAdmin(user)) {
      // If no branchId specified, use the user's branch (if they have one)
      if (!req.body.branchId && user.branchId) {
        req.body.branchId = user.branchId;
      }
      return next();
    }

    // For branch admins and regular users, force their branch association
    if (user.branchId) {
      // Override any branchId in the request body with user's actual branch
      req.body.branchId = user.branchId;

      // Also set it in req.branchId for backward compatibility
      req.branchId = user.branchId;
    } else {
      return res.status(400).json({
        success: false,
        message: "User has no branch association. Cannot create records.",
      });
    }

    next();
  } catch (error) {
    console.error("Branch auto-association error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during branch association",
    });
  }
};

/**
 * Middleware to validate branch ownership for update/delete operations
 * Ensures users can only modify records in their own branch
 */
const validateBranchOwnership = (resourceModel, resourceIdParam = "id") => {
  return async (req, res, next) => {
    try {
      const user = req.user;
      const resourceId = req.params[resourceIdParam];

      if (!user || !resourceId) {
        return res.status(400).json({
          success: false,
          message: "Missing required authentication or resource ID",
        });
      }

      // Superadmin can modify any resource
      if (isSuperAdmin(user)) {
        return next();
      }

      // Find the resource and check branch ownership
      const resource = await resourceModel.findById(resourceId);

      if (!resource) {
        return res.status(404).json({
          success: false,
          message: "Resource not found",
        });
      }

      // Check if resource belongs to user's branch
      const resourceBranchId = resource.branchId?.toString();
      const userBranchId = user.branchId?.toString();

      if (resourceBranchId !== userBranchId) {
        return res.status(403).json({
          success: false,
          message: "Access denied. Resource belongs to a different branch",
        });
      }

      // Store the resource in request for potential use in the controller
      req.resource = resource;

      next();
    } catch (error) {
      console.error("Branch ownership validation error:", error);
      res.status(500).json({
        success: false,
        message: "Server error during ownership validation",
      });
    }
  };
};

/**
 * Middleware to ensure branch admins can only query their own branch data
 * This filters query parameters and adds branch filtering
 */
const filterByBranch = (req, res, next) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Superadmin can access any branch data
    if (isSuperAdmin(user)) {
      return next();
    }

    // For branch admins and other users, filter to their branch only
    if (user.branchId) {
      // Remove any branchId from query params to prevent bypassing
      delete req.query.branchId;

      // Set the branch filter
      req.branchFilter = { branchId: user.branchId };
      req.branchId = user.branchId;
    } else {
      return res.status(400).json({
        success: false,
        message: "User has no branch association. Cannot access data.",
      });
    }

    next();
  } catch (error) {
    console.error("Branch filtering error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during branch filtering",
    });
  }
};

/**
 * Middleware to log branch admin actions for audit purposes
 */
const logBranchAdminAction = (action) => {
  return (req, res, next) => {
    try {
      const user = req.user;

      if (user && user.roles.includes("branchadmin")) {
        console.log(
          `[BRANCH ADMIN ACTION] ${new Date().toISOString()} - User: ${
            user.email
          } (${user._id}) - Action: ${action} - Branch: ${
            user.branchId
          } - IP: ${req.ip}`
        );
      }

      next();
    } catch (error) {
      console.error("Branch admin logging error:", error);
      // Don't fail the request due to logging errors
      next();
    }
  };
};

module.exports = {
  autoAssociateBranch,
  validateBranchOwnership,
  filterByBranch,
  logBranchAdminAction,
};
