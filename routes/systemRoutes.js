const express = require("express");
const { protect, authorize } = require("../middlewares/auth");
const {
  getScheduledJobsStatus,
  getScheduledJobsHealth,
  getSystemHealth,
} = require("../controllers/systemController");

const router = express.Router();

/**
 * @swagger
 * /api/system/health:
 *   get:
 *     summary: Get system health status
 *     tags: [System]
 *     responses:
 *       200:
 *         description: System is healthy
 *       503:
 *         description: System is unhealthy
 */
router.get("/health", getSystemHealth);

/**
 * @swagger
 * /api/system/jobs/status:
 *   get:
 *     summary: Get scheduled jobs status
 *     tags: [System]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Jobs status retrieved successfully
 */
router.get(
  "/jobs/status",
  protect,
  authorize(["admin", "super_admin"]),
  getScheduledJobsStatus
);

/**
 * @swagger
 * /api/system/jobs/health:
 *   get:
 *     summary: Get scheduled jobs health report
 *     tags: [System]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Jobs health report retrieved successfully
 */
router.get(
  "/jobs/health",
  protect,
  authorize(["admin", "super_admin"]),
  getScheduledJobsHealth
);

module.exports = router;
