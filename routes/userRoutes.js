const express = require("express");
const { body, param } = require("express-validator");
const {
  getUsers,
  getUser,
  updateUser,
  deleteUser,
  updateUserRoles,
  updateUserStatus,
  getUserStatistics,
  transferUserToBranch,
  assignBranches,
  removeBranch,
  getUserBranches,
} = require("../controllers/userController");
const {
  protect,
  requireSuperAdmin,
  requireAdmin,
  canManageUsers,
  authorize,
} = require("../middlewares/auth");

const router = express.Router();

// Validation rules
const userUpdateValidation = [
  body("firstName")
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("First name must be between 2 and 50 characters"),
  body("lastName")
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Last name must be between 2 and 50 characters"),
  body("profileDetails.phone")
    .optional()
    .trim()
    .matches(/^[\+]?[0-9\-\(\)\s]+$/)
    .withMessage("Please provide a valid phone number"),
  body("profileDetails.address")
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage("Address cannot exceed 200 characters"),
  body("profileDetails.dateOfBirth")
    .optional()
    .isISO8601()
    .withMessage("Please provide a valid date of birth"),
  body("profileDetails.gender")
    .optional()
    .isIn(["male", "female", "other"])
    .withMessage("Gender must be male, female, or other"),
];

const roleUpdateValidation = [
  body("roles")
    .isArray({ min: 1 })
    .withMessage("Roles must be a non-empty array"),
  body("roles.*")
    .isIn(["student", "teacher", "admin", "secretary", "superadmin"])
    .withMessage("Invalid role specified"),
  body("reason")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("Reason cannot exceed 500 characters"),
];

const transferValidation = [
  body("targetBranchId")
    .isMongoId()
    .withMessage("Valid target branch ID is required"),
  body("reason")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("Reason cannot exceed 500 characters"),
];

const statusUpdateValidation = [
  body("status")
    .isIn(["active", "inactive", "suspended", "pending"])
    .withMessage("Status must be active, inactive, suspended, or pending"),
  body("reason")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("Reason cannot exceed 500 characters"),
];

const mongoIdValidation = [
  param("id").isMongoId().withMessage("Valid user ID is required"),
];

const branchAssignmentValidation = [
  body("branchIds")
    .isArray({ min: 1 })
    .withMessage("branchIds must be a non-empty array"),
  body("branchIds.*")
    .isMongoId()
    .withMessage("Each branch ID must be a valid MongoDB ObjectId"),
];

const branchIdValidation = [
  param("userId").isMongoId().withMessage("Valid user ID is required"),
  param("branchId").isMongoId().withMessage("Valid branch ID is required"),
];

// Apply authentication to all routes
router.use(protect);

// Statistics route (should be before :id routes)
router.get("/statistics", canManageUsers, getUserStatistics);

// Main CRUD routes
router.get("/", canManageUsers, getUsers);
router.get("/:id", mongoIdValidation, getUser);
router.put("/:id", mongoIdValidation, userUpdateValidation, updateUser);
router.delete("/:id", mongoIdValidation, canManageUsers, deleteUser);

// Role management routes
router.put(
  "/:id/roles",
  mongoIdValidation,
  canManageUsers,
  roleUpdateValidation,
  updateUserRoles
);

// Status management route
router.put(
  "/:id/status",
  mongoIdValidation,
  canManageUsers,
  statusUpdateValidation,
  updateUserStatus
);

// Transfer route (SuperAdmin only)
router.put(
  "/:id/transfer",
  mongoIdValidation,
  requireSuperAdmin,
  transferValidation,
  transferUserToBranch
);

// Branch assignment routes (SuperAdmin only)
router.post(
  "/:userId/branches",
  param("userId").isMongoId().withMessage("Valid user ID is required"),
  requireSuperAdmin,
  branchAssignmentValidation,
  assignBranches
);

router.delete(
  "/:userId/branches/:branchId",
  branchIdValidation,
  requireSuperAdmin,
  removeBranch
);

router.get(
  "/:userId/branches",
  param("userId").isMongoId().withMessage("Valid user ID is required"),
  getUserBranches
);

module.exports = router;
