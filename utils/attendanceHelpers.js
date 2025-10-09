const Attendance = require("../models/Attendance");
const User = require("../models/User");
const Student = require("../models/Student");
const Teacher = require("../models/Teacher");

// Calculate attendance statistics for a given period
const calculateAttendanceStats = async (
  branchId,
  startDate,
  endDate,
  userType = null
) => {
  try {
    const query = { branchId };

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    if (userType) query.userType = userType;

    const stats = await Attendance.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalRecords: { $sum: 1 },
          uniqueUsers: { $addToSet: "$userId" },
          presentCount: {
            $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] },
          },
          absentCount: {
            $sum: { $cond: [{ $eq: ["$status", "absent"] }, 1, 0] },
          },
          lateCount: {
            $sum: { $cond: [{ $eq: ["$status", "late"] }, 1, 0] },
          },
          halfDayCount: {
            $sum: { $cond: [{ $eq: ["$status", "half_day"] }, 1, 0] },
          },
          earlyDepartureCount: {
            $sum: { $cond: [{ $eq: ["$status", "early_departure"] }, 1, 0] },
          },
          totalHours: { $sum: "$totalHours" },
          avgHours: { $avg: "$totalHours" },
          lateArrivals: { $sum: { $cond: ["$isLate", 1, 0] } },
          earlyDepartures: { $sum: { $cond: ["$isEarlyDeparture", 1, 0] } },
          avgLateMinutes: { $avg: "$lateMinutes" },
          avgEarlyDepartureMinutes: { $avg: "$earlyDepartureMinutes" },
        },
      },
    ]);

    const result = stats[0] || {
      totalRecords: 0,
      uniqueUsers: [],
      presentCount: 0,
      absentCount: 0,
      lateCount: 0,
      halfDayCount: 0,
      earlyDepartureCount: 0,
      totalHours: 0,
      avgHours: 0,
      lateArrivals: 0,
      earlyDepartures: 0,
      avgLateMinutes: 0,
      avgEarlyDepartureMinutes: 0,
    };

    // Calculate attendance rate
    const totalNonAbsent =
      result.presentCount +
      result.lateCount +
      result.halfDayCount +
      result.earlyDepartureCount;
    result.attendanceRate =
      result.totalRecords > 0
        ? Math.round((totalNonAbsent / result.totalRecords) * 100)
        : 0;

    result.uniqueUserCount = result.uniqueUsers ? result.uniqueUsers.length : 0;
    delete result.uniqueUsers; // Remove the actual array to keep response clean

    return result;
  } catch (error) {
    console.error("Calculate attendance stats error:", error);
    throw error;
  }
};

// Get attendance breakdown by user type
const getAttendanceBreakdownByUserType = async (
  branchId,
  startDate,
  endDate
) => {
  try {
    const query = { branchId };

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const breakdown = await Attendance.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$userType",
          totalRecords: { $sum: 1 },
          uniqueUsers: { $addToSet: "$userId" },
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
        },
      },
      { $sort: { totalRecords: -1 } },
    ]);

    return breakdown.map((item) => {
      const totalNonAbsent = item.presentCount + item.lateCount;
      return {
        userType: item._id,
        totalRecords: item.totalRecords,
        uniqueUserCount: item.uniqueUsers.length,
        presentCount: item.presentCount,
        absentCount: item.absentCount,
        lateCount: item.lateCount,
        totalHours: Math.round(item.totalHours),
        avgHours: Math.round(item.avgHours * 100) / 100,
        lateArrivals: item.lateArrivals,
        attendanceRate:
          item.totalRecords > 0
            ? Math.round((totalNonAbsent / item.totalRecords) * 100)
            : 0,
      };
    });
  } catch (error) {
    console.error("Get attendance breakdown error:", error);
    throw error;
  }
};

// Get attendance trends for a specific period
const getAttendanceTrends = async (branchId, days = 30, userType = null) => {
  try {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    const query = {
      branchId,
      date: { $gte: startDate, $lte: endDate },
    };

    if (userType) query.userType = userType;

    const trends = await Attendance.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            year: { $year: "$date" },
            month: { $month: "$date" },
            day: { $dayOfMonth: "$date" },
          },
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
          lateArrivals: { $sum: { $cond: ["$isLate", 1, 0] } },
        },
      },
      {
        $addFields: {
          date: {
            $dateFromParts: {
              year: "$_id.year",
              month: "$_id.month",
              day: "$_id.day",
            },
          },
          attendanceRate: {
            $multiply: [{ $divide: ["$presentCount", "$totalRecords"] }, 100],
          },
        },
      },
      { $sort: { date: 1 } },
      {
        $project: {
          _id: 0,
          date: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
          totalRecords: 1,
          presentCount: 1,
          absentCount: 1,
          lateCount: 1,
          totalHours: { $round: ["$totalHours", 1] },
          lateArrivals: 1,
          attendanceRate: { $round: ["$attendanceRate", 1] },
        },
      },
    ]);

    return trends;
  } catch (error) {
    console.error("Get attendance trends error:", error);
    throw error;
  }
};

// Get class-wise attendance summary
const getClasswiseAttendanceSummary = async (branchId, startDate, endDate) => {
  try {
    const query = {
      branchId,
      userType: "student",
      classId: { $exists: true },
    };

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const summary = await Attendance.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$classId",
          totalRecords: { $sum: 1 },
          uniqueStudents: { $addToSet: "$userId" },
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
          lateArrivals: { $sum: { $cond: ["$isLate", 1, 0] } },
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
        $addFields: {
          attendanceRate: {
            $multiply: [{ $divide: ["$presentCount", "$totalRecords"] }, 100],
          },
        },
      },
      { $sort: { "class.name": 1 } },
      {
        $project: {
          classId: "$_id",
          className: "$class.name",
          grade: "$class.grade",
          section: "$class.section",
          totalRecords: 1,
          uniqueStudentCount: { $size: "$uniqueStudents" },
          presentCount: 1,
          absentCount: 1,
          lateCount: 1,
          totalHours: { $round: ["$totalHours", 1] },
          lateArrivals: 1,
          attendanceRate: { $round: ["$attendanceRate", 1] },
        },
      },
    ]);

    return summary;
  } catch (error) {
    console.error("Get classwise attendance summary error:", error);
    throw error;
  }
};

// Get top performers by attendance rate
const getTopPerformers = async (
  branchId,
  startDate,
  endDate,
  userType = null,
  limit = 10
) => {
  try {
    const query = { branchId };

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    if (userType) query.userType = userType;

    const performers = await Attendance.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$userId",
          totalDays: { $sum: 1 },
          presentDays: {
            $sum: { $cond: [{ $ne: ["$status", "absent"] }, 1, 0] },
          },
          lateDays: { $sum: { $cond: ["$isLate", 1, 0] } },
          totalHours: { $sum: "$totalHours" },
          avgHours: { $avg: "$totalHours" },
          userType: { $first: "$userType" },
        },
      },
      {
        $addFields: {
          attendanceRate: {
            $multiply: [{ $divide: ["$presentDays", "$totalDays"] }, 100],
          },
        },
      },
      { $sort: { attendanceRate: -1, totalHours: -1 } },
      { $limit: limit },
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
          userId: "$_id",
          name: { $concat: ["$user.firstName", " ", "$user.lastName"] },
          email: "$user.email",
          userType: 1,
          totalDays: 1,
          presentDays: 1,
          lateDays: 1,
          totalHours: { $round: ["$totalHours", 1] },
          avgHours: { $round: ["$avgHours", 1] },
          attendanceRate: { $round: ["$attendanceRate", 1] },
        },
      },
    ]);

    return performers;
  } catch (error) {
    console.error("Get top performers error:", error);
    throw error;
  }
};

// Get attendance alerts (late arrivals, early departures, etc.)
const getAttendanceAlerts = async (branchId, days = 7) => {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const alerts = await Attendance.find({
      branchId,
      date: { $gte: startDate },
      $or: [
        { isLate: true },
        { isEarlyDeparture: true },
        { status: "absent" },
        { status: "half_day" },
        { lateMinutes: { $gte: 30 } },
        { earlyDepartureMinutes: { $gte: 30 } },
      ],
    })
      .populate("userId", "firstName lastName email")
      .populate("classId", "name grade section")
      .sort({ date: -1, clockInTime: -1 })
      .limit(50)
      .select(
        "userId classId date clockInTime clockOutTime status isLate isEarlyDeparture lateMinutes earlyDepartureMinutes notes"
      );

    return alerts.map((alert) => ({
      id: alert._id,
      user: alert.userId,
      class: alert.classId,
      date: alert.date.toISOString().split("T")[0],
      clockInTime: alert.clockInTime,
      clockOutTime: alert.clockOutTime,
      status: alert.status,
      alertType: getAlertType(alert),
      severity: getAlertSeverity(alert),
      message: getAlertMessage(alert),
      notes: alert.notes,
    }));
  } catch (error) {
    console.error("Get attendance alerts error:", error);
    throw error;
  }
};

// Helper function to determine alert type
const getAlertType = (attendance) => {
  if (attendance.status === "absent") return "absent";
  if (attendance.status === "half_day") return "half_day";
  if (attendance.isLate && attendance.lateMinutes >= 30) return "very_late";
  if (attendance.isLate) return "late";
  if (attendance.isEarlyDeparture && attendance.earlyDepartureMinutes >= 30)
    return "very_early_departure";
  if (attendance.isEarlyDeparture) return "early_departure";
  return "normal";
};

// Helper function to determine alert severity
const getAlertSeverity = (attendance) => {
  if (attendance.status === "absent") return "high";
  if (attendance.lateMinutes >= 60 || attendance.earlyDepartureMinutes >= 60)
    return "high";
  if (attendance.lateMinutes >= 30 || attendance.earlyDepartureMinutes >= 30)
    return "medium";
  if (attendance.isLate || attendance.isEarlyDeparture) return "low";
  return "normal";
};

// Helper function to generate alert message
const getAlertMessage = (attendance) => {
  if (attendance.status === "absent") {
    return "Marked as absent";
  }
  if (attendance.status === "half_day") {
    return "Half day attendance";
  }
  if (attendance.isLate && attendance.isEarlyDeparture) {
    return `Late by ${attendance.lateMinutes} min, left ${attendance.earlyDepartureMinutes} min early`;
  }
  if (attendance.isLate) {
    return `Late arrival by ${attendance.lateMinutes} minutes`;
  }
  if (attendance.isEarlyDeparture) {
    return `Early departure by ${attendance.earlyDepartureMinutes} minutes`;
  }
  return "Normal attendance";
};

// Validate attendance data
const validateAttendanceData = (attendanceData) => {
  const errors = [];

  // Required fields
  if (!attendanceData.userId) {
    errors.push("User ID is required");
  }

  if (!attendanceData.userType) {
    errors.push("User type is required");
  }

  if (!attendanceData.clockInTime) {
    errors.push("Clock in time is required");
  }

  // Date validation
  if (attendanceData.clockInTime && attendanceData.clockOutTime) {
    const clockIn = new Date(attendanceData.clockInTime);
    const clockOut = new Date(attendanceData.clockOutTime);

    if (clockOut <= clockIn) {
      errors.push("Clock out time must be after clock in time");
    }

    // Check if times are on the same day
    if (clockIn.toDateString() !== clockOut.toDateString()) {
      errors.push("Clock in and clock out must be on the same day");
    }
  }

  // Future date validation
  if (attendanceData.clockInTime) {
    const clockIn = new Date(attendanceData.clockInTime);
    const now = new Date();

    if (clockIn > now) {
      errors.push("Clock in time cannot be in the future");
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

// Get working hours for a user type (can be customized per branch)
const getWorkingHours = (userType, branchId = null) => {
  // Default working hours - can be made configurable per branch
  const defaultHours = {
    student: {
      start: "08:00",
      end: "15:30",
      expectedHours: 7.5,
    },
    teacher: {
      start: "07:30",
      end: "16:30",
      expectedHours: 8.5,
    },
    secretary: {
      start: "08:00",
      end: "17:00",
      expectedHours: 8,
    },
    admin: {
      start: "08:00",
      end: "17:00",
      expectedHours: 8,
    },
  };

  return defaultHours[userType] || defaultHours.teacher;
};

module.exports = {
  calculateAttendanceStats,
  getAttendanceBreakdownByUserType,
  getAttendanceTrends,
  getClasswiseAttendanceSummary,
  getTopPerformers,
  getAttendanceAlerts,
  validateAttendanceData,
  getWorkingHours,
  getAlertType,
  getAlertSeverity,
  getAlertMessage,
};
