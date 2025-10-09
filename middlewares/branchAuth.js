const mongoose = require("mongoose");

// Middleware to ensure user can only access their branch data
const branchAuth = (req, res, next) => {
  // Skip branch validation for superadmins
  if (req.user && req.user.roles && req.user.roles.includes("superadmin")) {
    return next();
  }

  // Get branchId from user
  const userBranchId = req.user?.branchId;

  if (!userBranchId) {
    return res.status(403).json({
      success: false,
      message: "Access denied. No branch association found",
    });
  }

  // Add branchId to request for use in controllers
  req.branchId = userBranchId;

  // If branchId is specified in params or body, validate it matches user's branch
  const paramBranchId = req.params.branchId;
  const bodyBranchId = req.body.branchId;

  if (paramBranchId) {
    if (!mongoose.Types.ObjectId.isValid(paramBranchId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid branch ID format",
      });
    }

    if (paramBranchId !== userBranchId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Cannot access data from other branches",
      });
    }
  }

  if (bodyBranchId) {
    if (!mongoose.Types.ObjectId.isValid(bodyBranchId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid branch ID format",
      });
    }

    if (bodyBranchId !== userBranchId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Cannot create/modify data for other branches",
      });
    }
  }

  next();
};

// Middleware to allow superadmin to specify branch or use their own
const flexibleBranchAuth = (req, res, next) => {
  const userBranchId = req.user?.branchId;
  const isSuperAdmin = req.user?.hasRole("superadmin");

  // For superadmin, allow them to specify branchId in params or use query parameter
  if (isSuperAdmin) {
    const specifiedBranchId =
      req.params.branchId || req.query.branchId || req.body.branchId;

    if (specifiedBranchId) {
      if (!mongoose.Types.ObjectId.isValid(specifiedBranchId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid branch ID format",
        });
      }
      req.branchId = new mongoose.Types.ObjectId(specifiedBranchId);
    } else {
      // If no branch specified, superadmin can access all branches (set to null)
      req.branchId = null;
    }
  } else {
    // For non-superadmin users, use their branch
    if (!userBranchId) {
      return res.status(403).json({
        success: false,
        message: "Access denied. No branch association found",
      });
    }
    req.branchId = userBranchId;
  }

  next();
};

// Middleware to validate and set branch filter for database queries
const setBranchFilter = (req, res, next) => {
  const userBranchId = req.user?.branchId;
  const isSuperAdmin = req.user?.hasRole("superadmin");

  // Set up branch filter for database queries
  if (isSuperAdmin) {
    // Superadmin can optionally filter by branch
    const filterBranchId = req.query.branchId || req.params.branchId;
    if (filterBranchId) {
      if (!mongoose.Types.ObjectId.isValid(filterBranchId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid branch ID format",
        });
      }
      req.branchFilter = {
        branchId: new mongoose.Types.ObjectId(filterBranchId),
      };
    } else {
      req.branchFilter = {}; // No filter - access all branches
    }
  } else {
    // Regular users can only access their branch
    if (!userBranchId) {
      return res.status(403).json({
        success: false,
        message: "Access denied. No branch association found",
      });
    }
    req.branchFilter = { branchId: userBranchId };
  }

  next();
};

// Middleware to ensure the current user can only modify their own profile
// unless they have admin privileges
const profileAuth = (req, res, next) => {
  const targetUserId = req.params.userId || req.params.id;
  const currentUserId = req.user?._id.toString();
  const hasAdminRole = req.user?.hasAnyRole([
    "admin",
    "superadmin",
    "secretary",
  ]);

  // Allow if user is modifying their own profile
  if (targetUserId === currentUserId) {
    return next();
  }

  // Allow if user has admin privileges
  if (hasAdminRole) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: "Access denied. You can only modify your own profile",
  });
};

module.exports = {
  branchAuth,
  flexibleBranchAuth,
  setBranchFilter,
  profileAuth,
};
