const mongoose = require("mongoose");

const SubmissionSchema = new mongoose.Schema(
  {
    assignmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Assignment",
      required: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    submittedAt: {
      type: Date,
      default: Date.now,
    },
    files: [
      {
        filename: {
          type: String,
          required: true,
        },
        originalName: String,
        r2Key: String, // Cloudflare R2 key
        fileUrl: String, // Public or signed URL
        size: Number, // File size in bytes
        mimeType: String,
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    textSubmission: {
      type: String,
      trim: true,
    },
    grade: {
      type: Number,
      min: 0,
    },
    feedback: {
      type: String,
    },
    rubricScores: [
      {
        criteriaId: mongoose.Schema.Types.ObjectId,
        score: Number,
        feedback: String,
      },
    ],
    gradedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    gradedAt: Date,
    status: {
      type: String,
      enum: [
        "draft",
        "submitted",
        "graded",
        "returned",
        "late",
        "resubmission_required",
      ],
      default: "submitted",
    },
    attempt: {
      type: Number,
      default: 1,
      min: 1,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
    },
    // Submission metadata
    metadata: {
      submissionMethod: {
        type: String,
        enum: ["online", "email", "physical"],
        default: "online",
      },
      ipAddress: String,
      userAgent: String,
      submissionTime: Date,
      lastModified: Date,
      wordCount: Number,
      characterCount: Number,
    },
    // Version control for resubmissions
    versions: [
      {
        versionNumber: Number,
        submittedAt: Date,
        files: [
          {
            filename: String,
            r2Key: String,
            fileUrl: String,
            size: Number,
          },
        ],
        textSubmission: String,
        changes: String, // Description of what changed
      },
    ],
    // Plagiarism check results
    plagiarismCheck: {
      checked: { type: Boolean, default: false },
      checkedAt: Date,
      similarityPercentage: Number,
      sources: [
        {
          url: String,
          title: String,
          similarityPercentage: Number,
        },
      ],
      status: {
        type: String,
        enum: ["clean", "suspicious", "flagged"],
      },
    },
    // Analytics and timing
    analytics: {
      timeSpentOnAssignment: Number, // in minutes
      viewCount: { type: Number, default: 0 },
      editCount: { type: Number, default: 0 },
      saveCount: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
SubmissionSchema.index({ assignmentId: 1, studentId: 1 });
SubmissionSchema.index({ studentId: 1, status: 1 });
SubmissionSchema.index({ branchId: 1 });
SubmissionSchema.index({ submittedAt: 1 });
SubmissionSchema.index({ gradedBy: 1 });
SubmissionSchema.index({ status: 1 });

// Compound index for finding latest submission
SubmissionSchema.index({ assignmentId: 1, studentId: 1, attempt: -1 });

// Virtual for is late
SubmissionSchema.virtual("isLate").get(function () {
  if (!this.populated("assignmentId")) return false;
  return this.submittedAt > this.assignmentId.dueDate;
});

// Virtual for days late
SubmissionSchema.virtual("daysLate").get(function () {
  if (!this.populated("assignmentId") || !this.isLate) return 0;
  const diffTime = this.submittedAt - this.assignmentId.dueDate;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for final grade (considering late penalties)
SubmissionSchema.virtual("finalGrade").get(function () {
  if (this.grade === undefined || this.grade === null) return null;

  if (!this.populated("assignmentId")) return this.grade;

  if (this.isLate && this.assignmentId.allowLateSubmission) {
    const penalty = this.assignmentId.calculateLatePenalty(this.submittedAt);
    const penaltyPoints = (penalty / 100) * this.grade;
    return Math.max(0, this.grade - penaltyPoints);
  }

  return this.grade;
});

// Virtual for total file size
SubmissionSchema.virtual("totalFileSize").get(function () {
  return this.files.reduce((total, file) => total + (file.size || 0), 0);
});

// Virtual for file count
SubmissionSchema.virtual("fileCount").get(function () {
  return this.files.length;
});

// Virtual for grade percentage
SubmissionSchema.virtual("gradePercentage").get(function () {
  if (!this.populated("assignmentId") || this.finalGrade === null) return null;
  return (this.finalGrade / this.assignmentId.maxPoints) * 100;
});

// Methods
SubmissionSchema.methods.addFile = function (fileData) {
  this.files.push(fileData);
  this.analytics.editCount += 1;
  this.metadata.lastModified = new Date();
  return this.save();
};

SubmissionSchema.methods.removeFile = function (fileId) {
  this.files = this.files.filter(
    (file) => file._id.toString() !== fileId.toString()
  );
  this.analytics.editCount += 1;
  this.metadata.lastModified = new Date();
  return this.save();
};

SubmissionSchema.methods.updateTextSubmission = function (newText) {
  this.textSubmission = newText;
  this.metadata.wordCount = newText ? newText.split(/\s+/).length : 0;
  this.metadata.characterCount = newText ? newText.length : 0;
  this.analytics.editCount += 1;
  this.metadata.lastModified = new Date();
  return this.save();
};

SubmissionSchema.methods.submit = function () {
  if (this.status === "draft") {
    this.status = "submitted";
    this.submittedAt = new Date();
    this.metadata.submissionTime = new Date();

    // Create version snapshot
    this.versions.push({
      versionNumber: this.versions.length + 1,
      submittedAt: this.submittedAt,
      files: this.files.map((f) => ({
        filename: f.filename,
        r2Key: f.r2Key,
        fileUrl: f.fileUrl,
        size: f.size,
      })),
      textSubmission: this.textSubmission,
      changes: "Initial submission",
    });
  }
  return this.save();
};

SubmissionSchema.methods.gradeSubmission = function (gradeData) {
  this.grade = gradeData.grade;
  this.feedback = gradeData.feedback;
  this.rubricScores = gradeData.rubricScores || [];
  this.gradedBy = gradeData.gradedBy;
  this.gradedAt = new Date();
  this.status = "graded";
  return this.save();
};

SubmissionSchema.methods.requireResubmission = function (feedback) {
  this.status = "resubmission_required";
  this.feedback = feedback;
  this.gradedAt = new Date();
  return this.save();
};

SubmissionSchema.methods.calculateRubricTotal = function () {
  return this.rubricScores.reduce((total, score) => total + score.score, 0);
};

SubmissionSchema.methods.canEdit = function () {
  return ["draft", "resubmission_required"].includes(this.status);
};

SubmissionSchema.methods.canSubmit = function () {
  return (
    this.status === "draft" && (this.files.length > 0 || this.textSubmission)
  );
};

SubmissionSchema.methods.markAsViewed = function () {
  this.analytics.viewCount += 1;
  return this.save();
};

// Static methods
SubmissionSchema.statics.findLatestSubmission = function (
  assignmentId,
  studentId
) {
  return this.findOne({ assignmentId, studentId })
    .sort({ attempt: -1 })
    .populate("assignmentId")
    .populate("studentId", "name email")
    .populate("gradedBy", "name");
};

SubmissionSchema.statics.findAllSubmissions = function (
  assignmentId,
  studentId
) {
  return this.find({ assignmentId, studentId })
    .sort({ attempt: -1 })
    .populate("assignmentId")
    .populate("studentId", "name email")
    .populate("gradedBy", "name");
};

SubmissionSchema.statics.getSubmissionStats = async function (assignmentId) {
  const stats = await this.aggregate([
    { $match: { assignmentId: mongoose.Types.ObjectId(assignmentId) } },
    {
      $group: {
        _id: null,
        totalSubmissions: { $sum: 1 },
        gradedSubmissions: {
          $sum: { $cond: [{ $ne: ["$grade", null] }, 1, 0] },
        },
        averageGrade: { $avg: "$grade" },
        lateSubmissions: {
          $sum: { $cond: [{ $eq: ["$status", "late"] }, 1, 0] },
        },
      },
    },
  ]);

  return (
    stats[0] || {
      totalSubmissions: 0,
      gradedSubmissions: 0,
      averageGrade: 0,
      lateSubmissions: 0,
    }
  );
};

// Pre-save middleware
SubmissionSchema.pre("save", function (next) {
  // Update word count and character count for text submissions
  if (this.isModified("textSubmission") && this.textSubmission) {
    this.metadata.wordCount = this.textSubmission.split(/\s+/).length;
    this.metadata.characterCount = this.textSubmission.length;
  }

  // Mark as late if submitted after due date
  if (this.isModified("submittedAt") && this.populated("assignmentId")) {
    if (this.submittedAt > this.assignmentId.dueDate) {
      this.status = "late";
    }
  }

  next();
});

// Post-save middleware to update assignment analytics
SubmissionSchema.post("save", async function () {
  if (this.populated("assignmentId")) {
    await this.assignmentId.updateAnalytics();
  }
});

module.exports = mongoose.model("Submission", SubmissionSchema);
