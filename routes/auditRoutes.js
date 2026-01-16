// routes/auditRoutes.js
const express = require("express");
const router = express.Router();
const { protect, requireSuperAdmin } = require("../middlewares/auth");
const AuditLogger = require("../utils/auditLogger");
const AuditLog = require("../models/AuditLog");

// Constants for audit log management
const MAX_AUDIT_LOG_EXPORT_LIMIT = 50000; // Maximum records that can be exported at once

// Get audit logs with filtering and pagination
router.get("/logs", protect, requireSuperAdmin, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      userId,
      action,
      resourceType,
      category,
      severity,
      startDate,
      endDate,
      success,
      targetUserId,
      branchId,
      sortBy = "timestamp",
      sortOrder = -1,
      search,
    } = req.query;

    // Build filters
    const filters = {};
    if (userId) filters.userId = userId;
    if (action) filters.action = action;
    if (resourceType) filters.resourceType = resourceType;
    if (category) filters.category = category;
    if (severity) filters.severity = severity;
    if (success !== undefined) filters.success = success === "true";
    if (targetUserId) filters.targetUserId = targetUserId;
    if (branchId) filters.branchId = branchId;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    // Build options
    const options = {
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 100), // Max 100 items per page
      sortBy,
      sortOrder: parseInt(sortOrder),
    };

    let result;

    if (search) {
      // If search term provided, use text search
      const searchRegex = new RegExp(search, "i");
      const searchQuery = {
        $or: [
          { userName: searchRegex },
          { userEmail: searchRegex },
          { description: searchRegex },
          { resourceName: searchRegex },
          { targetUserName: searchRegex },
        ],
      };

      // Combine search with filters
      const combinedQuery = filters
        ? { $and: [searchQuery, filters] }
        : searchQuery;

      const skip = (options.page - 1) * options.limit;
      const sort = { [options.sortBy]: options.sortOrder };

      const [logs, total] = await Promise.all([
        AuditLog.find(combinedQuery)
          .populate("userId", "name email role")
          .populate("targetUserId", "name email")
          .populate("metadata.branchId", "name")
          .sort(sort)
          .skip(skip)
          .limit(options.limit)
          .lean(),
        AuditLog.countDocuments(combinedQuery),
      ]);

      result = {
        logs,
        pagination: {
          currentPage: options.page,
          totalPages: Math.ceil(total / options.limit),
          totalItems: total,
          itemsPerPage: options.limit,
          hasNextPage: options.page < Math.ceil(total / options.limit),
          hasPreviousPage: options.page > 1,
        },
      };
    } else {
      result = await AuditLog.getAuditLogs(filters, options);
    }

    // Log this audit view action
    await AuditLogger.logSystemEvent(
      req.user,
      "AUDIT_LOGS_VIEWED",
      `Viewed audit logs (page ${page}, filters: ${JSON.stringify(filters)})`,
      req,
      "LOW"
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch audit logs",
      error: error.message,
    });
  }
});

// Get audit logs summary/dashboard data
router.get("/summary", protect, requireSuperAdmin, async (req, res) => {
  try {
    const { timeRange = 30 } = req.query;

    const summary = await AuditLogger.getAuditLogsSummary(parseInt(timeRange));

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error("Error fetching audit summary:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch audit summary",
      error: error.message,
    });
  }
});

// Get specific user's activity
router.get("/user/:userId", protect, requireSuperAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { timeRange = 30 } = req.query;

    const activity = await AuditLogger.getUserActivity(
      userId,
      parseInt(timeRange)
    );

    // Log this user activity view
    await AuditLogger.logSystemEvent(
      req.user,
      "USER_ACTIVITY_VIEWED",
      `Viewed activity for user ${userId}`,
      req,
      "LOW"
    );

    res.json({
      success: true,
      data: activity,
    });
  } catch (error) {
    console.error("Error fetching user activity:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user activity",
      error: error.message,
    });
  }
});

// Get available filter options (for dropdowns in UI)
router.get("/filters", protect, requireSuperAdmin, async (req, res) => {
  try {
    const [actions, resourceTypes, categories, severities] = await Promise.all([
      AuditLog.distinct("action"),
      AuditLog.distinct("resourceType"),
      AuditLog.distinct("metadata.category"),
      AuditLog.distinct("metadata.severity"),
    ]);

    res.json({
      success: true,
      data: {
        actions: actions.sort(),
        resourceTypes: resourceTypes.sort(),
        categories: categories.sort(),
        severities: severities.sort(),
      },
    });
  } catch (error) {
    console.error("Error fetching filter options:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch filter options",
      error: error.message,
    });
  }
});

// Export audit logs (CSV format)
router.get("/export", protect, requireSuperAdmin, async (req, res) => {
  try {
    const { startDate, endDate, format = "csv", limit = 10000 } = req.query;

    // Validate limit to prevent excessive resource usage
    const exportLimit = Math.min(
      parseInt(limit) || 10000,
      MAX_AUDIT_LOG_EXPORT_LIMIT
    );

    // Build date filter
    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.timestamp = {};
      if (startDate) dateFilter.timestamp.$gte = new Date(startDate);
      if (endDate) dateFilter.timestamp.$lte = new Date(endDate);
    }

    // Get total count for large dataset warning
    const totalCount = await AuditLog.countDocuments(dateFilter);

    if (totalCount > exportLimit) {
      return res.status(400).json({
        success: false,
        message: `Dataset too large. Found ${totalCount} records, but export is limited to ${exportLimit}. Please narrow your date range.`,
        totalRecords: totalCount,
        maxExportLimit: exportLimit,
      });
    }

    const logs = await AuditLog.find(dateFilter)
      .populate("userId", "name email")
      .populate("targetUserId", "name email")
      .sort({ timestamp: -1 })
      .limit(exportLimit)
      .lean();

    if (format === "csv") {
      const csv = logs.map((log) => ({
        timestamp: log.timestamp.toISOString(),
        user: log.userName,
        email: log.userEmail,
        action: log.action,
        resourceType: log.resourceType,
        resourceName: log.resourceName || "",
        targetUser: log.targetUserName || "",
        description: log.description,
        success: log.success,
        severity: log.metadata?.severity || "",
        category: log.metadata?.category || "",
        ipAddress: log.metadata?.ipAddress || "",
      }));

      // Convert to CSV string
      const csvHeader = Object.keys(csv[0]).join(",");
      const csvRows = csv.map((row) =>
        Object.values(row)
          .map((value) => `"${value}"`)
          .join(",")
      );
      const csvContent = [csvHeader, ...csvRows].join("\n");

      // Log export action
      await AuditLogger.logSystemEvent(
        req.user,
        "DATA_EXPORT",
        `Exported ${logs.length} audit log entries`,
        req,
        "HIGH"
      );

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=audit-logs-${
          new Date().toISOString().split("T")[0]
        }.csv`
      );
      res.send(csvContent);
    } else {
      res.json({
        success: true,
        data: logs,
      });
    }
  } catch (error) {
    console.error("Error exporting audit logs:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export audit logs",
      error: error.message,
    });
  }
});

// Get audit statistics
router.get("/stats", protect, requireSuperAdmin, async (req, res) => {
  try {
    const { timeRange = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(timeRange));

    const stats = await AuditLog.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate },
        },
      },
      {
        $facet: {
          // Total counts by category
          byCategory: [
            {
              $group: {
                _id: "$metadata.category",
                count: { $sum: 1 },
                successful: {
                  $sum: { $cond: [{ $eq: ["$success", true] }, 1, 0] },
                },
                failed: {
                  $sum: { $cond: [{ $eq: ["$success", false] }, 1, 0] },
                },
              },
            },
          ],
          // Daily activity
          dailyActivity: [
            {
              $group: {
                _id: {
                  $dateToString: {
                    format: "%Y-%m-%d",
                    date: "$timestamp",
                  },
                },
                count: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ],
          // Top actions
          topActions: [
            {
              $group: {
                _id: "$action",
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1 } },
            { $limit: 10 },
          ],
          // Security events
          securityEvents: [
            {
              $match: {
                $or: [
                  { "metadata.category": "SECURITY" },
                  { "metadata.severity": "CRITICAL" },
                  { success: false },
                ],
              },
            },
            {
              $group: {
                _id: "$action",
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1 } },
          ],
        },
      },
    ]);

    res.json({
      success: true,
      data: stats[0],
    });
  } catch (error) {
    console.error("Error fetching audit stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch audit statistics",
      error: error.message,
    });
  }
});

module.exports = router;
