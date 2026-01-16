const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const {
  offerScholarship,
  revokeScholarship,
  getScholarships,
  getStudentScholarship,
} = require("../controllers/scholarshipController");
const { protect, authorize } = require("../middlewares/auth");
const { hasAdminPrivileges } = require("../utils/accessControl");

// Validation rules
const scholarshipValidation = [
  body("studentId").isMongoId().withMessage("Valid student ID is required"),
  body("percentage")
    .isFloat({ min: 0, max: 100 })
    .withMessage("Percentage must be between 0 and 100"),
  body("reason")
    .optional()
    .isLength({ min: 1, max: 500 })
    .withMessage("Reason must be less than 500 characters"),
];

// Routes
router.post(
  "/offer",
  protect,
  authorize("admin", "superadmin"),
  scholarshipValidation,
  offerScholarship
);

router.put(
  "/revoke/:studentId",
  protect,
  authorize("admin", "superadmin"),
  revokeScholarship
);

router.get("/", protect, authorize("admin", "superadmin"), getScholarships);

router.get(
  "/student/:studentId",
  protect,
  authorize("admin", "superadmin"),
  getStudentScholarship
);

module.exports = router;
