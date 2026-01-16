const mongoose = require("mongoose");

const SharedContentLibrarySchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    originalContentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CourseContent",
      required: true,
    },
    originalCourseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    originalModuleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LearningModule",
    },
    originalBranchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
    },

    // Sharing metadata
    sharedBy: {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: "sharedBy.userType",
      },
      userType: {
        type: String,
        required: true,
        enum: ["Teacher", "User"], // User for admins
      },
      userName: String,
      userEmail: String,
    },
    sharedAt: {
      type: Date,
      default: Date.now,
    },

    // Content categorization
    contentType: {
      type: String,
      enum: [
        "video",
        "document",
        "presentation",
        "audio",
        "interactive",
        "quiz",
        "assignment",
        "mixed",
      ],
      required: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    gradeLevel: {
      type: String,
      enum: ["primary", "middle", "high", "university", "professional", "all"],
      default: "all",
    },
    difficulty: {
      type: String,
      enum: ["beginner", "intermediate", "advanced", "expert"],
      default: "intermediate",
    },

    // Educational metadata
    learningObjectives: [String],
    prerequisites: [String],
    estimatedDuration: {
      // in minutes
      type: Number,
      min: 0,
    },
    tags: [{ type: String, trim: true, lowercase: true }],
    keywords: [String], // For enhanced search

    // License and usage rights
    license: {
      type: {
        type: String,
        enum: [
          "creative_commons",
          "public_domain",
          "fair_use",
          "custom",
          "proprietary",
        ],
        default: "custom",
      },
      attribution: String,
      allowCommercialUse: { type: Boolean, default: false },
      allowModification: { type: Boolean, default: true },
      requireShareAlike: { type: Boolean, default: false },
      customTerms: String,
    },

    // Content details (cached from original)
    contentDetails: {
      fileUrl: String,
      thumbnailUrl: String,
      fileType: String,
      fileSize: Number,
      duration: Number, // for videos/audio
      pages: Number, // for documents
      hasTranscript: Boolean,
      hasSubtitles: Boolean,
      languages: [String],
      accessibility: {
        hasAltText: Boolean,
        hasClosedCaptions: Boolean,
        screenReaderCompatible: Boolean,
        keyboardNavigable: Boolean,
      },
    },

    // Quality and ratings
    quality: {
      averageRating: { type: Number, default: 0, min: 0, max: 5 },
      totalRatings: { type: Number, default: 0 },
      ratings: [
        {
          userId: mongoose.Schema.Types.ObjectId,
          userType: String,
          rating: { type: Number, min: 1, max: 5 },
          review: String,
          helpful: { type: Number, default: 0 },
          unhelpful: { type: Number, default: 0 },
          ratedAt: { type: Date, default: Date.now },
        },
      ],
      qualityChecked: { type: Boolean, default: false },
      qualityCheckedBy: mongoose.Schema.Types.ObjectId,
      qualityCheckedAt: Date,
      qualityNotes: String,
    },

    // Usage and analytics
    usage: {
      downloadCount: { type: Number, default: 0 },
      viewCount: { type: Number, default: 0 },
      shareCount: { type: Number, default: 0 },
      usageByBranch: [
        {
          branchId: mongoose.Schema.Types.ObjectId,
          branchName: String,
          usageCount: { type: Number, default: 0 },
          lastUsed: Date,
          teachers: [
            {
              teacherId: mongoose.Schema.Types.ObjectId,
              teacherName: String,
              usageCount: Number,
              courses: [
                {
                  courseId: mongoose.Schema.Types.ObjectId,
                  courseName: String,
                },
              ],
            },
          ],
        },
      ],

      // Performance metrics
      averageEngagement: { type: Number, default: 0 }, // percentage
      completionRate: { type: Number, default: 0 }, // percentage
      effectiveness: { type: Number, default: 0 }, // based on learning outcomes
    },

    // Sharing permissions and access control
    permissions: {
      visibility: {
        type: String,
        enum: ["public", "network_only", "branch_only", "private"],
        default: "network_only",
      },
      allowedBranches: [
        {
          branchId: mongoose.Schema.Types.ObjectId,
          branchName: String,
          permissions: {
            type: String,
            enum: ["view", "download", "modify"],
            default: "view",
          },
          sharedAt: Date,
          sharedBy: mongoose.Schema.Types.ObjectId,
        },
      ],
      allowedUsers: [
        {
          userId: mongoose.Schema.Types.ObjectId,
          userType: String,
          userName: String,
          permissions: {
            type: String,
            enum: ["view", "download", "modify"],
            default: "view",
          },
          sharedAt: Date,
          expiresAt: Date,
        },
      ],
      requireApproval: { type: Boolean, default: false },
      maxDownloads: Number,
      downloadExpiry: Date,
    },

    // Content status and moderation
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "archived", "removed"],
      default: "pending",
    },
    moderation: {
      reviewedBy: mongoose.Schema.Types.ObjectId,
      reviewedAt: Date,
      reviewNotes: String,
      flagged: { type: Boolean, default: false },
      flaggedReasons: [String],
      violations: [
        {
          type: String,
          description: String,
          reportedBy: mongoose.Schema.Types.ObjectId,
          reportedAt: Date,
          resolved: Boolean,
        },
      ],
    },

    // Version control and updates
    version: { type: Number, default: 1 },
    versionHistory: [
      {
        version: Number,
        changedBy: mongoose.Schema.Types.ObjectId,
        changedAt: Date,
        changeDescription: String,
        contentSnapshot: mongoose.Schema.Types.Mixed, // Store previous version data
      },
    ],
    lastUpdated: Date,
    isLatestVersion: { type: Boolean, default: true },

    // Collection and organization
    collections: [
      {
        collectionId: mongoose.Schema.Types.ObjectId,
        collectionName: String,
        addedBy: mongoose.Schema.Types.ObjectId,
        addedAt: Date,
      },
    ],
    relatedContent: [
      {
        contentId: mongoose.Schema.Types.ObjectId,
        relationType: {
          type: String,
          enum: ["prerequisite", "follow_up", "alternative", "complement"],
        },
        relevanceScore: Number,
      },
    ],

    // Comments and feedback
    comments: [
      {
        authorId: mongoose.Schema.Types.ObjectId,
        authorType: String,
        authorName: String,
        content: String,
        parentCommentId: mongoose.Schema.Types.ObjectId, // For nested comments
        likes: { type: Number, default: 0 },
        dislikes: { type: Number, default: 0 },
        createdAt: { type: Date, default: Date.now },
        edited: Boolean,
        editedAt: Date,
      },
    ],

    // Integration with external systems
    external: {
      originalPlatform: String, // If imported from external source
      externalId: String,
      externalUrl: String,
      importedAt: Date,
      importedBy: mongoose.Schema.Types.ObjectId,
      lastSyncAt: Date,
      autoSync: { type: Boolean, default: false },
    },

    // Analytics and insights
    analytics: {
      popularityScore: { type: Number, default: 0 },
      trendingScore: { type: Number, default: 0 },
      searchRanking: { type: Number, default: 0 },
      seasonalTrends: [
        {
          month: Number,
          year: Number,
          usageCount: Number,
          averageRating: Number,
        },
      ],
      userSegments: [
        {
          segment: String, // 'new_teachers', 'experienced_teachers', 'administrators'
          usagePercent: Number,
          satisfaction: Number,
        },
      ],
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
SharedContentLibrarySchema.index({ originalContentId: 1 });
SharedContentLibrarySchema.index({ originalCourseId: 1 });
SharedContentLibrarySchema.index({ originalBranchId: 1 });
SharedContentLibrarySchema.index({
  "sharedBy.userId": 1,
  "sharedBy.userType": 1,
});
SharedContentLibrarySchema.index({ contentType: 1, subject: 1 });
SharedContentLibrarySchema.index({ gradeLevel: 1, difficulty: 1 });
SharedContentLibrarySchema.index({ status: 1, "permissions.visibility": 1 });
SharedContentLibrarySchema.index({ tags: 1 });
SharedContentLibrarySchema.index({ "quality.averageRating": -1 });
SharedContentLibrarySchema.index({ "usage.downloadCount": -1 });
SharedContentLibrarySchema.index({ "analytics.popularityScore": -1 });
SharedContentLibrarySchema.index({ sharedAt: -1 });

// Text index for search
SharedContentLibrarySchema.index({
  title: "text",
  description: "text",
  tags: "text",
  keywords: "text",
  subject: "text",
  learningObjectives: "text",
});

// Compound indexes for common queries
SharedContentLibrarySchema.index({ subject: 1, gradeLevel: 1, contentType: 1 });
SharedContentLibrarySchema.index({
  "permissions.visibility": 1,
  status: 1,
  sharedAt: -1,
});

// Virtual fields
SharedContentLibrarySchema.virtual("isPopular").get(function () {
  return this.usage.downloadCount > 100 || this.quality.averageRating > 4.0;
});

SharedContentLibrarySchema.virtual("isTrending").get(function () {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return this.analytics.trendingScore > 50 && this.sharedAt > oneWeekAgo;
});

SharedContentLibrarySchema.virtual("effectivenessRating").get(function () {
  // Combine rating, completion rate, and effectiveness
  const ratingScore = this.quality.averageRating * 20; // Convert to percentage
  const completionScore = this.usage.completionRate;
  const effectivenessScore = this.usage.effectiveness;

  return (ratingScore + completionScore + effectivenessScore) / 3;
});

SharedContentLibrarySchema.virtual("canDownload").get(function () {
  return (
    this.status === "approved" &&
    (!this.permissions.maxDownloads ||
      this.usage.downloadCount < this.permissions.maxDownloads) &&
    (!this.permissions.downloadExpiry ||
      new Date() < this.permissions.downloadExpiry)
  );
});

// Instance methods
SharedContentLibrarySchema.methods.addRating = function (
  userId,
  userType,
  rating,
  review
) {
  // Remove existing rating from this user
  this.quality.ratings = this.quality.ratings.filter(
    (r) =>
      !(r.userId.toString() === userId.toString() && r.userType === userType)
  );

  // Add new rating
  this.quality.ratings.push({
    userId,
    userType,
    rating,
    review,
    ratedAt: new Date(),
  });

  // Recalculate average
  this.quality.totalRatings = this.quality.ratings.length;
  this.quality.averageRating =
    this.quality.ratings.reduce((sum, r) => sum + r.rating, 0) /
    this.quality.totalRatings;

  this.updateAnalytics();
  return this.save();
};

SharedContentLibrarySchema.methods.recordUsage = function (
  branchId,
  branchName,
  teacherId,
  teacherName,
  courseId,
  courseName
) {
  this.usage.viewCount += 1;

  // Update branch usage
  let branchUsage = this.usage.usageByBranch.find(
    (b) => b.branchId.toString() === branchId.toString()
  );

  if (!branchUsage) {
    branchUsage = {
      branchId,
      branchName,
      usageCount: 0,
      teachers: [],
    };
    this.usage.usageByBranch.push(branchUsage);
  }

  branchUsage.usageCount += 1;
  branchUsage.lastUsed = new Date();

  // Update teacher usage within branch
  let teacherUsage = branchUsage.teachers.find(
    (t) => t.teacherId.toString() === teacherId.toString()
  );

  if (!teacherUsage) {
    teacherUsage = {
      teacherId,
      teacherName,
      usageCount: 0,
      courses: [],
    };
    branchUsage.teachers.push(teacherUsage);
  }

  teacherUsage.usageCount += 1;

  // Update course usage
  let courseUsage = teacherUsage.courses.find(
    (c) => c.courseId.toString() === courseId.toString()
  );

  if (!courseUsage) {
    teacherUsage.courses.push({ courseId, courseName });
  }

  this.updateAnalytics();
  return this.save();
};

SharedContentLibrarySchema.methods.recordDownload = function (
  branchId,
  branchName,
  teacherId,
  teacherName
) {
  this.usage.downloadCount += 1;
  this.recordUsage(branchId, branchName, teacherId, teacherName, null, null);

  return this.save();
};

SharedContentLibrarySchema.methods.shareWithBranch = function (
  branchId,
  branchName,
  permissions,
  sharedBy
) {
  // Remove existing permission for this branch
  this.permissions.allowedBranches = this.permissions.allowedBranches.filter(
    (b) => b.branchId.toString() !== branchId.toString()
  );

  // Add new permission
  this.permissions.allowedBranches.push({
    branchId,
    branchName,
    permissions,
    sharedAt: new Date(),
    sharedBy,
  });

  this.usage.shareCount += 1;
  return this.save();
};

SharedContentLibrarySchema.methods.shareWithUser = function (
  userId,
  userType,
  userName,
  permissions,
  expiresAt,
  sharedBy
) {
  // Remove existing permission for this user
  this.permissions.allowedUsers = this.permissions.allowedUsers.filter(
    (u) =>
      !(u.userId.toString() === userId.toString() && u.userType === userType)
  );

  // Add new permission
  this.permissions.allowedUsers.push({
    userId,
    userType,
    userName,
    permissions,
    sharedAt: new Date(),
    expiresAt,
  });

  this.usage.shareCount += 1;
  return this.save();
};

SharedContentLibrarySchema.methods.addToCollection = function (
  collectionId,
  collectionName,
  addedBy
) {
  const exists = this.collections.some(
    (c) => c.collectionId.toString() === collectionId.toString()
  );

  if (!exists) {
    this.collections.push({
      collectionId,
      collectionName,
      addedBy,
      addedAt: new Date(),
    });

    return this.save();
  }

  return Promise.resolve(this);
};

SharedContentLibrarySchema.methods.addComment = function (
  authorId,
  authorType,
  authorName,
  content,
  parentCommentId = null
) {
  this.comments.push({
    authorId,
    authorType,
    authorName,
    content,
    parentCommentId,
    createdAt: new Date(),
  });

  return this.save();
};

SharedContentLibrarySchema.methods.moderate = function (
  reviewerId,
  action,
  notes
) {
  this.moderation.reviewedBy = reviewerId;
  this.moderation.reviewedAt = new Date();
  this.moderation.reviewNotes = notes;

  if (action === "approve") {
    this.status = "approved";
  } else if (action === "reject") {
    this.status = "rejected";
  } else if (action === "archive") {
    this.status = "archived";
  }

  return this.save();
};

SharedContentLibrarySchema.methods.flag = function (
  reportedBy,
  reasons,
  description
) {
  this.moderation.flagged = true;
  this.moderation.flaggedReasons = [
    ...new Set([...this.moderation.flaggedReasons, ...reasons]),
  ];

  this.moderation.violations.push({
    type: reasons.join(", "),
    description,
    reportedBy,
    reportedAt: new Date(),
    resolved: false,
  });

  return this.save();
};

SharedContentLibrarySchema.methods.createVersion = function (
  changedBy,
  changeDescription
) {
  // Store current version in history
  this.versionHistory.push({
    version: this.version,
    changedBy,
    changedAt: new Date(),
    changeDescription,
    contentSnapshot: {
      title: this.title,
      description: this.description,
      contentDetails: this.contentDetails,
      learningObjectives: this.learningObjectives,
    },
  });

  // Increment version
  this.version += 1;
  this.lastUpdated = new Date();

  return this.save();
};

SharedContentLibrarySchema.methods.updateAnalytics = function () {
  // Calculate popularity score based on multiple factors
  const downloadWeight = this.usage.downloadCount * 2;
  const ratingWeight = this.quality.averageRating * this.quality.totalRatings;
  const recentUsageWeight = this.usage.viewCount * 0.5;
  const shareWeight = this.usage.shareCount * 3;

  this.analytics.popularityScore =
    downloadWeight + ratingWeight + recentUsageWeight + shareWeight;

  // Calculate trending score (recent activity)
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentDownloads = this.usage.usageByBranch.reduce((sum, branch) => {
    return sum + (branch.lastUsed > oneWeekAgo ? branch.usageCount : 0);
  }, 0);

  this.analytics.trendingScore =
    recentDownloads * 10 + this.usage.shareCount * 5;

  // Update search ranking
  this.analytics.searchRanking =
    this.analytics.popularityScore +
    this.quality.averageRating * 20 +
    this.analytics.trendingScore * 0.5;
};

SharedContentLibrarySchema.methods.checkAccess = function (
  userId,
  userType,
  branchId
) {
  // Check if content is approved
  if (this.status !== "approved") return false;

  // Check visibility
  if (this.permissions.visibility === "public") return true;

  if (this.permissions.visibility === "private") {
    return (
      this.sharedBy.userId.toString() === userId.toString() &&
      this.sharedBy.userType === userType
    );
  }

  if (this.permissions.visibility === "branch_only") {
    return this.originalBranchId.toString() === branchId.toString();
  }

  if (this.permissions.visibility === "network_only") {
    // Check if user's branch has access or user has explicit access
    const branchAccess = this.permissions.allowedBranches.some(
      (b) => b.branchId.toString() === branchId.toString()
    );

    const userAccess = this.permissions.allowedUsers.some(
      (u) =>
        u.userId.toString() === userId.toString() &&
        u.userType === userType &&
        (!u.expiresAt || new Date() < u.expiresAt)
    );

    return branchAccess || userAccess;
  }

  return false;
};

// Static methods
SharedContentLibrarySchema.statics.search = function (
  searchTerm,
  filters = {}
) {
  const query = {
    $text: { $search: searchTerm },
    status: "approved",
    ...filters,
  };

  return this.find(query, { score: { $meta: "textScore" } })
    .sort({ score: { $meta: "textScore" }, "analytics.searchRanking": -1 })
    .populate("sharedBy.userId", "name email");
};

SharedContentLibrarySchema.statics.findBySubject = function (
  subject,
  options = {}
) {
  const query = {
    subject: new RegExp(subject, "i"),
    status: "approved",
    ...options.filters,
  };

  let mongoQuery = this.find(query);

  if (options.sortBy === "popularity") {
    mongoQuery = mongoQuery.sort({ "analytics.popularityScore": -1 });
  } else if (options.sortBy === "rating") {
    mongoQuery = mongoQuery.sort({
      "quality.averageRating": -1,
      "quality.totalRatings": -1,
    });
  } else if (options.sortBy === "recent") {
    mongoQuery = mongoQuery.sort({ sharedAt: -1 });
  }

  return mongoQuery
    .limit(options.limit || 50)
    .populate("sharedBy.userId", "name email");
};

SharedContentLibrarySchema.statics.getTrending = function (limit = 20) {
  return this.find({
    status: "approved",
    "permissions.visibility": { $in: ["public", "network_only"] },
  })
    .sort({ "analytics.trendingScore": -1 })
    .limit(limit)
    .populate("sharedBy.userId", "name email");
};

SharedContentLibrarySchema.statics.getPopular = function (limit = 20) {
  return this.find({
    status: "approved",
    "permissions.visibility": { $in: ["public", "network_only"] },
  })
    .sort({ "analytics.popularityScore": -1 })
    .limit(limit)
    .populate("sharedBy.userId", "name email");
};

SharedContentLibrarySchema.statics.getAnalytics = async function (
  filters = {}
) {
  const matchQuery = { status: "approved", ...filters };

  const analytics = await this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        totalContent: { $sum: 1 },
        totalDownloads: { $sum: "$usage.downloadCount" },
        totalViews: { $sum: "$usage.viewCount" },
        totalShares: { $sum: "$usage.shareCount" },
        averageRating: { $avg: "$quality.averageRating" },
        contentByType: {
          $push: {
            type: "$contentType",
            downloads: "$usage.downloadCount",
            rating: "$quality.averageRating",
          },
        },
        contentBySubject: {
          $push: {
            subject: "$subject",
            downloads: "$usage.downloadCount",
            rating: "$quality.averageRating",
          },
        },
      },
    },
  ]);

  return analytics[0] || {};
};

// Pre-save middleware
SharedContentLibrarySchema.pre("save", function (next) {
  // Update analytics if usage data changed
  if (this.isModified("usage") || this.isModified("quality.ratings")) {
    this.updateAnalytics();
  }

  next();
});

module.exports = mongoose.model(
  "SharedContentLibrary",
  SharedContentLibrarySchema
);
