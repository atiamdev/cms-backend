const mongoose = require("mongoose");

const AssignmentSchema = new mongoose.Schema(
  {
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    moduleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LearningModule",
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    instructions: {
      type: String,
      required: true,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    maxPoints: {
      type: Number,
      required: true,
      min: 1,
    },
    allowedFileTypes: [
      {
        type: String,
        enum: [
          "pdf",
          "doc",
          "docx",
          "txt",
          "jpg",
          "jpeg",
          "png",
          "gif",
          "zip",
          "rar",
        ],
      },
    ],
    maxFileSize: {
      type: Number, // in MB
      default: 10,
    },
    allowLateSubmission: {
      type: Boolean,
      default: true,
    },
    latePenalty: {
      type: Number, // Percentage deduction per day
      default: 10,
      min: 0,
      max: 100,
    },
    rubric: [
      {
        criteria: {
          type: String,
          required: true,
        },
        points: {
          type: Number,
          required: true,
          min: 1,
        },
        description: String,
        levels: [
          {
            name: String, // e.g., "Excellent", "Good", "Fair", "Poor"
            points: Number,
            description: String,
          },
        ],
      },
    ],
    isPublished: {
      type: Boolean,
      default: false,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Assignment settings
    settings: {
      allowMultipleSubmissions: { type: Boolean, default: false },
      showGradeImmediately: { type: Boolean, default: false },
      requireTextSubmission: { type: Boolean, default: false },
      requireFileSubmission: { type: Boolean, default: true },
      plagiarismCheck: { type: Boolean, default: false },
      anonymousGrading: { type: Boolean, default: false },
    },
    // Grading configuration
    grading: {
      gradingScale: {
        type: String,
        enum: ["points", "percentage", "letter", "pass_fail"],
        default: "points",
      },
      passingGrade: Number,
      letterGradeScale: {
        type: Map,
        of: {
          min: { type: Number, required: true },
          max: { type: Number, required: true },
        },
        default: {
          A: { min: 90, max: 100 },
          B: { min: 80, max: 89 },
          C: { min: 70, max: 79 },
          D: { min: 60, max: 69 },
          F: { min: 0, max: 59 },
        },
      },
    },
    // Analytics
    analytics: {
      submissionCount: { type: Number, default: 0 },
      onTimeSubmissions: { type: Number, default: 0 },
      lateSubmissions: { type: Number, default: 0 },
      averageGrade: { type: Number, default: 0 },
      averageTimeToSubmit: { type: Number, default: 0 }, // in hours
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
AssignmentSchema.index({ courseId: 1 });
AssignmentSchema.index({ moduleId: 1 });
AssignmentSchema.index({ branchId: 1 });
AssignmentSchema.index({ dueDate: 1 });
AssignmentSchema.index({ createdBy: 1 });

// Virtual for submission rate
AssignmentSchema.virtual("submissionRate").get(function () {
  // This would need to be calculated based on enrolled students
  return 0; // Placeholder
});

// Virtual for late submission rate
AssignmentSchema.virtual("lateSubmissionRate").get(function () {
  if (this.analytics.submissionCount === 0) return 0;
  return (
    (this.analytics.lateSubmissions / this.analytics.submissionCount) * 100
  );
});

// Virtual for days until due
AssignmentSchema.virtual("daysUntilDue").get(function () {
  const now = new Date();
  const due = new Date(this.dueDate);
  const diffTime = due - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for is overdue
AssignmentSchema.virtual("isOverdue").get(function () {
  return new Date() > new Date(this.dueDate);
});

// Methods
AssignmentSchema.methods.calculateLatePenalty = function (submissionDate) {
  if (!this.allowLateSubmission) return 0;
  if (submissionDate <= this.dueDate) return 0;

  const daysLate = Math.ceil(
    (submissionDate - this.dueDate) / (1000 * 60 * 60 * 24)
  );
  const totalPenalty = daysLate * this.latePenalty;
  return Math.min(totalPenalty, 100); // Cap at 100%
};

AssignmentSchema.methods.calculateRubricTotal = function () {
  return this.rubric.reduce((total, criterion) => total + criterion.points, 0);
};

AssignmentSchema.methods.canSubmit = function (currentDate = new Date()) {
  if (!this.isPublished) return false;
  if (!this.allowLateSubmission && currentDate > this.dueDate) return false;
  return true;
};

AssignmentSchema.methods.updateAnalytics = async function () {
  const Submission = mongoose.model("Submission");
  const submissions = await Submission.find({ assignmentId: this._id });

  this.analytics.submissionCount = submissions.length;
  this.analytics.onTimeSubmissions = submissions.filter(
    (s) => new Date(s.submittedAt) <= this.dueDate
  ).length;
  this.analytics.lateSubmissions =
    this.analytics.submissionCount - this.analytics.onTimeSubmissions;

  if (submissions.length > 0) {
    const gradedSubmissions = submissions.filter((s) => s.grade !== undefined);
    if (gradedSubmissions.length > 0) {
      this.analytics.averageGrade =
        gradedSubmissions.reduce((sum, s) => sum + s.grade, 0) /
        gradedSubmissions.length;
    }
  }

  return this.save();
};

// Pre-save validation
AssignmentSchema.pre("save", function (next) {
  // Validate that rubric total matches maxPoints
  if (this.rubric && this.rubric.length > 0) {
    const rubricTotal = this.calculateRubricTotal();
    if (rubricTotal !== this.maxPoints) {
      const error = new Error("Rubric total points must equal maxPoints");
      return next(error);
    }
  }

  // Validate due date is in the future (for new assignments)
  if (this.isNew && this.dueDate <= new Date()) {
    const error = new Error("Due date must be in the future");
    return next(error);
  }

  next();
});

module.exports = mongoose.model("Assignment", AssignmentSchema);
