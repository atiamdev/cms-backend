const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema(
  {
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: [true, "Branch reference is required"],
    },
    // Can be either student or teacher/staff
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User reference is required"],
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: function () {
        return this.userType === "student";
      },
    },
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
      required: function () {
        return this.userType === "teacher";
      },
    },
    userType: {
      type: String,
      enum: ["student", "teacher", "secretary", "admin"],
      required: [true, "User type is required"],
    },
    date: {
      type: Date,
      required: [true, "Attendance date is required"],
      default: Date.now,
    },
    clockInTime: {
      type: Date,
      required: [true, "Clock in time is required"],
    },
    clockOutTime: {
      type: Date,
    },
    totalHours: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["present", "absent", "late", "half_day", "early_departure"],
      default: "present",
    },
    attendanceType: {
      type: String,
      enum: ["manual", "biometric", "card", "mobile"],
      default: "biometric",
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: false,
    },
    deviceId: {
      type: String,
      trim: true,
    },
    deviceName: {
      type: String,
      trim: true,
    },
    biometricId: {
      type: String,
      trim: true,
    },
    cardNumber: {
      type: String,
      trim: true,
    },
    location: {
      latitude: Number,
      longitude: Number,
      address: String,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [500, "Notes cannot exceed 500 characters"],
    },
    isLate: {
      type: Boolean,
      default: false,
    },
    lateMinutes: {
      type: Number,
      default: 0,
    },
    isEarlyDeparture: {
      type: Boolean,
      default: false,
    },
    earlyDepartureMinutes: {
      type: Number,
      default: 0,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "approved",
    },
    approvalNotes: {
      type: String,
      trim: true,
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    // ZKTeco specific fields
    zktecoData: {
      enrollNumber: String,
      verifyMode: Number, // 1: Fingerprint, 2: Card, 3: Password
      inOutMode: Number, // 0: Check In, 1: Check Out, 2: Break Out, 3: Break In
      workCode: String,
      deviceSerialNumber: String,
      deviceIp: String,
      rawData: String,
    },
    // Sync tracking fields
    syncedAt: {
      type: Date,
    },
    syncSource: {
      type: String,
      enum: ["manual", "zkteco_db", "zkteco_sdk", "mobile_app"],
      default: "manual",
    },
    deviceIp: {
      type: String,
      trim: true,
    },
    // Break time tracking
    breakOutTime: {
      type: Date,
    },
    breakInTime: {
      type: Date,
    },
    breakDurationMinutes: {
      type: Number,
      default: 0,
    },
    durationMinutes: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

// Compound indexes for efficient queries
attendanceSchema.index({ branchId: 1, date: -1 });
attendanceSchema.index({ branchId: 1, userId: 1, date: -1 });
attendanceSchema.index({ branchId: 1, userType: 1, date: -1 });
attendanceSchema.index({ branchId: 1, classId: 1, date: -1 });
attendanceSchema.index({ branchId: 1, status: 1 });
attendanceSchema.index({ deviceId: 1, date: -1 });
attendanceSchema.index({ biometricId: 1 });
attendanceSchema.index({ cardNumber: 1 });

// Ensure one attendance record per user per day
attendanceSchema.index(
  { branchId: 1, userId: 1, date: 1 },
  {
    unique: true,
    partialFilterExpression: { date: { $exists: true } },
  },
);

// Pre-save middleware to calculate total hours and determine status
attendanceSchema.pre("save", function (next) {
  // Calculate total hours if both clockIn and clockOut are present
  if (this.clockInTime && this.clockOutTime) {
    const diffMs = this.clockOutTime.getTime() - this.clockInTime.getTime();
    this.totalHours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;
  }

  // Set date to the beginning of the day for consistency
  if (this.clockInTime) {
    const attendanceDate = new Date(this.clockInTime);
    this.date = new Date(
      attendanceDate.getFullYear(),
      attendanceDate.getMonth(),
      attendanceDate.getDate(),
    );
  }

  // Update lastModifiedBy if document is being modified
  if (this.isModified() && !this.isNew) {
    this.updatedAt = new Date();
  }

  next();
});

// Method to calculate if user is late
attendanceSchema.methods.calculateLateStatus = function (expectedTime) {
  if (!this.clockInTime || !expectedTime) return false;

  const expected = new Date(expectedTime);
  const actual = new Date(this.clockInTime);

  if (actual > expected) {
    this.isLate = true;
    this.lateMinutes = Math.round((actual - expected) / (1000 * 60));
    if (this.lateMinutes > 30) {
      this.status = "late";
    }
  }

  return this.isLate;
};

// Method to calculate early departure
attendanceSchema.methods.calculateEarlyDeparture = function (expectedEndTime) {
  if (!this.clockOutTime || !expectedEndTime) return false;

  const expected = new Date(expectedEndTime);
  const actual = new Date(this.clockOutTime);

  if (actual < expected) {
    this.isEarlyDeparture = true;
    this.earlyDepartureMinutes = Math.round((expected - actual) / (1000 * 60));
    if (this.earlyDepartureMinutes > 30) {
      this.status = "early_departure";
    }
  }

  return this.isEarlyDeparture;
};

// Static method to get attendance summary for a date range
attendanceSchema.statics.getAttendanceSummary = async function (
  branchId,
  startDate,
  endDate,
  userType,
) {
  const matchStage = {
    branchId,
    date: { $gte: startDate, $lte: endDate },
  };

  if (userType) {
    matchStage.userType = userType;
  }

  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: {
          date: "$date",
          status: "$status",
        },
        count: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: "$_id.date",
        statusBreakdown: {
          $push: {
            status: "$_id.status",
            count: "$count",
          },
        },
        totalCount: { $sum: "$count" },
      },
    },
    { $sort: { _id: 1 } },
  ]);
};

// Virtual for formatted clock in time
attendanceSchema.virtual("formattedClockIn").get(function () {
  if (!this.clockInTime) return null;
  return this.clockInTime.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
});

// Virtual for formatted clock out time
attendanceSchema.virtual("formattedClockOut").get(function () {
  if (!this.clockOutTime) return null;
  return this.clockOutTime.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
});

// Virtual for attendance day name
attendanceSchema.virtual("dayName").get(function () {
  if (!this.date) return null;
  return this.date.toLocaleDateString("en-US", { weekday: "long" });
});

// Ensure virtuals are included in JSON output
attendanceSchema.set("toJSON", { virtuals: true });
attendanceSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Attendance", attendanceSchema);
