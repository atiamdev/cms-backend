const cron = require("node-cron");
const LiveSession = require("../models/elearning/LiveSession");
const Enrollment = require("../models/elearning/Enrollment");
const pushController = require("../controllers/pushController");
const { storeNotificationAsNotice } = require("../utils/notificationStorage");
const moment = require("moment-timezone");

/**
 * Check for upcoming live sessions and send notifications 2 hours before (students)
 */
async function checkUpcomingLiveSessions() {
  try {
    console.log("[Live Session Reminder] Checking for upcoming sessions...");

    const now = moment().tz("Africa/Nairobi");
    const twoHoursFromNow = moment(now).add(2, "hours");

    // Find scheduled sessions that start within the next 2 hours (+/- 5 minutes window)
    const sessions = await LiveSession.find({
      status: "scheduled",
      startAt: {
        $gte: twoHoursFromNow.clone().subtract(5, "minutes").toDate(),
        $lte: twoHoursFromNow.clone().add(5, "minutes").toDate(),
      },
    }).populate("courseId hostUserId");

    console.log(
      `[Live Session Reminder] Found ${sessions.length} sessions starting in ~2 hours`,
    );

    for (const session of sessions) {
      try {
        if (!session.courseId) {
          console.log(
            `[Live Session Reminder] No course found for session ${session._id}`,
          );
          continue;
        }

        // Get enrolled students
        const enrollments = await Enrollment.find({
          courseId: session.courseId._id,
        }).populate({
          path: "studentId",
          populate: { path: "userId" },
        });

        const studentUserIds = enrollments
          .map((e) => e.studentId?.userId?._id)
          .filter(Boolean);

        if (studentUserIds.length === 0) {
          console.log(
            `[Live Session Reminder] No students enrolled in course ${session.courseId.title}`,
          );
          continue;
        }

        console.log(
          `[Live Session Reminder] Sending reminder to ${studentUserIds.length} students for session ${session._id}`,
        );

        // Send push notification
        const payload = {
          title: `Live Session Starting Soon!`,
          body: `${session.courseId.title} starts in 2 hours`,
          icon: "/logo.png",
          tag: `live-session-reminder-${session._id}`,
          type: "live-session-reminder",
          sessionId: session._id.toString(),
          courseId: session.courseId._id.toString(),
          courseTitle: session.courseId.title,
          meetLink: session.meetLink,
          startTime: moment(session.startAt).format("HH:mm"),
          url: `/student/courses/${session.courseId._id}/live-sessions`,
        };

        // Store as notice
        await storeNotificationAsNotice({
          userIds: studentUserIds,
          title: payload.title,
          content: payload.body,
          type: "academic",
          priority: "high",
          targetAudience: "students",
        });

        const result = await pushController.sendNotification(
          studentUserIds,
          payload,
        );

        console.log(
          `[Live Session Reminder] Notification sent for session ${session._id}:`,
          result,
        );
      } catch (error) {
        console.error(
          `[Live Session Reminder] Error sending notification for session ${session._id}:`,
          error,
        );
      }
    }

    console.log("[Live Session Reminder] Check complete");
  } catch (error) {
    console.error("[Live Session Reminder] Error checking sessions:", error);
  }
}

/**
 * Check for upcoming live sessions and send notifications 1 hour before (teachers)
 */
async function checkTeacherLiveSessionReminders() {
  try {
    console.log(
      "[Teacher Live Session Reminder] Checking for upcoming sessions...",
    );

    const now = moment().tz("Africa/Nairobi");
    const oneHourFromNow = moment(now).add(1, "hour");

    // Find scheduled sessions that start within the next 1 hour (+/- 5 minutes window)
    const sessions = await LiveSession.find({
      status: "scheduled",
      startAt: {
        $gte: oneHourFromNow.clone().subtract(5, "minutes").toDate(),
        $lte: oneHourFromNow.clone().add(5, "minutes").toDate(),
      },
    }).populate("courseId hostUserId");

    console.log(
      `[Teacher Live Session Reminder] Found ${sessions.length} sessions starting in ~1 hour`,
    );

    for (const session of sessions) {
      try {
        if (!session.hostUserId) {
          console.log(
            `[Teacher Live Session Reminder] No host found for session ${session._id}`,
          );
          continue;
        }

        if (!session.courseId) {
          console.log(
            `[Teacher Live Session Reminder] No course found for session ${session._id}`,
          );
          continue;
        }

        // Get enrolled student count
        const enrollments = await Enrollment.find({
          courseId: session.courseId._id,
        });

        const studentCount = enrollments.length;

        console.log(
          `[Teacher Live Session Reminder] Sending reminder to teacher ${session.hostUserId._id} for session ${session._id}`,
        );

        // Send push notification to teacher
        const payload = {
          title: `🎥 Live Session in 1 Hour`,
          body: `${session.courseId.title} starts soon (${studentCount} students enrolled)`,
          icon: "/logo.png",
          tag: `teacher-live-session-reminder-${session._id}`,
          type: "teacher-live-session-reminder",
          sessionId: session._id.toString(),
          courseId: session.courseId._id.toString(),
          courseTitle: session.courseId.title,
          meetLink: session.meetLink,
          startTime: moment(session.startAt).format("HH:mm"),
          studentCount: studentCount,
          url: `/teacher/live-sessions`,
        };

        // Store as notice
        await storeNotificationAsNotice({
          userIds: [session.hostUserId._id],
          title: payload.title,
          content: payload.body,
          type: "academic",
          priority: "high",
          targetAudience: "teachers",
        });

        await pushController.sendNotification(
          [session.hostUserId._id],
          payload,
        );

        console.log(
          `[Teacher Live Session Reminder] Notification sent for session ${session._id}`,
        );
      } catch (error) {
        console.error(
          `[Teacher Live Session Reminder] Error sending notification for session ${session._id}:`,
          error,
        );
      }
    }

    console.log("[Teacher Live Session Reminder] Check complete");
  } catch (error) {
    console.error(
      "[Teacher Live Session Reminder] Error checking sessions:",
      error,
    );
  }
}

/**
 * Initialize the live session reminder scheduler
 * Runs every 10 minutes to check for upcoming sessions
 */
function initializeLiveSessionReminderScheduler() {
  console.log("[Live Session Reminder] Initializing scheduler...");

  // Run every 10 minutes
  cron.schedule("*/10 * * * *", () => {
    checkUpcomingLiveSessions();
    checkTeacherLiveSessionReminders();
  });

  console.log(
    "[Live Session Reminder] Scheduler initialized - checking every 10 minutes",
  );

  // Run once on startup (after 30 seconds)
  setTimeout(() => {
    console.log("[Live Session Reminder] Running initial check...");
    checkUpcomingLiveSessions();
    checkTeacherLiveSessionReminders();
  }, 30000);
}

module.exports = {
  initializeLiveSessionReminderScheduler,
  checkUpcomingLiveSessions,
  checkTeacherLiveSessionReminders,
};
