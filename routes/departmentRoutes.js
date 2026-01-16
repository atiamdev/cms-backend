const express = require("express");
const { body } = require("express-validator");
const {
  createDepartment,
  getDepartments,
  getDepartment,
  updateDepartment,
  deleteDepartment,
  getDepartmentsByBranch,
  getDepartmentStatistics,
} = require("../controllers/departmentController");
const {
  protect,
  requireSuperAdmin,
  requireAdmin,
} = require("../middlewares/auth");
const { branchAuth } = require("../middlewares/branchAuth");

const router = express.Router();

// Validation rules
const departmentValidation = [
  body("name")
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Department name must be between 2 and 100 characters"),
  body("code")
    .trim()
    .isLength({ min: 2, max: 10 })
    .matches(/^[A-Z0-9]+$/)
    .withMessage(
      "Department code must be 2-10 uppercase letters and numbers only"
    ),
  body("description")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("Description cannot exceed 500 characters"),
  body("branchId").isMongoId().withMessage("Valid branch ID is required"),
  body("contactInfo.email")
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage("Please provide a valid email"),
  body("contactInfo.phone")
    .optional()
    .trim()
    .matches(/^[\+]?[0-9\-\(\)\s]+$/)
    .withMessage("Please provide a valid phone number"),
  body("programs.*")
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Program names must be between 1 and 100 characters"),
];

const updateDepartmentValidation = [
  body("name")
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Department name must be between 2 and 100 characters"),
  body("code")
    .optional()
    .trim()
    .isLength({ min: 2, max: 10 })
    .matches(/^[A-Z0-9]+$/)
    .withMessage(
      "Department code must be 2-10 uppercase letters and numbers only"
    ),
  body("description")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("Description cannot exceed 500 characters"),
  body("contactInfo.email")
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage("Please provide a valid email"),
  body("contactInfo.phone")
    .optional()
    .trim()
    .matches(/^[\+]?[0-9\-\(\)\s]+$/)
    .withMessage("Please provide a valid phone number"),
  body("programs.*")
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Program names must be between 1 and 100 characters"),
];

// Routes

// @route   POST /api/departments
// @desc    Create a new department
// @access  Private (SuperAdmin, BranchAdmin)
router.post(
  "/",
  protect,
  requireAdmin,
  branchAuth,
  departmentValidation,
  createDepartment
);

// @route   GET /api/departments
// @desc    Get all departments with pagination and filtering
// @access  Private (SuperAdmin, BranchAdmin, Teacher, Secretary)
router.get("/", protect, branchAuth, getDepartments);

// @route   GET /api/departments/statistics
// @desc    Get department statistics
// @access  Private (SuperAdmin, BranchAdmin, Teacher, Secretary)
router.get("/statistics", protect, branchAuth, getDepartmentStatistics);

// @route   GET /api/departments/branch/:branchId
// @desc    Get departments by branch
// @access  Private (SuperAdmin, BranchAdmin, Teacher, Secretary)
router.get("/branch/:branchId", protect, branchAuth, getDepartmentsByBranch);

// @route   GET /api/departments/:id
// @desc    Get single department
// @access  Private (SuperAdmin, BranchAdmin, Teacher, Secretary)
router.get("/:id", protect, branchAuth, getDepartment);

// @route   PUT /api/departments/:id
// @desc    Update department
// @access  Private (SuperAdmin, BranchAdmin)
router.put(
  "/:id",
  protect,
  requireAdmin,
  branchAuth,
  updateDepartmentValidation,
  updateDepartment
);

// @route   DELETE /api/departments/:id
// @desc    Delete department
// @access  Private (SuperAdmin only)
router.delete("/:id", protect, requireSuperAdmin, deleteDepartment);

module.exports = router;
