const cron = require("node-cron");
const QuizAttempt = require("../models/elearning/QuizAttempt");
const Quiz = require("../models/elearning/Quiz");
const Teacher = require("../models/Teacher");
const pushController = require("../controllers/pushController");
const { storeNotificationAsNotice } = require("../utils/notificationStorage");
const moment = require("moment-timezone");

/**
 * Check for ungraded quiz attempts and send reminders
 */
async function checkUngradedQuizzes() {
  try {
    console.log("[Grading Reminder] Checking for ungraded quizzes...");

    const threeDaysAgo = moment().subtract(3, "days").toDate();

    // Find quiz attempts that need manual grading and are older than 3 days
    const ungradedAttempts = await QuizAttempt.find({
      status: "partially_graded",
      submittedAt: { $lte: threeDaysAgo },
    }).populate("quizId");

    console.log(
      `[Grading Reminder] Found ${ungradedAttempts.length} ungraded attempts`
    );

    // Group attempts by teacher (quiz creator)
    const teacherAttempts = {};

    for (const attempt of ungradedAttempts) {
      if (!attempt.quizId || !attempt.quizId.createdBy) continue;

      const teacherId = attempt.quizId.createdBy.toString();
      if (!teacherAttempts[teacherId]) {
        teacherAttempts[teacherId] = [];
      }
      teacherAttempts[teacherId].push(attempt);
    }

    console.log(
      `[Grading Reminder] Found ${
        Object.keys(teacherAttempts).length
      } teachers with ungraded work`
    );

    // Send notifications to teachers
    for (const [teacherId, attempts] of Object.entries(teacherAttempts)) {
      try {
        const teacher = await Teacher.findOne({ userId: teacherId }).populate(
          "userId"
        );

        if (!teacher || !teacher.userId) {
          console.log(
            `[Grading Reminder] Teacher not found for userId: ${teacherId}`
          );
          continue;
        }

        const quizCount = new Set(attempts.map((a) => a.quizId._id.toString()))
          .size;
        const attemptCount = attempts.length;

        const payload = {
          title: "📝 Grading Reminder",
          body: `You have ${attemptCount} ungraded quiz ${
            attemptCount > 1 ? "attempts" : "attempt"
          } across ${quizCount} ${quizCount > 1 ? "quizzes" : "quiz"}`,
          icon: "/logo.png",
          tag: `grading-reminder-${teacherId}`,
          type: "grading-reminder",
          attemptCount: attemptCount,
          quizCount: quizCount,
          url: "/teacher/quizzes/grading",
        };

        await storeNotificationAsNotice({
          userIds: [teacher.userId._id],
          title: payload.title,
          content: payload.body,
          type: "important",
          priority: "medium",
          targetAudience: "teachers",
        });

        await pushController.sendNotification([teacher.userId._id], payload);

        console.log(
          `[Grading Reminder] Sent reminder to teacher ${teacher.userId._id} for ${attemptCount} attempts`
        );
      } catch (error) {
        console.error(
          `[Grading Reminder] Error sending reminder to teacher ${teacherId}:`,
          error
        );
      }
    }

    console.log("[Grading Reminder] Check complete");
  } catch (error) {
    console.error("[Grading Reminder] Error in checkUngradedQuizzes:", error);
  }
}

/**
 * Check for submitted assignments awaiting grading
 */
async function checkUngradedAssignments() {
  try {
    console.log("[Grading Reminder] Checking for ungraded assignments...");

    const threeDaysAgo = moment().subtract(3, "days").toDate();

    // Find submitted assignments that haven't been graded
    const Submission = require("../models/elearning/Submission");
    const Assignment = require("../models/elearning/Assignment");

    const ungradedSubmissions = await Submission.find({
      status: "submitted",
      grade: { $exists: false },
      submittedAt: { $lte: threeDaysAgo },
    }).populate("assignmentId");

    console.log(
      `[Grading Reminder] Found ${ungradedSubmissions.length} ungraded assignment submissions`
    );

    // Group submissions by teacher (assignment creator)
    const teacherSubmissions = {};

    for (const submission of ungradedSubmissions) {
      if (!submission.assignmentId || !submission.assignmentId.teacherId)
        continue;

      const teacherId = submission.assignmentId.teacherId.toString();
      if (!teacherSubmissions[teacherId]) {
        teacherSubmissions[teacherId] = [];
      }
      teacherSubmissions[teacherId].push(submission);
    }

    console.log(
      `[Grading Reminder] Found ${
        Object.keys(teacherSubmissions).length
      } teachers with ungraded assignments`
    );

    // Send notifications to teachers
    for (const [teacherId, submissions] of Object.entries(teacherSubmissions)) {
      try {
        const teacher = await Teacher.findById(teacherId).populate("userId");

        if (!teacher || !teacher.userId) {
          console.log(
            `[Grading Reminder] Teacher not found for id: ${teacherId}`
          );
          continue;
        }

        const assignmentCount = new Set(
          submissions.map((s) => s.assignmentId._id.toString())
        ).size;
        const submissionCount = submissions.length;

        const payload = {
          title: "📋 Assignment Grading Reminder",
          body: `You have ${submissionCount} ungraded ${
            submissionCount > 1 ? "submissions" : "submission"
          } across ${assignmentCount} ${
            assignmentCount > 1 ? "assignments" : "assignment"
          }`,
          icon: "/logo.png",
          tag: `assignment-grading-reminder-${teacherId}`,
          type: "assignment-grading-reminder",
          submissionCount: submissionCount,
          assignmentCount: assignmentCount,
          url: "/teacher/assignments/grading",
        };

        await storeNotificationAsNotice({
          userIds: [teacher.userId._id],
          title: payload.title,
          content: payload.body,
          type: "important",
          priority: "medium",
          targetAudience: "teachers",
        });

        await pushController.sendNotification([teacher.userId._id], payload);

        console.log(
          `[Grading Reminder] Sent assignment reminder to teacher ${teacher.userId._id} for ${submissionCount} submissions`
        );
      } catch (error) {
        console.error(
          `[Grading Reminder] Error sending reminder to teacher ${teacherId}:`,
          error
        );
      }
    }

    console.log("[Grading Reminder] Assignment check complete");
  } catch (error) {
    console.error(
      "[Grading Reminder] Error in checkUngradedAssignments:",
      error
    );
  }
}

/**
 * Initialize the grading reminder scheduler
 * Runs daily at 9:00 AM and 3:00 PM
 */
function initializeGradingReminderScheduler() {
  console.log("[Grading Reminder] Initializing scheduler...");

  // Run daily at 9:00 AM
  cron.schedule("0 9 * * *", () => {
    console.log(
      "[Grading Reminder] Running morning grading reminder check at 9:00 AM"
    );
    checkUngradedQuizzes();
    checkUngradedAssignments();
  });

  // Run daily at 3:00 PM
  cron.schedule("0 15 * * *", () => {
    console.log(
      "[Grading Reminder] Running afternoon grading reminder check at 3:00 PM"
    );
    checkUngradedQuizzes();
    checkUngradedAssignments();
  });

  console.log(
    "[Grading Reminder] Scheduler initialized - checking at 9:00 AM and 3:00 PM daily"
  );

  // Run once on startup (after 1 minute)
  setTimeout(() => {
    console.log("[Grading Reminder] Running initial check...");
    checkUngradedQuizzes();
    checkUngradedAssignments();
  }, 60000);
}

module.exports = {
  initializeGradingReminderScheduler,
  checkUngradedQuizzes,
  checkUngradedAssignments,
};
