const express = require("express");
const router = express.Router();
const { protect, canAccessStudents } = require("../middlewares/auth");
const { body } = require("express-validator");
const {
  submitApplication,
  getApplications,
  getApplication,
  approveApplication,
  rejectApplication,
  deleteApplication,
} = require("../controllers/studentApplicationController");

// Public route - submit application
router.post(
  "/",
  [
    body("branchId").notEmpty().withMessage("Branch is required"),
    body("firstName").notEmpty().withMessage("First name is required"),
    body("lastName").notEmpty().withMessage("Last name is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("phone").notEmpty().withMessage("Phone number is required"),
    body("dateOfBirth").notEmpty().withMessage("Date of birth is required"),
    body("gender")
      .isIn(["male", "female", "other"])
      .withMessage("Valid gender is required"),
    body("departmentId").notEmpty().withMessage("Department is required"),
    body("courseId").notEmpty().withMessage("Course is required"),
  ],
  submitApplication
);

// Protected routes - require authentication
router.use(protect);

// Get all applications for branch
router.get("/", canAccessStudents, getApplications);

// Get single application
router.get("/:id", canAccessStudents, getApplication);

// Approve application
router.post(
  "/:id/approve",
  canAccessStudents,
  [
    body("admissionNumber")
      .notEmpty()
      .withMessage("Admission number is required"),
  ],
  approveApplication
);

// Reject application
router.post(
  "/:id/reject",
  canAccessStudents,
  [body("reviewNotes").optional()],
  rejectApplication
);

// Delete application (admin only)
router.delete("/:id", canAccessStudents, deleteApplication);

module.exports = router;
