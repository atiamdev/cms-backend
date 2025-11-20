const express = require("express");
const { body } = require("express-validator");
const {
  createStudent,
  getStudents,
  getCurrentStudent,
  getStudent,
  updateStudent,
  deleteStudent,
  suspendStudent,
  addAcademicRecord,
  addGrade,
  updateAttendance,
  getStudentsByClass,
  getStudentStatistics,
  cleanupOrphanedUsers,
  assignStudentToClass,
  removeStudentFromClass,
  recordStudentPayment,
  getStudentPaymentHistory,
  generateStudentPaymentReceipt,
  downloadStudentPaymentReceipt,
  getStudentCourseMaterials,
  getStudentWhatsappGroups,
} = require("../controllers/studentController");
const {
  protect,
  canAccessStudents,
  requireAdmin,
  requireBranchAdmin,
} = require("../middlewares/auth");
const { branchAuth } = require("../middlewares/branchAuth");
const {
  validateBranchAccess,
  requireBranchAdmin: requireBranchAdminAccess,
} = require("../middlewares/branchAccess");
const {
  autoAssociateBranch,
  validateBranchOwnership,
  filterByBranch,
  logBranchAdminAction,
} = require("../middlewares/branchAutoAssociation");
const Student = require("../models/Student");

/**
 * @swagger
 * components:
 *   schemas:
 *     CreateStudentRequest:
 *       type: object
 *       required:
 *         - firstName
 *         - lastName
 *         - email
 *         - password
 *         - parentGuardianInfo
 *       properties:
 *         firstName:
 *           type: string
 *           minLength: 2
 *           maxLength: 50
 *           description: Student's first name
 *         lastName:
 *           type: string
 *           minLength: 2
 *           maxLength: 50
 *           description: Student's last name
 *         email:
 *           type: string
 *           format: email
 *           description: Student's email address
 *         password:
 *           type: string
 *           minLength: 6
 *           description: Account password
 *         dateOfBirth:
 *           type: string
 *           format: date
 *           description: Student's date of birth
 *         gender:
 *           type: string
 *           enum: [male, female, other]
 *           description: Student's gender
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
 *         parentGuardianInfo:
 *           type: object
 *           required:
 *             - emergencyContact
 *           properties:
 *             fatherName:
 *               type: string
 *             motherName:
 *               type: string
 *             guardianName:
 *               type: string
 *             emergencyContact:
 *               type: object
 *               required:
 *                 - name
 *                 - phone
 *               properties:
 *                 name:
 *                   type: string
 *                 phone:
 *                   type: string
 *                 email:
 *                   type: string
 *                   format: email
 *                 relationship:
 *                   type: string
 *         admissionNumber:
 *           type: string
 *           description: Unique admission number
 *         class:
 *           type: string
 *           description: Class ID to assign student to
 *       example:
 *         firstName: John
 *         lastName: Doe
 *         email: john.doe@student.atiamcollege.com
 *         password: password123
 *         dateOfBirth: "2005-05-15"
 *         gender: male
 *         admissionNumber: ADM2024001
 *         parentGuardianInfo:
 *           fatherName: James Doe
 *           motherName: Jane Doe
 *           emergencyContact:
 *             name: James Doe
 *             phone: "+254712345678"
 *             email: james.doe@email.com
 *             relationship: Father
 *
 *     UpdateStudentRequest:
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
 *         dateOfBirth:
 *           type: string
 *           format: date
 *         gender:
 *           type: string
 *           enum: [male, female, other]
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
 *         parentGuardianInfo:
 *           type: object
 *           properties:
 *             fatherName:
 *               type: string
 *             motherName:
 *               type: string
 *             guardianName:
 *               type: string
 *             emergencyContact:
 *               type: object
 *               properties:
 *                 name:
 *                   type: string
 *                 phone:
 *                   type: string
 *                 email:
 *                   type: string
 *                   format: email
 *                 relationship:
 *                   type: string
 *         isActive:
 *           type: boolean
 *           description: Student's active status
 *
 *     AddGradeRequest:
 *       type: object
 *       required:
 *         - academicTermId
 *         - subjectName
 *         - examType
 *         - score
 *       properties:
 *         academicTermId:
 *           type: string
 *           description: Academic term ID
 *         subjectName:
 *           type: string
 *           description: Subject name
 *         examType:
 *           type: string
 *           enum: [quiz, test, midterm, final, assignment, project]
 *           description: Type of examination
 *         score:
 *           type: number
 *           minimum: 0
 *           maximum: 100
 *           description: Score achieved
 *         maxScore:
 *           type: number
 *           minimum: 1
 *           description: Maximum possible score
 *         remarks:
 *           type: string
 *           description: Additional remarks
 *       example:
 *         academicTermId: 64f7c9b8e123456789abcdef
 *         subjectName: Mathematics
 *         examType: midterm
 *         score: 85
 *         maxScore: 100
 *         remarks: "Good performance"
 *
 *     StudentStatistics:
 *       type: object
 *       properties:
 *         totalStudents:
 *           type: number
 *           description: Total number of students
 *         activeStudents:
 *           type: number
 *           description: Number of active students
 *         newEnrollments:
 *           type: number
 *           description: New enrollments this month
 *         graduatedStudents:
 *           type: number
 *           description: Students graduated this year
 *         averageAge:
 *           type: number
 *           description: Average age of students
 *         genderDistribution:
 *           type: object
 *           properties:
 *             male:
 *               type: number
 *             female:
 *               type: number
 *             other:
 *               type: number
 *         classDistribution:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               className:
 *                 type: string
 *               studentCount:
 *                 type: number
 */

/**
 * @swagger
 * tags:
 *   name: Student Management
 *   description: Student registration, profile management, academic records, and class assignments
 */

const router = express.Router();

// Validation rules
const studentValidation = [
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
  body("parentGuardianInfo.emergencyContact.phone")
    .notEmpty()
    .withMessage("Emergency contact phone is required"),
];

const gradeValidation = [
  body("academicTermId")
    .isMongoId()
    .withMessage("Valid academic term ID is required"),
  body("subjectName").trim().notEmpty().withMessage("Subject name is required"),
  body("examType")
    .isIn(["quiz", "test", "midterm", "final", "assignment", "project"])
    .withMessage("Invalid exam type"),
  body("score")
    .isNumeric()
    .isFloat({ min: 0, max: 100 })
    .withMessage("Score must be between 0 and 100"),
  body("maxScore")
    .optional()
    .isNumeric()
    .isFloat({ min: 1 })
    .withMessage("Max score must be a positive number"),
];

// Apply middleware to all routes
router.use(protect);

// Routes that don't need branch auth (student self-access routes)
router.get("/me", getCurrentStudent);
router.get("/whatsapp-groups", getStudentWhatsappGroups);

router.use(branchAuth);

/**
 * @swagger
 * /students/statistics:
 *   get:
 *     summary: Get student statistics and analytics
 *     tags: [Student Management]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Student statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/StudentStatistics'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  "/statistics",
  canAccessStudents,
  validateBranchAccess("read"),
  getStudentStatistics
);

/**
 * @swagger
 * /students/cleanup-orphaned-users:
 *   post:
 *     summary: Cleanup orphaned user records (Admin only)
 *     tags: [Student Management]
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
 * /students/class/{classId}:
 *   get:
 *     summary: Get students by class
 *     tags: [Student Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: classId
 *         required: true
 *         schema:
 *           type: string
 *         description: Class ID
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
 *         description: Number of students per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name or admission number
 *     responses:
 *       200:
 *         description: List of students in the class
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedResponse'
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Class not found
 */
router.get("/class/:classId", canAccessStudents, getStudentsByClass);

/**
 * @swagger
 * /students:
 *   post:
 *     summary: Create a new student
 *     tags: [Student Management]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateStudentRequest'
 *     responses:
 *       201:
 *         description: Student created successfully
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
 *                   $ref: '#/components/schemas/Student'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       409:
 *         description: Student already exists
 */
router.post(
  "/",
  canAccessStudents,
  autoAssociateBranch,
  logBranchAdminAction("CREATE_STUDENT"),
  validateBranchAccess("create"),
  studentValidation,
  createStudent
);

/**
 * @swagger
 * /students:
 *   get:
 *     summary: Get all students with filtering and pagination
 *     tags: [Student Management]
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
 *         description: Number of students per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name, email, or admission number
 *       - in: query
 *         name: class
 *         schema:
 *           type: string
 *         description: Filter by class ID
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: gender
 *         schema:
 *           type: string
 *           enum: [male, female, other]
 *         description: Filter by gender
 *     responses:
 *       200:
 *         description: List of students
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedResponse'
 *       401:
 *         description: Not authenticated
 */
router.get(
  "/",
  canAccessStudents,
  filterByBranch,
  validateBranchAccess("read"),
  getStudents
);

/**
 * @swagger
 * /students/{id}:
 *   get:
 *     summary: Get student by ID
 *     tags: [Student Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Student ID
 *     responses:
 *       200:
 *         description: Student details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Student'
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Student not found
 */

/**
 * @swagger
 * /students/me:
 *   get:
 *     summary: Get current student profile
 *     tags: [Student Management]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Current student profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 student:
 *                   $ref: '#/components/schemas/Student'
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Student profile not found
 */
router.get("/me", protect, getCurrentStudent);

router.get("/:id", canAccessStudents, getStudent);

/**
 * @swagger
 * /students/{id}:
 *   put:
 *     summary: Update student information
 *     tags: [Student Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Student ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateStudentRequest'
 *     responses:
 *       200:
 *         description: Student updated successfully
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
 *                   $ref: '#/components/schemas/Student'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Student not found
 */
router.put(
  "/:id",
  canAccessStudents,
  validateBranchOwnership(Student),
  logBranchAdminAction("UPDATE_STUDENT"),
  updateStudent
);

/**
 * @swagger
 * /students/bulk:
 *   delete:
 *     summary: Bulk delete students
 *     tags: [Student Management]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ids
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of student IDs to delete
 *     responses:
 *       200:
 *         description: Students deleted successfully
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Access denied
 */
router.delete(
  "/bulk",
  canAccessStudents,
  branchAuth,
  logBranchAdminAction("BULK_DELETE_STUDENTS"),
  async (req, res) => {
    try {
      const { ids } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Student IDs array is required",
        });
      }

      // Verify all students belong to user's branch
      const students = await Student.find({
        _id: { $in: ids },
        branchId: req.branchId,
      });

      if (students.length !== ids.length) {
        return res.status(403).json({
          success: false,
          message: "Some students do not belong to your branch or do not exist",
        });
      }

      // Delete all students
      await Student.deleteMany({ _id: { $in: ids } });

      // Also delete associated user accounts
      const User = require("../models/User");
      const userIds = students.map((s) => s.userId).filter(Boolean);
      if (userIds.length > 0) {
        await User.deleteMany({ _id: { $in: userIds } });
      }

      res.json({
        success: true,
        message: `Successfully deleted ${ids.length} student(s)`,
        deletedCount: ids.length,
      });
    } catch (error) {
      console.error("Bulk delete students error:", error);
      res.status(500).json({
        success: false,
        message: "Server error during bulk deletion",
        error: error.message,
      });
    }
  }
);

/**
 * @swagger
 * /students/{id}:
 *   delete:
 *     summary: Delete student (Admin only)
 *     tags: [Student Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Student ID
 *     responses:
 *       200:
 *         description: Student deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Student not found
 */
router.delete(
  "/:id",
  canAccessStudents,
  validateBranchOwnership(Student),
  logBranchAdminAction("DELETE_STUDENT"),
  deleteStudent
);

/**
 * @swagger
 * /students/{id}/academic-records:
 *   post:
 *     summary: Add academic record for student
 *     tags: [Student Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Student ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - academicYear
 *               - term
 *             properties:
 *               academicYear:
 *                 type: string
 *                 description: Academic year (e.g., "2024-2025")
 *               term:
 *                 type: string
 *                 description: Academic term
 *               subjects:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     grade:
 *                       type: string
 *                     marks:
 *                       type: number
 *                     maxMarks:
 *                       type: number
 *     responses:
 *       201:
 *         description: Academic record added successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Student not found
 */
router.post("/:id/academic-records", canAccessStudents, addAcademicRecord);

/**
 * @swagger
 * /students/{id}/grades:
 *   post:
 *     summary: Add grade for student
 *     tags: [Student Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Student ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AddGradeRequest'
 *     responses:
 *       201:
 *         description: Grade added successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Student not found
 */
router.post("/:id/grades", canAccessStudents, gradeValidation, addGrade);

/**
 * @swagger
 * /students/{id}/attendance:
 *   put:
 *     summary: Update student attendance
 *     tags: [Student Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Student ID
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
 *         description: Student not found
 */
router.put("/:id/attendance", canAccessStudents, updateAttendance);

/**
 * @swagger
 * /students/{id}/assign-class:
 *   post:
 *     summary: Assign student to a class
 *     tags: [Student Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Student ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - classId
 *             properties:
 *               classId:
 *                 type: string
 *                 description: Class ID to assign student to
 *               rollNumber:
 *                 type: string
 *                 description: Optional roll number in the class
 *     responses:
 *       200:
 *         description: Student assigned to class successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Validation error or student already in class
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Student or class not found
 */
router.post("/:id/assign-class", canAccessStudents, assignStudentToClass);

/**
 * @swagger
 * /students/{id}/remove-from-class:
 *   delete:
 *     summary: Remove student from their current class
 *     tags: [Student Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Student ID
 *     responses:
 *       200:
 *         description: Student removed from class successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Student not found or not assigned to any class
 */
router.delete(
  "/:id/remove-from-class",
  canAccessStudents,
  removeStudentFromClass
);

// @desc    Get payment history for student
// @route   GET /api/students/:id/payments
// @access  Private (Admin, Secretary)
router.get("/:id/payments", protect, branchAuth, getStudentPaymentHistory);

// @desc    Record payment for student
// @route   POST /api/students/:id/payment
// @access  Private (Admin, Secretary)
router.post(
  "/:id/payment",
  protect,
  branchAuth,
  [
    body("amount")
      .isFloat({ min: 0.01 })
      .withMessage("Amount must be greater than 0"),
    body("paymentMethod")
      .isIn(["cash", "bank_transfer", "cheque", "mpesa", "card", "online"])
      .withMessage("Invalid payment method"),
    body("referenceNumber")
      .optional()
      .isString()
      .withMessage("Reference number must be a string"),
    body("notes").optional().isString().withMessage("Notes must be a string"),
  ],
  recordStudentPayment
);

// @desc    Generate receipt for student payment history entry
// @route   GET /api/students/:id/payment-receipt/:reference
// @access  Private (Admin, Secretary, Student)
router.get(
  "/:id/payment-receipt/:reference",
  protect,
  branchAuth,
  generateStudentPaymentReceipt
);

// @desc    Download receipt for student payment history entry
// @route   GET /api/students/:id/payment-receipt/:reference/download
// @access  Private (Admin, Secretary, Student)
router.get(
  "/:id/payment-receipt/:reference/download",
  protect,
  branchAuth,
  downloadStudentPaymentReceipt
);

// @desc    Get course materials for enrolled student
// @route   GET /api/students/courses/:courseId/materials
// @access  Private (Student)
router.get("/courses/:courseId/materials", protect, getStudentCourseMaterials);

/**
 * @swagger
 * /students/{id}/suspend:
 *   patch:
 *     summary: Suspend student (Admin only)
 *     tags: [Student Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Student ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Reason for suspension
 *     responses:
 *       200:
 *         description: Student suspended successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Student already suspended
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Student not found
 */
router.patch(
  "/:id/suspend",
  requireAdmin,
  validateBranchOwnership(Student),
  logBranchAdminAction("SUSPEND_STUDENT"),
  suspendStudent
);

module.exports = router;
