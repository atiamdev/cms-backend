const cron = require("node-cron");
const Class = require("../models/Class");
const Student = require("../models/Student");
const pushController = require("../controllers/pushController");
const { storeNotificationAsNotice } = require("../utils/notificationStorage");
const moment = require("moment-timezone");

// Map day names to moment day numbers
const dayNameToNumber = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/**
 * Check for upcoming classes and send notifications 3 hours before
 */
async function checkUpcomingClasses() {
  try {
    console.log("[Class Reminder] Checking for upcoming classes...");

    const now = moment().tz("Africa/Nairobi");
    const threeHoursFromNow = moment(now).add(3, "hours");

    // Get current day of week
    const currentDay = now.format("dddd").toLowerCase();
    const targetDay = threeHoursFromNow.format("dddd").toLowerCase();
    const targetTime = threeHoursFromNow.format("HH:mm");

    console.log(
      "[Class Reminder] Current time:",
      now.format("YYYY-MM-DD HH:mm")
    );
    console.log(
      "[Class Reminder] Target time:",
      threeHoursFromNow.format("YYYY-MM-DD HH:mm")
    );
    console.log(
      "[Class Reminder] Looking for classes on:",
      targetDay,
      "at around",
      targetTime
    );

    // Find active classes with schedules
    const classes = await Class.find({
      status: "active",
      "schedule.periods": { $exists: true, $ne: [] },
    }).populate({
      path: "students.studentId",
      populate: { path: "userId" },
    });

    console.log(
      "[Class Reminder] Found",
      classes.length,
      "active classes with schedules"
    );

    for (const classDoc of classes) {
      // Check each period in the schedule
      for (const period of classDoc.schedule.periods || []) {
        if (period.day.toLowerCase() !== targetDay) {
          continue;
        }

        // Parse period start time
        const periodStart = moment.tz(
          `${threeHoursFromNow.format("YYYY-MM-DD")} ${period.startTime}`,
          "YYYY-MM-DD HH:mm",
          "Africa/Nairobi"
        );

        // Check if class starts within 3 hours (+/- 5 minutes window)
        const diffMinutes = periodStart.diff(now, "minutes");

        if (diffMinutes >= 175 && diffMinutes <= 185) {
          // This class starts in approximately 3 hours
          console.log(
            `[Class Reminder] Found class: ${classDoc.name} - ${period.subjectName} at ${period.startTime}`
          );

          // Get active students
          const activeStudents = classDoc.students.filter(
            (s) => s.status === "active" && s.studentId && s.studentId.userId
          );

          if (activeStudents.length === 0) {
            console.log("[Class Reminder] No active students in this class");
            continue;
          }

          const studentUserIds = activeStudents
            .map((s) => s.studentId.userId._id)
            .filter(Boolean);

          console.log(
            `[Class Reminder] Sending notification to ${studentUserIds.length} students`
          );

          // Send push notification
          try {
            const payload = {
              title: `Class Reminder: ${period.subjectName}`,
              body: `Your ${period.subjectName} class starts at ${period.startTime} (in 3 hours)`,
              icon: "/logo.png",
              tag: `class-reminder-${classDoc._id}-${period.day}-${period.startTime}`,
              type: "class-reminder",
              classId: classDoc._id.toString(),
              subject: period.subjectName,
              startTime: period.startTime,
              room: period.room || classDoc.room?.number || "TBA",
              url: "/student/schedule",
            };

            // Store as notice
            await storeNotificationAsNotice({
              userIds: studentUserIds,
              title: payload.title,
              content: payload.body,
              type: "academic",
              priority: "medium",
              branchId: classDoc.branchId,
              targetAudience: "students",
            });

            const result = await pushController.sendNotification(
              studentUserIds,
              payload
            );

            console.log(`[Class Reminder] Notification sent:`, result);
          } catch (error) {
            console.error(
              "[Class Reminder] Error sending notification:",
              error
            );
          }
        }
      }
    }

    console.log("[Class Reminder] Check complete");
  } catch (error) {
    console.error("[Class Reminder] Error in checkUpcomingClasses:", error);
  }
}

/**
 * Initialize the class reminder scheduler
 * Runs every 10 minutes to check for upcoming classes
 */
function initializeClassReminderScheduler() {
  console.log("[Class Reminder] Initializing class reminder scheduler...");

  // Run every 10 minutes
  cron.schedule("*/10 * * * *", () => {
    checkUpcomingClasses();
  });

  console.log(
    "[Class Reminder] Scheduler initialized - checking every 10 minutes"
  );

  // Run once on startup (after 30 seconds)
  setTimeout(() => {
    console.log("[Class Reminder] Running initial check...");
    checkUpcomingClasses();
  }, 30000);
}

module.exports = {
  initializeClassReminderScheduler,
  checkUpcomingClasses,
};
