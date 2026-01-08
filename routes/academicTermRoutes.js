const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const {
  getAcademicTerms,
  getAcademicTerm,
  getActiveTerm,
  getCurrentTerm,
  createAcademicTerm,
  updateAcademicTerm,
  deleteAcademicTerm,
  activateAcademicTerm,
  setCurrentAcademicTerm,
  archiveAcademicTerm,
} = require("../controllers/academicTermController");
const { protect, authorize } = require("../middlewares/auth");

// Public routes (authenticated users can view)
router.get("/", protect, getAcademicTerms);
router.get("/active", protect, getActiveTerm);
router.get("/current", protect, getCurrentTerm);
router.get("/:id", protect, getAcademicTerm);

// Super admin only routes
router.post(
  "/",
  protect,
  authorize("superadmin"),
  [
    body("name").trim().notEmpty().withMessage("Term name is required"),
    body("code").trim().notEmpty().withMessage("Term code is required"),
    body("academicYear")
      .trim()
      .notEmpty()
      .withMessage("Academic year is required"),
    body("startDate").isISO8601().withMessage("Valid start date is required"),
    body("endDate").isISO8601().withMessage("Valid end date is required"),
  ],
  createAcademicTerm
);

router.put(
  "/:id",
  protect,
  authorize("superadmin"),
  [
    body("name")
      .optional()
      .trim()
      .notEmpty()
      .withMessage("Term name cannot be empty"),
    body("code")
      .optional()
      .trim()
      .notEmpty()
      .withMessage("Term code cannot be empty"),
    body("academicYear")
      .optional()
      .trim()
      .notEmpty()
      .withMessage("Academic year cannot be empty"),
    body("startDate")
      .optional()
      .isISO8601()
      .withMessage("Valid start date is required"),
    body("endDate")
      .optional()
      .isISO8601()
      .withMessage("Valid end date is required"),
  ],
  updateAcademicTerm
);

router.delete("/:id", protect, authorize("superadmin"), deleteAcademicTerm);
router.put(
  "/:id/activate",
  protect,
  authorize("superadmin"),
  activateAcademicTerm
);
router.put(
  "/:id/set-current",
  protect,
  authorize("superadmin"),
  setCurrentAcademicTerm
);
router.put(
  "/:id/archive",
  protect,
  authorize("superadmin"),
  archiveAcademicTerm
);

module.exports = router;
