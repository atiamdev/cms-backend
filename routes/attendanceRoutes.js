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
} = require("../controllers/attendanceController");

const {
  getAttendanceDashboard,
  getDetailedAttendanceReport,
  exportAttendanceReport,
  getAttendanceTrends,
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
  getAttendanceRecords
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
  getAttendanceSummary
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
  markAttendance
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
  clockOut
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
  updateAttendance
);

router.delete(
  "/:id",
  protect,
  branchAuth,
  authorize(["admin"]),
  deleteAttendance
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
  syncFromZKTeco
);

// Reporting Routes
router.get(
  "/reports/dashboard",
  protect,
  branchAuth,
  authorize(["admin", "secretary", "teacher"]),
  getAttendanceDashboard
);

router.get(
  "/reports/detailed",
  protect,
  branchAuth,
  authorize(["admin", "secretary", "teacher"]),
  getDetailedAttendanceReport
);

router.get(
  "/reports/export",
  protect,
  branchAuth,
  authorize(["admin", "secretary"]),
  exportAttendanceReport
);

router.get(
  "/reports/trends",
  protect,
  branchAuth,
  authorize(["admin", "secretary", "teacher"]),
  getAttendanceTrends
);

// ZKTeco Database Sync Routes
router.post("/sync-from-branch", apiKeyAuth, syncFromBranch);

router.get(
  "/last-sync/:branchId?",
  protect,
  authorize(["admin", "secretary"]),
  getLastSyncStatus
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

module.exports = router;
