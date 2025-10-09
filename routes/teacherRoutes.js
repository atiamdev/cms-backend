const express = require("express");
const { body } = require("express-validator");
const {
  createTeacher,
  getTeachers,
  getTeacher,
  updateTeacher,
  deleteTeacher,
  assignClass,
  removeClassAssignment,
  addAppraisal,
  applyLeave,
  updateLeaveStatus,
  updateAttendance,
  getTeachersByDepartment,
  getTeacherStatistics,
  cleanupOrphanedUsers,
  getMyProfile,
  getMyClasses,
} = require("../controllers/teacherController");
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
const Teacher = require("../models/Teacher");

/**
 * @swagger
 * components:
 *   schemas:
 *     CreateTeacherRequest:
 *       type: object
 *       required:
 *         - firstName
 *         - lastName
 *         - email
 *         - password
 *         - department
 *         - designation
 *         - emergencyContact
 *       properties:
 *         firstName:
 *           type: string
 *           minLength: 2
 *           maxLength: 50
 *           description: Teacher's first name
 *         lastName:
 *           type: string
 *           minLength: 2
 *           maxLength: 50
 *           description: Teacher's last name
 *         email:
 *           type: string
 *           format: email
 *           description: Teacher's email address
 *         password:
 *           type: string
 *           minLength: 6
 *           description: Account password
 *         department:
 *           type: string
 *           description: Department name (e.g., Mathematics, Science)
 *         designation:
 *           type: string
 *           description: Job designation (e.g., Senior Teacher, HOD)
 *         dateOfBirth:
 *           type: string
 *           format: date
 *           description: Teacher's date of birth
 *         gender:
 *           type: string
 *           enum: [male, female, other]
 *           description: Teacher's gender
 *         phone:
 *           type: string
 *           description: Primary phone number
 *         address:
 *           type: object
 *           properties:
 *             street:
 *               type: string
 *             city:
 *               type: string
 *             state:
 *               type: string
 *             postalCode:
 *               type: string
 *             country:
 *               type: string
 *         emergencyContact:
 *           type: object
 *           required:
 *             - name
 *             - phone
 *           properties:
 *             name:
 *               type: string
 *               description: Emergency contact name
 *             phone:
 *               type: string
 *               description: Emergency contact phone
 *             email:
 *               type: string
 *               format: email
 *               description: Emergency contact email
 *             relationship:
 *               type: string
 *               description: Relationship to teacher
 *         qualifications:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               degree:
 *                 type: string
 *               institution:
 *                 type: string
 *               year:
 *                 type: number
 *               grade:
 *                 type: string
 *         experience:
 *           type: object
 *           properties:
 *             totalYears:
 *               type: number
 *               description: Total years of teaching experience
 *             previousSchools:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   schoolName:
 *                     type: string
 *                   position:
 *                     type: string
 *                   duration:
 *                     type: string
 *         salary:
 *           type: number
 *           description: Monthly salary
 *         joinDate:
 *           type: string
 *           format: date
 *           description: Date of joining
 *       example:
 *         firstName: Jane
 *         lastName: Smith
 *         email: jane.smith@atiamcollege.com
 *         password: password123
 *         department: Mathematics
 *         designation: Senior Teacher
 *         dateOfBirth: "1985-08-20"
 *         gender: female
 *         phone: "+254712345678"
 *         emergencyContact:
 *           name: John Smith
 *           phone: "+254723456789"
 *           email: john.smith@email.com
 *           relationship: Spouse
 *         salary: 75000
 *         joinDate: "2024-01-15"
 *
 *     UpdateTeacherRequest:
 *       type: object
 *       properties:
 *         firstName:
 *           type: string
 *           minLength: 2
 *           maxLength: 50
 *         lastName:
 *           type: string
 *           minLength: 2
 *           maxLength: 50
 *         email:
 *           type: string
 *           format: email
 *         department:
 *           type: string
 *         designation:
 *           type: string
 *         phone:
 *           type: string
 *         address:
 *           type: object
 *           properties:
 *             street:
 *               type: string
 *             city:
 *               type: string
 *             state:
 *               type: string
 *             postalCode:
 *               type: string
 *             country:
 *               type: string
 *         emergencyContact:
 *           type: object
 *           properties:
 *             name:
 *               type: string
 *             phone:
 *               type: string
 *             email:
 *               type: string
 *               format: email
 *             relationship:
 *               type: string
 *         salary:
 *           type: number
 *         isActive:
 *           type: boolean
 *
 *     AssignClassRequest:
 *       type: object
 *       required:
 *         - classId
 *         - subject
 *       properties:
 *         classId:
 *           type: string
 *           description: Class ID to assign teacher to
 *         subject:
 *           type: string
 *           description: Subject to teach
 *         isClassTeacher:
 *           type: boolean
 *           default: false
 *           description: Whether teacher is the class teacher
 *         academicYear:
 *           type: string
 *           description: Academic year for the assignment
 *       example:
 *         classId: 64f7c9b8e123456789abcdef
 *         subject: Mathematics
 *         isClassTeacher: false
 *         academicYear: "2024-2025"
 *
 *     AddAppraisalRequest:
 *       type: object
 *       required:
 *         - period
 *         - ratings
 *       properties:
 *         period:
 *           type: string
 *           description: Appraisal period (e.g., "Q1 2024")
 *         ratings:
 *           type: object
 *           properties:
 *             teaching:
 *               type: number
 *               minimum: 1
 *               maximum: 5
 *               description: Teaching effectiveness rating
 *             communication:
 *               type: number
 *               minimum: 1
 *               maximum: 5
 *               description: Communication skills rating
 *             punctuality:
 *               type: number
 *               minimum: 1
 *               maximum: 5
 *               description: Punctuality rating
 *             teamwork:
 *               type: number
 *               minimum: 1
 *               maximum: 5
 *               description: Teamwork rating
 *         comments:
 *           type: string
 *           description: Appraisal comments
 *         goals:
 *           type: array
 *           items:
 *             type: string
 *           description: Goals for next period
 *
 *     ApplyLeaveRequest:
 *       type: object
 *       required:
 *         - startDate
 *         - endDate
 *         - reason
 *         - type
 *       properties:
 *         startDate:
 *           type: string
 *           format: date
 *           description: Leave start date
 *         endDate:
 *           type: string
 *           format: date
 *           description: Leave end date
 *         reason:
 *           type: string
 *           description: Reason for leave
 *         type:
 *           type: string
 *           enum: [sick, annual, maternity, emergency, unpaid]
 *           description: Type of leave
 *         description:
 *           type: string
 *           description: Detailed description
 *       example:
 *         startDate: "2024-09-15"
 *         endDate: "2024-09-20"
 *         reason: "Medical treatment"
 *         type: "sick"
 *         description: "Scheduled surgery and recovery"
 *
 *     TeacherStatistics:
 *       type: object
 *       properties:
 *         totalTeachers:
 *           type: number
 *           description: Total number of teachers
 *         activeTeachers:
 *           type: number
 *           description: Number of active teachers
 *         newHires:
 *           type: number
 *           description: New hires this month
 *         onLeave:
 *           type: number
 *           description: Teachers currently on leave
 *         averageExperience:
 *           type: number
 *           description: Average years of experience
 *         departmentDistribution:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               department:
 *                 type: string
 *               teacherCount:
 *                 type: number
 *         genderDistribution:
 *           type: object
 *           properties:
 *             male:
 *               type: number
 *             female:
 *               type: number
 *             other:
 *               type: number
 *         averageSalary:
 *           type: number
 *           description: Average salary
 */

/**
 * @swagger
 * tags:
 *   name: Teacher Management
 *   description: Teacher registration, profile management, class assignments, appraisals, and leave management
 */

const router = express.Router();

// Validation rules
const teacherValidation = [
  body("email")
    .isEmail()
    .normalizeEmail()
    .withMessage("Please provide a valid email"),
  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters long"),
  body("firstName")
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("First name must be between 2 and 50 characters"),
  body("lastName")
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Last name must be between 2 and 50 characters"),
  body("department").trim().notEmpty().withMessage("Department is required"),
  body("designation").trim().notEmpty().withMessage("Designation is required"),
  body("emergencyContact.name")
    .trim()
    .notEmpty()
    .withMessage("Emergency contact name is required"),
  body("emergencyContact.phone")
    .trim()
    .notEmpty()
    .withMessage("Emergency contact phone is required"),
];

const classAssignmentValidation = [
  body("classId").isMongoId().withMessage("Valid class ID is required"),
  body("subjects")
    .isArray({ min: 1 })
    .withMessage("At least one subject is required"),
  body("isClassTeacher")
    .optional()
    .isBoolean()
    .withMessage("isClassTeacher must be boolean"),
];

const appraisalValidation = [
  body("rating")
    .isFloat({ min: 1, max: 5 })
    .withMessage("Rating must be between 1 and 5"),
  body("strengths")
    .optional()
    .isArray()
    .withMessage("Strengths must be an array"),
  body("improvements")
    .optional()
    .isArray()
    .withMessage("Improvements must be an array"),
];

const leaveValidation = [
  body("type")
    .isIn(["annual", "sick", "maternity", "paternity", "emergency", "unpaid"])
    .withMessage("Invalid leave type"),
  body("startDate").isISO8601().withMessage("Valid start date is required"),
  body("endDate").isISO8601().withMessage("Valid end date is required"),
  body("reason").trim().notEmpty().withMessage("Leave reason is required"),
];

// Apply middleware to all routes
router.use(protect);
router.use(branchAuth);

/**
 * @swagger
 * /teachers/statistics:
 *   get:
 *     summary: Get teacher statistics and analytics
 *     tags: [Teacher Management]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Teacher statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/TeacherStatistics'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions
 */
router.get("/statistics", canAccessStudents, getTeacherStatistics);

/**
 * @swagger
 * /teachers/me:
 *   get:
 *     summary: Get my teacher profile
 *     tags: [Teacher Management]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Teacher profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Teacher'
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Teacher profile not found
 */
router.get("/me", protect, getMyProfile);

/**
 * @swagger
 * /teacher/classes:
 *   get:
 *     summary: Get current teacher's classes
 *     tags: [Teachers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of teacher's classes
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
 *                     type: object
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Teacher profile not found
 */
router.get("/classes", protect, getMyClasses);

/**
 * @swagger
 * /teachers/cleanup-orphaned-users:
 *   post:
 *     summary: Cleanup orphaned teacher user records (Admin only)
 *     tags: [Teacher Management]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Cleanup completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Admin access required
 */
router.post("/cleanup-orphaned-users", requireAdmin, cleanupOrphanedUsers);

/**
 * @swagger
 * /teachers/department/{department}:
 *   get:
 *     summary: Get teachers by department
 *     tags: [Teacher Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: department
 *         required: true
 *         schema:
 *           type: string
 *         description: Department name
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Number of teachers per page
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: List of teachers in the department
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedResponse'
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Department not found
 */
router.get(
  "/department/:department",
  canAccessStudents,
  getTeachersByDepartment
);

/**
 * @swagger
 * /teachers:
 *   post:
 *     summary: Create a new teacher
 *     tags: [Teacher Management]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateTeacherRequest'
 *     responses:
 *       201:
 *         description: Teacher created successfully
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
 *                   $ref: '#/components/schemas/Teacher'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       409:
 *         description: Teacher already exists
 */
router.post(
  "/",
  canAccessStudents,
  autoAssociateBranch,
  logBranchAdminAction("CREATE_TEACHER"),
  teacherValidation,
  createTeacher
);

/**
 * @swagger
 * /teachers:
 *   get:
 *     summary: Get all teachers with filtering and pagination
 *     tags: [Teacher Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Number of teachers per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name, email, or employee ID
 *       - in: query
 *         name: department
 *         schema:
 *           type: string
 *         description: Filter by department
 *       - in: query
 *         name: designation
 *         schema:
 *           type: string
 *         description: Filter by designation
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: List of teachers
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedResponse'
 *       401:
 *         description: Not authenticated
 */
router.get("/", canAccessStudents, filterByBranch, getTeachers);

/**
 * @swagger
 * /teachers/{id}:
 *   get:
 *     summary: Get teacher by ID
 *     tags: [Teacher Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Teacher ID
 *     responses:
 *       200:
 *         description: Teacher details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Teacher'
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Teacher not found
 */
router.get("/:id", authorize("admin", "secretary", "teacher"), getTeacher);

/**
 * @swagger
 * /teachers/{id}:
 *   put:
 *     summary: Update teacher information
 *     tags: [Teacher Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Teacher ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateTeacherRequest'
 *     responses:
 *       200:
 *         description: Teacher updated successfully
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
 *                   $ref: '#/components/schemas/Teacher'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Teacher not found
 */
router.put(
  "/:id",
  canAccessStudents,
  validateBranchOwnership(Teacher),
  logBranchAdminAction("UPDATE_TEACHER"),
  updateTeacher
);

/**
 * @swagger
 * /teachers/{id}:
 *   delete:
 *     summary: Delete teacher (Admin only)
 *     tags: [Teacher Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Teacher ID
 *     responses:
 *       200:
 *         description: Teacher deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Teacher not found
 */
router.delete(
  "/:id",
  requireAdmin,
  validateBranchOwnership(Teacher),
  logBranchAdminAction("DELETE_TEACHER"),
  deleteTeacher
);

/**
 * @swagger
 * /teachers/{id}/assign-class:
 *   post:
 *     summary: Assign teacher to a class
 *     tags: [Teacher Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Teacher ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AssignClassRequest'
 *     responses:
 *       200:
 *         description: Teacher assigned to class successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Validation error or teacher already assigned
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Teacher or class not found
 */
router.post(
  "/:id/assign-class",
  canAccessStudents,
  classAssignmentValidation,
  assignClass
);

/**
 * @swagger
 * /teachers/{id}/remove-class/{classId}:
 *   delete:
 *     summary: Remove teacher from class assignment
 *     tags: [Teacher Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Teacher ID
 *       - in: path
 *         name: classId
 *         required: true
 *         schema:
 *           type: string
 *         description: Class ID
 *     responses:
 *       200:
 *         description: Teacher removed from class successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Teacher, class, or assignment not found
 */
router.delete(
  "/:id/remove-class/:classId",
  canAccessStudents,
  removeClassAssignment
);

/**
 * @swagger
 * /teachers/{id}/appraisals:
 *   post:
 *     summary: Add performance appraisal for teacher (Admin only)
 *     tags: [Teacher Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Teacher ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AddAppraisalRequest'
 *     responses:
 *       201:
 *         description: Appraisal added successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Teacher not found
 */
router.post("/:id/appraisals", requireAdmin, appraisalValidation, addAppraisal);

/**
 * @swagger
 * /teachers/{id}/leave:
 *   post:
 *     summary: Apply for leave
 *     tags: [Teacher Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Teacher ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ApplyLeaveRequest'
 *     responses:
 *       201:
 *         description: Leave application submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Teacher not found
 */
router.post(
  "/:id/leave",
  authorize("admin", "secretary", "teacher"),
  leaveValidation,
  applyLeave
);

/**
 * @swagger
 * /teachers/{id}/leave/{leaveId}:
 *   put:
 *     summary: Update leave application status (Admin only)
 *     tags: [Teacher Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Teacher ID
 *       - in: path
 *         name: leaveId
 *         required: true
 *         schema:
 *           type: string
 *         description: Leave application ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [approved, rejected, pending]
 *                 description: Leave application status
 *               adminComments:
 *                 type: string
 *                 description: Admin comments on the leave application
 *     responses:
 *       200:
 *         description: Leave status updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Teacher or leave application not found
 */
router.put("/:id/leave/:leaveId", requireAdmin, updateLeaveStatus);

/**
 * @swagger
 * /teachers/{id}/attendance:
 *   put:
 *     summary: Update teacher attendance
 *     tags: [Teacher Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Teacher ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - date
 *               - status
 *             properties:
 *               date:
 *                 type: string
 *                 format: date
 *                 description: Attendance date
 *               status:
 *                 type: string
 *                 enum: [present, absent, late, excused]
 *                 description: Attendance status
 *               checkIn:
 *                 type: string
 *                 format: time
 *                 description: Check-in time
 *               checkOut:
 *                 type: string
 *                 format: time
 *                 description: Check-out time
 *               remarks:
 *                 type: string
 *                 description: Optional remarks
 *     responses:
 *       200:
 *         description: Attendance updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Teacher not found
 */
router.put("/:id/attendance", canAccessStudents, updateAttendance);

module.exports = router;
