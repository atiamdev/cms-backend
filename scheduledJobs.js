/**
 * Scheduled Jobs Manager
 *
 * This module manages all scheduled/cron jobs for the CMS system.
 * Jobs are scheduled using node-cron and run at specified intervals.
 * Includes retry logic and error alerting for critical jobs.
 */

const cron = require("node-cron");
const {
  checkAndMarkInactiveStudents,
  sendAtRiskNotificationsAllBranches,
} = require("./services/studentInactivityService");

// WhatsApp Integration Service
const WhatsAppIntegrationService = require("./services/whatsappIntegrationService");

// Fee Reminder Service
const { checkFeeReminders } = require("./services/feeReminderService");

// Store active cron jobs for management
const activeJobs = {};

// Store job execution history for monitoring
const jobHistory = {
  studentInactivityCheck: {
    lastRun: null,
    lastSuccess: null,
    failures: 0,
    consecutiveFailures: 0,
  },
  atRiskNotifications: {
    lastRun: null,
    lastSuccess: null,
    failures: 0,
    consecutiveFailures: 0,
  },
  monthlyInvoiceGeneration: {
    lastRun: null,
    lastSuccess: null,
    failures: 0,
    consecutiveFailures: 0,
  },
  weeklyInvoiceGeneration: {
    lastRun: null,
    lastSuccess: null,
    failures: 0,
    consecutiveFailures: 0,
  },
  weeklyAttendanceReports: {
    lastRun: null,
    lastSuccess: null,
    failures: 0,
    consecutiveFailures: 0,
  },
  feeReminderMorning: {
    lastRun: null,
    lastSuccess: null,
    failures: 0,
    consecutiveFailures: 0,
  },
  feeReminderAfternoon: {
    lastRun: null,
    lastSuccess: null,
    failures: 0,
    consecutiveFailures: 0,
  },
};

/**
 * Send alert to administrators about job failures
 */
async function sendJobFailureAlert(jobName, error, consecutiveFailures) {
  try {
    const Notice = require("./models/Notice");
    const User = require("./models/User");

    // Find all admin users
    const admins = await User.find({
      roles: { $in: ["admin", "super_admin"] },
      isActive: true,
    }).select("_id");

    if (admins.length === 0) return;

    const alertMessage = `Scheduled job "${jobName}" has failed ${consecutiveFailures} consecutive time(s). Latest error: ${error.message || error}. Please check system logs and investigate immediately.`;

    await Notice.create({
      title: `⚠️ CRITICAL: Scheduled Job Failure`,
      message: alertMessage,
      targetAudience: "staff", // Changed from "admin" to valid enum value
      specificRecipients: admins.map((a) => a._id), // Changed from targetUsers to specificRecipients
      priority: "urgent",
      type: "urgent", // Changed from "system" to valid enum value
      isActive: true,
      branchId: admins[0]?.branchId, // Add branchId from first admin
      author: {
        userId: admins[0]?._id, // Use first admin as author
        name: "System",
      },
      publishDate: new Date(),
      metadata: {
        jobName,
        error: error.message || String(error),
        consecutiveFailures,
        timestamp: new Date(),
      },
    });

    console.error(
      `🚨 ALERT SENT: Job ${jobName} failed ${consecutiveFailures} times`,
    );
  } catch (alertError) {
    console.error("Failed to send job failure alert:", alertError);
  }
}

/**
 * Execute a job with retry logic and error tracking
 */
async function executeJobWithRetry(jobName, jobFunction, maxRetries = 3) {
  const history = jobHistory[jobName];
  history.lastRun = new Date();

  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`\n🕐 [${jobName}] Attempt ${attempt}/${maxRetries}...`);

      const result = await jobFunction();

      // Success!
      history.lastSuccess = new Date();
      history.consecutiveFailures = 0;

      console.log(`✅ [${jobName}] Completed successfully`);
      return { success: true, result };
    } catch (error) {
      lastError = error;
      console.error(
        `❌ [${jobName}] Attempt ${attempt} failed:`,
        error.message,
      );

      if (attempt < maxRetries) {
        // Exponential backoff: 2^attempt seconds
        const backoffMs = Math.pow(2, attempt) * 1000;
        console.log(`   Retrying in ${backoffMs / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }

  // All retries failed
  history.failures++;
  history.consecutiveFailures++;

  console.error(`🚨 [${jobName}] FAILED after ${maxRetries} attempts`);

  // Send alert if we have multiple consecutive failures
  if (history.consecutiveFailures >= 2) {
    await sendJobFailureAlert(jobName, lastError, history.consecutiveFailures);
  }

  return { success: false, error: lastError };
}

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
      await executeJobWithRetry("studentInactivityCheck", async () => {
        const result = await checkAndMarkInactiveStudents();

        if (result && result.success) {
          console.log(
            `   Marked ${result.summary?.totalMarkedInactive || 0} students inactive.`,
          );
        } else {
          throw new Error(result?.error || "Inactivity check failed");
        }

        return result;
      });
    },
    {
      scheduled: true,
      timezone: "Africa/Nairobi", // Adjust to your timezone
    },
  );

  activeJobs.studentInactivityCheck = job;
  console.log(
    "📅 Scheduled: Student inactivity check (daily at 6:00 AM, Mon-Fri)",
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
      await executeJobWithRetry("atRiskNotifications", async () => {
        const result = await sendAtRiskNotificationsAllBranches();

        if (result.success) {
          console.log(
            `   Sent ${result.totalNotificationsSent} notifications.`,
          );
        } else {
          throw new Error(result.error || "At-risk notifications failed");
        }

        return result;
      });
    },
    {
      scheduled: true,
      timezone: "Africa/Nairobi", // Adjust to your timezone
    },
  );

  activeJobs.atRiskNotifications = job;
  console.log(
    "📅 Scheduled: At-risk notifications (daily at 8:00 AM, Mon-Fri)",
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

  // Schedule monthly invoice generation (runs 03:00 on the 1st of every month)
  try {
    const monthlyInvoiceService = require("./services/monthlyInvoiceService");
    const job = cron.schedule(
      "0 3 1 * *",
      async () => {
        await executeJobWithRetry(
          "monthlyInvoiceGeneration",
          async () => {
            const now = new Date();
            const result =
              await monthlyInvoiceService.generateInvoicesForFrequency({
                frequency: "monthly",
                date: now,
              });
            console.log(
              `   Created: ${result.created}, Skipped: ${result.skipped}, Notifications: ${result.notificationsPending}`,
            );
            return result;
          },
          2, // Fewer retries for invoice generation to avoid duplicates
        );
      },
      { scheduled: true, timezone: "Africa/Nairobi" },
    );

    activeJobs.monthlyInvoiceGeneration = job;
    console.log(
      "📅 Scheduled: Monthly invoice generation (1st day each month at 03:00)",
    );

    // Weekly invoices (every Monday at 03:00)
    const weeklyJob = cron.schedule(
      "0 3 * * 1",
      async () => {
        await executeJobWithRetry(
          "weeklyInvoiceGeneration",
          async () => {
            const now = new Date();
            const result =
              await monthlyInvoiceService.generateInvoicesForFrequency({
                frequency: "weekly",
                date: now,
              });
            console.log(
              `   Created: ${result.created}, Skipped: ${result.skipped}`,
            );
            return result;
          },
          2,
        );
      },
      { scheduled: true, timezone: "Africa/Nairobi" },
    );

    activeJobs.weeklyInvoiceGeneration = weeklyJob;
    console.log(
      "📅 Scheduled: Weekly invoice generation (every Monday at 03:00)",
    );

    // Weekly attendance reports (every Friday at 17:00)
    const attendanceJob = cron.schedule(
      "0 17 * * 5",
      async () => {
        await executeJobWithRetry(
          "weeklyAttendanceReports",
          async () => {
            const whatsappService = new WhatsAppIntegrationService();
            const result = await whatsappService.sendWeeklyAttendanceReports();

            console.log(
              `📊 Weekly attendance reports sent: ${result.successful}/${result.total} successful`,
            );
            return result;
          },
          2,
        );
      },
      { scheduled: true, timezone: "Africa/Nairobi" },
    );

    activeJobs.weeklyAttendanceReports = attendanceJob;
    console.log(
      "📅 Scheduled: Weekly attendance reports (every Friday at 17:00)",
    );

    // Fee reminders - Morning check (8:00 AM daily)
    const feeReminderMorningJob = cron.schedule(
      "0 8 * * *",
      async () => {
        await executeJobWithRetry(
          "feeReminderMorning",
          async () => {
            const result = await checkFeeReminders();
            console.log("   Fee reminders checked (morning run)");
            return { success: true, result };
          },
          2,
        );
      },
      { scheduled: true, timezone: "Africa/Nairobi" },
    );

    activeJobs.feeReminderMorning = feeReminderMorningJob;
    console.log("📅 Scheduled: Fee reminder check (daily at 08:00)");

    // Fee reminders - Afternoon check (2:00 PM daily)
    const feeReminderAfternoonJob = cron.schedule(
      "0 14 * * *",
      async () => {
        await executeJobWithRetry(
          "feeReminderAfternoon",
          async () => {
            const result = await checkFeeReminders();
            console.log("   Fee reminders checked (afternoon run)");
            return { success: true, result };
          },
          2,
        );
      },
      { scheduled: true, timezone: "Africa/Nairobi" },
    );

    activeJobs.feeReminderAfternoon = feeReminderAfternoonJob;
    console.log("📅 Scheduled: Fee reminder check (daily at 14:00)");
  } catch (error) {
    console.error("Error initializing invoice/reminder jobs:", error.message);
  }

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
 * Manually trigger fee reminder check
 * Useful for admin triggering or testing
 */
const runFeeReminderCheckNow = async () => {
  console.log("🔄 Manually triggering fee reminder check...");
  return await checkFeeReminders();
};

/**
 * Get status of all scheduled jobs including execution history
 */
const getJobsStatus = () => {
  const status = {};

  Object.keys(activeJobs).forEach((jobName) => {
    status[jobName] = {
      running: activeJobs[jobName] ? true : false,
      history: jobHistory[jobName] || null,
    };
  });

  return status;
};

/**
 * Get detailed health report of scheduled jobs
 */
const getJobsHealthReport = () => {
  const report = {
    timestamp: new Date(),
    totalJobs: Object.keys(activeJobs).length,
    healthStatus: "healthy",
    jobs: {},
    alerts: [],
  };

  Object.keys(jobHistory).forEach((jobName) => {
    const history = jobHistory[jobName];
    const timeSinceLastRun = history.lastRun
      ? Date.now() - history.lastRun.getTime()
      : null;
    const timeSinceLastSuccess = history.lastSuccess
      ? Date.now() - history.lastSuccess.getTime()
      : null;

    const jobStatus = {
      ...history,
      timeSinceLastRun: timeSinceLastRun
        ? `${Math.round(timeSinceLastRun / 60000)} minutes`
        : "Never run",
      timeSinceLastSuccess: timeSinceLastSuccess
        ? `${Math.round(timeSinceLastSuccess / 60000)} minutes`
        : "Never succeeded",
      health: "good",
    };

    // Determine health status
    if (history.consecutiveFailures >= 3) {
      jobStatus.health = "critical";
      report.healthStatus = "critical";
      report.alerts.push(
        `${jobName}: ${history.consecutiveFailures} consecutive failures`,
      );
    } else if (history.consecutiveFailures >= 2) {
      jobStatus.health = "warning";
      if (report.healthStatus === "healthy") report.healthStatus = "warning";
      report.alerts.push(
        `${jobName}: ${history.consecutiveFailures} consecutive failures`,
      );
    } else if (timeSinceLastSuccess && timeSinceLastSuccess > 86400000 * 2) {
      // 2 days
      jobStatus.health = "stale";
      if (report.healthStatus === "healthy") report.healthStatus = "warning";
      report.alerts.push(`${jobName}: No successful run in over 2 days`);
    }

    report.jobs[jobName] = jobStatus;
  });

  return report;
};

module.exports = {
  initializeScheduledJobs,
  stopAllJobs,
  runStudentInactivityCheckNow,
  runAtRiskNotificationsNow,
  runFeeReminderCheckNow,
  getJobsStatus,
  getJobsHealthReport,
  activeJobs,
  jobHistory,
};
