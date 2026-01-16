/**
 * System Controller
 * Handles system monitoring, health checks, and administrative endpoints
 */

const { getJobsStatus, getJobsHealthReport } = require("../scheduledJobs");

/**
 * @desc    Get scheduled jobs status
 * @route   GET /api/system/jobs/status
 * @access  Private (Admin only)
 */
const getScheduledJobsStatus = async (req, res) => {
  try {
    const status = getJobsStatus();
    
    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error("Get jobs status error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve job status",
      error: error.message,
    });
  }
};

/**
 * @desc    Get scheduled jobs health report
 * @route   GET /api/system/jobs/health
 * @access  Private (Admin only)
 */
const getScheduledJobsHealth = async (req, res) => {
  try {
    const report = getJobsHealthReport();
    
    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    console.error("Get jobs health error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve job health",
      error: error.message,
    });
  }
};

/**
 * @desc    Get system health check
 * @route   GET /api/system/health
 * @access  Public
 */
const getSystemHealth = async (req, res) => {
  try {
    const mongoose = require("mongoose");
    
    const health = {
      status: "healthy",
      timestamp: new Date(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "development",
      database: {
        status: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
        readyState: mongoose.connection.readyState,
      },
      memory: {
        heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)} MB`,
        external: `${Math.round(process.memoryUsage().external / 1024 / 1024)} MB`,
        rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
      },
    };

    // If database is not connected, set status to unhealthy
    if (mongoose.connection.readyState !== 1) {
      health.status = "unhealthy";
      return res.status(503).json({
        success: false,
        data: health,
      });
    }

    res.json({
      success: true,
      data: health,
    });
  } catch (error) {
    console.error("Health check error:", error);
    res.status(503).json({
      success: false,
      message: "System health check failed",
      error: error.message,
      data: {
        status: "unhealthy",
        timestamp: new Date(),
      },
    });
  }
};

module.exports = {
  getScheduledJobsStatus,
  getScheduledJobsHealth,
  getSystemHealth,
};
