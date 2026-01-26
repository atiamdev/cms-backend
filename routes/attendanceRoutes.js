const express = require("express");
const { body } = require("express-validator");
const { protect, authorize } = require("../middlewares/auth");
const { branchAuth } = require("../middlewares/branchAuth");
const { apiKeyAuth } = require("../middlewares/apiKeyAuth");

const {
  getAttendanceRecords,
  markAttendance,
  clockOut,
  updateAttendance,
  deleteAttendance,
  syncFromZKTeco,
  getAttendanceSummary,
  syncFromBranch,
  getLastSyncStatus,
  getMyAttendance,
  syncFromBioTime,
  createAttendanceRecord,
  updateStudentAccess,
} = require("../controllers/attendanceController");

const {
  getAttendanceDashboard,
  getDetailedAttendanceReport,
  exportAttendanceReport,
  getAttendanceTrends,
  generateStudentReport,
  generateClassReport,
  sendWeeklyAttendanceReports,
  sendStudentAttendanceReport,
  getAttendanceTrendsAnalysis,
  testAttendanceReport,
} = require("../controllers/attendanceReportController");

/**
 * @swagger
 * components:
 *   schemas:
 *     MarkAttendanceRequest:
 *       type: object
 *       required:
 *         - userId
 *         - userType
 *         - status
 *       properties:
 *         userId:
 *           type: string
 *           description: User ID
 *         userType:
 *           type: string
 *           enum: [student, teacher, secretary, admin]
 *           description: Type of user
 *         status:
 *           type: string
 *           enum: [present, absent, late, excused]
 *           description: Attendance status
 *         method:
 *           type: string
 *           enum: [manual, biometric, card]
 *           default: manual
 *           description: Method used to mark attendance
 *         notes:
 *           type: string
 *           description: Optional notes
 *         date:
 *           type: string
 *           format: date
 *           description: Attendance date (defaults to today)
 *       example:
 *         userId: 64f7c9b8e123456789abcdef
 *         userType: student
 *         status: present
 *         method: manual
 *         notes: "On time"
 *
 *     AttendanceSummary:
 *       type: object
 *       properties:
 *         totalUsers:
 *           type: number
 *           description: Total number of users
 *         presentToday:
 *           type: number
 *           description: Number of users present today
 *         absentToday:
 *           type: number
 *           description: Number of users absent today
 *         lateToday:
 *           type: number
 *           description: Number of users late today
 *         attendanceRate:
 *           type: number
 *           description: Overall attendance rate percentage
 *         trends:
 *           type: object
 *           description: Attendance trends data
 */

/**
 * @swagger
 * tags:
 *   name: Attendance Management
 *   description: Attendance tracking with biometric integration and comprehensive reporting
 */

const router = express.Router();

// Attendance Management Routes

/**
 * @swagger
 * /attendance:
 *   get:
 *     summary: Get attendance records
 *     tags: [Attendance Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter by user ID
 *       - in: query
 *         name: userType
 *         schema:
 *           type: string
 *           enum: [student, teacher, secretary, admin]
 *         description: Filter by user type
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by specific date
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter from date
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter to date
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [present, absent, late, excused]
 *         description: Filter by attendance status
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
 *         description: Number of records per page
 *     responses:
 *       200:
 *         description: List of attendance records
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedResponse'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  "/",
  protect,
  branchAuth,
  authorize(["admin", "secretary", "teacher"]),
  getAttendanceRecords,
);

/**
 * @swagger
 * /attendance/summary:
 *   get:
 *     summary: Get attendance summary
 *     tags: [Attendance Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: Date for summary (defaults to today)
 *       - in: query
 *         name: userType
 *         schema:
 *           type: string
 *           enum: [student, teacher, secretary, admin]
 *         description: Filter by user type
 *     responses:
 *       200:
 *         description: Attendance summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/AttendanceSummary'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  "/summary",
  protect,
  branchAuth,
  authorize(["admin", "secretary", "teacher"]),
  getAttendanceSummary,
);

/**
 * @swagger
 * /attendance/mark:
 *   post:
 *     summary: Mark attendance for a user
 *     tags: [Attendance Management]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MarkAttendanceRequest'
 *     responses:
 *       201:
 *         description: Attendance marked successfully
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
 *                   $ref: '#/components/schemas/Attendance'
 *       400:
 *         description: Validation error or attendance already marked
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions
 */
router.post("/", protect, createAttendanceRecord);

router.post(
  "/mark",
  protect,
  branchAuth,
  authorize(["admin", "secretary", "teacher"]),
  [
    body("userId").isMongoId().withMessage("Valid user ID is required"),
    body("userType")
      .isIn(["student", "teacher", "secretary", "admin"])
      .withMessage("Valid user type is required"),
    body("clockInTime")
      .isISO8601()
      .withMessage("Valid clock in time is required"),
    body("clockOutTime")
      .optional()
      .isISO8601()
      .withMessage("Valid clock out time required"),
    body("status")
      .optional()
      .isIn(["present", "absent", "late", "half_day", "early_departure"])
      .withMessage("Invalid status"),
    body("notes")
      .optional()
      .isLength({ max: 500 })
      .withMessage("Notes cannot exceed 500 characters"),
  ],
  markAttendance,
);

router.put(
  "/:id/clock-out",
  protect,
  branchAuth,
  authorize(["admin", "secretary", "teacher", "student"]),
  [
    body("clockOutTime")
      .optional()
      .isISO8601()
      .withMessage("Valid clock out time required"),
    body("notes")
      .optional()
      .isLength({ max: 500 })
      .withMessage("Notes cannot exceed 500 characters"),
  ],
  clockOut,
);

router.put(
  "/:id",
  protect,
  branchAuth,
  authorize(["admin", "secretary"]),
  [
    body("clockInTime")
      .optional()
      .isISO8601()
      .withMessage("Valid clock in time required"),
    body("clockOutTime")
      .optional()
      .isISO8601()
      .withMessage("Valid clock out time required"),
    body("status")
      .optional()
      .isIn(["present", "absent", "late", "half_day", "early_departure"])
      .withMessage("Invalid status"),
    body("notes")
      .optional()
      .isLength({ max: 500 })
      .withMessage("Notes cannot exceed 500 characters"),
    body("approvalStatus")
      .optional()
      .isIn(["pending", "approved", "rejected"])
      .withMessage("Invalid approval status"),
  ],
  updateAttendance,
);

router.delete(
  "/:id",
  protect,
  branchAuth,
  authorize(["admin"]),
  deleteAttendance,
);

// ZKTeco Integration
router.post(
  "/sync-zkteco",
  protect,
  branchAuth,
  authorize(["admin", "secretary"]),
  [
    body("deviceIp").isIP().withMessage("Valid device IP address is required"),
    body("devicePort")
      .optional()
      .isInt({ min: 1, max: 65535 })
      .withMessage("Valid port number required"),
  ],
  syncFromZKTeco,
);

// BioTime Integration
router.post(
  "/sync-biotime",
  protect,
  branchAuth,
  authorize(["admin", "secretary"]),
  syncFromBioTime,
);

router.post(
  "/update-access",
  protect,
  branchAuth,
  authorize(["admin", "secretary"]),
  [
    body("studentId").notEmpty().withMessage("Student ID is required"),
    body("feeStatus")
      .isIn(["paid", "pending", "partial"])
      .withMessage("Valid fee status is required"),
  ],
  updateStudentAccess,
);

// Reporting Routes
router.get(
  "/reports/dashboard",
  protect,
  branchAuth,
  authorize(["admin", "secretary", "teacher"]),
  getAttendanceDashboard,
);

router.get(
  "/reports/detailed",
  protect,
  branchAuth,
  authorize(["admin", "secretary", "teacher"]),
  getDetailedAttendanceReport,
);

router.get(
  "/reports/export",
  protect,
  branchAuth,
  authorize(["admin", "secretary"]),
  exportAttendanceReport,
);

router.get(
  "/reports/trends",
  protect,
  branchAuth,
  authorize(["admin", "secretary", "teacher"]),
  getAttendanceTrends,
);

// ZKTeco Database Sync Routes
router.post("/sync-from-branch", apiKeyAuth, syncFromBranch);

router.get(
  "/last-sync/:branchId?",
  protect,
  authorize(["admin", "secretary"]),
  getLastSyncStatus,
);

/**
 * @swagger
 * /attendance/my-attendance:
 *   get:
 *     summary: Get my attendance records (for students)
 *     tags: [Attendance Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Records per page
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: End date
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [present, absent, late, excused]
 *         description: Filter by status
 *     responses:
 *       200:
 *         description: Student's attendance records
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedResponse'
 *       401:
 *         description: Not authenticated
 */

router.get("/my-attendance", protect, authorize(["student"]), getMyAttendance);

// Attendance Reports with WhatsApp Integration

/**
 * @swagger
 * /attendance/reports/student/{studentId}:
 *   get:
 *     summary: Generate attendance report for a specific student
 *     tags: [Attendance Reports]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Student ID
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: "Start date (default: 30 days ago)"
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: "End date (default: today)"
 *     responses:
 *       200:
 *         description: Student attendance report
 *       403:
 *         description: Access denied
 *       404:
 *         description: Student not found
 */
router.get(
  "/reports/student/:studentId",
  protect,
  authorize(["admin", "secretary", "teacher"]),
  generateStudentReport,
);

/**
 * @swagger
 * /attendance/reports/class/{classId}:
 *   get:
 *     summary: Generate attendance report for a class
 *     tags: [Attendance Reports]
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
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: "Start date (default: 30 days ago)"
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: "End date (default: today)"
 *     responses:
 *       200:
 *         description: Class attendance report
 */
router.get(
  "/reports/class/:classId",
  protect,
  authorize(["admin", "secretary", "teacher"]),
  generateClassReport,
);

/**
 * @swagger
 * /attendance/reports/whatsapp/weekly:
 *   post:
 *     summary: Send weekly attendance reports via WhatsApp
 *     tags: [Attendance Reports]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               classId:
 *                 type: string
 *                 description: Optional class ID to send to specific class only
 *               weekStart:
 *                 type: string
 *                 format: date
 *                 description: "Start of the week (default: last week)"
 *               weekEnd:
 *                 type: string
 *                 format: date
 *                 description: "End of the week (default: last week)"
 *     responses:
 *       200:
 *         description: Bulk WhatsApp notifications sent
 *       403:
 *         description: Access denied (admin/secretary only)
 */
router.post(
  "/reports/whatsapp/weekly",
  protect,
  authorize(["admin", "secretary"]),
  sendWeeklyAttendanceReports,
);

/**
 * @swagger
 * /attendance/reports/whatsapp/student/{studentId}:
 *   post:
 *     summary: Send attendance report to specific student via WhatsApp
 *     tags: [Attendance Reports]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentId
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
 *               startDate:
 *                 type: string
 *                 format: date
 *                 description: "Start date (default: 7 days ago)"
 *               endDate:
 *                 type: string
 *                 format: date
 *                 description: "End date (default: today)"
 *               customMessage:
 *                 type: string
 *                 description: Optional custom message to include
 *     responses:
 *       200:
 *         description: WhatsApp message sent to student
 *       403:
 *         description: Access denied
 *       404:
 *         description: Student not found
 */
router.post(
  "/reports/whatsapp/student/:studentId",
  protect,
  authorize(["admin", "secretary", "teacher"]),
  sendStudentAttendanceReport,
);

/**
 * @swagger
 * /attendance/reports/trends/{studentId}:
 *   get:
 *     summary: Get attendance trends analysis for a student
 *     tags: [Attendance Reports]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Student ID
 *       - in: query
 *         name: weeks
 *         schema:
 *           type: integer
 *           default: 4
 *         description: Number of weeks to analyze
 *     responses:
 *       200:
 *         description: Attendance trends analysis
 *       403:
 *         description: Access denied
 *       404:
 *         description: Student not found
 */
router.get(
  "/reports/trends/:studentId",
  protect,
  authorize(["admin", "secretary", "teacher"]),
  getAttendanceTrendsAnalysis,
);

/**
 * @swagger
 * /attendance/reports/test:
 *   post:
 *     summary: Test attendance report generation (Admin only)
 *     tags: [Attendance Reports]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               studentId:
 *                 type: string
 *                 description: Student ID for testing
 *               classId:
 *                 type: string
 *                 description: Class ID for testing
 *     responses:
 *       200:
 *         description: Test results
 *       403:
 *         description: Access denied (admin only)
 */
router.post(
  "/reports/test",
  protect,
  authorize(["admin"]),
  testAttendanceReport,
);

module.exports = router;
