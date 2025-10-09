const mongoose = require("mongoose");

const LearningProgressSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
    },
    // Module-level progress
    moduleProgress: [
      {
        moduleId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "LearningModule",
          required: true,
        },
        status: {
          type: String,
          enum: ["not_started", "in_progress", "completed", "skipped"],
          default: "not_started",
        },
        startedAt: Date,
        completedAt: Date,
        timeSpent: { type: Number, default: 0 }, // in minutes
        lastAccessedAt: Date,
        progress: { type: Number, default: 0, min: 0, max: 100 }, // percentage

        // Content-specific progress within the module
        contentProgress: [
          {
            contentId: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "CourseContent",
            },
            status: {
              type: String,
              enum: ["not_started", "in_progress", "completed"],
              default: "not_started",
            },
            viewedAt: Date,
            completedAt: Date,
            timeSpent: { type: Number, default: 0 },

            // Video-specific tracking
            videoProgress: {
              duration: Number, // total video duration in seconds
              watchedDuration: { type: Number, default: 0 }, // watched duration
              watchPercentage: { type: Number, default: 0 }, // percentage watched
              playbackSessions: [
                {
                  startTime: Date,
                  endTime: Date,
                  startPosition: Number, // seconds
                  endPosition: Number, // seconds
                  watchedDuration: Number,
                },
              ],
              lastPosition: { type: Number, default: 0 }, // last watched position
              speedSettings: [Number], // playback speeds used
              completedSegments: [{ start: Number, end: Number }], // watched segments
            },

            // Document/Article reading progress
            readingProgress: {
              totalLength: Number, // estimated reading time or content length
              currentPosition: Number, // scroll position or section
              sectionsRead: [String], // section IDs or markers
              readingTime: { type: Number, default: 0 }, // time spent reading
              bookmarks: [{ position: Number, note: String, createdAt: Date }],
            },

            // Interactive content progress
            interactionData: {
              clickCount: { type: Number, default: 0 },
              scrollDepth: Number, // max scroll percentage reached
              timeOnPage: { type: Number, default: 0 },
              interactions: [
                {
                  type: String,
                  timestamp: Date,
                  data: mongoose.Schema.Types.Mixed,
                },
              ],
            },
          },
        ],

        // Assessment results within module
        assessmentResults: [
          {
            assessmentId: mongoose.Schema.Types.ObjectId, // Quiz or Assignment ID
            assessmentType: {
              type: String,
              enum: ["quiz", "discussion"],
            },
            score: Number,
            maxScore: Number,
            percentage: Number,
            attempts: Number,
            bestAttemptScore: Number,
            submittedAt: Date,
            passed: Boolean,
          },
        ],

        // Module completion criteria tracking
        completionCriteria: {
          requiredContentCompleted: { type: Number, default: 0 },
          totalRequiredContent: { type: Number, default: 0 },
          requiredAssessmentsCompleted: { type: Number, default: 0 },
          totalRequiredAssessments: { type: Number, default: 0 },
          minimumScoreAchieved: Boolean,
          prerequisitesMet: Boolean,
        },
      },
    ],

    // Overall course progress
    overallProgress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    // Course completion status
    status: {
      type: String,
      enum: ["not_started", "in_progress", "completed", "failed", "dropped"],
      default: "not_started",
    },

    // Time tracking
    totalTimeSpent: { type: Number, default: 0 }, // in minutes
    estimatedTimeRemaining: Number, // estimated completion time
    averageSessionDuration: Number,
    lastActivityAt: Date,

    // Performance analytics
    analytics: {
      averageScore: Number,
      totalAssignments: { type: Number, default: 0 },
      completedAssignments: { type: Number, default: 0 },
      totalQuizzes: { type: Number, default: 0 },
      completedQuizzes: { type: Number, default: 0 },
      totalDiscussions: { type: Number, default: 0 },
      participatedDiscussions: { type: Number, default: 0 },

      // Performance trends
      weeklyProgress: [
        { week: Date, progressGained: Number, timeSpent: Number },
      ],
      performanceByModule: [
        {
          moduleId: mongoose.Schema.Types.ObjectId,
          averageScore: Number,
          timeSpent: Number,
          difficulty: String, // 'easy', 'medium', 'hard' based on time/performance
        },
      ],

      // Learning patterns
      studyPatterns: {
        preferredStudyTimes: [{ hour: Number, frequency: Number }],
        averageSessionLength: Number,
        longestSession: Number,
        totalSessions: { type: Number, default: 0 },
        deviceUsage: {
          desktop: { type: Number, default: 0 },
          mobile: { type: Number, default: 0 },
          tablet: { type: Number, default: 0 },
        },
      },
    },

    // Engagement metrics
    engagement: {
      loginStreak: { type: Number, default: 0 },
      longestStreak: { type: Number, default: 0 },
      totalLogins: { type: Number, default: 0 },
      lastLoginAt: Date,

      // Content interaction
      notesCreated: { type: Number, default: 0 },
      bookmarksCreated: { type: Number, default: 0 },
      discussionPosts: { type: Number, default: 0 },
      questionsAsked: { type: Number, default: 0 },

      // Social learning
      peersInteracted: { type: Number, default: 0 },
      helpRequested: { type: Number, default: 0 },
      helpProvided: { type: Number, default: 0 },
    },

    // Certificates and achievements
    achievements: [
      {
        type: {
          type: String,
          enum: [
            "module_completion",
            "course_completion",
            "perfect_score",
            "fast_learner",
            "consistent_learner",
          ],
        },
        earnedAt: Date,
        metadata: mongoose.Schema.Types.Mixed,
      },
    ],

    // Completion tracking
    completionDate: Date,
    certificateIssued: { type: Boolean, default: false },
    certificateIssuedAt: Date,

    // Progress flags and notifications
    flags: {
      strugglingLearner: { type: Boolean, default: false }, // Low progress/scores
      atRiskDropout: { type: Boolean, default: false }, // Long inactivity
      fastTrack: { type: Boolean, default: false }, // Ahead of schedule
      needsAttention: { type: Boolean, default: false }, // Teacher intervention needed
    },

    // Custom milestones and goals
    customGoals: [
      {
        title: String,
        description: String,
        targetDate: Date,
        targetMetric: String, // 'progress', 'score', 'time_spent'
        targetValue: Number,
        achieved: { type: Boolean, default: false },
        achievedAt: Date,
      },
    ],

    // External system integration
    externalData: {
      lmsGrades: [
        { system: String, gradeId: String, grade: Number, syncedAt: Date },
      ],
      parentalAccess: {
        enabled: { type: Boolean, default: false },
        lastParentView: Date,
        reportsSent: [{ sentAt: Date, type: String }],
      },
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
LearningProgressSchema.index({ studentId: 1, courseId: 1 }, { unique: true });
LearningProgressSchema.index({ branchId: 1 });
LearningProgressSchema.index({ status: 1 });
LearningProgressSchema.index({ lastActivityAt: 1 });
LearningProgressSchema.index({ overallProgress: 1 });
LearningProgressSchema.index({ "flags.needsAttention": 1 });

// Compound indexes for analytics
LearningProgressSchema.index({ courseId: 1, status: 1, overallProgress: 1 });
LearningProgressSchema.index({ branchId: 1, status: 1, overallProgress: 1 });

// Virtual fields
LearningProgressSchema.virtual("isCompleted").get(function () {
  return this.status === "completed" && this.overallProgress >= 100;
});

LearningProgressSchema.virtual("isActive").get(function () {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return this.lastActivityAt > oneWeekAgo;
});

LearningProgressSchema.virtual("completionRate").get(function () {
  const completedModules = this.moduleProgress.filter(
    (m) => m.status === "completed"
  ).length;
  const totalModules = this.moduleProgress.length;
  return totalModules > 0 ? (completedModules / totalModules) * 100 : 0;
});

LearningProgressSchema.virtual("averageModuleScore").get(function () {
  const scores = this.moduleProgress
    .filter((m) => m.assessmentResults.length > 0)
    .map((m) => {
      const moduleAvg =
        m.assessmentResults.reduce((sum, r) => sum + (r.percentage || 0), 0) /
        m.assessmentResults.length;
      return moduleAvg;
    });

  return scores.length > 0
    ? scores.reduce((sum, score) => sum + score, 0) / scores.length
    : 0;
});

// Instance methods
LearningProgressSchema.methods.updateModuleProgress = function (
  moduleId,
  progressData
) {
  const moduleIndex = this.moduleProgress.findIndex(
    (m) => m.moduleId.toString() === moduleId.toString()
  );

  if (moduleIndex !== -1) {
    // Update existing module progress
    Object.assign(this.moduleProgress[moduleIndex], progressData);
    this.moduleProgress[moduleIndex].lastAccessedAt = new Date();
  } else {
    // Create new module progress
    this.moduleProgress.push({
      moduleId,
      ...progressData,
      lastAccessedAt: new Date(),
    });
  }

  this.lastActivityAt = new Date();
  return this.recalculateOverallProgress();
};

LearningProgressSchema.methods.updateContentProgress = function (
  moduleId,
  contentId,
  progressData
) {
  const moduleProgress = this.moduleProgress.find(
    (m) => m.moduleId.toString() === moduleId.toString()
  );

  if (!moduleProgress) {
    throw new Error("Module progress not found");
  }

  const contentIndex = moduleProgress.contentProgress.findIndex(
    (c) => c.contentId.toString() === contentId.toString()
  );

  if (contentIndex !== -1) {
    Object.assign(moduleProgress.contentProgress[contentIndex], progressData);
  } else {
    moduleProgress.contentProgress.push({
      contentId,
      ...progressData,
    });
  }

  // Update module progress based on content completion
  this.updateModuleProgressFromContent(moduleId);
  this.lastActivityAt = new Date();

  // Don't save here - let the controller handle saving
  return Promise.resolve(this);
};

LearningProgressSchema.methods.updateModuleProgressFromContent = function (
  moduleId
) {
  const moduleProgress = this.moduleProgress.find(
    (m) => m.moduleId.toString() === moduleId.toString()
  );

  if (!moduleProgress) return;

  const completedContent = moduleProgress.contentProgress.filter(
    (c) => c.status === "completed"
  ).length;
  const totalContent = moduleProgress.contentProgress.length;

  if (totalContent > 0) {
    moduleProgress.progress = (completedContent / totalContent) * 100;

    if (
      completedContent === totalContent &&
      moduleProgress.completionCriteria.prerequisitesMet
    ) {
      moduleProgress.status = "completed";
      moduleProgress.completedAt = new Date();
    } else if (completedContent > 0) {
      moduleProgress.status = "in_progress";
      if (!moduleProgress.startedAt) {
        moduleProgress.startedAt = new Date();
      }
    }
  }
};

LearningProgressSchema.methods.recordVideoProgress = function (
  moduleId,
  contentId,
  progressData
) {
  const contentProgress = this.getContentProgress(moduleId, contentId);

  if (!contentProgress.videoProgress) {
    contentProgress.videoProgress = {
      playbackSessions: [],
      completedSegments: [],
      speedSettings: [],
      watchedDuration: 0,
      lastPosition: 0,
    };
  }

  // Update video progress
  Object.assign(contentProgress.videoProgress, progressData);

  // Calculate watch percentage
  if (contentProgress.videoProgress.duration > 0) {
    contentProgress.videoProgress.watchPercentage =
      (contentProgress.videoProgress.watchedDuration /
        contentProgress.videoProgress.duration) *
      100;
  }

  // Mark as completed if watched 90% or more
  if (contentProgress.videoProgress.watchPercentage >= 90) {
    contentProgress.status = "completed";
    contentProgress.completedAt = new Date();
  } else if (contentProgress.videoProgress.watchPercentage > 10) {
    contentProgress.status = "in_progress";
    if (!contentProgress.viewedAt) {
      contentProgress.viewedAt = new Date();
    }
  }

  // Don't save here - let the controller handle saving
  return Promise.resolve(this);
};

LearningProgressSchema.methods.getContentProgress = function (
  moduleId,
  contentId
) {
  const moduleProgress = this.moduleProgress.find(
    (m) => m.moduleId.toString() === moduleId.toString()
  );

  if (!moduleProgress) {
    throw new Error("Module progress not found");
  }

  let contentProgress = moduleProgress.contentProgress.find(
    (c) => c.contentId.toString() === contentId.toString()
  );

  if (!contentProgress) {
    contentProgress = {
      contentId,
      status: "not_started",
      timeSpent: 0,
    };
    moduleProgress.contentProgress.push(contentProgress);
  }

  return contentProgress;
};

LearningProgressSchema.methods.recalculateOverallProgress = function () {
  const moduleProgresses = this.moduleProgress.map((m) => m.progress || 0);

  if (moduleProgresses.length > 0) {
    this.overallProgress =
      moduleProgresses.reduce((sum, progress) => sum + progress, 0) /
      moduleProgresses.length;
  } else {
    this.overallProgress = 0;
  }

  // Update status based on progress
  if (this.overallProgress >= 100) {
    this.status = "completed";
    this.completionDate = new Date();
  } else if (this.overallProgress > 0) {
    this.status = "in_progress";
  }

  // Don't save here - let the controller handle saving
  return Promise.resolve(this);
};

LearningProgressSchema.methods.addAssessmentResult = function (
  moduleId,
  assessmentData
) {
  const moduleProgress = this.moduleProgress.find(
    (m) => m.moduleId.toString() === moduleId.toString()
  );

  if (!moduleProgress) {
    throw new Error("Module progress not found");
  }

  moduleProgress.assessmentResults.push(assessmentData);

  // Update analytics
  this.updateAnalytics();

  // Don't save here - let the controller handle saving
  return Promise.resolve(this);
};

LearningProgressSchema.methods.updateAnalytics = function () {
  // Calculate average score across all assessments
  const allAssessments = this.moduleProgress.reduce((acc, module) => {
    return acc.concat(module.assessmentResults);
  }, []);

  if (allAssessments.length > 0) {
    this.analytics.averageScore =
      allAssessments.reduce(
        (sum, assessment) => sum + (assessment.percentage || 0),
        0
      ) / allAssessments.length;
  }

  // Update completion counts
  this.analytics.completedAssignments = 0; // Assignments are now treated as quizzes
  this.analytics.completedQuizzes = allAssessments.filter(
    (a) => a.assessmentType === "quiz"
  ).length;
  this.analytics.participatedDiscussions = allAssessments.filter(
    (a) => a.assessmentType === "discussion"
  ).length;

  // Update total time spent
  this.totalTimeSpent = this.moduleProgress.reduce(
    (sum, module) => sum + (module.timeSpent || 0),
    0
  );

  // Update session analytics
  this.analytics.studyPatterns.totalSessions = this.engagement.totalLogins;
  if (this.analytics.studyPatterns.totalSessions > 0) {
    this.analytics.studyPatterns.averageSessionLength =
      this.totalTimeSpent / this.analytics.studyPatterns.totalSessions;
  }
};

LearningProgressSchema.methods.updateEngagement = function (engagementData) {
  Object.assign(this.engagement, engagementData);
  this.lastActivityAt = new Date();

  // Update login streak
  if (engagementData.newLogin) {
    const lastLogin = this.engagement.lastLoginAt;
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    if (!lastLogin || lastLogin < oneDayAgo) {
      // Check if it's consecutive day
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      if (lastLogin && lastLogin > twoDaysAgo) {
        this.engagement.loginStreak += 1;
      } else {
        this.engagement.loginStreak = 1;
      }
    }

    this.engagement.lastLoginAt = now;
    this.engagement.totalLogins += 1;

    if (this.engagement.loginStreak > this.engagement.longestStreak) {
      this.engagement.longestStreak = this.engagement.loginStreak;
    }
  }

  // Don't save here - let the controller handle saving
  return Promise.resolve(this);
};

LearningProgressSchema.methods.checkFlags = function () {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  // Check if struggling learner (low scores or progress)
  this.flags.strugglingLearner =
    this.overallProgress < 30 || this.analytics.averageScore < 60;

  // Check if at risk of dropout (no activity for 2 weeks)
  this.flags.atRiskDropout =
    !this.lastActivityAt || this.lastActivityAt < twoWeeksAgo;

  // Check if needs attention (struggling + not active recently)
  this.flags.needsAttention =
    this.flags.strugglingLearner ||
    !this.lastActivityAt ||
    this.lastActivityAt < oneWeekAgo;

  // Check if fast track (ahead of typical progress)
  this.flags.fastTrack =
    this.overallProgress > 80 && this.analytics.averageScore > 85;

  // Don't call save() here - let the controller handle saving
};

LearningProgressSchema.methods.awardAchievement = function (
  achievementType,
  metadata = {}
) {
  const existingAchievement = this.achievements.find(
    (a) => a.type === achievementType
  );

  if (!existingAchievement) {
    this.achievements.push({
      type: achievementType,
      earnedAt: new Date(),
      metadata,
    });

    // Don't call save() here - let the controller handle saving
  }

  return Promise.resolve(this);
};

// Static methods
LearningProgressSchema.statics.getCourseAnalytics = async function (
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
        totalStudents: { $sum: 1 },
        completedStudents: {
          $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
        },
        averageProgress: { $avg: "$overallProgress" },
        averageScore: { $avg: "$analytics.averageScore" },
        averageTimeSpent: { $avg: "$totalTimeSpent" },
        strugglingStudents: {
          $sum: { $cond: ["$flags.strugglingLearner", 1, 0] },
        },
        atRiskStudents: { $sum: { $cond: ["$flags.atRiskDropout", 1, 0] } },
        fastTrackStudents: { $sum: { $cond: ["$flags.fastTrack", 1, 0] } },
      },
    },
  ]);

  return analytics[0] || {};
};

LearningProgressSchema.statics.getStudentsByFlag = function (
  flag,
  branchId = null
) {
  const query = { [`flags.${flag}`]: true };
  if (branchId) query.branchId = branchId;

  return this.find(query)
    .populate("studentId", "name email")
    .populate("courseId", "title")
    .sort({ lastActivityAt: 1 });
};

LearningProgressSchema.statics.getProgressReport = async function (
  courseId,
  branchId = null
) {
  const matchQuery = { courseId };
  if (branchId) matchQuery.branchId = branchId;

  const report = await this.aggregate([
    { $match: matchQuery },
    {
      $lookup: {
        from: "students",
        localField: "studentId",
        foreignField: "_id",
        as: "student",
      },
    },
    { $unwind: "$student" },
    {
      $project: {
        studentName: "$student.name",
        studentEmail: "$student.email",
        overallProgress: 1,
        status: 1,
        averageScore: "$analytics.averageScore",
        totalTimeSpent: 1,
        lastActivityAt: 1,
        flags: 1,
        completionDate: 1,
      },
    },
    { $sort: { overallProgress: -1 } },
  ]);

  return report;
};

// Pre-save middleware
LearningProgressSchema.pre("save", function (next) {
  this.checkFlags();
  next();
});

module.exports = mongoose.model("LearningProgress", LearningProgressSchema);
