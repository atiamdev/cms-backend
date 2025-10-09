const mongoose = require("mongoose");

const QuizAttemptSchema = new mongoose.Schema(
  {
    quizId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Quiz",
      required: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    submittedAt: Date,
    answers: [
      {
        questionId: {
          type: mongoose.Schema.Types.ObjectId,
          required: true,
        },
        answer: mongoose.Schema.Types.Mixed, // Can be string, array, or object
        isCorrect: Boolean,
        pointsEarned: {
          type: Number,
          default: 0,
        },
        needsManualGrading: {
          type: Boolean,
          default: false,
        },
        timeSpentOnQuestion: Number, // in seconds
        answeredAt: Date,
      },
    ],
    totalScore: {
      type: Number,
      default: 0,
    },
    totalPossible: Number,
    percentageScore: {
      type: Number,
      default: 0,
    },
    timeSpent: {
      type: Number, // in minutes
      default: 0,
    },
    attempt: {
      type: Number,
      default: 1,
      min: 1,
    },
    status: {
      type: String,
      enum: [
        "in_progress",
        "submitted",
        "timed_out",
        "abandoned",
        "submitted_pending_grading",
        "partially_graded",
      ],
      default: "in_progress",
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
    },
    // Attempt metadata
    metadata: {
      ipAddress: String,
      userAgent: String,
      browserFingerprint: String,
      screenResolution: String,
      timezone: String,
      startTime: Date,
      endTime: Date,
    },
    // Security and proctoring data
    proctoring: {
      webcamEnabled: { type: Boolean, default: false },
      screenShareEnabled: { type: Boolean, default: false },
      fullScreenMode: { type: Boolean, default: false },
      tabSwitches: [{ timestamp: Date, event: String }],
      suspiciousActivity: [
        {
          timestamp: Date,
          type: String, // 'tab_switch', 'copy_paste', 'right_click', etc.
          details: String,
        },
      ],
      flagged: { type: Boolean, default: false },
      flagReason: String,
    },
    // Question navigation tracking
    navigation: {
      questionOrder: [mongoose.Schema.Types.ObjectId], // Order questions were presented
      visitedQuestions: [mongoose.Schema.Types.ObjectId],
      currentQuestion: mongoose.Schema.Types.ObjectId,
      backtrackCount: { type: Number, default: 0 },
      flaggedQuestions: [mongoose.Schema.Types.ObjectId], // Questions marked for review
    },
    // Auto-save data for recovery
    autoSave: {
      lastSaved: Date,
      saveCount: { type: Number, default: 0 },
      tempAnswers: mongoose.Schema.Types.Mixed, // Temporary answers before submission
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
QuizAttemptSchema.index({ quizId: 1, studentId: 1, attempt: 1 });
QuizAttemptSchema.index({ studentId: 1, status: 1 });
QuizAttemptSchema.index({ branchId: 1 });
QuizAttemptSchema.index({ startedAt: 1 });
QuizAttemptSchema.index({ submittedAt: 1 });

// Compound index for finding latest attempt
QuizAttemptSchema.index({ quizId: 1, studentId: 1, attempt: -1 });

// Virtual for time remaining
QuizAttemptSchema.virtual("timeRemaining").get(function () {
  if (!this.populated("quizId") || !this.quizId.timeLimit) return null;

  const timeElapsed = this.timeSpent || 0;
  const timeLimit = this.quizId.timeLimit;
  return Math.max(0, timeLimit - timeElapsed);
});

// Virtual for is timed out
QuizAttemptSchema.virtual("isTimedOut").get(function () {
  if (!this.populated("quizId") || !this.quizId.timeLimit) return false;

  const timeElapsed = (new Date() - this.startedAt) / (1000 * 60); // minutes
  return timeElapsed >= this.quizId.timeLimit;
});

// Virtual for completion percentage
QuizAttemptSchema.virtual("completionPercentage").get(function () {
  if (!this.populated("quizId")) return 0;

  const totalQuestions = this.quizId.questions.length;
  const answeredQuestions = this.answers.filter(
    (a) => a.answer !== null && a.answer !== undefined
  ).length;

  return totalQuestions > 0 ? (answeredQuestions / totalQuestions) * 100 : 0;
});

// Virtual for passed status
QuizAttemptSchema.virtual("passed").get(function () {
  if (!this.populated("quizId") || this.status !== "submitted") return false;
  return this.percentageScore >= this.quizId.passingScore;
});

// Virtual for grade letter
QuizAttemptSchema.virtual("gradeLetter").get(function () {
  const percentage = this.percentageScore;
  if (percentage >= 90) return "A";
  if (percentage >= 80) return "B";
  if (percentage >= 70) return "C";
  if (percentage >= 60) return "D";
  return "F";
});

// Methods
QuizAttemptSchema.methods.answerQuestion = function (questionId, answer) {
  const existingAnswerIndex = this.answers.findIndex(
    (a) => a.questionId.toString() === questionId.toString()
  );

  const answerData = {
    questionId,
    answer,
    answeredAt: new Date(),
  };

  if (existingAnswerIndex !== -1) {
    this.answers[existingAnswerIndex] = {
      ...this.answers[existingAnswerIndex],
      ...answerData,
    };
  } else {
    this.answers.push(answerData);
  }

  // Update navigation
  if (!this.navigation.visitedQuestions.includes(questionId)) {
    this.navigation.visitedQuestions.push(questionId);
  }

  this.navigation.currentQuestion = questionId;

  return this.save();
};

QuizAttemptSchema.methods.flagQuestion = function (questionId) {
  if (!this.navigation.flaggedQuestions.includes(questionId)) {
    this.navigation.flaggedQuestions.push(questionId);
    return this.save();
  }
  return Promise.resolve(this);
};

QuizAttemptSchema.methods.unflagQuestion = function (questionId) {
  this.navigation.flaggedQuestions = this.navigation.flaggedQuestions.filter(
    (id) => id.toString() !== questionId.toString()
  );
  return this.save();
};

QuizAttemptSchema.methods.navigateToQuestion = function (questionId) {
  const prevQuestion = this.navigation.currentQuestion;
  this.navigation.currentQuestion = questionId;

  // Track backtracking
  if (
    prevQuestion &&
    this.navigation.questionOrder.indexOf(prevQuestion) >
      this.navigation.questionOrder.indexOf(questionId)
  ) {
    this.navigation.backtrackCount += 1;
  }

  if (!this.navigation.visitedQuestions.includes(questionId)) {
    this.navigation.visitedQuestions.push(questionId);
  }

  return this.save();
};

QuizAttemptSchema.methods.performAutoSave = function (tempAnswers) {
  this.autoSave.tempAnswers = tempAnswers;
  this.autoSave.lastSaved = new Date();
  this.autoSave.saveCount += 1;
  return this.save();
};

QuizAttemptSchema.methods.recordSuspiciousActivity = function (
  activityType,
  details
) {
  this.proctoring.suspiciousActivity.push({
    timestamp: new Date(),
    type: activityType,
    details: details || "",
  });

  // Auto-flag if too many suspicious activities
  if (this.proctoring.suspiciousActivity.length >= 5) {
    this.proctoring.flagged = true;
    this.proctoring.flagReason = "Multiple suspicious activities detected";
  }

  return this.save();
};

QuizAttemptSchema.methods.submitQuiz = async function () {
  if (this.status !== "in_progress") {
    throw new Error("Quiz attempt is not in progress");
  }

  // Check if time limit exceeded
  let isTimedOut = false;
  if (this.populated("quizId") && this.quizId.timeLimit) {
    const timeElapsed = (new Date() - this.startedAt) / (1000 * 60);
    if (timeElapsed >= this.quizId.timeLimit) {
      isTimedOut = true;
    }
  }

  // Calculate final time spent
  this.timeSpent = (new Date() - this.startedAt) / (1000 * 60); // minutes
  this.submittedAt = new Date();
  this.metadata.endTime = new Date();
  this.status = isTimedOut ? "timed_out" : "submitted";

  // Calculate score using quiz methods
  if (this.populated("quizId")) {
    const answerMap = {};
    this.answers.forEach((answer) => {
      answerMap[answer.questionId.toString()] = answer.answer;
    });

    const scoreResult = this.quizId.calculateScore(answerMap);
    this.totalScore = scoreResult.totalScore;
    this.totalPossible = scoreResult.totalPossible;
    this.percentageScore = scoreResult.percentage;

    // Check if any questions need manual grading
    const hasManualGrading = scoreResult.results.some(
      (result) => result.needsManualGrading
    );
    const allManualGrading = scoreResult.results.every(
      (result) => result.needsManualGrading
    );

    if (allManualGrading) {
      // All questions need manual grading
      this.status = isTimedOut ? "timed_out" : "submitted_pending_grading";
      this.totalScore = 0;
      this.totalPossible = 0;
      this.percentageScore = 0;
    } else if (hasManualGrading) {
      // Mixed: some auto-gradable, some manual
      this.status = isTimedOut ? "timed_out" : "partially_graded";
    }

    // Update individual answer scores
    scoreResult.results.forEach((result) => {
      const answerIndex = this.answers.findIndex(
        (a) => a.questionId.toString() === result.questionId.toString()
      );
      if (answerIndex !== -1) {
        this.answers[answerIndex].isCorrect = result.isCorrect;
        this.answers[answerIndex].pointsEarned = result.pointsEarned;
        this.answers[answerIndex].needsManualGrading =
          result.needsManualGrading;
      }
    });
  }

  return this.save();
};

QuizAttemptSchema.methods.timeOut = async function () {
  // Calculate final time spent
  this.timeSpent = (new Date() - this.startedAt) / (1000 * 60); // minutes
  this.submittedAt = new Date();
  this.metadata.endTime = new Date();
  this.status = "timed_out";

  // Calculate score using quiz methods if populated
  if (this.populated("quizId")) {
    const answerMap = {};
    this.answers.forEach((answer) => {
      answerMap[answer.questionId.toString()] = answer.answer;
    });

    const scoreResult = this.quizId.calculateScore(answerMap);
    this.totalScore = scoreResult.totalScore;
    this.totalPossible = scoreResult.totalPossible;
    this.percentageScore = scoreResult.percentage;

    // Check if any questions need manual grading
    const hasManualGrading = scoreResult.results.some(
      (result) => result.needsManualGrading
    );
    const allManualGrading = scoreResult.results.every(
      (result) => result.needsManualGrading
    );

    if (allManualGrading) {
      // All questions need manual grading - keep as timed_out but mark for grading
      this.totalScore = 0;
      this.totalPossible = 0;
      this.percentageScore = 0;
    } else if (hasManualGrading) {
      // Mixed: some auto-gradable, some manual - keep as timed_out
    }

    // Update individual answer scores
    scoreResult.results.forEach((result) => {
      const answer = this.answers.find(
        (a) => a.questionId.toString() === result.questionId.toString()
      );
      if (answer) {
        answer.isCorrect = result.isCorrect;
        answer.pointsEarned = result.pointsEarned;
        answer.needsManualGrading = result.needsManualGrading;
      }
    });
  }

  return this.save();
};

QuizAttemptSchema.methods.abandon = function () {
  this.status = "abandoned";
  this.metadata.endTime = new Date();
  this.timeSpent = (new Date() - this.startedAt) / (1000 * 60);
  return this.save();
};

QuizAttemptSchema.methods.canContinue = function () {
  return this.status === "in_progress" && !this.isTimedOut;
};

QuizAttemptSchema.methods.getUnansweredQuestions = function () {
  if (!this.populated("quizId")) return [];

  const answeredQuestionIds = this.answers.map((a) => a.questionId.toString());
  return this.quizId.questions.filter(
    (q) => !answeredQuestionIds.includes(q._id.toString())
  );
};

QuizAttemptSchema.methods.getQuestionResult = function (questionId) {
  return this.answers.find(
    (a) => a.questionId.toString() === questionId.toString()
  );
};

// Static methods
QuizAttemptSchema.statics.findLatestAttempt = function (quizId, studentId) {
  return this.findOne({ quizId, studentId })
    .sort({ attempt: -1 })
    .populate("quizId")
    .populate("studentId", "name email");
};

QuizAttemptSchema.statics.findAllAttempts = function (quizId, studentId) {
  return this.find({ quizId, studentId })
    .sort({ attempt: -1 })
    .populate("quizId")
    .populate("studentId", "name email");
};

QuizAttemptSchema.statics.getAttemptStats = async function (quizId) {
  const stats = await this.aggregate([
    {
      $match: { quizId: mongoose.Types.ObjectId(quizId), status: "submitted" },
    },
    {
      $group: {
        _id: null,
        totalAttempts: { $sum: 1 },
        averageScore: { $avg: "$percentageScore" },
        averageTimeSpent: { $avg: "$timeSpent" },
        passRate: {
          $avg: { $cond: [{ $gte: ["$percentageScore", 60] }, 1, 0] },
        },
        highestScore: { $max: "$percentageScore" },
        lowestScore: { $min: "$percentageScore" },
      },
    },
  ]);

  return (
    stats[0] || {
      totalAttempts: 0,
      averageScore: 0,
      averageTimeSpent: 0,
      passRate: 0,
      highestScore: 0,
      lowestScore: 0,
    }
  );
};

// Pre-save middleware
QuizAttemptSchema.pre("save", async function (next) {
  // Note: Time limit checking is now handled in submitQuiz method
  // to avoid auto-timing out attempts during active answering
  next();
});

// Post-save middleware to update quiz analytics
QuizAttemptSchema.post("save", async function () {
  if (this.status === "submitted" && this.populated("quizId")) {
    await this.quizId.updateAnalytics();
  }
});

module.exports = mongoose.model("QuizAttempt", QuizAttemptSchema);
