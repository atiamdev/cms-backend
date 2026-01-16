const express = require("express");
const { body, param } = require("express-validator");
const {
  createClass,
  getClasses,
  getClass,
  updateClass,
  deleteClass,
  addStudentToClass,
  removeStudentFromClass,
  addSubjectToClass,
  assignTeacherToSubject,
  removeTeacherFromSubject,
  setClassTeacher,
  addPeriodToSchedule,
  updatePeriodInSchedule,
  deletePeriodFromSchedule,
  getClassesByTerm,
  getClassStatistics,
} = require("../controllers/classController");
const {
  protect,
  canAccessStudents,
  requireAdmin,
  authorize,
} = require("../middlewares/auth");
const { branchAuth } = require("../middlewares/branchAuth");
const {
  autoAssociateBranch,
  validateBranchOwnership,
  filterByBranch,
  logBranchAdminAction,
} = require("../middlewares/branchAutoAssociation");
const Class = require("../models/Class");

/**
 * @swagger
 * components:
 *   schemas:
 *     Class:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           description: Unique identifier for the class
 *         name:
 *           type: string
 *           description: Name of the class
 *         grade:
 *           type: string
 *           description: Grade level of the class
 *         section:
 *           type: string
 *           description: Section identifier
 *         branch:
 *           type: string
 *           description: Branch ID this class belongs to
 *         academicTermId:
 *           type: string
 *           description: Academic term ID
 *         capacity:
 *           type: number
 *           description: Maximum number of students
 *         classTeacher:
 *           type: string
 *           description: ID of the assigned class teacher
 *         students:
 *           type: array
 *           items:
 *             type: string
 *           description: Array of student IDs in this class
 *         subjects:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               subjectName:
 *                 type: string
 *               courseId:
 *                 type: string
 *               teacher:
 *                 type: string
 *               weeklyHours:
 *                 type: number
 *         schedule:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               day:
 *                 type: string
 *                 enum: [monday, tuesday, wednesday, thursday, friday, saturday, sunday]
 *               startTime:
 *                 type: string
 *                 pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$'
 *               endTime:
 *                 type: string
 *                 pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$'
 *               subjectName:
 *                 type: string
 *         isActive:
 *           type: boolean
 *           description: Whether the class is active
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *       example:
 *         _id: 64f7c9b8e123456789abcdef
 *         name: Grade 12A
 *         grade: "12"
 *         section: A
 *         capacity: 35
 *         isActive: true
 *
 *     CreateClassRequest:
 *       type: object
 *       required:
 *         - name
 *         - grade
 *         - academicTermId
 *       properties:
 *         name:
 *           type: string
 *           minLength: 1
 *           maxLength: 100
 *           description: Name of the class
 *         grade:
 *           type: string
 *           description: Grade level
 *         section:
 *           type: string
 *           maxLength: 10
 *           description: Section identifier (optional)
 *         academicTermId:
 *           type: string
 *           description: Academic term ID
 *         capacity:
 *           type: number
 *           minimum: 1
 *           maximum: 100
 *           description: Maximum number of students
 *         classTeacherId:
 *           type: string
 *           description: ID of the class teacher (optional)
 *       example:
 *         name: Grade 12A
 *         grade: "12"
 *         section: A
 *         academicTermId: 64f7c9b8e123456789abcdef
 *         capacity: 35
 *
 *     AddSubjectRequest:
 *       type: object
 *       required:
 *         - subjectName
 *         - courseId
 *       properties:
 *         subjectName:
 *           type: string
 *           description: Name of the subject
 *         courseId:
 *           type: string
 *           description: Course ID this subject is based on
 *         weeklyHours:
 *           type: number
 *           minimum: 1
 *           maximum: 40
 *           description: Number of weekly hours for this subject
 *       example:
 *         subjectName: Mathematics
 *         courseId: 64f7c9b8e123456789abcdef
 *         weeklyHours: 5
 *
 *     AddPeriodRequest:
 *       type: object
 *       required:
 *         - day
 *         - startTime
 *         - endTime
 *         - subjectName
 *       properties:
 *         day:
 *           type: string
 *           enum: [monday, tuesday, wednesday, thursday, friday, saturday, sunday]
 *           description: Day of the week
 *         startTime:
 *           type: string
 *           pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$'
 *           description: Start time in HH:MM format
 *         endTime:
 *           type: string
 *           pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$'
 *           description: End time in HH:MM format
 *         subjectName:
 *           type: string
 *           description: Name of the subject for this period
 *       example:
 *         day: monday
 *         startTime: "09:00"
 *         endTime: "10:00"
 *         subjectName: Mathematics
 *
 *     ClassStatistics:
 *       type: object
 *       properties:
 *         totalClasses:
 *           type: number
 *           description: Total number of classes
 *         totalStudents:
 *           type: number
 *           description: Total number of students across all classes
 *         averageClassSize:
 *           type: number
 *           description: Average number of students per class
 *         classesWithTeachers:
 *           type: number
 *           description: Number of classes with assigned class teachers
 *         utilizationRate:
 *           type: number
 *           description: Class capacity utilization percentage
 *         gradeDistribution:
 *           type: object
 *           description: Distribution of students by grade
 */

/**
 * @swagger
 * tags:
 *   name: Class Management
 *   description: Class creation, student assignment, subject management, and scheduling
 */

const router = express.Router();

// Validation rules
const classValidation = [
  body("name")
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Class name must be between 1 and 100 characters"),
  body("grade").trim().notEmpty().withMessage("Grade is required"),
  body("section")
    .optional()
    .trim()
    .isLength({ max: 10 })
    .withMessage("Section cannot exceed 10 characters"),
  body("academicTermId")
    .isMongoId()
    .withMessage("Valid academic term ID is required"),
  body("capacity")
    .optional()
    .isInt({ min: 1, max: 500 })
    .withMessage("Capacity must be between 1 and 500"),
  body("classTeacherId")
    .optional()
    .isMongoId()
    .withMessage("Valid teacher ID is required"),
];

const subjectValidation = [
  body("subjectName").trim().notEmpty().withMessage("Subject name is required"),
  body("courseId").isMongoId().withMessage("Valid course ID is required"),
  body("weeklyHours")
    .optional()
    .isInt({ min: 1, max: 40 })
    .withMessage("Weekly hours must be between 1 and 40"),
];

const periodValidation = [
  body("day")
    .isIn([
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ])
    .withMessage("Valid day is required"),
  body("startTime")
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage("Valid start time is required (HH:MM format)"),
  body("endTime")
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage("Valid end time is required (HH:MM format)"),
  body("subjectName").trim().notEmpty().withMessage("Subject name is required"),
];

// Apply middleware to all routes
router.use(protect);
router.use(branchAuth);

// Statistics route (should be before :id routes)

/**
 * @swagger
 * /classes/statistics:
 *   get:
 *     summary: Get class statistics
 *     tags: [Class Management]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Class statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/ClassStatistics'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get("/statistics", canAccessStudents, getClassStatistics);

// Academic term specific routes

/**
 * @swagger
 * /classes/term/{termId}:
 *   get:
 *     summary: Get classes by academic term
 *     tags: [Class Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: termId
 *         required: true
 *         schema:
 *           type: string
 *         description: Academic term ID
 *     responses:
 *       200:
 *         description: List of classes for the academic term
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Class'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get("/term/:termId", canAccessStudents, getClassesByTerm);

// Main CRUD routes

/**
 * @swagger
 * /classes:
 *   post:
 *     summary: Create a new class
 *     tags: [Class Management]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateClassRequest'
 *     responses:
 *       201:
 *         description: Class created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Class'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.post(
  "/",
  canAccessStudents,
  autoAssociateBranch,
  logBranchAdminAction("CREATE_CLASS"),
  classValidation,
  createClass
);

/**
 * @swagger
 * /classes:
 *   get:
 *     summary: Get all classes
 *     tags: [Class Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: grade
 *         schema:
 *           type: string
 *         description: Filter by grade level
 *       - in: query
 *         name: academicTermId
 *         schema:
 *           type: string
 *         description: Filter by academic term
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: List of classes
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Class'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     currentPage:
 *                       type: number
 *                     totalPages:
 *                       type: number
 *                     totalItems:
 *                       type: number
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get("/", canAccessStudents, filterByBranch, getClasses);

/**
 * @swagger
 * /classes/{id}:
 *   get:
 *     summary: Get a specific class by ID
 *     tags: [Class Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Class ID
 *     responses:
 *       200:
 *         description: Class details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Class'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get("/:id", canAccessStudents, getClass);

/**
 * @swagger
 * /classes/{id}:
 *   put:
 *     summary: Update a class
 *     tags: [Class Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Class ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateClassRequest'
 *     responses:
 *       200:
 *         description: Class updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Class'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.put(
  "/:id",
  canAccessStudents,
  validateBranchOwnership(Class),
  logBranchAdminAction("UPDATE_CLASS"),
  classValidation,
  updateClass
);

/**
 * @swagger
 * /classes/{id}:
 *   delete:
 *     summary: Delete a class (Admin only)
 *     tags: [Class Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Class ID
 *     responses:
 *       200:
 *         description: Class deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.delete(
  "/:id",
  requireAdmin,
  validateBranchOwnership(Class),
  logBranchAdminAction("DELETE_CLASS"),
  deleteClass
);

// Student management routes

/**
 * @swagger
 * /classes/{id}/students:
 *   post:
 *     summary: Add a student to a class
 *     tags: [Class Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Class ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - studentId
 *             properties:
 *               studentId:
 *                 type: string
 *                 description: Student ID to add to the class
 *     responses:
 *       200:
 *         description: Student added to class successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.post(
  "/:id/students",
  canAccessStudents,
  [body("studentId").isMongoId().withMessage("Valid student ID is required")],
  addStudentToClass
);

/**
 * @swagger
 * /classes/{id}/students/{studentId}:
 *   delete:
 *     summary: Remove a student from a class
 *     tags: [Class Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Class ID
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Student ID to remove from the class
 *     responses:
 *       200:
 *         description: Student removed from class successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.delete(
  "/:id/students/:studentId",
  canAccessStudents,
  removeStudentFromClass
);

// Subject management routes

/**
 * @swagger
 * /classes/{id}/subjects:
 *   post:
 *     summary: Add a subject to a class
 *     tags: [Class Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Class ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AddSubjectRequest'
 *     responses:
 *       200:
 *         description: Subject added to class successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.post(
  "/:id/subjects",
  canAccessStudents,
  subjectValidation,
  addSubjectToClass
);

/**
 * @swagger
 * /classes/{id}/subjects/{subjectName}/assign-teacher:
 *   post:
 *     summary: Assign a teacher to a subject in a class
 *     tags: [Class Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Class ID
 *       - in: path
 *         name: subjectName
 *         required: true
 *         schema:
 *           type: string
 *         description: Subject name
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - teacherId
 *             properties:
 *               teacherId:
 *                 type: string
 *                 description: Teacher ID to assign to the subject
 *     responses:
 *       200:
 *         description: Teacher assigned to subject successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.post(
  "/:id/subjects/:subjectName/assign-teacher",
  canAccessStudents,
  [body("teacherId").isMongoId().withMessage("Valid teacher ID is required")],
  assignTeacherToSubject
);

/**
 * @swagger
 * /classes/{id}/subjects/{subjectName}/remove-teacher/{teacherId}:
 *   delete:
 *     summary: Remove a teacher from a subject
 *     tags: [Class Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Class ID
 *       - in: path
 *         name: subjectName
 *         required: true
 *         schema:
 *           type: string
 *         description: Subject name
 *       - in: path
 *         name: teacherId
 *         required: true
 *         schema:
 *           type: string
 *         description: Teacher ID to remove
 *     responses:
 *       200:
 *         description: Teacher removed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Teacher removed from subject successfully"
 *                 class:
 *                   $ref: '#/components/schemas/Class'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.delete(
  "/:id/subjects/:subjectName/remove-teacher/:teacherId",
  canAccessStudents,
  removeTeacherFromSubject
);

// Class teacher assignment

/**
 * @swagger
 * /classes/{id}/class-teacher:
 *   put:
 *     summary: Set or update the class teacher
 *     tags: [Class Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Class ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               teacherId:
 *                 type: string
 *                 description: Teacher ID to assign as class teacher (optional, null to remove)
 *     responses:
 *       200:
 *         description: Class teacher assigned successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.put(
  "/:id/class-teacher",
  canAccessStudents,
  [
    body("teacherId")
      .optional()
      .isMongoId()
      .withMessage("Valid teacher ID is required"),
  ],
  setClassTeacher
);

// Schedule management

/**
 * @swagger
 * /classes/{id}/schedule/periods:
 *   post:
 *     summary: Add a period to the class schedule
 *     tags: [Class Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Class ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AddPeriodRequest'
 *     responses:
 *       200:
 *         description: Period added to schedule successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.post(
  "/:id/schedule/periods",
  canAccessStudents,
  periodValidation,
  addPeriodToSchedule
);

// Update period in schedule
router.put(
  "/:id/schedule/periods/:periodIndex",
  canAccessStudents,
  periodValidation,
  updatePeriodInSchedule
);

// Delete period from schedule
router.delete(
  "/:id/schedule/periods/:periodIndex",
  canAccessStudents,
  deletePeriodFromSchedule
);

module.exports = router;
