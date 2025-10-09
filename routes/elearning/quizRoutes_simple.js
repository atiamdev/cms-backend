const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../../middlewares/auth");
const { branchAuth } = require("../../middlewares/branchAuth");
const quizController = require("../../controllers/elearning/quizController");

// Simple GET route for testing
router.get(
  "/",
  protect,
  authorize("teacher", "admin", "branch-admin", "super-admin"),
  branchAuth,
  quizController.getTeacherQuizzes
);

// Simple POST route for testing
router.post(
  "/",
  protect,
  authorize("teacher", "admin", "branch-admin", "super-admin"),
  branchAuth,
  quizController.createQuiz
);

module.exports = router;
