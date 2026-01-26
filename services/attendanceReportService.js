/**
 * Attendance Report Service
 *
 * Generates comprehensive attendance reports for students
 * Used by WhatsApp integration for weekly notifications
 */

const Attendance = require("../models/Attendance");
const Student = require("../models/Student");
const Class = require("../models/Class");
const mongoose = require("mongoose");
const { isSuperAdmin } = require("../utils/accessControl");

class AttendanceReportService {
  constructor() {
    this.reportCache = new Map(); // Cache for performance
  }

  /**
   * Generate attendance report for a specific student and date range
   * @param {string} studentId - Student ID
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Object} Attendance report data
   */
  async generateStudentReport(studentId, startDate, endDate) {
    try {
      // Get student details
      const student = await Student.findById(studentId)
        .populate("userId", "firstName lastName")
        .populate("currentClassId", "name")
        .populate("branchId", "name");

      if (!student) {
        throw new Error("Student not found");
      }

      // Get attendance records for the period
      const attendanceRecords = await Attendance.find({
        studentId: studentId,
        date: { $gte: startDate, $lte: endDate },
        status: { $exists: true },
      }).sort({ date: 1 });

      // Calculate attendance statistics
      const totalDays = attendanceRecords.length;
      const presentDays = attendanceRecords.filter(
        (record) => record.status === "present",
      ).length;
      const absentDays = attendanceRecords.filter(
        (record) => record.status === "absent",
      ).length;
      const lateDays = attendanceRecords.filter(
        (record) => record.status === "late",
      ).length;
      const excusedDays = attendanceRecords.filter(
        (record) => record.status === "excused",
      ).length;

      const attendancePercentage =
        totalDays > 0 ? (presentDays / totalDays) * 100 : 0;

      // Determine attendance status
      let statusEmoji = "🟢";
      let statusText = "Excellent";
      let statusMessage = "Keep up the great work!";

      if (attendancePercentage >= 90) {
        statusEmoji = "🟢";
        statusText = "Excellent";
        statusMessage = "Outstanding attendance! Keep it up!";
      } else if (attendancePercentage >= 80) {
        statusEmoji = "🟡";
        statusText = "Good";
        statusMessage = "Good attendance. Try to be more consistent.";
      } else if (attendancePercentage >= 70) {
        statusEmoji = "🟠";
        statusText = "Needs Improvement";
        statusMessage = "Attendance needs improvement. Please be more regular.";
      } else {
        statusEmoji = "🔴";
        statusText = "Critical";
        statusMessage =
          "Critical attendance issue. Immediate improvement required.";
      }

      // Generate detailed breakdown by day
      const dailyBreakdown = attendanceRecords.map((record) => ({
        date: record.date.toLocaleDateString(),
        status: record.status,
        time: record.checkInTime
          ? record.checkInTime.toLocaleTimeString()
          : "N/A",
        notes: record.notes || "",
      }));

      return {
        student: {
          id: student.studentId,
          name: `${student.userId.firstName} ${student.userId.lastName}`,
          class: student.currentClassId?.name || "N/A",
          branch: student.branchId?.name || "ATIAM COLLEGE",
        },
        period: {
          start: startDate.toLocaleDateString(),
          end: endDate.toLocaleDateString(),
          totalDays: totalDays,
        },
        summary: {
          present: presentDays,
          absent: absentDays,
          late: lateDays,
          excused: excusedDays,
          percentage: attendancePercentage,
          status: statusText,
          statusEmoji: statusEmoji,
          message: statusMessage,
        },
        breakdown: dailyBreakdown,
        generatedAt: new Date(),
      };
    } catch (error) {
      console.error("Error generating student attendance report:", error);
      throw error;
    }
  }

  /**
   * Generate weekly attendance report for WhatsApp notifications
   * @param {string} studentId - Student ID
   * @param {Date} weekStart - Start of the week (optional, defaults to last week)
   * @param {Date} weekEnd - End of the week (optional, defaults to last week)
   * @returns {Object} Formatted report for WhatsApp
   */
  async generateWeeklyReportForWhatsApp(
    studentId,
    weekStart = null,
    weekEnd = null,
  ) {
    try {
      // Default to last week if dates not provided
      const now = new Date();
      const startDate =
        weekStart || new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const endDate = weekEnd || now;

      const report = await this.generateStudentReport(
        studentId,
        startDate,
        endDate,
      );

      // Format for WhatsApp message
      return {
        studentName: report.student.name,
        studentId: report.student.id,
        weekStart: startDate,
        weekEnd: endDate,
        totalDays: report.period.totalDays,
        presentDays: report.summary.present,
        absentDays: report.summary.absent,
        attendancePercentage: report.summary.percentage,
        className: report.student.class,
        branchName: report.student.branch,
        statusEmoji: report.summary.statusEmoji,
        statusText: report.summary.status,
        statusMessage: report.summary.message,
      };
    } catch (error) {
      console.error("Error generating WhatsApp weekly report:", error);
      throw error;
    }
  }

  /**
   * Generate class attendance report
   * @param {string} classId - Class ID
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Object} Class attendance report
   */
  async generateClassReport(classId, startDate, endDate) {
    try {
      // Get all students in the class
      const students = await Student.find({
        currentClassId: classId,
        status: "active",
      }).populate("userId", "firstName lastName");

      const studentReports = [];

      for (const student of students) {
        try {
          const report = await this.generateStudentReport(
            student._id,
            startDate,
            endDate,
          );
          studentReports.push(report);
        } catch (error) {
          console.error(
            `Error generating report for student ${student.studentId}:`,
            error,
          );
        }
      }

      // Calculate class statistics
      const totalStudents = studentReports.length;
      const averageAttendance =
        totalStudents > 0
          ? studentReports.reduce(
              (sum, report) => sum + report.summary.percentage,
              0,
            ) / totalStudents
          : 0;

      const excellentCount = studentReports.filter(
        (r) => r.summary.percentage >= 90,
      ).length;
      const goodCount = studentReports.filter(
        (r) => r.summary.percentage >= 80 && r.summary.percentage < 90,
      ).length;
      const needsImprovementCount = studentReports.filter(
        (r) => r.summary.percentage >= 70 && r.summary.percentage < 80,
      ).length;
      const criticalCount = studentReports.filter(
        (r) => r.summary.percentage < 70,
      ).length;

      return {
        classId: classId,
        period: {
          start: startDate.toLocaleDateString(),
          end: endDate.toLocaleDateString(),
        },
        summary: {
          totalStudents: totalStudents,
          averageAttendance: averageAttendance,
          distribution: {
            excellent: excellentCount,
            good: goodCount,
            needsImprovement: needsImprovementCount,
            critical: criticalCount,
          },
        },
        studentReports: studentReports,
        generatedAt: new Date(),
      };
    } catch (error) {
      console.error("Error generating class attendance report:", error);
      throw error;
    }
  }

  /**
   * Generate bulk weekly reports for all active students
   * Used by the scheduled job
   * @param {string} classId - Optional: Generate for specific class only
   * @param {Date} weekStart - Start of the week
   * @param {Date} weekEnd - End of the week
   * @returns {Array} Array of student report data for WhatsApp
   */
  async generateBulkWeeklyReports(
    classId = null,
    weekStart = null,
    weekEnd = null,
  ) {
    try {
      console.log("📊 Generating bulk weekly attendance reports...");

      // Default to last week if dates not provided
      const now = new Date();
      const startDate =
        weekStart || new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const endDate = weekEnd || now;

      // Build student query
      const studentQuery = { status: "active" };
      if (classId) {
        studentQuery.currentClassId = classId;
      }

      // Get all active students
      const students = await Student.find(studentQuery)
        .populate("userId", "firstName lastName phone")
        .populate("currentClassId", "name")
        .populate("branchId", "name");

      console.log(
        `👥 Found ${students.length} active students for attendance reports`,
      );

      const reports = [];

      for (const student of students) {
        try {
          if (!student.userId?.phone) {
            console.log(
              `⚠️ Skipping student ${student.studentId}: No phone number`,
            );
            continue;
          }

          const report = await this.generateWeeklyReportForWhatsApp(
            student._id,
            startDate,
            endDate,
          );
          reports.push(report);
        } catch (error) {
          console.error(
            `❌ Error generating report for student ${student.studentId}:`,
            error,
          );
        }
      }

      console.log(`📊 Generated ${reports.length} attendance reports`);
      return reports;
    } catch (error) {
      console.error("Error generating bulk weekly reports:", error);
      throw error;
    }
  }

  /**
   * Get attendance trends for a student
   * @param {string} studentId - Student ID
   * @param {number} weeks - Number of weeks to analyze (default: 4)
   * @returns {Object} Attendance trend analysis
   */
  async getAttendanceTrends(studentId, weeks = 4) {
    try {
      const trends = [];
      const now = new Date();

      for (let i = weeks - 1; i >= 0; i--) {
        const weekStart = new Date(
          now.getTime() - (i + 1) * 7 * 24 * 60 * 60 * 1000,
        );
        const weekEnd = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);

        const report = await this.generateStudentReport(
          studentId,
          weekStart,
          weekEnd,
        );
        trends.push({
          week: `Week ${weeks - i}`,
          startDate: weekStart.toLocaleDateString(),
          endDate: weekEnd.toLocaleDateString(),
          percentage: report.summary.percentage,
          status: report.summary.status,
        });
      }

      // Calculate trend
      const percentages = trends.map((t) => t.percentage);
      const trend =
        percentages.length > 1
          ? (percentages[percentages.length - 1] - percentages[0]) /
            percentages.length
          : 0;

      let trendDirection = "stable";
      if (trend > 2) trendDirection = "improving";
      else if (trend < -2) trendDirection = "declining";

      return {
        studentId: studentId,
        weeksAnalyzed: weeks,
        trends: trends,
        overallTrend: trendDirection,
        averageAttendance:
          percentages.reduce((sum, p) => sum + p, 0) / percentages.length,
        generatedAt: new Date(),
      };
    } catch (error) {
      console.error("Error getting attendance trends:", error);
      throw error;
    }
  }

  /**
   * Clear report cache
   */
  clearCache() {
    this.reportCache.clear();
    console.log("🧹 Attendance report cache cleared");
  }

  /**
   * Get service statistics
   */
  getStats() {
    return {
      cacheSize: this.reportCache.size,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
    };
  }
}

module.exports = AttendanceReportService;
