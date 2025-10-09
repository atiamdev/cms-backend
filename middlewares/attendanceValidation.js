const { body, validationResult } = require("express-validator");
const Attendance = require("../models/Attendance");
const User = require("../models/User");

// Validation rules for marking attendance
const validateMarkAttendance = [
  body("userId")
    .isMongoId()
    .withMessage("Valid user ID is required")
    .custom(async (userId, { req }) => {
      // Check if user exists and belongs to the same branch
      const user = await User.findOne({
        _id: userId,
        branchId: req.user.branchId,
        status: "active",
      });

      if (!user) {
        throw new Error("User not found or inactive");
      }

      req.attendanceUser = user;
      return true;
    }),

  body("userType")
    .isIn(["student", "teacher", "secretary", "admin"])
    .withMessage("Valid user type is required")
    .custom((userType, { req }) => {
      // Check if user type matches the user's roles
      if (req.attendanceUser && !req.attendanceUser.roles.includes(userType)) {
        throw new Error("User type does not match user's roles");
      }
      return true;
    }),

  body("clockInTime")
    .isISO8601()
    .withMessage("Valid clock in time is required")
    .custom((clockInTime) => {
      const clockIn = new Date(clockInTime);
      const now = new Date();

      // Don't allow future dates
      if (clockIn > now) {
        throw new Error("Clock in time cannot be in the future");
      }

      // Don't allow dates more than 7 days in the past
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      if (clockIn < sevenDaysAgo) {
        throw new Error("Clock in time cannot be more than 7 days in the past");
      }

      return true;
    }),

  body("clockOutTime")
    .optional()
    .isISO8601()
    .withMessage("Valid clock out time required")
    .custom((clockOutTime, { req }) => {
      if (clockOutTime) {
        const clockIn = new Date(req.body.clockInTime);
        const clockOut = new Date(clockOutTime);

        // Clock out must be after clock in
        if (clockOut <= clockIn) {
          throw new Error("Clock out time must be after clock in time");
        }

        // Must be on the same day
        if (clockIn.toDateString() !== clockOut.toDateString()) {
          throw new Error("Clock in and clock out must be on the same day");
        }

        // Don't allow future times
        const now = new Date();
        if (clockOut > now) {
          throw new Error("Clock out time cannot be in the future");
        }
      }
      return true;
    }),

  body("status")
    .optional()
    .isIn(["present", "absent", "late", "half_day", "early_departure"])
    .withMessage("Invalid status"),

  body("attendanceType")
    .optional()
    .isIn(["manual", "biometric", "card", "mobile"])
    .withMessage("Invalid attendance type"),

  body("notes")
    .optional()
    .isLength({ max: 500 })
    .withMessage("Notes cannot exceed 500 characters"),

  body("classId").optional().isMongoId().withMessage("Valid class ID required"),

  // Custom validation to check for duplicate attendance
  body("userId").custom(async (userId, { req }) => {
    const clockInDate = new Date(req.body.clockInTime);
    const attendanceDate = new Date(
      clockInDate.getFullYear(),
      clockInDate.getMonth(),
      clockInDate.getDate()
    );

    const existingAttendance = await Attendance.findOne({
      branchId: req.user.branchId,
      userId: userId,
      date: attendanceDate,
    });

    if (existingAttendance) {
      throw new Error("Attendance already marked for this user on this date");
    }

    return true;
  }),
];

// Validation rules for updating attendance
const validateUpdateAttendance = [
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

  body("approvalNotes")
    .optional()
    .isLength({ max: 500 })
    .withMessage("Approval notes cannot exceed 500 characters"),

  // Custom validation for time consistency
  body("clockOutTime").custom(async (clockOutTime, { req }) => {
    if (clockOutTime) {
      // Get existing attendance record to check clockInTime
      const attendance = await Attendance.findOne({
        _id: req.params.id,
        branchId: req.user.branchId,
      });

      if (!attendance) {
        throw new Error("Attendance record not found");
      }

      const clockIn = req.body.clockInTime
        ? new Date(req.body.clockInTime)
        : attendance.clockInTime;
      const clockOut = new Date(clockOutTime);

      if (clockOut <= clockIn) {
        throw new Error("Clock out time must be after clock in time");
      }

      // Must be on the same day
      if (clockIn.toDateString() !== clockOut.toDateString()) {
        throw new Error("Clock in and clock out must be on the same day");
      }
    }
    return true;
  }),
];

// Validation rules for clock out
const validateClockOut = [
  body("clockOutTime")
    .optional()
    .isISO8601()
    .withMessage("Valid clock out time required")
    .custom(async (clockOutTime, { req }) => {
      if (clockOutTime) {
        const clockOut = new Date(clockOutTime);
        const now = new Date();

        // Don't allow future times
        if (clockOut > now) {
          throw new Error("Clock out time cannot be in the future");
        }

        // Get the attendance record to validate against clock in time
        const attendance = await Attendance.findOne({
          _id: req.params.id,
          branchId: req.user.branchId,
        });

        if (!attendance) {
          throw new Error("Attendance record not found");
        }

        if (attendance.clockOutTime) {
          throw new Error("Already clocked out");
        }

        if (clockOut <= attendance.clockInTime) {
          throw new Error("Clock out time must be after clock in time");
        }

        // Must be on the same day as clock in
        if (attendance.clockInTime.toDateString() !== clockOut.toDateString()) {
          throw new Error("Clock out must be on the same day as clock in");
        }
      }
      return true;
    }),

  body("notes")
    .optional()
    .isLength({ max: 500 })
    .withMessage("Notes cannot exceed 500 characters"),
];

// Validation rules for ZKTeco sync
const validateZKTecoSync = [
  body("deviceIp").isIP().withMessage("Valid device IP address is required"),

  body("devicePort")
    .optional()
    .isInt({ min: 1, max: 65535 })
    .withMessage("Valid port number required (1-65535)"),

  body("deviceName")
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage("Device name must be between 1 and 100 characters"),

  body("clearAfterSync")
    .optional()
    .isBoolean()
    .withMessage("Clear after sync must be a boolean value"),
];

// Middleware to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map((error) => ({
      field: error.path || error.param,
      message: error.msg,
      value: error.value,
    }));

    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: formattedErrors,
    });
  }

  next();
};

// Authorization middleware for attendance access
const authorizeAttendanceAccess = (req, res, next) => {
  const { id } = req.params;
  const userRoles = req.user.roles;

  // Admin and secretary have full access
  if (userRoles.includes("admin") || userRoles.includes("secretary")) {
    return next();
  }

  // Teachers can view attendance but limited update access
  if (userRoles.includes("teacher")) {
    // Teachers can only view, not modify attendance records
    if (req.method !== "GET") {
      return res.status(403).json({
        success: false,
        message: "Teachers can only view attendance records",
      });
    }
    return next();
  }

  // Students can only access their own attendance records
  if (userRoles.includes("student")) {
    // For routes that include attendance ID, we need to check ownership
    if (id) {
      Attendance.findOne({
        _id: id,
        branchId: req.user.branchId,
      })
        .then((attendance) => {
          if (!attendance) {
            return res.status(404).json({
              success: false,
              message: "Attendance record not found",
            });
          }

          if (attendance.userId.toString() !== req.user._id.toString()) {
            return res.status(403).json({
              success: false,
              message: "Access denied. You can only view your own attendance",
            });
          }

          next();
        })
        .catch((error) => {
          res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message,
          });
        });
    } else {
      // For general routes, students can only see their own records
      next();
    }
  } else {
    return res.status(403).json({
      success: false,
      message: "Access denied",
    });
  }
};

// Middleware to add date filters for student access
const addStudentFilters = (req, res, next) => {
  if (req.user.roles.includes("student")) {
    // Students can only see their own attendance
    req.query.userId = req.user._id.toString();

    // Limit date range to last 6 months for students
    if (!req.query.startDate) {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      req.query.startDate = sixMonthsAgo.toISOString().split("T")[0];
    }
  }

  next();
};

module.exports = {
  validateMarkAttendance,
  validateUpdateAttendance,
  validateClockOut,
  validateZKTecoSync,
  handleValidationErrors,
  authorizeAttendanceAccess,
  addStudentFilters,
};
