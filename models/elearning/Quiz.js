const mongoose = require("mongoose");

const QuizSchema = new mongoose.Schema(
  {
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      // Note: This can reference either Course or ECourse
      // We'll handle the population dynamically based on courseType
    },
    courseType: {
      type: String,
      enum: ["course", "ecourse"],
      required: true,
      default: "ecourse",
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
    },
    instructions: {
      type: String,
      default: "Read each question carefully and select the best answer.",
    },
    timeLimit: {
      type: Number, // in minutes, 0 means no time limit
      default: 0,
    },
    attempts: {
      type: Number, // allowed attempts, 0 means unlimited
      default: 1,
      min: 0,
    },
    shuffleQuestions: {
      type: Boolean,
      default: false,
    },
    shuffleOptions: {
      type: Boolean,
      default: false,
    },
    showResults: {
      type: Boolean,
      default: true,
    },
    showCorrectAnswers: {
      type: Boolean,
      default: true,
    },
    passingScore: {
      type: Number, // percentage
      default: 60,
      min: 0,
      max: 100,
    },
    questions: [
      {
        _id: {
          type: mongoose.Schema.Types.ObjectId,
          default: () => new mongoose.Types.ObjectId(),
        },
        type: {
          type: String,
          enum: [
            "multiple_choice",
            "true_false",
            "short_answer",
            "essay",
            "fill_blank",
            "matching",
          ],
          required: true,
        },
        question: {
          type: String,
          required: true,
        },
        options: [String], // for multiple choice, true/false, matching
        correctAnswer: String, // or array for multiple correct answers
        correctAnswers: [String], // for questions with multiple correct answers
        points: {
          type: Number,
          required: true,
          min: 1,
          default: 1,
        },
        explanation: String,
        difficulty: {
          type: String,
          enum: ["easy", "medium", "hard"],
          default: "medium",
        },
        // For essay questions
        rubric: [
          {
            criteria: String,
            points: Number,
            description: String,
          },
        ],
        // For matching questions
        pairs: [
          {
            left: String,
            right: String,
          },
        ],
        // Question metadata
        tags: [String],
        estimatedTime: Number, // in seconds
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
    // Quiz settings
    settings: {
      randomizeQuestions: { type: Boolean, default: false },
      oneQuestionAtATime: { type: Boolean, default: false },
      preventBacktracking: { type: Boolean, default: false },
      lockQuestionsAfterAnswering: { type: Boolean, default: false },
      requireWebcam: { type: Boolean, default: false },
      fullScreenMode: { type: Boolean, default: false },
      showProgressBar: { type: Boolean, default: true },
    },
    // Grading configuration
    grading: {
      autoGrade: { type: Boolean, default: true },
      gradingMethod: {
        type: String,
        enum: ["highest", "latest", "average"],
        default: "highest",
      },
      releaseGrades: {
        type: String,
        enum: ["immediately", "after_due_date", "manual"],
        default: "immediately",
      },
    },
    // Scheduling
    schedule: {
      availableFrom: Date,
      availableUntil: Date,
      dueDate: Date,
    },
    // Analytics
    analytics: {
      attemptCount: { type: Number, default: 0 },
      completionCount: { type: Number, default: 0 },
      averageScore: { type: Number, default: 0 },
      averageTimeSpent: { type: Number, default: 0 }, // in minutes
      passRate: { type: Number, default: 0 },
      questionAnalytics: [
        {
          questionId: mongoose.Schema.Types.ObjectId,
          correctAnswers: { type: Number, default: 0 },
          totalAttempts: { type: Number, default: 0 },
          difficulty: Number, // calculated based on success rate
        },
      ],
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
QuizSchema.index({ courseId: 1 });
QuizSchema.index({ moduleId: 1 });
QuizSchema.index({ branchId: 1 });
QuizSchema.index({ createdBy: 1 });
QuizSchema.index({ "schedule.availableFrom": 1, "schedule.availableUntil": 1 });

// Virtual for total points
QuizSchema.virtual("totalPoints").get(function () {
  return this.questions.reduce((total, question) => total + question.points, 0);
});

// Virtual for question count
QuizSchema.virtual("questionCount").get(function () {
  return this.questions.length;
});

// Virtual for estimated time
QuizSchema.virtual("estimatedTime").get(function () {
  const totalQuestionTime = this.questions.reduce((total, q) => {
    return total + (q.estimatedTime || 60); // default 60 seconds per question
  }, 0);
  return Math.ceil(totalQuestionTime / 60); // convert to minutes
});

// Virtual for availability status
QuizSchema.virtual("availabilityStatus").get(function () {
  const now = new Date();
  if (this.schedule.availableFrom && now < this.schedule.availableFrom) {
    return "not_yet_available";
  }
  if (this.schedule.availableUntil && now > this.schedule.availableUntil) {
    return "no_longer_available";
  }
  if (this.schedule.dueDate && now > this.schedule.dueDate) {
    return "overdue";
  }
  return "available";
});

// Methods
QuizSchema.methods.addQuestion = function (questionData) {
  this.questions.push(questionData);
  return this.save();
};

QuizSchema.methods.removeQuestion = function (questionId) {
  this.questions = this.questions.filter(
    (q) => q._id.toString() !== questionId.toString()
  );
  return this.save();
};

QuizSchema.methods.updateQuestion = function (questionId, questionData) {
  const questionIndex = this.questions.findIndex(
    (q) => q._id.toString() === questionId.toString()
  );
  if (questionIndex !== -1) {
    this.questions[questionIndex] = {
      ...this.questions[questionIndex],
      ...questionData,
    };
    return this.save();
  }
  throw new Error("Question not found");
};

QuizSchema.methods.getShuffledQuestions = function () {
  if (this.shuffleQuestions) {
    for (let i = this.questions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.questions[i], this.questions[j]] = [
        this.questions[j],
        this.questions[i],
      ];
    }
  }
  return this.questions;
};

QuizSchema.methods.isAvailable = function (currentDate = new Date()) {
  if (!this.isPublished) return false;

  if (
    this.schedule.availableFrom &&
    currentDate < this.schedule.availableFrom
  ) {
    return false;
  }

  if (
    this.schedule.availableUntil &&
    currentDate > this.schedule.availableUntil
  ) {
    return false;
  }

  return true;
};

QuizSchema.methods.calculateScore = function (answers) {
  let totalScore = 0;
  let totalPossible = 0;
  const results = [];

  this.questions.forEach((question) => {
    const userAnswer = answers[question._id.toString()];
    let isCorrect = false;
    let pointsEarned = 0;
    const needsManualGrading = ["short_answer", "essay"].includes(
      question.type
    );

    if (!needsManualGrading) {
      totalPossible += question.points;
    }

    switch (question.type) {
      case "multiple_choice":
      case "true_false":
      case "multiple_select":
        isCorrect = userAnswer === question.correctAnswer;
        pointsEarned = isCorrect ? question.points : 0;
        break;

      case "short_answer":
      case "essay":
        // These require manual grading by teacher
        pointsEarned = 0;
        isCorrect = false;
        break;

      case "fill_blank":
        // Check if all blanks are filled correctly
        if (
          Array.isArray(question.correctAnswers) &&
          Array.isArray(userAnswer)
        ) {
          const correctCount = userAnswer.filter(
            (answer, index) =>
              answer?.toLowerCase().trim() ===
              question.correctAnswers[index]?.toLowerCase().trim()
          ).length;
          pointsEarned =
            (correctCount / question.correctAnswers.length) * question.points;
          isCorrect = correctCount === question.correctAnswers.length;
        }
        break;
    }

    totalScore += pointsEarned;
    results.push({
      questionId: question._id,
      isCorrect,
      pointsEarned,
      userAnswer,
      correctAnswer: question.correctAnswer || question.correctAnswers,
      needsManualGrading: ["short_answer", "essay"].includes(question.type),
    });
  });

  const percentage = totalPossible > 0 ? (totalScore / totalPossible) * 100 : 0;

  return {
    totalScore,
    totalPossible,
    percentage,
    passed: percentage >= this.passingScore,
    results,
  };
};

QuizSchema.methods.updateAnalytics = async function () {
  const QuizAttempt = mongoose.model("QuizAttempt");
  const attempts = await QuizAttempt.find({ quizId: this._id });

  this.analytics.attemptCount = attempts.length;
  this.analytics.completionCount = attempts.filter((a) => a.submittedAt).length;

  const completedAttempts = attempts.filter(
    (a) => a.submittedAt && a.totalScore !== undefined
  );
  if (completedAttempts.length > 0) {
    this.analytics.averageScore =
      completedAttempts.reduce((sum, a) => sum + a.percentageScore, 0) /
      completedAttempts.length;
    this.analytics.averageTimeSpent =
      completedAttempts.reduce((sum, a) => sum + a.timeSpent, 0) /
      completedAttempts.length;
    this.analytics.passRate =
      (completedAttempts.filter((a) => a.percentageScore >= this.passingScore)
        .length /
        completedAttempts.length) *
      100;
  }

  return this.save();
};

// Pre-save validation
QuizSchema.pre("save", function (next) {
  // Validate that all questions have valid data
  for (const question of this.questions) {
    if (
      question.type === "multiple_choice" &&
      (!question.options || question.options.length < 2)
    ) {
      return next(
        new Error("Multiple choice questions must have at least 2 options")
      );
    }

    if (
      question.type === "true_false" &&
      (!question.options || question.options.length !== 2)
    ) {
      return next(
        new Error("True/false questions must have exactly 2 options")
      );
    }
  }

  next();
});

module.exports = mongoose.model("Quiz", QuizSchema);
