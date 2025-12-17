const Attendance = require("../models/Attendance");
const User = require("../models/User");
const Student = require("../models/Student");
const Teacher = require("../models/Teacher");
const Class = require("../models/Class");
const { isSuperAdmin } = require("../utils/accessControl");
const mongoose = require("mongoose");
const ExcelJS = require("exceljs");

// Helper function to get branch filter based on user role
const getBranchFilter = (user) => {
  return isSuperAdmin(user) ? {} : { branchId: user.branchId };
};

// @desc    Get attendance dashboard data
// @route   GET /api/attendance/reports/dashboard
// @access  Private (Admin, Secretary, Teacher)
const getAttendanceDashboard = async (req, res) => {
  try {
    const branchFilter = getBranchFilter(req.user);
    const { period = "month", userType, classId } = req.query;

    const now = new Date();
    let startDate, endDate;

    // Calculate date range based on period
    switch (period) {
      case "today":
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
        break;
      case "week":
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startDate = new Date(
          startOfWeek.getFullYear(),
          startOfWeek.getMonth(),
          startOfWeek.getDate()
        );
        endDate = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);
        break;
      case "month":
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        break;
    }

    const query = {
      ...branchFilter,
      date: { $gte: startDate, $lt: endDate },
    };

    if (userType) query.userType = userType;
    if (classId) query.classId = classId;

    // Overall attendance statistics
    const overallStats = await Attendance.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalRecords: { $sum: 1 },
          presentCount: {
            $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] },
          },
          absentCount: {
            $sum: { $cond: [{ $eq: ["$status", "absent"] }, 1, 0] },
          },
          lateCount: {
            $sum: { $cond: [{ $eq: ["$status", "late"] }, 1, 0] },
          },
          totalHours: { $sum: "$totalHours" },
          avgHours: { $avg: "$totalHours" },
          lateArrivals: { $sum: { $cond: ["$isLate", 1, 0] } },
          earlyDepartures: { $sum: { $cond: ["$isEarlyDeparture", 1, 0] } },
        },
      },
    ]);

    // Daily attendance trend
    const dailyTrend = await Attendance.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            year: { $year: "$date" },
            month: { $month: "$date" },
            day: { $dayOfMonth: "$date" },
            status: "$status",
          },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: {
            year: "$_id.year",
            month: "$_id.month",
            day: "$_id.day",
          },
          statusBreakdown: {
            $push: {
              status: "$_id.status",
              count: "$count",
            },
          },
          totalCount: { $sum: "$count" },
        },
      },
      {
        $sort: {
          "_id.year": 1,
          "_id.month": 1,
          "_id.day": 1,
        },
      },
    ]);

    // Attendance by user type
    const userTypeBreakdown = await Attendance.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$userType",
          totalRecords: { $sum: 1 },
          presentCount: {
            $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] },
          },
          lateCount: {
            $sum: { $cond: [{ $eq: ["$status", "late"] }, 1, 0] },
          },
          totalHours: { $sum: "$totalHours" },
          avgHours: { $avg: "$totalHours" },
        },
      },
    ]);

    // Top performers (highest attendance rate)
    const topPerformers = await Attendance.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$userId",
          totalDays: { $sum: 1 },
          presentDays: {
            $sum: { $cond: [{ $ne: ["$status", "absent"] }, 1, 0] },
          },
          totalHours: { $sum: "$totalHours" },
          avgHours: { $avg: "$totalHours" },
          lateCount: { $sum: { $cond: ["$isLate", 1, 0] } },
        },
      },
      {
        $addFields: {
          attendanceRate: {
            $multiply: [{ $divide: ["$presentDays", "$totalDays"] }, 100],
          },
        },
      },
      { $sort: { attendanceRate: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $project: {
          name: { $concat: ["$user.firstName", " ", "$user.lastName"] },
          email: "$user.email",
          userType: { $arrayElemAt: ["$user.roles", 0] },
          totalDays: 1,
          presentDays: 1,
          attendanceRate: { $round: ["$attendanceRate", 1] },
          totalHours: { $round: ["$totalHours", 1] },
          avgHours: { $round: ["$avgHours", 1] },
          lateCount: 1,
        },
      },
    ]);

    // Attendance by class (for students)
    const classwiseStats = await Attendance.aggregate([
      {
        $match: {
          ...query,
          userType: "student",
          classId: { $exists: true },
        },
      },
      {
        $group: {
          _id: "$classId",
          totalStudents: { $addToSet: "$userId" },
          totalRecords: { $sum: 1 },
          presentCount: {
            $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] },
          },
          lateCount: {
            $sum: { $cond: [{ $eq: ["$status", "late"] }, 1, 0] },
          },
        },
      },
      {
        $addFields: {
          totalStudentCount: { $size: "$totalStudents" },
          attendanceRate: {
            $multiply: [{ $divide: ["$presentCount", "$totalRecords"] }, 100],
          },
        },
      },
      {
        $lookup: {
          from: "classes",
          localField: "_id",
          foreignField: "_id",
          as: "class",
        },
      },
      { $unwind: "$class" },
      {
        $project: {
          className: "$class.name",
          grade: "$class.grade",
          section: "$class.section",
          totalStudentCount: 1,
          totalRecords: 1,
          presentCount: 1,
          lateCount: 1,
          attendanceRate: { $round: ["$attendanceRate", 1] },
        },
      },
      { $sort: { attendanceRate: -1 } },
    ]);

    // Recent attendance alerts (late arrivals, early departures)
    const recentAlerts = await Attendance.find({
      branchId,
      date: { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
      $or: [{ isLate: true }, { isEarlyDeparture: true }, { status: "absent" }],
    })
      .populate("userId", "firstName lastName email")
      .populate("classId", "name")
      .sort({ date: -1 })
      .limit(20)
      .select(
        "userId classId date status isLate isEarlyDeparture lateMinutes earlyDepartureMinutes"
      );

    res.json({
      success: true,
      data: {
        period,
        dateRange: { startDate, endDate },
        overallStats: overallStats[0] || {
          totalRecords: 0,
          presentCount: 0,
          absentCount: 0,
          lateCount: 0,
          totalHours: 0,
          avgHours: 0,
          lateArrivals: 0,
          earlyDepartures: 0,
        },
        dailyTrend,
        userTypeBreakdown,
        topPerformers,
        classwiseStats,
        recentAlerts,
      },
    });
  } catch (error) {
    console.error("Get attendance dashboard error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Get detailed attendance report
// @route   GET /api/attendance/reports/detailed
// @access  Private (Admin, Secretary, Teacher)
const getDetailedAttendanceReport = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      userType,
      classId,
      status,
      includeAbsent = "false",
    } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Start date and end date are required",
      });
    }

    const branchFilter = getBranchFilter(req.user);
    const query = {
      ...branchFilter,
      date: {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      },
    };

    if (userType) query.userType = userType;
    if (classId) query.classId = classId;
    if (status) query.status = status;

    // Get all users in the branch for the specified type
    let usersQuery = { ...branchFilter, status: "active" };
    if (userType) usersQuery.roles = { $in: [userType] };

    const allUsers = await User.find(usersQuery).select(
      "_id firstName lastName email roles"
    );

    // Get attendance records
    const attendanceRecords = await Attendance.find(query)
      .populate("userId", "firstName lastName email")
      .populate("classId", "name grade section")
      .sort({ date: 1, "userId.firstName": 1 });

    // Create date range array
    const dates = [];
    const current = new Date(startDate);
    const end = new Date(endDate);

    while (current <= end) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }

    // Build detailed report
    const report = [];

    for (const user of allUsers) {
      const userReport = {
        userId: user._id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        userType: user.roles[0],
        attendance: {},
        summary: {
          totalDays: dates.length,
          presentDays: 0,
          absentDays: 0,
          lateDays: 0,
          totalHours: 0,
          attendanceRate: 0,
        },
      };

      // Get user's attendance for each date
      for (const date of dates) {
        const dateKey = date.toISOString().split("T")[0];
        const attendance = attendanceRecords.find(
          (record) =>
            record.userId._id.toString() === user._id.toString() &&
            record.date.toISOString().split("T")[0] === dateKey
        );

        if (attendance) {
          userReport.attendance[dateKey] = {
            status: attendance.status,
            clockInTime: attendance.clockInTime,
            clockOutTime: attendance.clockOutTime,
            totalHours: attendance.totalHours,
            isLate: attendance.isLate,
            lateMinutes: attendance.lateMinutes,
            isEarlyDeparture: attendance.isEarlyDeparture,
            notes: attendance.notes,
          };

          // Update summary
          if (attendance.status !== "absent") {
            userReport.summary.presentDays++;
          } else {
            userReport.summary.absentDays++;
          }

          if (attendance.isLate) {
            userReport.summary.lateDays++;
          }

          userReport.summary.totalHours += attendance.totalHours || 0;
        } else {
          // Mark as absent if no attendance record
          userReport.attendance[dateKey] = {
            status: "absent",
            clockInTime: null,
            clockOutTime: null,
            totalHours: 0,
            isLate: false,
            lateMinutes: 0,
            isEarlyDeparture: false,
            notes: null,
          };
          userReport.summary.absentDays++;
        }
      }

      // Calculate attendance rate
      userReport.summary.attendanceRate = Math.round(
        (userReport.summary.presentDays / userReport.summary.totalDays) * 100
      );

      // Include user in report based on filters
      if (includeAbsent === "true" || userReport.summary.presentDays > 0) {
        report.push(userReport);
      }
    }

    res.json({
      success: true,
      data: {
        dateRange: { startDate, endDate },
        dates: dates.map((d) => d.toISOString().split("T")[0]),
        totalUsers: report.length,
        report,
      },
    });
  } catch (error) {
    console.error("Get detailed attendance report error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Export attendance report to Excel
// @route   GET /api/attendance/reports/export
// @access  Private (Admin, Secretary)
const exportAttendanceReport = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      userType,
      classId,
      format = "excel",
    } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Start date and end date are required",
      });
    }

    const branchFilter = getBranchFilter(req.user);
    const query = {
      ...branchFilter,
      date: {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      },
    };

    if (userType) query.userType = userType;
    if (classId) query.classId = classId;

    const attendanceRecords = await Attendance.find(query)
      .populate("userId", "firstName lastName email phone")
      .populate("studentId", "studentId admissionNumber")
      .populate("teacherId", "employeeId department")
      .populate("classId", "name grade section")
      .sort({ date: 1, "userId.firstName": 1 });

    if (format === "excel") {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Attendance Report");

      // Add headers
      const headers = [
        "Date",
        "Name",
        "Email",
        "User Type",
        "Student/Employee ID",
        "Class",
        "Clock In",
        "Clock Out",
        "Total Hours",
        "Status",
        "Late",
        "Late Minutes",
        "Early Departure",
        "Notes",
      ];

      worksheet.addRow(headers);

      // Style headers
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" },
      };

      // Add data rows
      attendanceRecords.forEach((record) => {
        const row = [
          record.date.toLocaleDateString(),
          `${record.userId.firstName} ${record.userId.lastName}`,
          record.userId.email,
          record.userType,
          record.studentId?.studentId || record.teacherId?.employeeId || "",
          record.classId?.name || "",
          record.clockInTime?.toLocaleTimeString() || "",
          record.clockOutTime?.toLocaleTimeString() || "",
          record.totalHours || 0,
          record.status,
          record.isLate ? "Yes" : "No",
          record.lateMinutes || 0,
          record.isEarlyDeparture ? "Yes" : "No",
          record.notes || "",
        ];
        worksheet.addRow(row);
      });

      // Auto-fit columns
      worksheet.columns.forEach((column) => {
        column.width =
          Math.max(
            column.header?.length || 0,
            ...column.values.map((val) => val?.toString().length || 0)
          ) + 2;
      });

      // Set response headers for Excel download
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=attendance-report-${startDate}-to-${endDate}.xlsx`
      );

      await workbook.xlsx.write(res);
      res.end();
    } else {
      // Return JSON format
      res.json({
        success: true,
        data: attendanceRecords,
        summary: {
          totalRecords: attendanceRecords.length,
          dateRange: { startDate, endDate },
        },
      });
    }
  } catch (error) {
    console.error("Export attendance report error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Get attendance trends analysis
// @route   GET /api/attendance/reports/trends
// @access  Private (Admin, Secretary, Teacher)
const getAttendanceTrends = async (req, res) => {
  try {
    const { period = "month", userType, classId } = req.query;
    const branchFilter = getBranchFilter(req.user);

    const now = new Date();
    let startDate, groupBy;

    switch (period) {
      case "week":
        startDate = new Date(now.getTime() - 8 * 7 * 24 * 60 * 60 * 1000); // 8 weeks
        groupBy = {
          year: { $year: "$date" },
          week: { $week: "$date" },
        };
        break;
      case "year":
        startDate = new Date(now.getTime() - 3 * 365 * 24 * 60 * 60 * 1000); // 3 years
        groupBy = {
          year: { $year: "$date" },
        };
        break;
      case "month":
      default:
        startDate = new Date(now.getTime() - 12 * 30 * 24 * 60 * 60 * 1000); // 12 months
        groupBy = {
          year: { $year: "$date" },
          month: { $month: "$date" },
        };
        break;
    }

    const query = {
      ...branchFilter,
      date: { $gte: startDate },
    };

    if (userType) query.userType = userType;
    if (classId) query.classId = classId;

    const trends = await Attendance.aggregate([
      { $match: query },
      {
        $group: {
          _id: groupBy,
          totalRecords: { $sum: 1 },
          presentCount: {
            $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] },
          },
          lateCount: {
            $sum: { $cond: [{ $eq: ["$status", "late"] }, 1, 0] },
          },
          absentCount: {
            $sum: { $cond: [{ $eq: ["$status", "absent"] }, 1, 0] },
          },
          totalHours: { $sum: "$totalHours" },
          avgHours: { $avg: "$totalHours" },
          lateArrivals: { $sum: { $cond: ["$isLate", 1, 0] } },
          earlyDepartures: { $sum: { $cond: ["$isEarlyDeparture", 1, 0] } },
        },
      },
      {
        $addFields: {
          attendanceRate: {
            $multiply: [{ $divide: ["$presentCount", "$totalRecords"] }, 100],
          },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.week": 1 } },
    ]);

    res.json({
      success: true,
      data: {
        period,
        trends: trends.map((trend) => ({
          ...trend,
          attendanceRate: Math.round(trend.attendanceRate * 100) / 100,
          totalHours: Math.round(trend.totalHours * 100) / 100,
          avgHours: Math.round(trend.avgHours * 100) / 100,
        })),
      },
    });
  } catch (error) {
    console.error("Get attendance trends error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

module.exports = {
  getAttendanceDashboard,
  getDetailedAttendanceReport,
  exportAttendanceReport,
  getAttendanceTrends,
};
