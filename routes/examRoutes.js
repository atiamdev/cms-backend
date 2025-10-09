const express = require("express");
const {
  createExam,
  getExamsForCourse,
  getTeacherExams,
  updateExam,
  deleteExam,
  submitExamGrades,
  getExamGrades,
  getStudentGradesForCourse,
  publishExamGrades,
  getUpcomingExams,
} = require("../controllers/examController");

const { protect, authorize } = require("../middlewares/auth");

const router = express.Router();

// All routes require authentication
router.use(protect);

// Teacher routes
router.post("/", authorize("teacher"), createExam);
router.get("/teacher", authorize("teacher"), getTeacherExams);
router.put("/:id", authorize("teacher"), updateExam);
router.delete("/:id", authorize("teacher"), deleteExam);
router.post("/:examId/grades", authorize("teacher"), submitExamGrades);
router.get("/:examId/grades", authorize("teacher"), getExamGrades);
router.put("/:examId/publish-grades", authorize("teacher"), publishExamGrades);

// Student routes
router.get("/student/upcoming", authorize("student"), getUpcomingExams);
router.get(
  "/course/:courseId/grades",
  authorize("student"),
  getStudentGradesForCourse
);

// Public routes (within branch)
router.get("/course/:courseId", getExamsForCourse);

module.exports = router;
