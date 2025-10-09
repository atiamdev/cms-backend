const cron = require("node-cron");
const moment = require("moment-timezone");
const Quiz = require("../models/elearning/Quiz");
const QuizAttempt = require("../models/elearning/QuizAttempt");

class QuizSchedulingService {
  constructor() {
    this.scheduledTasks = new Map();
    this.initializeScheduledQuizzes();
  }

  /**
   * Initialize scheduled quizzes on server start
   */
  async initializeScheduledQuizzes() {
    try {
      // Find all quizzes with future start times
      const now = new Date();
      const scheduledQuizzes = await Quiz.find({
        "schedule.availableFrom": { $gt: now },
        isPublished: true,
      });

      console.log(`Initializing ${scheduledQuizzes.length} scheduled quizzes`);

      for (const quiz of scheduledQuizzes) {
        this.scheduleQuizStart(quiz);
      }

      // Also schedule auto-close for active quizzes
      const activeQuizzes = await Quiz.find({
        "schedule.availableFrom": { $lte: now },
        "schedule.availableUntil": { $gt: now },
        isPublished: true,
      });

      for (const quiz of activeQuizzes) {
        this.scheduleQuizEnd(quiz);
      }
    } catch (error) {
      console.error("Error initializing scheduled quizzes:", error);
    }
  }

  /**
   * Schedule a quiz to start at a specific time
   */
  scheduleQuizStart(quiz) {
    if (!quiz.schedule?.availableFrom) return;

    const startTime = moment(quiz.schedule.availableFrom);
    const now = moment();

    if (startTime.isBefore(now)) {
      console.log(
        `Quiz ${quiz._id} start time has passed, making available now`
      );
      return;
    }

    // Create cron expression for the exact start time
    const cronExpression = this.createCronExpression(startTime);

    console.log(
      `Scheduling quiz ${quiz._id} to start at ${startTime.format()}`
    );

    const task = cron.schedule(
      cronExpression,
      async () => {
        try {
          console.log(`Starting quiz: ${quiz.title} (${quiz._id})`);

          // Send notifications to enrolled students
          await this.notifyStudentsQuizAvailable(quiz);

          // Schedule the end time if specified
          if (quiz.schedule.availableUntil) {
            this.scheduleQuizEnd(quiz);
          }

          // Remove this task from scheduled tasks
          this.scheduledTasks.delete(`start_${quiz._id}`);
        } catch (error) {
          console.error(`Error starting quiz ${quiz._id}:`, error);
        }
      },
      {
        scheduled: true,
        timezone: quiz.timezone || "UTC",
      }
    );

    this.scheduledTasks.set(`start_${quiz._id}`, task);
  }

  /**
   * Schedule a quiz to end at a specific time
   */
  scheduleQuizEnd(quiz) {
    if (!quiz.schedule?.availableUntil) return;

    const endTime = moment(quiz.schedule.availableUntil);
    const now = moment();

    if (endTime.isBefore(now)) {
      console.log(`Quiz ${quiz._id} end time has passed`);
      return;
    }

    const cronExpression = this.createCronExpression(endTime);

    console.log(`Scheduling quiz ${quiz._id} to end at ${endTime.format()}`);

    const task = cron.schedule(
      cronExpression,
      async () => {
        try {
          console.log(`Ending quiz: ${quiz.title} (${quiz._id})`);

          // Auto-submit any in-progress attempts
          await this.autoSubmitActiveAttempts(quiz._id);

          // Send notifications
          await this.notifyStudentsQuizEnded(quiz);

          // Remove this task from scheduled tasks
          this.scheduledTasks.delete(`end_${quiz._id}`);
        } catch (error) {
          console.error(`Error ending quiz ${quiz._id}:`, error);
        }
      },
      {
        scheduled: true,
        timezone: quiz.timezone || "UTC",
      }
    );

    this.scheduledTasks.set(`end_${quiz._id}`, task);
  }

  /**
   * Create cron expression from moment object
   */
  createCronExpression(momentObj) {
    const minute = momentObj.minute();
    const hour = momentObj.hour();
    const day = momentObj.date();
    const month = momentObj.month() + 1; // moment months are 0-indexed

    return `${minute} ${hour} ${day} ${month} *`;
  }

  /**
   * Auto-submit active quiz attempts when quiz ends
   */
  async autoSubmitActiveAttempts(quizId) {
    try {
      const activeAttempts = await QuizAttempt.find({
        quizId: quizId,
        status: "in_progress",
      });

      console.log(
        `Auto-submitting ${activeAttempts.length} active attempts for quiz ${quizId}`
      );

      for (const attempt of activeAttempts) {
        attempt.status = "timed_out";
        attempt.submittedAt = new Date();

        // Calculate final score based on answered questions
        const quiz = await Quiz.findById(quizId);
        this.calculateFinalScore(attempt, quiz);

        await attempt.save();
      }
    } catch (error) {
      console.error("Error auto-submitting attempts:", error);
    }
  }

  /**
   * Calculate final score for auto-submitted attempt
   */
  calculateFinalScore(attempt, quiz) {
    let totalScore = 0;
    let totalPossible = 0;

    for (const question of quiz.questions) {
      totalPossible += question.points;

      const answer = attempt.answers.find(
        (a) => a.questionId.toString() === question._id.toString()
      );

      if (answer) {
        totalScore += answer.pointsEarned || 0;
      }
    }

    attempt.totalScore = totalScore;
    attempt.totalPossible = totalPossible;
    attempt.percentageScore =
      totalPossible > 0 ? (totalScore / totalPossible) * 100 : 0;
  }

  /**
   * Notify students when quiz becomes available
   */
  async notifyStudentsQuizAvailable(quiz) {
    // Implementation would depend on your notification system
    console.log(
      `Notifying students that quiz "${quiz.title}" is now available`
    );
    // You could integrate with your existing notification system here
  }

  /**
   * Notify students when quiz ends
   */
  async notifyStudentsQuizEnded(quiz) {
    console.log(`Notifying students that quiz "${quiz.title}" has ended`);
    // Implementation for end notifications
  }

  /**
   * Cancel scheduled task for a quiz
   */
  cancelScheduledQuiz(quizId) {
    const startTask = this.scheduledTasks.get(`start_${quizId}`);
    const endTask = this.scheduledTasks.get(`end_${quizId}`);

    if (startTask) {
      startTask.destroy();
      this.scheduledTasks.delete(`start_${quizId}`);
    }

    if (endTask) {
      endTask.destroy();
      this.scheduledTasks.delete(`end_${quizId}`);
    }
  }

  /**
   * Update quiz schedule
   */
  updateQuizSchedule(quiz) {
    // Cancel existing schedules
    this.cancelScheduledQuiz(quiz._id);

    // Create new schedules
    if (quiz.schedule?.availableFrom) {
      this.scheduleQuizStart(quiz);
    }

    if (quiz.schedule?.availableUntil) {
      this.scheduleQuizEnd(quiz);
    }
  }

  /**
   * Check if quiz is currently available
   */
  isQuizAvailable(quiz) {
    const now = new Date();
    const { availableFrom, availableUntil } = quiz.schedule || {};

    if (availableFrom && now < availableFrom) return false;
    if (availableUntil && now > availableUntil) return false;

    return quiz.isPublished;
  }

  /**
   * Get time until quiz starts
   */
  getTimeUntilStart(quiz) {
    if (!quiz.schedule?.availableFrom) return null;

    const now = moment();
    const startTime = moment(quiz.schedule.availableFrom);

    if (startTime.isBefore(now)) return null;

    return {
      milliseconds: startTime.diff(now),
      duration: moment.duration(startTime.diff(now)),
      formatted: startTime.fromNow(),
    };
  }

  /**
   * Get time until quiz ends
   */
  getTimeUntilEnd(quiz) {
    if (!quiz.schedule?.availableUntil) return null;

    const now = moment();
    const endTime = moment(quiz.schedule.availableUntil);

    if (endTime.isBefore(now)) return null;

    return {
      milliseconds: endTime.diff(now),
      duration: moment.duration(endTime.diff(now)),
      formatted: endTime.fromNow(),
    };
  }
}

module.exports = new QuizSchedulingService();
