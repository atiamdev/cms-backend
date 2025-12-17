const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Protect routes - verify JWT token
const protect = async (req, res, next) => {
  let token;

  // Check for token in header
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      // Get token from header
      token = req.headers.authorization.split(" ")[1];

      // Check for obviously invalid tokens
      if (
        !token ||
        token === "null" ||
        token === "undefined" ||
        token.length < 10
      ) {
        // Only log if it looks like a real attempt (not just empty/null)
        if (token && token !== "null" && token !== "undefined") {
          console.warn(
            "Invalid token format received:",
            token?.substring(0, 20)
          );
        }
        return res.status(401).json({
          success: false,
          message: "Not authorized, invalid token format",
        });
      }

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from the token
      const user = await User.findById(decoded.id).select("-password");

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Not authorized, user not found",
        });
      }

      // Check if user account is active
      if (user.status !== "active") {
        return res.status(401).json({
          success: false,
          message: "Account is not active",
        });
      }

      // Check if account is locked
      if (user.isLocked) {
        return res.status(401).json({
          success: false,
          message: "Account is temporarily locked due to failed login attempts",
        });
      }

      // Add user to request object
      req.user = user;
      next();
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        // Don't log full error for expected token expiration
        console.log("Token expired for request:", req.originalUrl);
        return res.status(401).json({
          success: false,
          message: "Token expired",
        });
      }

      // Log full error only for unexpected issues
      console.error("Token verification error:", error);

      if (error.name === "JsonWebTokenError") {
        return res.status(401).json({
          success: false,
          message: "Invalid token",
        });
      } else {
        return res.status(401).json({
          success: false,
          message: "Not authorized, token failed",
        });
      }
    }
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Not authorized, no token",
    });
  }
};

// Grant access to specific roles
const authorize = (...roles) => {
  return (req, res, next) => {
    // Flatten the roles array in case it's passed as authorize(['role1', 'role2']) instead of authorize('role1', 'role2')
    const flatRoles = roles.flat();

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Not authorized",
      });
    }

    // Check if user has any of the required roles
    const hasRole = flatRoles.some((role) => req.user.roles.includes(role));

    if (!hasRole) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required roles: ${flatRoles.join(", ")}`,
      });
    }

    next();
  };
};

// Check if user is superadmin
const requireSuperAdmin = (req, res, next) => {
  if (!req.user || !req.user.hasRole("superadmin")) {
    return res.status(403).json({
      success: false,
      message: "Access denied. Super admin privileges required",
    });
  }
  next();
};

// Check if user is admin or superadmin
const requireAdmin = (req, res, next) => {
  if (!req.user || !req.user.hasAnyRole(["admin", "superadmin"])) {
    return res.status(403).json({
      success: false,
      message: "Access denied. Admin privileges required",
    });
  }
  next();
};

// Require branch admin or higher privileges (branchadmin, admin, superadmin)
const requireBranchAdmin = (req, res, next) => {
  if (
    !req.user ||
    !req.user.hasAnyRole(["branchadmin", "admin", "superadmin"])
  ) {
    return res.status(403).json({
      success: false,
      message: "Access denied. Branch admin privileges required",
    });
  }
  next();
};

// Allow notice creation for specified roles (teachers, secretaries, admins)
const canCreateNotices = (req, res, next) => {
  if (
    !req.user ||
    !req.user.hasAnyRole([
      "teacher",
      "secretary",
      "branchadmin",
      "admin",
      "superadmin",
    ])
  ) {
    return res.status(403).json({
      success: false,
      message: "Access denied. You don't have permission to create notices",
    });
  }
  next();
};

// Allow editing/deleting notices for authors or admins
const canEditNotices = async (req, res, next) => {
  try {
    // Admins can edit all notices
    if (
      req.user &&
      req.user.hasAnyRole(["branchadmin", "admin", "superadmin"])
    ) {
      return next();
    }

    // For non-admins, they can only edit their own notices
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Access denied. Please log in.",
      });
    }

    // We'll validate ownership in the controller
    // This middleware just ensures the user has basic permissions
    if (
      req.user.hasAnyRole([
        "teacher",
        "secretary",
        "branchadmin",
        "admin",
        "superadmin",
      ])
    ) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: "Access denied. You don't have permission to modify notices",
    });
  } catch (error) {
    console.error("Error in canEditNotices middleware:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while checking permissions",
    });
  }
};

// Check if user can manage users (SuperAdmin or Admin)
const canManageUsers = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Access denied. Please log in.",
    });
  }

  if (req.user.hasRole("superadmin") || req.user.hasRole("admin")) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: "Access denied. Admin privileges required.",
  });
};

// Check if user can access student data
const canAccessStudents = (req, res, next) => {
  if (
    !req.user ||
    !req.user.hasAnyRole(["admin", "superadmin", "teacher", "secretary"])
  ) {
    return res.status(403).json({
      success: false,
      message: "Access denied. Student data access privileges required",
    });
  }
  next();
};

// Check if user can manage financial data
const canManageFinances = (req, res, next) => {
  if (!req.user || !req.user.hasAnyRole(["admin", "superadmin", "secretary"])) {
    return res.status(403).json({
      success: false,
      message: "Access denied. Financial management privileges required",
    });
  }
  next();
};

// Optional authentication - doesn't fail if no token
const optionalAuth = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select("-password");

      if (user && user.status === "active" && !user.isLocked) {
        req.user = user;
      }
    } catch (error) {
      // Silently fail for optional auth
      console.log("Optional auth failed:", error.message);
    }
  }

  next();
};

module.exports = {
  protect,
  authorize,
  requireSuperAdmin,
  requireAdmin,
  requireBranchAdmin,
  canManageUsers,
  canAccessStudents,
  canManageFinances,
  canCreateNotices,
  canEditNotices,
  optionalAuth,
};
