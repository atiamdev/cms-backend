// middlewares/branchAccess.js
const {
  canAccessBranchResource,
  canPerformBranchOperation,
  isSuperAdmin,
  hasAdminPrivileges,
} = require("../utils/accessControl");

/**
 * Middleware to validate branch access for resource operations
 * Ensures users can only access resources in their authorized branches
 */
const validateBranchAccess = (operation = "read") => {
  return async (req, res, next) => {
    try {
      const user = req.user;

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      // For read operations, check if user can access the branch
      if (operation === "read") {
        const requestedBranchId = req.query.branchId || req.params.branchId;

        // If no specific branch requested, user sees their own branch data
        if (!requestedBranchId) {
          return next();
        }

        // Check if user can access the requested branch
        if (!canAccessBranchResource(user, requestedBranchId)) {
          return res.status(403).json({
            success: false,
            message: "Access denied. Cannot access data from this branch",
          });
        }
      }

      // For write operations (create, update, delete), check if user can perform operations
      if (["create", "update", "delete"].includes(operation)) {
        const targetBranchId =
          req.body.branchId || req.params.branchId || req.branchId;

        if (!canPerformBranchOperation(user, targetBranchId)) {
          return res.status(403).json({
            success: false,
            message: `Access denied. Cannot ${operation} data in this branch`,
          });
        }
      }

      next();
    } catch (error) {
      console.error("Branch access validation error:", error);
      res.status(500).json({
        success: false,
        message: "Server error during branch access validation",
      });
    }
  };
};

/**
 * Middleware to ensure users can only access their own branch resources
 * More restrictive than validateBranchAccess - no cross-branch access even for superadmin
 */
const enforceOwnBranchOnly = async (req, res, next) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Superadmin can access any branch if explicitly specified
    if (isSuperAdmin(user)) {
      return next();
    }

    const requestedBranchId =
      req.query.branchId || req.params.branchId || req.body.branchId;

    // If branch specified and it's not user's branch, deny access
    if (requestedBranchId && requestedBranchId !== user.branchId?.toString()) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. You can only access resources in your own branch",
      });
    }

    next();
  } catch (error) {
    console.error("Own branch enforcement error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during branch access validation",
    });
  }
};

/**
 * Middleware to validate that user has admin privileges for the target branch
 */
const requireBranchAdmin = async (req, res, next) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!hasAdminPrivileges(user)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin privileges required",
      });
    }

    const targetBranchId =
      req.body.branchId || req.params.branchId || req.query.branchId;

    // If specific branch targeted, validate access
    if (targetBranchId && !canPerformBranchOperation(user, targetBranchId)) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. Cannot perform admin operations in this branch",
      });
    }

    next();
  } catch (error) {
    console.error("Branch admin validation error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during admin validation",
    });
  }
};

module.exports = {
  validateBranchAccess,
  enforceOwnBranchOnly,
  requireBranchAdmin,
};
