const express = require("express");
const { protect, authorize } = require("../middlewares/auth");
const {
  getSystemHealth,
  getSystemAnalytics,
  getUserActivityAnalytics,
  getSystemPerformance,
  getSecretaryDashboardStats,
} = require("../controllers/systemAnalyticsController");

/**
 * @swagger
 * components:
 *   schemas:
 *     SystemHealth:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           enum: [healthy, warning, critical]
 *         timestamp:
 *           type: string
 *           format: date-time
 *         database:
 *           type: object
 *           properties:
 *             status:
 *               type: string
 *             healthy:
 *               type: boolean
 *             responseTime:
 *               type: number
 *         system:
 *           type: object
 *           properties:
 *             uptime:
 *               type: number
 *             memory:
 *               type: object
 *             cpu:
 *               type: object
 *
 *     SystemAnalytics:
 *       type: object
 *       properties:
 *         timeframe:
 *           type: string
 *         period:
 *           type: object
 *         user:
 *           type: object
 *         financial:
 *           type: object
 *         academic:
 *           type: object
 *         activity:
 *           type: object
 *         growth:
 *           type: object
 */

/**
 * @swagger
 * tags:
 *   name: System Analytics
 *   description: System monitoring and analytics for super admin
 */

const router = express.Router();

/**
 * @swagger
 * /system/health:
 *   get:
 *     summary: Get system health status
 *     tags: [System Analytics]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: System health data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/SystemHealth'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions (Super Admin required)
 */
router.get("/health", protect, authorize(["superadmin"]), getSystemHealth);

/**
 * @swagger
 * /system/analytics:
 *   get:
 *     summary: Get comprehensive system analytics
 *     tags: [System Analytics]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: timeframe
 *         schema:
 *           type: string
 *           enum: [7d, 30d, 90d, 1y]
 *           default: 30d
 *         description: Analytics timeframe
 *     responses:
 *       200:
 *         description: System analytics data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/SystemAnalytics'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions (Super Admin required)
 */
router.get(
  "/analytics",
  protect,
  authorize(["superadmin"]),
  getSystemAnalytics
);

/**
 * @swagger
 * /system/user-activity:
 *   get:
 *     summary: Get user activity analytics
 *     tags: [System Analytics]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: timeframe
 *         schema:
 *           type: string
 *           default: 7d
 *         description: Activity timeframe in days (e.g., 7d, 30d)
 *     responses:
 *       200:
 *         description: User activity analytics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions (Super Admin required)
 */
router.get(
  "/user-activity",
  protect,
  authorize(["superadmin"]),
  getUserActivityAnalytics
);

/**
 * @swagger
 * /system/performance:
 *   get:
 *     summary: Get system performance metrics
 *     tags: [System Analytics]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: System performance data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions (Super Admin required)
 */
router.get(
  "/performance",
  protect,
  authorize(["superadmin"]),
  getSystemPerformance
);

/**
 * @swagger
 * /system/secretary-dashboard:
 *   get:
 *     summary: Get secretary dashboard statistics
 *     tags: [System Analytics]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Secretary dashboard statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     studentsRegistered:
 *                       type: object
 *                     paymentsProcessed:
 *                       type: object
 *                     receiptsGenerated:
 *                       type: object
 *                     pendingTasks:
 *                       type: object
 *                     recentActivity:
 *                       type: array
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions (Secretary required)
 */
router.get(
  "/secretary-dashboard",
  protect,
  authorize(["superadmin", "admin", "secretary"]),
  getSecretaryDashboardStats
);

module.exports = router;
