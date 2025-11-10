const mongoose = require("mongoose");

const ECourseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    shortDescription: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    thumbnail: {
      type: String, // URL to course thumbnail image
    },
    category: {
      type: String,
      enum: [
        "Programming",
        "Design",
        "Business",
        "Marketing",
        "Language",
        "Science",
        "Mathematics",
        "Arts",
        "Health",
        "Technology",
        "Other",
      ],
      default: "Other",
    },
    level: {
      type: String,
      enum: ["Beginner", "Intermediate", "Advanced"],
      default: "Beginner",
    },
    language: {
      type: String,
      default: "English",
    },
    duration: {
      estimatedHours: {
        type: Number,
        default: 0,
      },
      estimatedMinutes: {
        type: Number,
        default: 0,
      },
    },
    pricing: {
      type: {
        type: String,
        enum: ["free", "paid"],
        default: "free",
      },
      amount: {
        type: Number,
        default: 0,
      },
      currency: {
        type: String,
        default: "KES",
      },
    },
    instructor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Registration settings
    registration: {
      type: {
        type: String,
        enum: ["self", "manual", "invite-only"],
        default: "self",
      },
      requiresApproval: {
        type: Boolean,
        default: false,
      },
      maxStudents: {
        type: Number,
        default: null, // null means unlimited
      },
      enrollmentDeadline: {
        type: Date,
        default: null,
      },
      prerequisites: [String], // Array of prerequisite descriptions
    },
    // Course chaining for sequential learning
    chain: {
      chainId: {
        type: String,
        trim: true,
      },
      sequenceNumber: {
        type: Number,
        default: 1,
        min: 1,
      },
      isChainFinal: {
        type: Boolean,
        default: true,
      },
      nextCourseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ECourse",
        default: null,
      },
    },
    // Course status and visibility
    status: {
      type: String,
      enum: [
        "draft",
        "pending_approval",
        "approved",
        "published",
        "archived",
        "suspended",
        "rejected",
      ],
      default: "draft",
    },
    visibility: {
      type: String,
      enum: ["public", "private", "branch-only"],
      default: "public",
    },
    // Approval workflow
    approvalStatus: {
      type: String,
      enum: ["not_required", "pending", "approved", "rejected"],
      default: "not_required",
    },
    approvalHistory: [
      {
        action: {
          type: String,
          enum: ["submitted", "approved", "rejected", "modified"],
          required: true,
        },
        performedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        performedAt: {
          type: Date,
          default: Date.now,
        },
        notes: String,
        previousData: mongoose.Schema.Types.Mixed, // Store previous state for rejections/modifications
        newData: mongoose.Schema.Types.Mixed, // Store new state for modifications
      },
    ],
    lastApprovalRequest: {
      type: Date,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    approvedAt: {
      type: Date,
    },
    // Course structure
    modules: [
      {
        title: {
          type: String,
          required: true,
          trim: true,
        },
        description: {
          type: String,
          trim: true,
        },
        order: {
          type: Number,
          required: true,
          default: 1,
        },
        estimatedDuration: {
          type: Number,
          default: 0,
        },
        contents: [
          {
            title: {
              type: String,
              required: true,
              trim: true,
            },
            description: {
              type: String,
              trim: true,
            },
            type: {
              type: String,
              enum: [
                "video",
                "document",
                "presentation",
                "audio",
                "interactive",
                "text",
                "mixed",
              ],
              required: true,
            },
            order: {
              type: Number,
              required: true,
              default: 1,
            },
            estimatedDuration: {
              type: Number,
              default: 0,
            },
            content: {
              type: String, // For text content
            },
            mediaUrl: {
              type: String, // For video/audio files
            },
            externalUrl: {
              type: String, // For external links
            },
            status: {
              type: String,
              enum: ["draft", "published", "archived"],
              default: "draft",
            },
            createdAt: {
              type: Date,
              default: Date.now,
            },
          },
        ],
        status: {
          type: String,
          enum: ["draft", "published", "archived", "deleted"],
          default: "draft",
        },
        settings: {
          allowSkip: { type: Boolean, default: false },
          requireCompletion: { type: Boolean, default: true },
          attempts: { type: Number, default: 1 },
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    content: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "CourseContent",
      },
    ],
    // Completion requirements
    completionRequirements: {
      minimumProgress: {
        type: Number,
        default: 80, // Percentage
      },
      requireAllModules: {
        type: Boolean,
        default: true,
      },
      requireFinalAssessment: {
        type: Boolean,
        default: false,
      },
    },
    // Course settings
    settings: {
      allowDiscussions: {
        type: Boolean,
        default: true,
      },
      allowDownloads: {
        type: Boolean,
        default: false,
      },
      trackProgress: {
        type: Boolean,
        default: true,
      },
      generateCertificate: {
        type: Boolean,
        default: false,
      },
      certificateTemplate: String,
    },
    // Tags for search and categorization
    tags: [String],
    // Course statistics
    stats: {
      totalEnrollments: {
        type: Number,
        default: 0,
      },
      activeStudents: {
        type: Number,
        default: 0,
      },
      completionRate: {
        type: Number,
        default: 0,
      },
      averageRating: {
        type: Number,
        default: 0,
      },
      totalRatings: {
        type: Number,
        default: 0,
      },
    },
    // Branch association
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
ECourseSchema.index({ instructor: 1, branchId: 1 });
ECourseSchema.index({ status: 1, visibility: 1 });
ECourseSchema.index({ category: 1, level: 1 });
ECourseSchema.index({ "registration.type": 1 });
ECourseSchema.index({ tags: 1 });

// Virtual for total duration
ECourseSchema.virtual("totalDuration").get(function () {
  return this.duration.estimatedHours * 60 + this.duration.estimatedMinutes;
});

// Methods
ECourseSchema.methods.canEnroll = function (user) {
  // Check if user can enroll in this course
  if (this.status !== "published") return false;
  if (
    this.registration.maxStudents &&
    this.stats.totalEnrollments >= this.registration.maxStudents
  )
    return false;
  if (
    this.registration.enrollmentDeadline &&
    new Date() > this.registration.enrollmentDeadline
  )
    return false;

  // Check branch access
  if (
    this.visibility === "branch-only" &&
    user.branchId.toString() !== this.branchId.toString()
  ) {
    return false;
  }

  return true;
};

ECourseSchema.methods.submitForApproval = function (userId, notes = "") {
  this.approvalStatus = "pending";
  this.lastApprovalRequest = new Date();
  this.approvalHistory.push({
    action: "submitted",
    performedBy: userId,
    notes: notes,
  });
  return this.save();
};

ECourseSchema.methods.approve = function (adminId, notes = "") {
  // Check if there are pending modifications to apply
  const pendingModification = this.approvalHistory
    .filter((entry) => entry.action === "modified")
    .sort((a, b) => new Date(b.performedAt) - new Date(a.performedAt))[0];

  if (pendingModification && pendingModification.newData) {
    // Apply the pending changes
    const newData = pendingModification.newData;
    Object.keys(newData).forEach((key) => {
      if (newData[key] !== undefined) {
        if (key === "chain" && newData[key]) {
          // Handle chain object specially
          this.chain = {
            chainId: newData[key].chainId || undefined,
            sequenceNumber: newData[key].sequenceNumber || 1,
            isChainFinal: newData[key].isChainFinal ?? true,
            nextCourseId: newData[key].nextCourseId || null,
          };
        } else {
          this[key] = newData[key];
        }
      }
    });
  }

  this.approvalStatus = "approved";
  this.approvedBy = adminId;
  this.approvedAt = new Date();
  this.status = "approved"; // Set to approved status
  this.approvalHistory.push({
    action: "approved",
    performedBy: adminId,
    notes: notes,
  });
  return this.save().catch((err) => {
    console.error("Error saving approved course:", err);
    throw err;
  });
};

ECourseSchema.methods.reject = function (adminId, notes = "") {
  this.approvalStatus = "rejected";
  this.status = "rejected";
  this.approvalHistory.push({
    action: "rejected",
    performedBy: adminId,
    notes: notes,
  });
  return this.save();
};

ECourseSchema.methods.requestModificationApproval = function (
  userId,
  newData,
  notes = ""
) {
  // Store current state as previous data
  const previousData = {
    title: this.title,
    description: this.description,
    shortDescription: this.shortDescription,
    category: this.category,
    level: this.level,
    duration: this.duration,
    pricing: this.pricing,
    registration: this.registration,
    settings: this.settings,
    tags: this.tags,
    thumbnail: this.thumbnail,
    modules: this.modules,
    chain: this.chain, // Include chain data
  };

  this.approvalStatus = "pending";
  this.lastApprovalRequest = new Date();
  this.approvalHistory.push({
    action: "modified",
    performedBy: userId,
    notes: notes,
    previousData: previousData,
    newData: newData,
  });
  return this.save();
};

ECourseSchema.methods.canModify = function (user) {
  // Admins and superadmins can always modify
  if (
    user.roles?.includes("admin") ||
    user.roles?.includes("superadmin") ||
    user.roles?.includes("branchadmin")
  ) {
    return true;
  }

  // Teachers can modify their own courses, but changes need approval
  if (
    user.roles?.includes("teacher") &&
    this.instructor.toString() === user._id.toString()
  ) {
    return true;
  }

  return false;
};

ECourseSchema.methods.canDelete = function (user) {
  // Only admins and superadmins can delete courses
  return user.roles?.includes("admin") || user.roles?.includes("superadmin");
};

ECourseSchema.methods.canPublish = function (user) {
  // Check if course is approved or published (for unpublish operations)
  const canModify =
    this.approvalStatus === "approved" ||
    this.status === "approved" ||
    this.status === "published";

  if (!canModify) {
    return false;
  }

  // Admins can publish/unpublish any approved or published course
  if (
    user.roles?.includes("admin") ||
    user.roles?.includes("superadmin") ||
    user.roles?.includes("branchadmin")
  ) {
    return true;
  }

  // Instructor can publish/unpublish their own approved or published course
  if (
    user.roles?.includes("teacher") &&
    this.instructor.toString() === user._id.toString()
  ) {
    return true;
  }

  return false;
};

ECourseSchema.methods.updateStats = async function () {
  // This would be called to update course statistics
  // Implementation would involve querying enrollment and progress data
};

// Static methods for chain operations
ECourseSchema.statics.getChainCourses = function (chainId) {
  return this.find({ "chain.chainId": chainId }).sort("chain.sequenceNumber");
};

ECourseSchema.statics.getNextCourseInChain = function (
  chainId,
  currentSequence
) {
  return this.findOne({
    "chain.chainId": chainId,
    "chain.sequenceNumber": currentSequence + 1,
  });
};

module.exports = mongoose.model("ECourse", ECourseSchema);
