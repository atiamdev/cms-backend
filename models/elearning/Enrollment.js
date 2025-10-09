const mongoose = require("mongoose");

const EnrollmentSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ECourse",
      required: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
    },
    // Enrollment status
    status: {
      type: String,
      enum: [
        "pending",
        "approved",
        "active",
        "completed",
        "dropped",
        "suspended",
      ],
      default: "active",
    },
    // Registration type that was used
    enrollmentType: {
      type: String,
      enum: ["self", "manual", "invite-only"],
      default: "self",
    },
    // Approval workflow
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    approvedAt: Date,
    // Progress tracking
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    // Completion tracking
    completedAt: Date,
    // Activity tracking
    lastAccessedAt: {
      type: Date,
      default: Date.now,
    },
    // Time tracking
    totalTimeSpent: {
      type: Number,
      default: 0, // in minutes
    },
    // Certification
    certificateIssued: {
      type: Boolean,
      default: false,
    },
    certificateIssuedAt: Date,
    // Withdrawal/Drop tracking
    droppedAt: Date,
    dropReason: String,
  },
  {
    timestamps: true, // This adds createdAt and updatedAt
  }
);

// Indexes for performance
EnrollmentSchema.index({ studentId: 1, courseId: 1 }, { unique: true });
EnrollmentSchema.index({ studentId: 1 });
EnrollmentSchema.index({ courseId: 1 });
EnrollmentSchema.index({ branchId: 1 });
EnrollmentSchema.index({ status: 1 });
EnrollmentSchema.index({ createdAt: -1 });

// Virtual for enrollment date (alias for createdAt)
EnrollmentSchema.virtual("enrolledAt").get(function () {
  return this.createdAt;
});

// Method to check if enrollment is active
EnrollmentSchema.methods.isActive = function () {
  return ["active", "approved"].includes(this.status);
};

// Method to complete enrollment
EnrollmentSchema.methods.complete = function () {
  this.status = "completed";
  this.completedAt = new Date();
  this.progress = 100;
  return this.save();
};

// Method to drop enrollment
EnrollmentSchema.methods.drop = function (reason) {
  this.status = "dropped";
  this.droppedAt = new Date();
  this.dropReason = reason;
  return this.save();
};

// Static method to get student's enrollments
EnrollmentSchema.statics.getStudentEnrollments = function (
  studentId,
  options = {}
) {
  const query = { studentId };

  if (options.status) {
    if (Array.isArray(options.status)) {
      query.status = { $in: options.status };
    } else {
      query.status = options.status;
    }
  }

  return this.find(query)
    .populate({
      path: "courseId",
      select:
        "title description thumbnail category level duration pricing instructor status stats",
      populate: {
        path: "instructor",
        select: "firstName lastName",
      },
    })
    .sort({ createdAt: -1 });
};

// Static method to check if student is enrolled in course
EnrollmentSchema.statics.isEnrolled = function (studentId, courseId) {
  return this.findOne({
    studentId,
    courseId,
    status: { $in: ["active", "approved", "completed"] },
  });
};

// Static method to get enrollment stats for a course
EnrollmentSchema.statics.getCourseStats = function (courseId) {
  return this.aggregate([
    { $match: { courseId: new mongoose.Types.ObjectId(courseId) } },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        avgProgress: { $avg: "$progress" },
      },
    },
  ]);
};

module.exports = mongoose.model("Enrollment", EnrollmentSchema);
