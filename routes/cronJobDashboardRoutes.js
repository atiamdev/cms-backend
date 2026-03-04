/**
 * Cron Job Dashboard Routes
 *
 * Routes for monitoring and managing scheduled cron jobs.
 * All routes are protected and require SuperAdmin role.
 */

const express = require("express");
const { protect, authorize } = require("../middlewares/auth");
const {
  getAllJobsStatus,
  getHealthReport,
  getJobStatus,
  manuallyTriggerJob,
  getHistorySummary,
  getOverview,
} = require("../controllers/cronJobDashboardController");

const router = express.Router();

// All routes require authentication and superadmin role
router.use(protect);
router.use(authorize("superadmin"));

// @route   GET /api/cron-jobs/overview
// @desc    Get overview statistics of all cron jobs
// @access  Private/Superadmin
router.get("/overview", getOverview);

// @route   GET /api/cron-jobs/status
// @desc    Get status of all cron jobs
// @access  Private/Superadmin
router.get("/status", getAllJobsStatus);

// @route   GET /api/cron-jobs/health
// @desc    Get detailed health report of all cron jobs
// @access  Private/Superadmin
router.get("/health", getHealthReport);

// @route   GET /api/cron-jobs/history/summary
// @desc    Get execution history summary
// @access  Private/Superadmin
router.get("/history/summary", getHistorySummary);

// @route   GET /api/cron-jobs/:jobName
// @desc    Get status of a specific job
// @access  Private/Superadmin
router.get("/:jobName", getJobStatus);

// @route   POST /api/cron-jobs/:jobName/run
// @desc    Manually trigger a specific job
// @access  Private/Superadmin
router.post("/:jobName/run", manuallyTriggerJob);

module.exports = router;
