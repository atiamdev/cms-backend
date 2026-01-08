/**
 * Scheduled Jobs Manager
 *
 * This module manages all scheduled/cron jobs for the CMS system.
 * Jobs are scheduled using node-cron and run at specified intervals.
 */

const cron = require("node-cron");
const {
  checkAndMarkInactiveStudents,
  sendAtRiskNotificationsAllBranches,
} = require("./services/studentInactivityService");

// Store active cron jobs for management
const activeJobs = {};

/**
 * Student Inactivity Check Job
 * Runs daily at 6:00 AM to check for students absent for 2 weeks
 *
 * Cron pattern: minute hour day-of-month month day-of-week
 * '0 6 * * 1-5' = At 06:00 on every day-of-week from Monday through Friday
 */
const scheduleStudentInactivityCheck = () => {
  // Run at 6:00 AM every weekday (Monday-Friday)
  const job = cron.schedule(
    "0 6 * * 1-5",
    async () => {
      console.log("\n🕐 [Scheduled Job] Running student inactivity check...");

      try {
        const result = await checkAndMarkInactiveStudents();

        if (result && result.success) {
          console.log(
            `✅ [Scheduled Job] Inactivity check completed. Marked ${
              result.summary?.totalMarkedInactive || 0
            } students inactive.`
          );
        } else {
          console.error(
            "❌ [Scheduled Job] Inactivity check failed:",
            result?.error || "Unknown error"
          );
        }
      } catch (error) {
        console.error(
          "❌ [Scheduled Job] Error running inactivity check:",
          error
        );
      }
    },
    {
      scheduled: true,
      timezone: "Africa/Nairobi", // Adjust to your timezone
    }
  );

  activeJobs.studentInactivityCheck = job;
  console.log(
    "📅 Scheduled: Student inactivity check (daily at 6:00 AM, Mon-Fri)"
  );

  return job;
};

/**
 * At-Risk Notification Job
 * Runs daily at 8:00 AM to send warnings to students at risk of deactivation
 *
 * Cron pattern: '0 8 * * 1-5' = At 08:00 on every day-of-week from Monday through Friday
 */
const scheduleAtRiskNotifications = () => {
  // Run at 8:00 AM every weekday (Monday-Friday)
  const job = cron.schedule(
    "0 8 * * 1-5",
    async () => {
      console.log("\n🕐 [Scheduled Job] Sending at-risk notifications...");

      try {
        const result = await sendAtRiskNotificationsAllBranches();

        if (result.success) {
          console.log(
            `✅ [Scheduled Job] At-risk notifications completed. Sent ${result.totalNotificationsSent} notifications.`
          );
        } else {
          console.error(
            "❌ [Scheduled Job] At-risk notifications failed:",
            result.error
          );
        }
      } catch (error) {
        console.error(
          "❌ [Scheduled Job] Error sending at-risk notifications:",
          error
        );
      }
    },
    {
      scheduled: true,
      timezone: "Africa/Nairobi", // Adjust to your timezone
    }
  );

  activeJobs.atRiskNotifications = job;
  console.log(
    "📅 Scheduled: At-risk notifications (daily at 8:00 AM, Mon-Fri)"
  );

  return job;
};

/**
 * Initialize all scheduled jobs
 * Call this function when the server starts
 */
const initializeScheduledJobs = () => {
  console.log("\n" + "=".repeat(50));
  console.log("⏰ INITIALIZING SCHEDULED JOBS");
  console.log("=".repeat(50));

  // Schedule student inactivity check
  scheduleStudentInactivityCheck();

  // Schedule at-risk notifications
  scheduleAtRiskNotifications();

  console.log("=".repeat(50) + "\n");

  return activeJobs;
};

/**
 * Stop all scheduled jobs
 */
const stopAllJobs = () => {
  Object.keys(activeJobs).forEach((jobName) => {
    if (activeJobs[jobName]) {
      activeJobs[jobName].stop();
      console.log(`⏹️  Stopped job: ${jobName}`);
    }
  });
};

/**
 * Manually trigger the student inactivity check
 * Useful for admin triggering or testing
 */
const runStudentInactivityCheckNow = async () => {
  console.log("🔄 Manually triggering student inactivity check...");
  return await checkAndMarkInactiveStudents();
};

/**
 * Manually trigger at-risk notifications
 * Useful for admin triggering or testing
 */
const runAtRiskNotificationsNow = async () => {
  console.log("🔄 Manually triggering at-risk notifications...");
  return await sendAtRiskNotificationsAllBranches();
};

/**
 * Get status of all scheduled jobs
 */
const getJobsStatus = () => {
  const status = {};

  Object.keys(activeJobs).forEach((jobName) => {
    status[jobName] = {
      running: activeJobs[jobName] ? true : false,
    };
  });

  return status;
};

module.exports = {
  initializeScheduledJobs,
  stopAllJobs,
  runStudentInactivityCheckNow,
  runAtRiskNotificationsNow,
  getJobsStatus,
  activeJobs,
};
