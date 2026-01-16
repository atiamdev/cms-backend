/**
 * Student Inactivity Routes
 *
 * API endpoints for managing student inactivity tracking
 */

const express = require("express");
const router = express.Router();
const { protect, authorize, requireAdmin } = require("../middlewares/auth");
const {
  checkAndMarkInactiveStudents,
  getStudentsAtRisk,
  reactivateStudent,
  getLastAttendanceDate,
  sendAtRiskNotifications,
  sendAtRiskNotificationsAllBranches,
  CONFIG,
} = require("../services/studentInactivityService");
const Student = require("../models/Student");
const Attendance = require("../models/Attendance");

/**
 * @route   POST /api/students/inactivity/check
 * @desc    Manually trigger inactivity check (marks students inactive if absent for 2 weeks)
 * @access  Private (Admin only)
 */
router.post("/inactivity/check", protect, requireAdmin, async (req, res) => {
  try {
    console.log(
      `📋 Manual inactivity check triggered by user: ${req.user.email}`
    );

    const result = await checkAndMarkInactiveStudents();

    if (result.success) {
      res.json({
        success: true,
        message: `Inactivity check completed. ${result.summary.totalMarkedInactive} students marked inactive.`,
        data: result,
      });
    } else {
      res.status(500).json({
        success: false,
        message: "Inactivity check failed",
        error: result.error,
      });
    }
  } catch (error) {
    console.error("Manual inactivity check error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to run inactivity check",
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/students/inactivity/at-risk
 * @desc    Get students at risk of becoming inactive (absent for 5-9 school days)
 * @access  Private (Admin, Secretary)
 */
router.get(
  "/inactivity/at-risk",
  protect,
  authorize("admin", "secretary"),
  async (req, res) => {
    try {
      const branchId = req.user.branchId;
      const atRiskStudents = await getStudentsAtRisk(branchId);

      res.json({
        success: true,
        message: `Found ${atRiskStudents.length} students at risk of becoming inactive`,
        data: {
          threshold: CONFIG.ABSENCE_THRESHOLD_DAYS,
          students: atRiskStudents,
        },
      });
    } catch (error) {
      console.error("Get at-risk students error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get at-risk students",
        error: error.message,
      });
    }
  }
);

/**
 * @route   GET /api/students/inactivity/config
 * @desc    Get the current inactivity configuration
 * @access  Private (Admin)
 */
router.get("/inactivity/config", protect, requireAdmin, async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        absenceThresholdDays: CONFIG.ABSENCE_THRESHOLD_DAYS,
        activeStatuses: CONFIG.ACTIVE_STATUSES,
        inactiveStatus: CONFIG.INACTIVE_STATUS,
        description: `Students are automatically marked as '${CONFIG.INACTIVE_STATUS}' if they have no attendance records for ${CONFIG.ABSENCE_THRESHOLD_DAYS} school days (approximately 2 weeks, Monday-Friday).`,
        scheduledCheckTime: "Daily at 6:00 AM (Mon-Fri)",
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to get configuration",
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/students/inactivity/reactivate/:studentId
 * @desc    Manually reactivate an inactive student
 * @access  Private (Admin, Secretary)
 */
router.post(
  "/inactivity/reactivate/:studentId",
  protect,
  authorize("admin", "secretary"),
  async (req, res) => {
    try {
      const { studentId } = req.params;
      const { reason } = req.body;

      const result = await reactivateStudent(
        studentId,
        req.user._id,
        reason || "Manually reactivated by admin"
      );

      if (result.alreadyActive) {
        return res.json({
          success: true,
          message: "Student is already active",
          data: result,
        });
      }

      res.json({
        success: true,
        message: "Student reactivated successfully",
        data: result,
      });
    } catch (error) {
      console.error("Reactivate student error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to reactivate student",
        error: error.message,
      });
    }
  }
);

/**
 * @route   GET /api/students/inactivity/status/:studentId
 * @desc    Get inactivity status for a specific student
 * @access  Private (Admin, Secretary, Teacher)
 */
router.get(
  "/inactivity/status/:studentId",
  protect,
  authorize("admin", "secretary", "teacher"),
  async (req, res) => {
    try {
      const { studentId } = req.params;

      const student = await Student.findById(studentId)
        .populate("userId", "firstName lastName email")
        .select("studentId admissionNumber academicStatus statusHistory");

      if (!student) {
        return res.status(404).json({
          success: false,
          message: "Student not found",
        });
      }

      const lastAttendance = await getLastAttendanceDate(
        student._id,
        student.userId
      );

      // Count school days since last attendance
      let daysAbsent = 0;
      if (lastAttendance) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const checkDate = new Date(lastAttendance);
        checkDate.setHours(0, 0, 0, 0);

        while (checkDate < today) {
          checkDate.setDate(checkDate.getDate() + 1);
          const dayOfWeek = checkDate.getDay();
          if (dayOfWeek >= 1 && dayOfWeek <= 5) {
            daysAbsent++;
          }
        }
      } else {
        daysAbsent = CONFIG.ABSENCE_THRESHOLD_DAYS; // Max if no record
      }

      const isAtRisk =
        daysAbsent >= Math.floor(CONFIG.ABSENCE_THRESHOLD_DAYS / 2) &&
        daysAbsent < CONFIG.ABSENCE_THRESHOLD_DAYS;
      const willBeMarkedInactive =
        daysAbsent >= CONFIG.ABSENCE_THRESHOLD_DAYS &&
        student.academicStatus === "active";

      res.json({
        success: true,
        data: {
          student: {
            id: student._id,
            studentId: student.studentId,
            admissionNumber: student.admissionNumber,
            name: student.userId
              ? `${student.userId.firstName} ${student.userId.lastName}`
              : "Unknown",
            currentStatus: student.academicStatus,
          },
          attendance: {
            lastAttendanceDate: lastAttendance,
            schoolDaysAbsent: daysAbsent,
            threshold: CONFIG.ABSENCE_THRESHOLD_DAYS,
            isAtRisk,
            willBeMarkedInactive,
          },
          statusHistory: student.statusHistory.slice(-5), // Last 5 status changes
        },
      });
    } catch (error) {
      console.error("Get student inactivity status error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get student inactivity status",
        error: error.message,
      });
    }
  }
);

/**
 * @route   GET /api/students/inactivity/summary
 * @desc    Get summary of inactive students in the branch
 * @access  Private (Admin, Secretary)
 */
router.get(
  "/inactivity/summary",
  protect,
  authorize("admin", "secretary"),
  async (req, res) => {
    try {
      const branchId = req.user.branchId;

      // Get counts
      const [
        totalStudents,
        activeStudents,
        inactiveStudents,
        recentlyInactive,
      ] = await Promise.all([
        Student.countDocuments({ branchId }),
        Student.countDocuments({ branchId, academicStatus: "active" }),
        Student.countDocuments({ branchId, academicStatus: "inactive" }),
        Student.find({
          branchId,
          academicStatus: "inactive",
          "statusHistory.reason": { $regex: /automatically marked inactive/i },
        })
          .sort({ "statusHistory.changedAt": -1 })
          .limit(10)
          .populate("userId", "firstName lastName")
          .select("studentId admissionNumber statusHistory"),
      ]);

      // Get at-risk students
      const atRiskStudents = await getStudentsAtRisk(branchId);

      res.json({
        success: true,
        data: {
          summary: {
            totalStudents,
            activeStudents,
            inactiveStudents,
            atRiskCount: atRiskStudents.length,
            inactivityRate:
              totalStudents > 0
                ? ((inactiveStudents / totalStudents) * 100).toFixed(2)
                : 0,
          },
          config: {
            absenceThresholdDays: CONFIG.ABSENCE_THRESHOLD_DAYS,
            description: `Students absent for ${CONFIG.ABSENCE_THRESHOLD_DAYS}+ school days are marked inactive`,
          },
          recentlyMarkedInactive: recentlyInactive.map((s) => ({
            id: s._id,
            studentId: s.studentId,
            admissionNumber: s.admissionNumber,
            name: s.userId
              ? `${s.userId.firstName} ${s.userId.lastName}`
              : "Unknown",
            markedInactiveAt: s.statusHistory.find(
              (h) =>
                h.newStatus === "inactive" &&
                h.reason?.includes("automatically")
            )?.changedAt,
          })),
          atRiskStudents: atRiskStudents.slice(0, 10), // Top 10 at risk
        },
      });
    } catch (error) {
      console.error("Get inactivity summary error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get inactivity summary",
        error: error.message,
      });
    }
  }
);

/**
 * @route   POST /api/students/inactivity/notify-at-risk
 * @desc    Send notification to all at-risk students in the branch
 * @access  Private (Admin, Secretary)
 */
router.post(
  "/inactivity/notify-at-risk",
  protect,
  authorize("admin", "secretary"),
  async (req, res) => {
    try {
      const branchId = req.user.branchId;
      console.log(
        `📧 At-risk notifications triggered by user: ${req.user.email}`
      );

      const result = await sendAtRiskNotifications(branchId);

      if (result.success) {
        res.json({
          success: true,
          message: `Sent ${result.notificationsSent} notifications to at-risk students`,
          data: result,
        });
      } else {
        res.status(500).json({
          success: false,
          message: "Failed to send notifications",
          error: result.error,
        });
      }
    } catch (error) {
      console.error("At-risk notifications error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to send at-risk notifications",
        error: error.message,
      });
    }
  }
);

/**
 * @route   POST /api/students/inactivity/notify-at-risk-all
 * @desc    Send notification to all at-risk students across ALL branches (superadmin only)
 * @access  Private (Superadmin only)
 */
router.post(
  "/inactivity/notify-at-risk-all",
  protect,
  requireAdmin,
  async (req, res) => {
    try {
      // Check if user is superadmin
      if (!req.user.roles.includes("superadmin")) {
        return res.status(403).json({
          success: false,
          message: "Only superadmin can send notifications to all branches",
        });
      }

      console.log(
        `📧 All-branch at-risk notifications triggered by superadmin: ${req.user.email}`
      );

      const result = await sendAtRiskNotificationsAllBranches();

      if (result.success) {
        res.json({
          success: true,
          message: `Sent ${result.totalNotificationsSent} notifications across all branches`,
          data: result,
        });
      } else {
        res.status(500).json({
          success: false,
          message: "Failed to send notifications",
          error: result.error,
        });
      }
    } catch (error) {
      console.error("All-branch notifications error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to send at-risk notifications to all branches",
        error: error.message,
      });
    }
  }
);

module.exports = router;
