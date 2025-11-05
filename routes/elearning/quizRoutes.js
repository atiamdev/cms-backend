const express = require("express");
const router = express.Router();
const { body, param } = require("express-validator");
const { protect, authorize } = require("../../middlewares/auth");
const { branchAuth } = require("../../middlewares/branchAuth");
const quizController = require("../../controllers/elearning/quizController");

/**
 * @swagger
 * components:
 *   schemas:
 *     Quiz:
 *       type: object
 *       required:
 *         - title
 *         - courseId
 *       properties:
 *         title:
 *           type: string
 *           description: Quiz title
 *         description:
 *           type: string
 *           description: Quiz description
 *         courseId:
 *           type: string
 *           description: Course ID (can be ECourse or regular Course)
 *         moduleId:
 *           type: string
 *           description: Learning module ID (optional)
 *         timeLimit:
 *           type: number
 *           description: Time limit in minutes (0 for unlimited)
 *         attempts:
 *           type: number
 *           description: Number of allowed attempts (0 for unlimited)
 *         passingScore:
 *           type: number
 *           description: Passing score percentage
 *         questions:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/QuizQuestion'
 *
 *     QuizQuestion:
 *       type: object
 *       required:
 *         - type
 *         - question
 *         - points
 *       properties:
 *         type:
 *           type: string
 *           enum: [multiple_choice, true_false, short_answer, essay, fill_blank, matching]
 *         question:
 *           type: string
 *         options:
 *           type: array
 *           items:
 *             type: string
 *         correctAnswer:
 *           type: string
 *         points:
 *           type: number
 *         explanation:
 *           type: string
 */

/**
 * @swagger
 * /api/elearning/quizzes:
 *   post:
 *     summary: Create a new quiz
 *     tags: [E-Learning - Quizzes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Quiz'
 *     responses:
 *       201:
 *         description: Quiz created successfully
 *       400:
 *         description: Validation error
 *       403:
 *         description: Access denied
 */
router.post(
  "/",
  protect,
  authorize("teacher", "admin", "branch-admin", "super-admin"),
  branchAuth,
  [
    body("title")
      .notEmpty()
      .withMessage("Title is required")
      .isLength({ min: 3, max: 200 })
      .withMessage("Title must be between 3 and 200 characters"),
    body("courseId")
      .notEmpty()
      .withMessage("Course ID is required")
      .isMongoId()
      .withMessage("Invalid course ID"),
    body("moduleId").optional().isMongoId().withMessage("Invalid module ID"),
    body("timeLimit")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Time limit must be a positive number"),
    body("attempts")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Attempts must be a positive number"),
    body("passingScore")
      .optional()
      .isFloat({ min: 0, max: 100 })
      .withMessage("Passing score must be between 0 and 100"),
    body("schedule.availableFrom")
      .optional()
      .isISO8601()
      .withMessage("Available from must be a valid date"),
    body("schedule.availableUntil")
      .optional()
      .isISO8601()
      .withMessage("Available until must be a valid date"),
    body("schedule.dueDate")
      .optional()
      .isISO8601()
      .withMessage("Due date must be a valid date"),
  ],
  quizController.createQuiz
);

/**
 * @swagger
 * /api/elearning/quizzes:
 *   get:
 *     summary: Get quizzes for teacher
 *     tags: [E-Learning - Quizzes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: courseId
 *         schema:
 *           type: string
 *         description: Filter by course ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [published, draft]
 *         description: Filter by publication status
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Items per page
 *     responses:
 *       200:
 *         description: Quizzes retrieved successfully
 */
router.get("/", protect, quizController.getTeacherQuizzes);

/**
 * @swagger
 * /api/elearning/quizzes/{id}:
 *   get:
 *     summary: Get quiz by ID
 *     tags: [E-Learning - Quizzes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Quiz ID
 *     responses:
 *       200:
 *         description: Quiz retrieved successfully
 *       404:
 *         description: Quiz not found
 */
router.get(
  "/:id",
  protect,
  authorize("teacher", "admin", "branch-admin", "super-admin", "student"),
  branchAuth,
  [param("id").isMongoId().withMessage("Invalid quiz ID")],
  quizController.getQuizById
);

/**
 * @swagger
 * /api/elearning/quizzes/{id}:
 *   put:
 *     summary: Update quiz
 *     tags: [E-Learning - Quizzes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Quiz ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Quiz'
 *     responses:
 *       200:
 *         description: Quiz updated successfully
 *       400:
 *         description: Validation error or quiz has attempts
 *       404:
 *         description: Quiz not found
 */
router.put(
  "/:id",
  protect,
  authorize("teacher", "admin", "branch-admin", "super-admin"),
  branchAuth,
  [
    param("id").isMongoId().withMessage("Invalid quiz ID"),
    body("title")
      .optional()
      .isLength({ min: 3, max: 200 })
      .withMessage("Title must be between 3 and 200 characters"),
    body("passingScore")
      .optional()
      .isFloat({ min: 0, max: 100 })
      .withMessage("Passing score must be between 0 and 100"),
  ],
  quizController.updateQuiz
);

/**
 * @swagger
 * /api/elearning/quizzes/{id}:
 *   delete:
 *     summary: Delete quiz
 *     tags: [E-Learning - Quizzes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Quiz ID
 *     responses:
 *       200:
 *         description: Quiz deleted successfully
 *       400:
 *         description: Quiz has attempts and cannot be deleted
 *       404:
 *         description: Quiz not found
 */
router.delete(
  "/:id",
  protect,
  authorize("teacher", "admin", "branch-admin", "super-admin"),
  branchAuth,
  [param("id").isMongoId().withMessage("Invalid quiz ID")],
  quizController.deleteQuiz
);

/**
 * @swagger
 * /api/elearning/quizzes/{id}/publish:
 *   patch:
 *     summary: Publish or unpublish quiz
 *     tags: [E-Learning - Quizzes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Quiz ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               isPublished:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Quiz publication status updated
 *       400:
 *         description: Cannot publish quiz without questions
 */
router.patch(
  "/:id/publish",
  protect,
  authorize("teacher", "admin", "branch-admin", "super-admin"),
  branchAuth,
  [
    param("id").isMongoId().withMessage("Invalid quiz ID"),
    body("isPublished")
      .isBoolean()
      .withMessage("isPublished must be a boolean"),
  ],
  quizController.toggleQuizPublication
);

/**
 * @swagger
 * /api/elearning/quizzes/{id}/questions:
 *   post:
 *     summary: Add question to quiz
 *     tags: [E-Learning - Quizzes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Quiz ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/QuizQuestion'
 *     responses:
 *       201:
 *         description: Question added successfully
 *       400:
 *         description: Quiz has attempts, cannot modify questions
 */
router.post(
  "/:id/questions",
  protect,
  authorize("teacher", "admin", "branch-admin", "super-admin"),
  branchAuth,
  [
    param("id").isMongoId().withMessage("Invalid quiz ID"),
    body("type")
      .isIn([
        "multiple_choice",
        "true_false",
        "short_answer",
        "essay",
        "fill_blank",
        "matching",
      ])
      .withMessage("Invalid question type"),
    body("question").notEmpty().withMessage("Question text is required"),
    body("points")
      .isInt({ min: 1 })
      .withMessage("Points must be a positive integer"),
  ],
  quizController.addQuestion
);

/**
 * @swagger
 * /api/elearning/quizzes/{id}/questions/{questionId}:
 *   put:
 *     summary: Update question in quiz
 *     tags: [E-Learning - Quizzes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Quiz ID
 *       - in: path
 *         name: questionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Question ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/QuizQuestion'
 *     responses:
 *       200:
 *         description: Question updated successfully
 *       400:
 *         description: Quiz has attempts, cannot modify questions
 */
router.put(
  "/:id/questions/:questionId",
  protect,
  authorize("teacher", "admin", "branch-admin", "super-admin"),
  branchAuth,
  [
    param("id").isMongoId().withMessage("Invalid quiz ID"),
    param("questionId").isMongoId().withMessage("Invalid question ID"),
  ],
  quizController.updateQuestion
);

/**
 * @swagger
 * /api/elearning/quizzes/{id}/questions/{questionId}:
 *   delete:
 *     summary: Remove question from quiz
 *     tags: [E-Learning - Quizzes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Quiz ID
 *       - in: path
 *         name: questionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Question ID
 *     responses:
 *       200:
 *         description: Question removed successfully
 *       400:
 *         description: Quiz has attempts, cannot modify questions
 */
router.delete(
  "/:id/questions/:questionId",
  protect,
  authorize("teacher", "admin", "branch-admin", "super-admin"),
  branchAuth,
  [
    param("id").isMongoId().withMessage("Invalid quiz ID"),
    param("questionId").isMongoId().withMessage("Invalid question ID"),
  ],
  quizController.removeQuestion
);

/**
 * @swagger
 * /api/elearning/quizzes/{id}/analytics:
 *   get:
 *     summary: Get quiz analytics
 *     tags: [E-Learning - Quizzes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Quiz ID
 *     responses:
 *       200:
 *         description: Quiz analytics retrieved successfully
 *       404:
 *         description: Quiz not found
 */
router.get(
  "/:id/analytics",
  protect,
  authorize("teacher", "admin", "branch-admin", "super-admin"),
  branchAuth,
  [param("id").isMongoId().withMessage("Invalid quiz ID")],
  quizController.getQuizAnalytics
);

/**
 * @swagger
 * /api/elearning/quizzes/{id}/questions:
 *   post:
 *     summary: Add multiple questions to quiz
 *     tags: [E-Learning - Quizzes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Quiz ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               questions:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                       enum: [multiple_choice, true_false, short_answer, essay, fill_blank, matching]
 *                     question:
 *                       type: string
 *                     options:
 *                       type: array
 *                       items:
 *                         type: string
 *                     correctAnswer:
 *                       type: string
 *                     points:
 *                       type: number
 *                       minimum: 1
 *     responses:
 *       200:
 *         description: Questions added successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Quiz not found
 */
router.post(
  "/:id/questions",
  protect,
  authorize("teacher", "admin", "branch-admin", "super-admin"),
  branchAuth,
  [
    param("id").isMongoId().withMessage("Invalid quiz ID"),
    body("questions")
      .isArray({ min: 1 })
      .withMessage("Questions array is required and must not be empty"),
    body("questions.*.type")
      .isIn([
        "multiple_choice",
        "true_false",
        "short_answer",
        "essay",
        "fill_blank",
        "matching",
      ])
      .withMessage("Invalid question type"),
    body("questions.*.question")
      .notEmpty()
      .withMessage("Question text is required"),
    body("questions.*.points")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Points must be a positive integer"),
  ],
  quizController.addQuestions
);

/**
 * @swagger
 * /api/elearning/quizzes/{id}/schedule:
 *   put:
 *     summary: Update quiz schedule
 *     tags: [E-Learning - Quizzes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Quiz ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               schedule:
 *                 type: object
 *                 properties:
 *                   availableFrom:
 *                     type: string
 *                     format: date-time
 *                     description: When the quiz becomes available
 *                   availableUntil:
 *                     type: string
 *                     format: date-time
 *                     description: When the quiz is no longer available
 *                   dueDate:
 *                     type: string
 *                     format: date-time
 *                     description: Quiz due date
 *     responses:
 *       200:
 *         description: Schedule updated successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Quiz not found
 */
router.put(
  "/:id/schedule",
  protect,
  authorize("teacher", "admin", "branch-admin", "super-admin"),
  branchAuth,
  [
    param("id").isMongoId().withMessage("Invalid quiz ID"),
    body("schedule.availableFrom")
      .optional()
      .isISO8601()
      .withMessage("Available from must be a valid date"),
    body("schedule.availableUntil")
      .optional()
      .isISO8601()
      .withMessage("Available until must be a valid date"),
    body("schedule.dueDate")
      .optional()
      .isISO8601()
      .withMessage("Due date must be a valid date"),
  ],
  quizController.updateQuizSchedule
);

/**
 * @swagger
 * /api/elearning/quizzes/{id}/import:
 *   post:
 *     summary: Import questions to quiz
 *     tags: [E-Learning - Quizzes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Quiz ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               questions:
 *                 type: array
 *                 description: Array of questions to import
 *               format:
 *                 type: string
 *                 enum: [json, csv, qti]
 *                 default: json
 *                 description: Format of the imported questions
 *     responses:
 *       200:
 *         description: Questions imported successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Quiz not found
 */
router.post(
  "/:id/import",
  protect,
  authorize("teacher", "admin", "branch-admin", "super-admin"),
  branchAuth,
  [
    param("id").isMongoId().withMessage("Invalid quiz ID"),
    body("questions")
      .isArray({ min: 1 })
      .withMessage("Questions array is required and must not be empty"),
    body("format")
      .optional()
      .isIn(["json", "csv", "qti"])
      .withMessage("Invalid format"),
  ],
  quizController.importQuestions
);

// Quiz Attempt Routes
router.post(
  "/:id/attempts",
  protect,
  authorize("student"),
  [param("id").isMongoId().withMessage("Invalid quiz ID")],
  quizController.startQuizAttempt
);

router.post(
  "/attempts/:id/submit",
  protect,
  authorize("student"),
  [param("id").isMongoId().withMessage("Invalid attempt ID")],
  quizController.submitQuizAttempt
);

router.get(
  "/attempts/:id",
  protect,
  authorize("student"),
  [param("id").isMongoId().withMessage("Invalid attempt ID")],
  quizController.getQuizAttempt
);

router.post(
  "/attempts/:id/answers",
  protect,
  authorize("student"),
  [param("id").isMongoId().withMessage("Invalid attempt ID")],
  quizController.submitAnswer
);

router.get(
  "/:id/my-attempts",
  protect,
  authorize("student"),
  [param("id").isMongoId().withMessage("Invalid quiz ID")],
  quizController.getStudentAttempts
);

module.exports = router;

// Quiz Attempt Routes
router.post(
  "/:id/attempts",
  protect,
  authorize("student"),
  [param("id").isMongoId().withMessage("Invalid quiz ID")],
  quizController.startQuizAttempt
);

router.post(
  "/attempts/:id/submit",
  protect,
  authorize("student"),
  [param("id").isMongoId().withMessage("Invalid attempt ID")],
  quizController.submitQuizAttempt
);

router.get(
  "/attempts/:id",
  protect,
  authorize("student"),
  [param("id").isMongoId().withMessage("Invalid attempt ID")],
  quizController.getQuizAttempt
);

router.post(
  "/attempts/:attemptId/grade",
  protect,
  authorize("teacher", "branch-admin", "admin", "super-admin"),
  [param("attemptId").isMongoId().withMessage("Invalid attempt ID")],
  quizController.gradeQuizAttempt
);

router.get(
  "/:quizId/attempts",
  protect,
  authorize("teacher", "branch-admin", "admin", "super-admin"),
  [param("quizId").isMongoId().withMessage("Invalid quiz ID")],
  quizController.getQuizAttempts
);

/**
 * @swagger
 * /api/elearning/quizzes/{id}/archive:
 *   put:
 *     summary: Archive a quiz
 *     tags: [Quizzes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Quiz ID
 *     responses:
 *       200:
 *         description: Quiz archived successfully
 *       404:
 *         description: Quiz not found
 *       403:
 *         description: Access denied
 */
router.put(
  "/:id/archive",
  protect,
  authorize("teacher", "admin", "branch-admin", "super-admin"),
  branchAuth,
  [param("id").isMongoId().withMessage("Invalid quiz ID")],
  quizController.archiveQuiz
);

/**
 * @swagger
 * /api/elearning/quizzes/{id}/unarchive:
 *   put:
 *     summary: Unarchive a quiz
 *     tags: [Quizzes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Quiz ID
 *     responses:
 *       200:
 *         description: Quiz unarchived successfully
 *       404:
 *         description: Quiz not found
 *       403:
 *         description: Access denied
 */
router.put(
  "/:id/unarchive",
  protect,
  authorize("teacher", "admin", "branch-admin", "super-admin"),
  branchAuth,
  [param("id").isMongoId().withMessage("Invalid quiz ID")],
  quizController.unarchiveQuiz
);

module.exports = router;
