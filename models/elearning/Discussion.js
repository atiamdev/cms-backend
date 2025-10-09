const mongoose = require("mongoose");

const DiscussionSchema = new mongoose.Schema(
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
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    moduleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LearningModule",
    },
    contentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CourseContent",
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
    },
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    authorType: {
      type: String,
      required: true,
      enum: ["Teacher", "Student"],
    },

    // Discussion type and settings
    type: {
      type: String,
      enum: [
        "general",
        "question",
        "announcement",
        "assignment_discussion",
        "peer_review",
      ],
      default: "general",
    },
    category: {
      type: String,
      enum: [
        "course_content",
        "technical_help",
        "study_group",
        "project_collaboration",
        "general_chat",
      ],
      default: "course_content",
    },

    // Content and formatting
    content: {
      type: String,
      required: true,
    },
    formattedContent: String, // HTML formatted content
    attachments: [
      {
        fileName: String,
        fileUrl: String,
        fileType: String,
        fileSize: Number,
        uploadedAt: { type: Date, default: Date.now },
      },
    ],

    // Discussion settings
    settings: {
      allowReplies: { type: Boolean, default: true },
      requireModeration: { type: Boolean, default: false },
      allowAnonymous: { type: Boolean, default: false },
      allowFileUploads: { type: Boolean, default: true },
      maxFileSize: { type: Number, default: 10 * 1024 * 1024 }, // 10MB
      allowedFileTypes: [
        {
          type: String,
          default: ["pdf", "doc", "docx", "txt", "jpg", "png", "gif"],
        },
      ],
      autoClose: { type: Boolean, default: false },
      autoCloseDate: Date,
      gradingEnabled: { type: Boolean, default: false },
      maxGrade: Number,
    },

    // Status and visibility
    status: {
      type: String,
      enum: ["draft", "published", "closed", "archived", "deleted"],
      default: "published",
    },
    visibility: {
      type: String,
      enum: ["public", "class_only", "module_only", "teacher_only"],
      default: "class_only",
    },
    isPinned: { type: Boolean, default: false },
    isFeatured: { type: Boolean, default: false },

    // Tags and categories for organization
    tags: [{ type: String, trim: true, lowercase: true }],
    keywords: [String], // For search optimization

    // Engagement tracking
    views: { type: Number, default: 0 },
    uniqueViewers: [
      {
        userId: mongoose.Schema.Types.ObjectId,
        userType: String,
        viewedAt: Date,
      },
    ],

    // Reply and interaction tracking
    replyCount: { type: Number, default: 0 },
    lastReplyAt: Date,
    lastReplyBy: {
      userId: mongoose.Schema.Types.ObjectId,
      userType: String,
      userName: String,
    },

    // Voting/Rating system
    votes: {
      upVotes: { type: Number, default: 0 },
      downVotes: { type: Number, default: 0 },
      totalVotes: { type: Number, default: 0 },
      voters: [
        {
          userId: mongoose.Schema.Types.ObjectId,
          userType: String,
          voteType: { type: String, enum: ["up", "down"] },
          votedAt: Date,
        },
      ],
    },

    // Moderation
    moderation: {
      isReported: { type: Boolean, default: false },
      reportCount: { type: Number, default: 0 },
      reports: [
        {
          reportedBy: mongoose.Schema.Types.ObjectId,
          reporterType: String,
          reason: String,
          description: String,
          reportedAt: Date,
          status: {
            type: String,
            enum: ["pending", "reviewed", "dismissed"],
            default: "pending",
          },
        },
      ],
      moderatedBy: mongoose.Schema.Types.ObjectId,
      moderatedAt: Date,
      moderationAction: String, // 'approved', 'rejected', 'edited', 'deleted'
      moderationNotes: String,
    },

    // Assignment integration (if discussion is for assignment)
    assignmentIntegration: {
      assignmentId: mongoose.Schema.Types.ObjectId,
      isGraded: { type: Boolean, default: false },
      participationPoints: { type: Number, default: 0 },
      qualityPoints: { type: Number, default: 0 },
      totalPoints: { type: Number, default: 0 },
      gradedBy: mongoose.Schema.Types.ObjectId,
      gradedAt: Date,
      feedback: String,
    },

    // Analytics and insights
    analytics: {
      engagementScore: { type: Number, default: 0 }, // Calculated based on views, replies, votes
      responseRate: { type: Number, default: 0 }, // Percentage of enrolled students who replied
      averageResponseTime: Number, // Average time to first response in minutes
      peakActivityPeriod: String, // Time period with most activity
      topContributors: [
        {
          userId: mongoose.Schema.Types.ObjectId,
          userType: String,
          userName: String,
          contributionCount: Number,
          qualityScore: Number,
        },
      ],
    },

    // Notification settings
    notifications: {
      notifyOnReply: { type: Boolean, default: true },
      notifyOnVote: { type: Boolean, default: false },
      notifyOnMention: { type: Boolean, default: true },
      subscribers: [
        {
          userId: mongoose.Schema.Types.ObjectId,
          userType: String,
          subscribedAt: Date,
        },
      ],
    },

    // Collaboration features
    collaboration: {
      allowCollaboration: { type: Boolean, default: false },
      collaborators: [
        {
          userId: mongoose.Schema.Types.ObjectId,
          userType: String,
          userName: String,
          role: { type: String, enum: ["editor", "contributor", "viewer"] },
          addedAt: Date,
          addedBy: mongoose.Schema.Types.ObjectId,
        },
      ],
      sharedDocuments: [
        {
          title: String,
          documentUrl: String,
          documentType: String,
          sharedBy: mongoose.Schema.Types.ObjectId,
          sharedAt: Date,
          permissions: { type: String, enum: ["view", "edit", "comment"] },
        },
      ],
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
DiscussionSchema.index({ courseId: 1 });
DiscussionSchema.index({ moduleId: 1 });
DiscussionSchema.index({ branchId: 1 });
DiscussionSchema.index({ authorId: 1, authorType: 1 });
DiscussionSchema.index({ status: 1, visibility: 1 });
DiscussionSchema.index({ type: 1, category: 1 });
DiscussionSchema.index({ isPinned: 1, createdAt: -1 });
DiscussionSchema.index({ tags: 1 });
DiscussionSchema.index({ "votes.totalVotes": -1 });
DiscussionSchema.index({ views: -1 });
DiscussionSchema.index({ lastReplyAt: -1 });

// Text index for search
DiscussionSchema.index({
  title: "text",
  content: "text",
  tags: "text",
  keywords: "text",
});

// Virtual fields
DiscussionSchema.virtual("isActive").get(function () {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  return this.lastReplyAt
    ? this.lastReplyAt > threeDaysAgo
    : this.createdAt > threeDaysAgo;
});

DiscussionSchema.virtual("popularity").get(function () {
  return this.views * 0.1 + this.replyCount * 2 + this.votes.totalVotes * 1.5;
});

DiscussionSchema.virtual("engagementRate").get(function () {
  return this.views > 0 ? (this.replyCount / this.views) * 100 : 0;
});

DiscussionSchema.virtual("voteRatio").get(function () {
  const total = this.votes.upVotes + this.votes.downVotes;
  return total > 0 ? (this.votes.upVotes / total) * 100 : 0;
});

// Instance methods
DiscussionSchema.methods.addView = function (userId, userType) {
  // Check if user hasn't viewed before
  const hasViewed = this.uniqueViewers.some(
    (viewer) =>
      viewer.userId.toString() === userId.toString() &&
      viewer.userType === userType
  );

  if (!hasViewed) {
    this.uniqueViewers.push({
      userId,
      userType,
      viewedAt: new Date(),
    });
  }

  this.views += 1;
  return this.save();
};

DiscussionSchema.methods.vote = function (userId, userType, voteType) {
  // Find existing vote from this user
  const existingVoteIndex = this.votes.voters.findIndex(
    (voter) =>
      voter.userId.toString() === userId.toString() &&
      voter.userType === userType
  );

  if (existingVoteIndex !== -1) {
    const existingVote = this.votes.voters[existingVoteIndex];

    // If user is voting the same way, remove the vote (toggle off)
    if (existingVote.voteType === voteType) {
      // Remove the vote
      this.votes.voters.splice(existingVoteIndex, 1);

      // Update vote counts
      if (voteType === "up") {
        this.votes.upVotes -= 1;
      } else if (voteType === "down") {
        this.votes.downVotes -= 1;
      }
    } else {
      // User is changing their vote (up to down or down to up)
      // Update the existing vote
      this.votes.voters[existingVoteIndex] = {
        userId,
        userType,
        voteType,
        votedAt: new Date(),
      };

      // Update vote counts
      if (existingVote.voteType === "up") {
        this.votes.upVotes -= 1;
      } else if (existingVote.voteType === "down") {
        this.votes.downVotes -= 1;
      }

      if (voteType === "up") {
        this.votes.upVotes += 1;
      } else if (voteType === "down") {
        this.votes.downVotes += 1;
      }
    }
  } else {
    // No existing vote, add new vote
    this.votes.voters.push({
      userId,
      userType,
      voteType,
      votedAt: new Date(),
    });

    // Update vote counts
    if (voteType === "up") {
      this.votes.upVotes += 1;
    } else if (voteType === "down") {
      this.votes.downVotes += 1;
    }
  }

  this.votes.totalVotes = this.votes.upVotes + this.votes.downVotes;
  this.calculateEngagementScore();

  return this.save();
};

DiscussionSchema.methods.removeVote = function (userId, userType) {
  const existingVote = this.votes.voters.find(
    (voter) =>
      voter.userId.toString() === userId.toString() &&
      voter.userType === userType
  );

  if (existingVote) {
    // Remove vote
    this.votes.voters = this.votes.voters.filter(
      (voter) =>
        !(
          voter.userId.toString() === userId.toString() &&
          voter.userType === userType
        )
    );

    // Update counts
    if (existingVote.voteType === "up") {
      this.votes.upVotes = Math.max(0, this.votes.upVotes - 1);
    } else {
      this.votes.downVotes = Math.max(0, this.votes.downVotes - 1);
    }

    this.votes.totalVotes = this.votes.upVotes + this.votes.downVotes;
    this.calculateEngagementScore();

    return this.save();
  }

  return Promise.resolve(this);
};

DiscussionSchema.methods.addReply = function (replyData) {
  this.replyCount += 1;
  this.lastReplyAt = new Date();
  this.lastReplyBy = {
    userId: replyData.authorId,
    userType: replyData.authorType,
    userName: replyData.authorName,
  };

  this.calculateEngagementScore();
  this.updateAnalytics();

  return this.save();
};

DiscussionSchema.methods.subscribe = function (userId, userType) {
  const isSubscribed = this.notifications.subscribers.some(
    (sub) =>
      sub.userId.toString() === userId.toString() && sub.userType === userType
  );

  if (!isSubscribed) {
    this.notifications.subscribers.push({
      userId,
      userType,
      subscribedAt: new Date(),
    });

    return this.save();
  }

  return Promise.resolve(this);
};

DiscussionSchema.methods.unsubscribe = function (userId, userType) {
  this.notifications.subscribers = this.notifications.subscribers.filter(
    (sub) =>
      !(
        sub.userId.toString() === userId.toString() && sub.userType === userType
      )
  );

  return this.save();
};

DiscussionSchema.methods.report = function (reportData) {
  this.moderation.reports.push({
    reportedBy: reportData.reportedBy,
    reporterType: reportData.reporterType,
    reason: reportData.reason,
    description: reportData.description,
    reportedAt: new Date(),
    status: "pending",
  });

  this.moderation.reportCount += 1;
  this.moderation.isReported = true;

  return this.save();
};

DiscussionSchema.methods.moderate = function (moderatorId, action, notes) {
  this.moderation.moderatedBy = moderatorId;
  this.moderation.moderatedAt = new Date();
  this.moderation.moderationAction = action;
  this.moderation.moderationNotes = notes;

  // Update status based on moderation action
  if (action === "rejected" || action === "deleted") {
    this.status = "deleted";
  }

  // Update all pending reports to reviewed
  this.moderation.reports.forEach((report) => {
    if (report.status === "pending") {
      report.status = "reviewed";
    }
  });

  return this.save();
};

DiscussionSchema.methods.addCollaborator = function (
  userId,
  userType,
  userName,
  role,
  addedBy
) {
  const existingCollaborator = this.collaboration.collaborators.find(
    (collab) =>
      collab.userId.toString() === userId.toString() &&
      collab.userType === userType
  );

  if (!existingCollaborator) {
    this.collaboration.collaborators.push({
      userId,
      userType,
      userName,
      role,
      addedAt: new Date(),
      addedBy,
    });

    return this.save();
  }

  return Promise.resolve(this);
};

DiscussionSchema.methods.calculateEngagementScore = function () {
  // Weighted engagement score calculation
  const viewScore = this.views * 0.1;
  const replyScore = this.replyCount * 3;
  const voteScore = this.votes.totalVotes * 2;
  const uniqueViewerScore = this.uniqueViewers.length * 0.5;

  this.analytics.engagementScore =
    viewScore + replyScore + voteScore + uniqueViewerScore;
};

DiscussionSchema.methods.updateAnalytics = async function () {
  // Update engagement score
  this.calculateEngagementScore();

  // Calculate response rate (requires course enrollment data)
  // This would need to be implemented with actual enrollment data

  // Update peak activity period based on reply times
  if (this.lastReplyAt) {
    const hour = this.lastReplyAt.getHours();
    if (hour >= 9 && hour < 12) {
      this.analytics.peakActivityPeriod = "morning";
    } else if (hour >= 12 && hour < 17) {
      this.analytics.peakActivityPeriod = "afternoon";
    } else if (hour >= 17 && hour < 21) {
      this.analytics.peakActivityPeriod = "evening";
    } else {
      this.analytics.peakActivityPeriod = "night";
    }
  }
};

DiscussionSchema.methods.pin = function () {
  this.isPinned = true;
  return this.save();
};

DiscussionSchema.methods.unpin = function () {
  this.isPinned = false;
  return this.save();
};

DiscussionSchema.methods.close = function () {
  this.status = "closed";
  this.settings.allowReplies = false;
  return this.save();
};

DiscussionSchema.methods.archive = function () {
  this.status = "archived";
  this.settings.allowReplies = false;
  return this.save();
};

// Static methods
DiscussionSchema.statics.findByCourse = function (courseId, options = {}) {
  const query = { courseId, status: { $ne: "deleted" } };

  if (options.type) query.type = options.type;
  if (options.category) query.category = options.category;
  if (options.visibility) query.visibility = options.visibility;

  let mongoQuery = this.find(query);

  // Sorting
  if (options.sortBy === "popularity") {
    mongoQuery = mongoQuery.sort({ "votes.totalVotes": -1, views: -1 });
  } else if (options.sortBy === "recent") {
    mongoQuery = mongoQuery.sort({ lastReplyAt: -1, createdAt: -1 });
  } else {
    mongoQuery = mongoQuery.sort({ isPinned: -1, createdAt: -1 });
  }

  return mongoQuery
    .populate("authorId", "name")
    .populate("courseId", "title")
    .populate("moduleId", "title");
};

DiscussionSchema.statics.searchDiscussions = function (
  searchTerm,
  filters = {}
) {
  const query = {
    $text: { $search: searchTerm },
    status: { $ne: "deleted" },
    ...filters,
  };

  return this.find(query, { score: { $meta: "textScore" } })
    .sort({ score: { $meta: "textScore" } })
    .populate("authorId", "name")
    .populate("courseId", "title");
};

DiscussionSchema.statics.getPopularDiscussions = function (
  courseId,
  limit = 10
) {
  return this.find({
    courseId,
    status: "published",
    visibility: { $in: ["public", "class_only"] },
  })
    .sort({ "analytics.engagementScore": -1 })
    .limit(limit)
    .populate("authorId", "name")
    .populate("lastReplyBy.userId", "name");
};

DiscussionSchema.statics.getTrendingDiscussions = function (
  branchId,
  days = 7
) {
  const dateThreshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  return this.find({
    branchId,
    status: "published",
    createdAt: { $gte: dateThreshold },
    replyCount: { $gte: 1 },
  })
    .sort({ "analytics.engagementScore": -1, replyCount: -1 })
    .limit(20)
    .populate("authorId", "name")
    .populate("courseId", "title");
};

DiscussionSchema.statics.getAnalytics = async function (
  courseId,
  branchId = null
) {
  const matchQuery = { courseId };
  if (branchId) matchQuery.branchId = branchId;

  const analytics = await this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        totalDiscussions: { $sum: 1 },
        totalViews: { $sum: "$views" },
        totalReplies: { $sum: "$replyCount" },
        averageEngagement: { $avg: "$analytics.engagementScore" },
        activeDiscussions: {
          $sum: {
            $cond: [
              {
                $gte: [
                  "$lastReplyAt",
                  new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                ],
              },
              1,
              0,
            ],
          },
        },
        pinnedDiscussions: { $sum: { $cond: ["$isPinned", 1, 0] } },
        reportedDiscussions: {
          $sum: { $cond: ["$moderation.isReported", 1, 0] },
        },
      },
    },
  ]);

  return analytics[0] || {};
};

// Pre-save middleware
DiscussionSchema.pre("save", function (next) {
  // Update analytics before saving
  if (
    this.isModified("replyCount") ||
    this.isModified("views") ||
    this.isModified("votes")
  ) {
    this.calculateEngagementScore();
  }

  // Auto-close if auto-close date is reached
  if (
    this.settings.autoClose &&
    this.settings.autoCloseDate &&
    new Date() >= this.settings.autoCloseDate &&
    this.status === "published"
  ) {
    this.status = "closed";
    this.settings.allowReplies = false;
  }

  next();
});

module.exports = mongoose.model("Discussion", DiscussionSchema);
