// cms-backend/routes/securityRoutes.js
const express = require("express");
const router = express.Router();
const {
  getSecurityRoles,
  createRole,
  updateRole,
  deleteRole,
  assignRolesToUser,
  revokeUserRole,
  updateSecurityPolicy,
  getUserPermissions,
} = require("../controllers/securityRolesController");
const { protect, authorize } = require("../middlewares/auth");

// Apply authentication to all routes
router.use(protect);

// Get all security and roles data (superadmin only)
router.get("/", authorize(["superadmin"]), getSecurityRoles);

// Role management routes (superadmin only)
router.post("/roles", authorize(["superadmin"]), createRole);
router.put("/roles/:id", authorize(["superadmin"]), updateRole);
router.delete("/roles/:id", authorize(["superadmin"]), deleteRole);

// User role assignment routes (superadmin only)
router.post("/assign-roles", authorize(["superadmin"]), assignRolesToUser);
router.patch(
  "/revoke-role/:assignmentId",
  authorize(["superadmin"]),
  revokeUserRole
);

// Security policy routes (superadmin only)
router.put("/policy", authorize(["superadmin"]), updateSecurityPolicy);

// Get user permissions (superadmin can get any user, others can get their own)
router.get(
  "/user-permissions/:userId",
  (req, res, next) => {
    // Allow users to get their own permissions, or superadmin to get any
    if (
      req.user.id === req.params.userId ||
      req.user.roles.includes("superadmin")
    ) {
      next();
    } else {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }
  },
  getUserPermissions
);

module.exports = router;
