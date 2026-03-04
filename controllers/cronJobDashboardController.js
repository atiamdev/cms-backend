/**
 * Cron Job Dashboard Controller
 *
 * Provides API endpoints for monitoring and managing scheduled cron jobs.
 * This controller wraps the existing job monitoring functions from scheduledJobs.js
 * and provides a REST API interface for the admin dashboard.
 */

const {
  getJobsStatus,
  getJobsHealthReport,
  runStudentInactivityCheckNow,
  runAtRiskNotificationsNow,
  runFeeReminderCheckNow,
  activeJobs,
  jobHistory,
} = require("../scheduledJobs");

// Job metadata - schedule information for display
const jobMetadata = {
  studentInactivityCheck: {
    name: "Student Inactivity Check",
    description:
      "Checks for students absent for 2 weeks and marks them inactive",
    schedule: "Daily at 6:00 AM (Mon-Fri)",
    cronPattern: "0 6 * * 1-5",
    category: "Student Management",
    canManualRun: true,
  },
  atRiskNotifications: {
    name: "At-Risk Notifications",
    description: "Sends warnings to students at risk of deactivation",
    schedule: "Daily at 8:00 AM (Mon-Fri)",
    cronPattern: "0 8 * * 1-5",
    category: "Notifications",
    canManualRun: true,
  },
  monthlyInvoiceGeneration: {
    name: "Monthly Invoice Generation",
    description: "Generates monthly invoices for all enrolled students",
    schedule: "1st of every month at 3:00 AM",
    cronPattern: "0 3 1 * *",
    category: "Financial",
    canManualRun: false,
  },
  weeklyInvoiceGeneration: {
    name: "Weekly Invoice Generation",
    description: "Generates weekly invoices for enrolled students",
    schedule: "Every Monday at 3:00 AM",
    cronPattern: "0 3 * * 1",
    category: "Financial",
    canManualRun: false,
  },
  weeklyAttendanceReports: {
    name: "Weekly Attendance Reports",
    description: "Sends weekly attendance reports via WhatsApp",
    schedule: "Every Friday at 5:00 PM",
    cronPattern: "0 17 * * 5",
    category: "Reports",
    canManualRun: false,
  },
  feeReminderMorning: {
    name: "Fee Reminder Check (Morning)",
    description:
      "Checks for fees due in 5 days or 1 day and sends WhatsApp reminders",
    schedule: "Daily at 8:00 AM",
    cronPattern: "0 8 * * *",
    category: "Financial",
    canManualRun: true,
  },
  feeReminderAfternoon: {
    name: "Fee Reminder Check (Afternoon)",
    description:
      "Afternoon check for fees due in 5 days or 1 day and sends WhatsApp reminders",
    schedule: "Daily at 2:00 PM",
    cronPattern: "0 14 * * *",
    category: "Financial",
    canManualRun: true,
  },
};

/**
 * @desc    Get all cron jobs status
 * @route   GET /api/cron-jobs/status
 * @access  Private/Superadmin
 */
const getAllJobsStatus = async (req, res) => {
  try {
    const status = getJobsStatus();

    // Enhance with metadata
    const enhancedStatus = {};
    Object.keys(status).forEach((jobName) => {
      enhancedStatus[jobName] = {
        ...status[jobName],
        metadata: jobMetadata[jobName] || {
          name: jobName,
          description: "No description available",
          schedule: "Unknown",
          category: "Other",
        },
      };
    });

    res.json({
      success: true,
      data: enhancedStatus,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Error fetching cron jobs status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch cron jobs status",
      error: error.message,
    });
  }
};

/**
 * @desc    Get detailed health report of all cron jobs
 * @route   GET /api/cron-jobs/health
 * @access  Private/Superadmin
 */
const getHealthReport = async (req, res) => {
  try {
    const healthReport = getJobsHealthReport();

    // Enhance with metadata
    const enhancedJobs = {};
    Object.keys(healthReport.jobs).forEach((jobName) => {
      enhancedJobs[jobName] = {
        ...healthReport.jobs[jobName],
        metadata: jobMetadata[jobName] || {
          name: jobName,
          description: "No description available",
          schedule: "Unknown",
          category: "Other",
        },
      };
    });

    res.json({
      success: true,
      data: {
        ...healthReport,
        jobs: enhancedJobs,
      },
    });
  } catch (error) {
    console.error("Error fetching health report:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch health report",
      error: error.message,
    });
  }
};

/**
 * @desc    Get status of a specific job
 * @route   GET /api/cron-jobs/:jobName
 * @access  Private/Superadmin
 */
const getJobStatus = async (req, res) => {
  try {
    const { jobName } = req.params;

    if (!jobHistory[jobName]) {
      return res.status(404).json({
        success: false,
        message: `Job '${jobName}' not found`,
      });
    }

    const isRunning = activeJobs[jobName] ? true : false;
    const history = jobHistory[jobName];
    const metadata = jobMetadata[jobName] || {
      name: jobName,
      description: "No description available",
      schedule: "Unknown",
      category: "Other",
    };

    res.json({
      success: true,
      data: {
        jobName,
        running: isRunning,
        history,
        metadata,
      },
    });
  } catch (error) {
    console.error(`Error fetching job ${req.params.jobName} status:`, error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch job status",
      error: error.message,
    });
  }
};

/**
 * @desc    Manually trigger a cron job
 * @route   POST /api/cron-jobs/:jobName/run
 * @access  Private/Superadmin
 */
const manuallyTriggerJob = async (req, res) => {
  try {
    const { jobName } = req.params;

    // Check if job exists
    if (!jobHistory[jobName]) {
      return res.status(404).json({
        success: false,
        message: `Job '${jobName}' not found`,
      });
    }

    // Check if manual run is allowed
    const metadata = jobMetadata[jobName];
    if (metadata && !metadata.canManualRun) {
      return res.status(403).json({
        success: false,
        message: `Manual execution of '${jobName}' is not allowed to prevent duplicate operations`,
      });
    }

    console.log(
      `🔄 Manually triggering job: ${jobName} by user ${req.user.name}`,
    );

    let result;
    switch (jobName) {
      case "studentInactivityCheck":
        result = await runStudentInactivityCheckNow();
        break;
      case "atRiskNotifications":
        result = await runAtRiskNotificationsNow();
        break;
      case "feeReminderMorning":
      case "feeReminderAfternoon":
        result = await runFeeReminderCheckNow();
        break;
      default:
        return res.status(400).json({
          success: false,
          message: `Job '${jobName}' does not support manual execution`,
        });
    }

    res.json({
      success: true,
      message: `Job '${jobName}' executed successfully`,
      data: result,
      triggeredBy: req.user.name,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error(
      `Error manually triggering job ${req.params.jobName}:`,
      error,
    );
    res.status(500).json({
      success: false,
      message: "Failed to execute job",
      error: error.message,
    });
  }
};

/**
 * @desc    Get job execution history summary
 * @route   GET /api/cron-jobs/history/summary
 * @access  Private/Superadmin
 */
const getHistorySummary = async (req, res) => {
  try {
    const summary = {
      totalJobs: Object.keys(jobHistory).length,
      jobsWithFailures: 0,
      jobsNeverRun: 0,
      totalFailures: 0,
      jobs: {},
    };

    Object.keys(jobHistory).forEach((jobName) => {
      const history = jobHistory[jobName];
      const metadata = jobMetadata[jobName] || { name: jobName };

      summary.jobs[jobName] = {
        name: metadata.name,
        lastRun: history.lastRun,
        lastSuccess: history.lastSuccess,
        failures: history.failures,
        consecutiveFailures: history.consecutiveFailures,
        category: metadata.category || "Other",
      };

      if (history.failures > 0) {
        summary.jobsWithFailures++;
        summary.totalFailures += history.failures;
      }

      if (!history.lastRun) {
        summary.jobsNeverRun++;
      }
    });

    res.json({
      success: true,
      data: summary,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Error fetching history summary:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch history summary",
      error: error.message,
    });
  }
};

/**
 * @desc    Get overview statistics
 * @route   GET /api/cron-jobs/overview
 * @access  Private/Superadmin
 */
const getOverview = async (req, res) => {
  try {
    const healthReport = getJobsHealthReport();
    const status = getJobsStatus();

    const overview = {
      totalJobs: healthReport.totalJobs,
      healthStatus: healthReport.healthStatus,
      activeJobs: Object.keys(status).filter(
        (jobName) => status[jobName].running,
      ).length,
      alerts: healthReport.alerts,
      categories: {},
      recentActivity: [],
    };

    // Group by category
    Object.keys(jobHistory).forEach((jobName) => {
      const metadata = jobMetadata[jobName] || { category: "Other" };
      const category = metadata.category;

      if (!overview.categories[category]) {
        overview.categories[category] = {
          total: 0,
          healthy: 0,
          warning: 0,
          critical: 0,
        };
      }

      overview.categories[category].total++;

      const jobHealth = healthReport.jobs[jobName]?.health || "good";
      if (jobHealth === "critical") {
        overview.categories[category].critical++;
      } else if (jobHealth === "warning" || jobHealth === "stale") {
        overview.categories[category].warning++;
      } else {
        overview.categories[category].healthy++;
      }
    });

    // Recent activity (last run times)
    Object.keys(jobHistory).forEach((jobName) => {
      const history = jobHistory[jobName];
      if (history.lastRun) {
        overview.recentActivity.push({
          jobName,
          name: jobMetadata[jobName]?.name || jobName,
          lastRun: history.lastRun,
          success: history.lastSuccess === history.lastRun,
        });
      }
    });

    // Sort by most recent
    overview.recentActivity.sort(
      (a, b) => new Date(b.lastRun) - new Date(a.lastRun),
    );
    overview.recentActivity = overview.recentActivity.slice(0, 10);

    res.json({
      success: true,
      data: overview,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Error fetching overview:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch overview",
      error: error.message,
    });
  }
};

module.exports = {
  getAllJobsStatus,
  getHealthReport,
  getJobStatus,
  manuallyTriggerJob,
  getHistorySummary,
  getOverview,
};
