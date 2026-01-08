const express = require("express");
const { body } = require("express-validator");
const {
  createBranch,
  getBranches,
  getBranch,
  updateBranch,
  deleteBranch,
} = require("../controllers/branchController");
const {
  protect,
  requireSuperAdmin,
  requireAdmin,
} = require("../middlewares/auth");

const router = express.Router();

// Validation rules
const branchValidation = [
  body("name")
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Branch name must be between 2 and 100 characters"),
  body("address.city")
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage("City name cannot exceed 50 characters"),
  body("address.state")
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage("State name cannot exceed 50 characters"),
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
];

// Routes
router.post("/", protect, requireSuperAdmin, branchValidation, createBranch);
router.get("/", protect, requireSuperAdmin, getBranches);
router.get("/:id", protect, getBranch);
router.put("/:id", protect, requireAdmin, branchValidation, updateBranch);
router.delete("/:id", protect, requireSuperAdmin, deleteBranch);

module.exports = router;
