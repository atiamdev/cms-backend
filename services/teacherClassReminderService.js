const cron = require("node-cron");
const Class = require("../models/Class");
const Teacher = require("../models/Teacher");
const pushController = require("../controllers/pushController");
const { storeNotificationAsNotice } = require("../utils/notificationStorage");
const moment = require("moment-timezone");

/**
 * Check for upcoming classes and send notifications 30 minutes before
 */
async function checkTeacherClassReminders() {
  try {
    console.log("[Teacher Class Reminder] Checking for upcoming classes...");

    const now = moment().tz("Africa/Nairobi");
    const thirtyMinutesFromNow = moment(now).add(30, "minutes");

    const targetDay = thirtyMinutesFromNow.format("dddd").toLowerCase();
    const targetTime = thirtyMinutesFromNow.format("HH:mm");

    console.log(
      "[Teacher Class Reminder] Current time:",
      now.format("YYYY-MM-DD HH:mm")
    );
    console.log(
      "[Teacher Class Reminder] Target time:",
      thirtyMinutesFromNow.format("YYYY-MM-DD HH:mm")
    );
    console.log(
      "[Teacher Class Reminder] Looking for classes on:",
      targetDay,
      "at around",
      targetTime
    );

    // Find active classes with schedules
    const classes = await Class.find({
      status: "active",
      "schedule.periods": { $exists: true, $ne: [] },
    }).populate("subjects.assignedTeacherIds");

    console.log(
      "[Teacher Class Reminder] Found",
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
          `${thirtyMinutesFromNow.format("YYYY-MM-DD")} ${period.startTime}`,
          "YYYY-MM-DD HH:mm",
          "Africa/Nairobi"
        );

        // Check if class starts within 30 minutes (+/- 2 minutes window)
        const diffMinutes = periodStart.diff(now, "minutes");

        if (diffMinutes >= 28 && diffMinutes <= 32) {
          console.log(
            `[Teacher Class Reminder] Found class: ${classDoc.name} - ${period.subjectName} at ${period.startTime}`
          );

          // Get teacher for this period
          let teacherUserId = null;

          if (period.teacherId) {
            const teacher = await Teacher.findById(period.teacherId).populate(
              "userId"
            );
            if (teacher && teacher.userId) {
              teacherUserId = teacher.userId._id;
            }
          }

          // If no specific teacher, try to get from subjects
          if (!teacherUserId) {
            const subject = classDoc.subjects.find(
              (s) => s.subjectName === period.subjectName
            );
            if (
              subject &&
              subject.assignedTeacherIds &&
              subject.assignedTeacherIds.length > 0
            ) {
              const teacher = subject.assignedTeacherIds[0];
              if (teacher && teacher.userId) {
                teacherUserId = teacher.userId._id;
              }
            }
          }

          if (!teacherUserId) {
            console.log(
              "[Teacher Class Reminder] No teacher found for this class"
            );
            continue;
          }

          const studentCount = classDoc.students.filter(
            (s) => s.status === "active"
          ).length;

          // Send push notification
          try {
            const result = await pushController.sendNotification(
              [teacherUserId],
              {
                title: `📚 Class Starting Soon`,
                body: `${period.subjectName} - ${classDoc.name} starts at ${period.startTime} (${studentCount} students)`,
                icon: "/logo.png",
                tag: `teacher-class-${classDoc._id}-${period.day}-${period.startTime}`,
                type: "teacher-class-reminder",
                classId: classDoc._id.toString(),
                className: classDoc.name,
                subject: period.subjectName,
                startTime: period.startTime,
                endTime: period.endTime,
                room: period.room || classDoc.room?.number || "TBA",
                studentCount: studentCount,
                url: "/teacher/classes",
              }
            );

            console.log(`[Teacher Class Reminder] Notification sent:`, result);
          } catch (error) {
            console.error(
              "[Teacher Class Reminder] Error sending notification:",
              error
            );
          }
        }
      }
    }

    console.log("[Teacher Class Reminder] Check complete");
  } catch (error) {
    console.error(
      "[Teacher Class Reminder] Error in checkTeacherClassReminders:",
      error
    );
  }
}

/**
 * Initialize the teacher class reminder scheduler
 * Runs every 5 minutes to check for upcoming classes
 */
function initializeTeacherClassReminderScheduler() {
  console.log("[Teacher Class Reminder] Initializing scheduler...");

  // Run every 5 minutes
  cron.schedule("*/5 * * * *", () => {
    checkTeacherClassReminders();
  });

  console.log(
    "[Teacher Class Reminder] Scheduler initialized - checking every 5 minutes"
  );

  // Run once on startup (after 30 seconds)
  setTimeout(() => {
    console.log("[Teacher Class Reminder] Running initial check...");
    checkTeacherClassReminders();
  }, 30000);
}

module.exports = {
  initializeTeacherClassReminderScheduler,
  checkTeacherClassReminders,
};
