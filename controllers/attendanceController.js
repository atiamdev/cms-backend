const Attendance = require("../models/Attendance");
const User = require("../models/User");
const Student = require("../models/Student");
const Teacher = require("../models/Teacher");
const Class = require("../models/Class");
const { validationResult } = require("express-validator");
const mongoose = require("mongoose");
const ZKTecoService = require("../services/zktecoService");
const { isSuperAdmin } = require("../utils/accessControl");

// Import student inactivity service for auto-reactivation
const {
  checkAndAutoReactivate,
} = require("../services/studentInactivityService");

// Helper function to get branch filter based on user role
const getBranchFilter = (user) => {
  return isSuperAdmin(user) ? {} : { branchId: user.branchId };
};

// Helper function to get valid ObjectId from user (handles sync tokens)
const getValidUserId = (user) => {
  return mongoose.Types.ObjectId.isValid(user._id)
    ? user._id
    : user.generatedBy || null;
};

// @desc    Get attendance records
// @route   GET /api/attendance
// @access  Private (Admin, Secretary, Teacher)
const getAttendanceRecords = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      startDate,
      endDate,
      dateFrom,
      dateTo,
      userType,
      classId,
      courseId,
      status,
      userId,
      search,
      sortBy = "date",
      sortOrder = "desc",
    } = req.query;

    // Build query
    const branchFilter = getBranchFilter(req.user);
    const query = { ...branchFilter };

    // Allow super admins to override branch filter for debugging (temporary)
    // This helps identify if branchId mismatch is the issue
    if (req.query.ignoreBranch === "true" && isSuperAdmin(req.user)) {
      delete query.branchId;
      console.log("  🔓 Branch filter removed (super admin override)");
    }

    // Date range filter - support both startDate/endDate and dateFrom/dateTo
    const fromDate = dateFrom || startDate;
    const toDate = dateTo || endDate;

    if (fromDate || toDate) {
      query.date = {};
      if (fromDate) {
        const start = new Date(fromDate);
        start.setHours(0, 0, 0, 0);
        query.date.$gte = start;
      }
      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        query.date.$lte = end;
      }
    }

    if (userType) query.userType = userType;
    if (classId) query.classId = classId;

    // Handle courseId filtering - need to find students enrolled in that course
    if (courseId && userType === "student") {
      const studentsInCourse = await Student.find({
        $or: [
          { courses: courseId },
          { "courseEnrollments.courseId": courseId },
        ],
        ...branchFilter,
      }).select("_id");

      const studentIds = studentsInCourse.map((s) => s._id);
      query.studentId = { $in: studentIds };

      console.log(
        `  📚 Filtering by courseId: ${courseId}, found ${studentIds.length} students`
      );
    }

    if (status) query.status = status;
    if (userId) query.userId = userId;

    // Debug logging
    console.log("📊 Attendance Query Debug:");
    console.log(
      "  User:",
      req.user.firstName,
      req.user.lastName,
      `(${req.user.email})`
    );
    console.log("  User Role:", req.user.roles);
    console.log("  User Branch ID:", req.user.branchId);
    console.log("  Query Parameters:", {
      dateFrom,
      dateTo,
      userType,
      classId,
      courseId,
      status,
    });
    console.log("  Final Query:", JSON.stringify(query, null, 2));

    // Text search
    if (search) {
      const searchRegex = new RegExp(search, "i");
      query.$or = [{ notes: searchRegex }, { deviceName: searchRegex }];
    }

    // Sort configuration
    const sortConfig = {};
    sortConfig[sortBy] = sortOrder === "desc" ? -1 : 1;

    // Populate based on user type
    let populateFields = [
      {
        path: "userId",
        select: "firstName lastName email phone",
      },
      {
        path: "recordedBy",
        select: "firstName lastName",
      },
    ];

    if (userType === "student" || !userType) {
      populateFields.push({
        path: "studentId",
        select: "studentId admissionNumber",
      });
      populateFields.push({
        path: "classId",
        select: "name grade section",
      });
    }

    if (userType === "teacher" || !userType) {
      populateFields.push({
        path: "teacherId",
        select: "employeeId department",
      });
    }

    const attendanceRecords = await Attendance.find(query)
      .populate(populateFields)
      .sort(sortConfig)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Attendance.countDocuments(query);

    // Additional debug: Check if there are ANY records for this date (ignoring branch)
    if (total === 0 && query.date) {
      const dateOnlyQuery = { date: query.date };
      if (userType) dateOnlyQuery.userType = userType;

      const anyRecordsForDate = await Attendance.countDocuments(dateOnlyQuery);
      console.log(
        `  ⚠️ Found ${anyRecordsForDate} total records for this date (all branches)`
      );

      if (anyRecordsForDate > 0) {
        // Get sample records to see what branch they belong to
        const sampleRecords = await Attendance.find(dateOnlyQuery)
          .limit(3)
          .select("branchId userType date studentId userId")
          .populate("userId", "firstName lastName branchId");
        console.log("  📋 Sample attendance records:");
        sampleRecords.forEach((record, index) => {
          console.log(`    Record ${index + 1}:`);
          console.log(`      Attendance branchId: ${record.branchId}`);
          console.log(`      User branchId: ${record.userId?.branchId}`);
          console.log(
            `      User: ${record.userId?.firstName} ${record.userId?.lastName}`
          );
          console.log(
            `      Match: ${
              record.branchId?.toString() === req.user.branchId?.toString()
                ? "✅ YES"
                : "❌ NO"
            }`
          );
        });
      }
    }

    console.log(`  ✅ Found ${total} records matching query`);

    // Calculate summary statistics
    const summaryStats = await Attendance.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalHours: { $sum: "$totalHours" },
        },
      },
    ]);

    const summary = {
      total: total,
      present: 0,
      absent: 0,
      late: 0,
      halfDay: 0,
      earlyDeparture: 0,
      totalHours: 0,
    };

    summaryStats.forEach((stat) => {
      summary[stat._id.replace("_", "")] = stat.count;
      summary.totalHours += stat.totalHours || 0;
    });

    res.json({
      success: true,
      data: attendanceRecords,
      summary,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Get attendance records error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Mark attendance (manual entry)
// @route   POST /api/attendance/mark
// @access  Private (Admin, Secretary, Teacher)
const markAttendance = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    const {
      userId,
      userType,
      classId,
      clockInTime,
      clockOutTime,
      status,
      notes,
      attendanceType = "manual",
    } = req.body;

    // Validate user exists and belongs to branch
    const user = await User.findOne({
      _id: userId,
      branchId: req.user.branchId,
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Validate user type matches
    if (!user.roles.includes(userType)) {
      return res.status(400).json({
        success: false,
        message: "User type mismatch",
      });
    }

    const attendanceDate = new Date(clockInTime);
    const dateOnly = new Date(
      attendanceDate.getFullYear(),
      attendanceDate.getMonth(),
      attendanceDate.getDate()
    );

    // Check if attendance already exists for this user and date
    const existingAttendance = await Attendance.findOne({
      branchId: req.user.branchId,
      userId,
      date: dateOnly,
    });

    if (existingAttendance) {
      return res.status(400).json({
        success: false,
        message: "Attendance already marked for this date",
      });
    }

    // Build attendance data
    const attendanceData = {
      branchId: req.user.branchId,
      userId,
      userType,
      date: dateOnly,
      clockInTime: new Date(clockInTime),
      status: status || "present",
      attendanceType,
      notes,
      recordedBy: req.user._id,
    };

    if (clockOutTime) {
      attendanceData.clockOutTime = new Date(clockOutTime);
    }

    // Add specific ID based on user type
    if (userType === "student") {
      const student = await Student.findOne({
        userId,
        branchId: req.user.branchId,
      });
      if (!student) {
        return res.status(404).json({
          success: false,
          message: "Student profile not found",
        });
      }
      attendanceData.studentId = student._id;
      attendanceData.classId = student.currentClassId;
    } else if (userType === "teacher") {
      const teacher = await Teacher.findOne({
        userId,
        branchId: req.user.branchId,
      });
      if (!teacher) {
        return res.status(404).json({
          success: false,
          message: "Teacher profile not found",
        });
      }
      attendanceData.teacherId = teacher._id;
    }

    if (classId && userType === "student") {
      attendanceData.classId = classId;
    }

    const attendance = new Attendance(attendanceData);

    // Calculate late status if clock in time is provided
    // You can customize this based on your school's schedule
    const expectedClockIn = new Date(attendanceDate);
    expectedClockIn.setHours(8, 0, 0, 0); // 8:00 AM default
    attendance.calculateLateStatus(expectedClockIn);

    await attendance.save();

    await attendance.populate("userId", "firstName lastName email");
    if (userType === "student") {
      await attendance.populate("studentId", "studentId admissionNumber");
      await attendance.populate("classId", "name grade section");
    }

    res.status(201).json({
      success: true,
      message: "Attendance marked successfully",
      data: attendance,
    });
  } catch (error) {
    console.error("Mark attendance error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Clock out user
// @route   PUT /api/attendance/:id/clock-out
// @access  Private (Admin, Secretary, Teacher, Student - own record)
const clockOut = async (req, res) => {
  try {
    const { id } = req.params;
    const { clockOutTime, notes } = req.body;

    const attendance = await Attendance.findOne({
      _id: id,
      branchId: req.user.branchId,
    });

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: "Attendance record not found",
      });
    }

    // Authorization check for students
    if (
      req.user.roles.includes("student") &&
      attendance.userId.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only clock out your own attendance",
      });
    }

    if (attendance.clockOutTime) {
      return res.status(400).json({
        success: false,
        message: "Already clocked out",
      });
    }

    attendance.clockOutTime = clockOutTime
      ? new Date(clockOutTime)
      : new Date();
    if (notes) attendance.notes = notes;
    attendance.lastModifiedBy = req.user._id;

    // Calculate early departure if needed
    const expectedClockOut = new Date(attendance.clockInTime);
    expectedClockOut.setHours(17, 0, 0, 0); // 5:00 PM default
    attendance.calculateEarlyDeparture(expectedClockOut);

    await attendance.save();

    await attendance.populate("userId", "firstName lastName email");

    res.json({
      success: true,
      message: "Clocked out successfully",
      data: attendance,
    });
  } catch (error) {
    console.error("Clock out error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Update attendance record
// @route   PUT /api/attendance/:id
// @access  Private (Admin, Secretary)
const updateAttendance = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    const { id } = req.params;
    const updateData = req.body;

    const attendance = await Attendance.findOne({
      _id: id,
      branchId: req.user.branchId,
    });

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: "Attendance record not found",
      });
    }

    // Update allowed fields
    const allowedFields = [
      "clockInTime",
      "clockOutTime",
      "status",
      "notes",
      "approvalStatus",
      "approvalNotes",
    ];

    allowedFields.forEach((field) => {
      if (updateData[field] !== undefined) {
        if (field === "clockInTime" || field === "clockOutTime") {
          attendance[field] = new Date(updateData[field]);
        } else {
          attendance[field] = updateData[field];
        }
      }
    });

    attendance.lastModifiedBy = req.user._id;

    await attendance.save();

    await attendance.populate("userId", "firstName lastName email");

    res.json({
      success: true,
      message: "Attendance updated successfully",
      data: attendance,
    });
  } catch (error) {
    console.error("Update attendance error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Delete attendance record
// @route   DELETE /api/attendance/:id
// @access  Private (Admin only)
const deleteAttendance = async (req, res) => {
  try {
    const { id } = req.params;

    const attendance = await Attendance.findOneAndDelete({
      _id: id,
      branchId: req.user.branchId,
    });

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: "Attendance record not found",
      });
    }

    res.json({
      success: true,
      message: "Attendance record deleted successfully",
    });
  } catch (error) {
    console.error("Delete attendance error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Sync attendance from ZKTeco device
// @route   POST /api/attendance/sync-zkteco
// @access  Private (Admin, Secretary)
const syncFromZKTeco = async (req, res) => {
  try {
    const { deviceIp, devicePort = 4370 } = req.body;

    if (!deviceIp) {
      return res.status(400).json({
        success: false,
        message: "Device IP address is required",
      });
    }

    const zkService = new ZKTecoService({
      ip: deviceIp,
      port: devicePort,
    });

    try {
      // Connect to device
      await zkService.connect();
      console.log("Connected to ZKTeco device");

      // Get attendance logs
      const logs = await zkService.getAttendanceLogs();
      console.log(`Retrieved ${logs.length} attendance logs`);

      const processedRecords = [];
      const syncErrors = [];

      for (const log of logs) {
        try {
          // Find user by biometric ID (enrollNumber)
          const user = await User.findOne({
            branchId: req.user.branchId,
            $or: [
              { biometricId: log.enrollNumber.toString() },
              { employeeId: log.enrollNumber.toString() },
              { studentId: log.enrollNumber.toString() },
            ],
          });

          if (!user) {
            syncErrors.push({
              enrollNumber: log.enrollNumber,
              message: "User not found for enroll number",
            });
            continue;
          }

          const attendanceDate = new Date(log.timestamp);
          const dateOnly = new Date(
            attendanceDate.getFullYear(),
            attendanceDate.getMonth(),
            attendanceDate.getDate()
          );

          // Check if attendance already exists
          let attendance = await Attendance.findOne({
            branchId: req.user.branchId,
            userId: user._id,
            date: dateOnly,
          });

          if (!attendance) {
            // Create new attendance record
            const attendanceData = {
              branchId: req.user.branchId,
              userId: user._id,
              userType: user.roles.includes("student")
                ? "student"
                : user.roles.includes("teacher")
                ? "teacher"
                : "admin",
              date: dateOnly,
              attendanceType: "biometric",
              deviceId: deviceIp,
              deviceName: `ZKTeco-${deviceIp}`,
              biometricId: log.enrollNumber.toString(),
              recordedBy: getValidUserId(req.user),
              zktecoData: {
                enrollNumber: log.enrollNumber.toString(),
                verifyMode: log.verifyMode,
                inOutMode: log.inOutMode,
                workCode: log.workCode,
                rawData: log.rawData,
              },
            };

            // Set clock in or clock out based on inOutMode
            if (log.inOutMode === 0) {
              // Clock In
              attendanceData.clockInTime = log.timestamp;
              attendanceData.status = "present";
            } else if (log.inOutMode === 1) {
              // Clock Out - this shouldn't happen for new records
              attendanceData.clockInTime = log.timestamp;
              attendanceData.clockOutTime = log.timestamp;
            }

            // Add specific user type data
            if (attendanceData.userType === "student") {
              const student = await Student.findOne({ userId: user._id });
              if (student) {
                attendanceData.studentId = student._id;
                attendanceData.classId = student.currentClassId;
              }
            } else if (attendanceData.userType === "teacher") {
              const teacher = await Teacher.findOne({ userId: user._id });
              if (teacher) {
                attendanceData.teacherId = teacher._id;
              }
            }

            attendance = new Attendance(attendanceData);
          } else {
            // Update existing record
            if (log.inOutMode === 0 && !attendance.clockInTime) {
              // Clock In
              attendance.clockInTime = log.timestamp;
              attendance.status = "present";
            } else if (log.inOutMode === 1 && !attendance.clockOutTime) {
              // Clock Out
              attendance.clockOutTime = log.timestamp;
            }

            attendance.lastModifiedBy = getValidUserId(req.user);
          }

          await attendance.save();
          processedRecords.push(attendance);
        } catch (error) {
          syncErrors.push({
            enrollNumber: log.enrollNumber,
            message: error.message,
          });
        }
      }

      await zkService.disconnect();

      res.json({
        success: true,
        message: `Synced ${processedRecords.length} attendance records`,
        data: {
          processedCount: processedRecords.length,
          errorCount: syncErrors.length,
          totalLogs: logs.length,
          errors: syncErrors,
        },
      });
    } catch (zkError) {
      await zkService.disconnect();
      throw zkError;
    }
  } catch (error) {
    console.error("ZKTeco sync error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to sync from ZKTeco device",
      error: error.message,
    });
  }
};

// @desc    Get attendance summary for dashboard
// @route   GET /api/attendance/summary
// @access  Private (Admin, Secretary, Teacher)
const getAttendanceSummary = async (req, res) => {
  try {
    const { date, userType, classId } = req.query;

    const targetDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(
      targetDate.getFullYear(),
      targetDate.getMonth(),
      targetDate.getDate()
    );
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const branchFilter = getBranchFilter(req.user);
    const query = {
      ...branchFilter,
      date: { $gte: startOfDay, $lt: endOfDay },
    };

    if (userType) query.userType = userType;
    if (classId) query.classId = classId;

    const summary = await Attendance.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalHours: { $sum: "$totalHours" },
          lateCount: {
            $sum: { $cond: ["$isLate", 1, 0] },
          },
          earlyDepartureCount: {
            $sum: { $cond: ["$isEarlyDeparture", 1, 0] },
          },
        },
      },
    ]);

    // Check if there are any attendance records for this date
    const totalRecordsForDate = await Attendance.countDocuments(query);

    // Get total registered users count for percentage calculation
    let totalUsers = 0;
    if (userType === "student") {
      totalUsers = await Student.countDocuments({
        ...branchFilter,
        academicStatus: { $in: ["active"] },
      });
    } else if (userType === "teacher") {
      totalUsers = await Teacher.countDocuments({
        ...branchFilter,
        status: "active",
      });
    } else {
      // For other user types or all, count from User collection
      const userQuery = { ...branchFilter, status: "active" };
      if (userType) userQuery.roles = { $in: [userType] };
      totalUsers = await User.countDocuments(userQuery);
    }

    const result = {
      date: targetDate.toISOString().split("T")[0],
      totalRegistered: totalUsers,
      present: 0,
      absent: 0,
      late: 0,
      halfDay: 0,
      earlyDeparture: 0,
      totalHours: 0,
      attendancePercentage: 0,
    };

    // If no attendance records exist for this date, return zeros (not assume everyone is absent)
    if (totalRecordsForDate === 0) {
      return res.json({
        success: true,
        data: result,
      });
    }

    let totalPresent = 0;

    summary.forEach((item) => {
      result[item._id.replace("_", "")] = item.count;
      result.totalHours += item.totalHours || 0;

      if (item._id !== "absent") {
        totalPresent += item.count;
      }
    });

    result.attendancePercentage =
      totalUsers > 0 ? Math.round((totalPresent / totalUsers) * 100) : 0;

    // Only calculate absent if attendance has been marked
    result.absent = totalUsers - totalPresent;

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Get attendance summary error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Sync attendance from ZKTeco database (for branch sync script)
// @route   POST /api/attendance/sync-from-branch
// @access  Private (Admin, Secretary)
const syncFromBranch = async (req, res) => {
  try {
    const { branchId, branchName, logs, syncTime } = req.body;

    if (!logs || !Array.isArray(logs)) {
      return res.status(400).json({
        success: false,
        message: "Invalid logs data - expected array",
      });
    }

    // Validate branchId is provided in request
    if (!branchId) {
      return res.status(400).json({
        success: false,
        message: "Branch ID is required",
      });
    }

    // For cross-branch sync tokens, use the branchId from request
    // For legacy tokens, use the user's branchId
    const targetBranchId = req.isCrossBranchSync ? branchId : req.user.branchId;

    console.log(
      `📥 Receiving ${logs.length} attendance logs from ${
        branchName || "branch"
      } (Branch ID: ${targetBranchId})`
    );

    if (req.isCrossBranchSync) {
      console.log("✅ Using cross-branch superadmin token");
    }

    const processedRecords = [];
    const syncErrors = [];
    const skippedRecords = [];

    for (const log of logs) {
      try {
        // First, try to find student by admission number
        let user = null;
        let student = null;

        // Search in Student collection by admission number
        if (log.admissionNumber) {
          student = await Student.findOne({
            branchId: targetBranchId,
            admissionNumber: log.admissionNumber,
          }).populate("userId");

          if (student && student.userId) {
            user = student.userId;
          }
        }

        // If not found by admission number, try other fields in User collection
        if (!user) {
          user = await User.findOne({
            branchId: targetBranchId,
            $or: [
              { "profileDetails.admissionNumber": log.admissionNumber },
              { zktecoEnrollNumber: log.enrollNumber?.toString() },
              { biometricId: log.enrollNumber?.toString() },
            ],
          });
        }

        if (!user) {
          syncErrors.push({
            enrollNumber: log.enrollNumber,
            admissionNumber: log.admissionNumber,
            timestamp: log.timestamp,
            message:
              "User not found - admission number not mapped to any student/staff",
          });
          continue;
        }

        const attendanceDate = new Date(log.timestamp);

        // Debug logging for timezone issues
        console.log(
          `🔍 Processing attendance: Enroll ${log.enrollNumber}, Timestamp: ${
            log.timestamp
          }, Parsed: ${attendanceDate.toISOString()}`
        );

        // Validate date
        if (isNaN(attendanceDate.getTime())) {
          syncErrors.push({
            enrollNumber: log.enrollNumber,
            timestamp: log.timestamp,
            message: "Invalid timestamp format",
          });
          continue;
        }

        // Convert local time to UTC for storage (since frontend expects UTC)
        const utcDate = new Date(
          attendanceDate.getTime() + attendanceDate.getTimezoneOffset() * 60000
        );

        // Create date-only key for grouping
        const dateOnly = new Date(
          attendanceDate.getFullYear(),
          attendanceDate.getMonth(),
          attendanceDate.getDate()
        );

        // Find or create attendance record for this user/date
        let attendance = await Attendance.findOne({
          branchId: targetBranchId,
          userId: user._id,
          date: dateOnly,
        });

        if (!attendance) {
          // Get student/teacher details (reuse student if already found)
          let studentId, teacherId, classId, userType;

          if (user.roles.includes("student")) {
            // If we already found the student earlier, reuse it
            if (!student) {
              student = await Student.findOne({ userId: user._id });
            }
            if (student) {
              studentId = student._id;
              classId = student.currentClassId;
              userType = "student";
            }
          } else if (user.roles.includes("teacher")) {
            const teacher = await Teacher.findOne({ userId: user._id });
            if (teacher) {
              teacherId = teacher._id;
              userType = "teacher";
            }
          } else if (user.roles.includes("secretary")) {
            userType = "secretary";
          } else {
            userType = "admin";
          }

          // Create new attendance record
          attendance = new Attendance({
            branchId: targetBranchId,
            userId: user._id,
            studentId,
            teacherId,
            classId,
            userType,
            date: dateOnly,
            clockInTime: utcDate,
            attendanceType: "biometric",
            deviceName: "ZKTeco K40",
            biometricId: log.enrollNumber?.toString(),
            zktecoData: {
              enrollNumber: log.enrollNumber?.toString(),
              verifyMode: log.verifyMode || 1,
              inOutMode: log.inOutMode || 0,
              deviceSerialNumber: log.deviceSerialNumber,
              deviceIp: log.deviceIp,
              rawData: JSON.stringify(log),
            },
            syncedAt: new Date(),
            syncSource: "zkteco_db",
            recordedBy: getValidUserId(req.user),
            status: "present",
          });
        } else {
          // Update existing record with clock-out time if needed
          if (!attendance.clockOutTime && utcDate > attendance.clockInTime) {
            attendance.clockOutTime = utcDate; // Calculate duration
            const durationMs = attendance.clockOutTime - attendance.clockInTime;
            attendance.durationMinutes = Math.round(durationMs / (1000 * 60));

            // Calculate total hours
            attendance.totalHours =
              Math.round((durationMs / (1000 * 60 * 60)) * 100) / 100;
          } else if (utcDate < attendance.clockInTime) {
            // This is an earlier clock-in time, update it
            attendance.clockInTime = utcDate;
          }

          attendance.lastModifiedBy = getValidUserId(req.user);
          attendance.syncedAt = new Date();
        }

        await attendance.save();

        // Auto-reactivate inactive students when they clock in
        // This ensures students who return to school are automatically marked active
        if (student && student._id) {
          try {
            const reactivateResult = await checkAndAutoReactivate(
              student._id,
              getValidUserId(req.user)
            );
            if (reactivateResult.reactivated) {
              console.log(
                `🔄 Auto-reactivated student ${log.admissionNumber} upon attendance`
              );
            }
          } catch (reactivateError) {
            // Don't fail the sync if reactivation fails, just log it
            console.warn(
              `⚠️ Failed to check auto-reactivate for ${log.admissionNumber}:`,
              reactivateError.message
            );
          }
        }

        processedRecords.push({
          userId: user._id,
          userName: `${user.firstName} ${user.lastName}`,
          admissionNumber: log.admissionNumber,
          date: dateOnly,
          clockIn: attendance.clockInTime,
          clockOut: attendance.clockOutTime,
        });
      } catch (error) {
        console.error("Error processing log:", error);
        syncErrors.push({
          enrollNumber: log.enrollNumber,
          admissionNumber: log.admissionNumber,
          timestamp: log.timestamp,
          message: error.message,
        });
      }
    }

    // Create audit log
    const AuditLog = require("../models/AuditLog");
    await AuditLog.create({
      userId: getValidUserId(req.user),
      userName: `${req.user.firstName} ${req.user.lastName}`,
      userEmail: req.user.email,
      action: "DATA_IMPORT",
      resourceType: "ATTENDANCE",
      description: `Synced ${processedRecords.length} attendance records from ZKTeco database for ${branchName}`,
      metadata: {
        branchId: branchId || req.user.branchId,
        category: "DATA_CHANGE",
        severity: "MEDIUM",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      },
      newValues: {
        source: "zkteco_database",
        branchName: branchName,
        processedCount: processedRecords.length,
        errorCount: syncErrors.length,
        totalLogs: logs.length,
        syncTime: syncTime,
      },
      success: true,
    });

    console.log(
      `✅ Synced ${processedRecords.length} records, ${syncErrors.length} errors`
    );

    res.json({
      success: true,
      message: `Successfully synced ${processedRecords.length} attendance records`,
      data: {
        processedCount: processedRecords.length,
        errorCount: syncErrors.length,
        totalLogs: logs.length,
        errors: syncErrors.length > 0 ? syncErrors.slice(0, 10) : [], // Only send first 10 errors
        processed: processedRecords.slice(0, 5), // Sample of processed records
      },
    });
  } catch (error) {
    console.error("Branch sync error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to sync attendance from branch",
      error: error.message,
    });
  }
};

// @desc    Get last sync status for a branch
// @route   GET /api/attendance/last-sync/:branchId?
// @access  Private (Admin)
const getLastSyncStatus = async (req, res) => {
  try {
    const branchId = req.params.branchId || req.user.branchId;

    // Get the most recent synced attendance record
    const lastSync = await Attendance.findOne({
      branchId: branchId,
      syncSource: "zkteco_db",
    })
      .sort({ syncedAt: -1 })
      .select("syncedAt syncSource deviceName")
      .lean();

    // Get count of records synced today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayCount = await Attendance.countDocuments({
      branchId: branchId,
      syncSource: "zkteco_db",
      syncedAt: { $gte: today },
    });

    res.json({
      success: true,
      data: {
        lastSync: lastSync?.syncedAt || null,
        deviceName: lastSync?.deviceName || "Unknown",
        recordCount: todayCount,
        status: lastSync ? "active" : "no_sync_yet",
      },
    });
  } catch (error) {
    console.error("Get last sync status error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get sync status",
      error: error.message,
    });
  }
};

/**
 * Get attendance records for the logged-in student
 * This endpoint is for students to view their own attendance
 */
const getMyAttendance = async (req, res) => {
  try {
    const userId = req.user._id;

    // Build query
    const query = { userId: userId };

    // Add date filters if provided
    if (req.query.dateFrom || req.query.dateTo) {
      query.date = {};
      if (req.query.dateFrom) {
        const fromDate = new Date(req.query.dateFrom);
        fromDate.setHours(0, 0, 0, 0); // Start of day
        query.date.$gte = fromDate;
      }
      if (req.query.dateTo) {
        const toDate = new Date(req.query.dateTo);
        toDate.setHours(23, 59, 59, 999); // End of day
        query.date.$lte = toDate;
      }
    }

    // Fetch attendance records with populated references
    const records = await Attendance.find(query)
      .populate("userId", "firstName lastName fullName email")
      .populate("classId", "name grade section")
      .populate("studentId", "admissionNumber rollNumber")
      .sort({ date: -1, clockInTime: -1 })
      .limit(req.query.limit ? parseInt(req.query.limit) : 100);

    // Calculate summary statistics
    const total = records.length;
    const present = records.filter((r) => r.status === "present").length;
    const absent = records.filter((r) => r.status === "absent").length;
    const late = records.filter((r) => r.status === "late").length;
    const attendancePercentage = total > 0 ? (present / total) * 100 : 0;

    res.json({
      success: true,
      data: records,
      summary: {
        total,
        present,
        absent,
        late,
        attendancePercentage: attendancePercentage.toFixed(2),
      },
    });
  } catch (error) {
    console.error("Get my attendance error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch attendance records",
      error: error.message,
    });
  }
};

module.exports = {
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
};
