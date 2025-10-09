// utils/auditLogger.js
const AuditLog = require("../models/AuditLog");

class AuditLogger {
  /**
   * Create an audit log entry
   * @param {Object} params - Audit log parameters
   * @param {Object} params.user - User performing the action
   * @param {string} params.action - Action being performed
   * @param {string} params.resourceType - Type of resource being affected
   * @param {string} params.resourceId - ID of the affected resource
   * @param {string} params.resourceName - Name/identifier of the affected resource
   * @param {string} params.description - Description of the action
   * @param {Object} params.oldValues - Previous values (for updates)
   * @param {Object} params.newValues - New values (for updates)
   * @param {Object} params.targetUser - Target user (for user-related actions)
   * @param {Object} params.req - Express request object
   * @param {boolean} params.success - Whether the action was successful
   * @param {string} params.errorMessage - Error message if action failed
   * @param {string} params.severity - Severity level
   * @param {string} params.category - Category of the action
   */
  static async log({
    user,
    action,
    resourceType,
    resourceId,
    resourceName,
    description,
    oldValues,
    newValues,
    targetUser,
    req,
    success = true,
    errorMessage,
    severity = "MEDIUM",
    category,
  }) {
    try {
      const logData = {
        userId: user._id || user.id,
        userName: user.name || `${user.firstName} ${user.lastName}`.trim(),
        userEmail: user.email,
        action,
        resourceType,
        resourceId,
        resourceName,
        description,
        oldValues,
        newValues,
        success,
        errorMessage,
        metadata: {
          severity,
          category,
          ipAddress: req?.ip || req?.connection?.remoteAddress,
          userAgent: req?.get("User-Agent"),
          sessionId: req?.sessionID,
          branchId: user.branchId || req?.body?.branchId,
        },
      };

      // Add target user info if provided
      if (targetUser) {
        logData.targetUserId = targetUser._id || targetUser.id;
        logData.targetUserName =
          targetUser.name ||
          `${targetUser.firstName} ${targetUser.lastName}`.trim();
      }

      return await AuditLog.createEntry(logData);
    } catch (error) {
      console.error("Failed to create audit log:", error);
      return null;
    }
  }

  // Convenience methods for different types of actions

  static async logRoleAction(
    user,
    action,
    role,
    req,
    oldValues = null,
    newValues = null
  ) {
    return this.log({
      user,
      action,
      resourceType: "ROLE",
      resourceId: role._id,
      resourceName: role.displayName || role.name,
      description: `${action.replace(/_/g, " ").toLowerCase()} role: ${
        role.displayName || role.name
      }`,
      oldValues,
      newValues,
      req,
      severity: action === "ROLE_DELETED" ? "HIGH" : "MEDIUM",
      category: "AUTHORIZATION",
    });
  }

  static async logUserRoleAssignment(user, action, targetUser, roles, req) {
    const roleNames = roles.map((r) => r.displayName || r.name).join(", ");
    return this.log({
      user,
      action,
      resourceType: "USER_ROLE_ASSIGNMENT",
      resourceName: roleNames,
      description: `${action
        .replace(/_/g, " ")
        .toLowerCase()} roles (${roleNames}) for user ${targetUser.name}`,
      targetUser,
      req,
      severity: "HIGH",
      category: "AUTHORIZATION",
    });
  }

  static async logSecurityPolicyChange(user, oldPolicy, newPolicy, req) {
    return this.log({
      user,
      action: "SECURITY_POLICY_UPDATED",
      resourceType: "SECURITY_POLICY",
      resourceName: "System Security Policy",
      description: "Updated system security policy",
      oldValues: oldPolicy,
      newValues: newPolicy,
      req,
      severity: "CRITICAL",
      category: "SECURITY",
    });
  }

  static async logAuthenticationEvent(
    user,
    action,
    req,
    success = true,
    errorMessage = null
  ) {
    return this.log({
      user: user || {
        _id: null,
        name: "Unknown",
        email: req?.body?.email || "unknown",
      },
      action,
      resourceType: "USER",
      resourceId: user?._id,
      resourceName: user?.email || req?.body?.email,
      description: `${action.replace(/_/g, " ").toLowerCase()}${
        success ? "" : " failed"
      }`,
      req,
      success,
      errorMessage,
      severity: success ? "LOW" : "HIGH",
      category: "AUTHENTICATION",
    });
  }

  static async logDataChange(
    user,
    action,
    resourceType,
    resource,
    req,
    oldValues = null,
    newValues = null
  ) {
    return this.log({
      user,
      action,
      resourceType,
      resourceId: resource._id,
      resourceName:
        resource.name || resource.title || resource.email || resource._id,
      description: `${action
        .replace(/_/g, " ")
        .toLowerCase()} ${resourceType.toLowerCase()}: ${
        resource.name || resource.title || resource.email
      }`,
      oldValues,
      newValues,
      req,
      severity: action.includes("DELETE") ? "HIGH" : "MEDIUM",
      category: "DATA_CHANGE",
    });
  }

  static async logSystemEvent(
    user,
    action,
    description,
    req,
    severity = "MEDIUM"
  ) {
    return this.log({
      user,
      action,
      resourceType: "SYSTEM_SETTINGS",
      description,
      req,
      severity,
      category: "SYSTEM",
    });
  }

  // Query methods

  static async getAuditLogs(filters, options) {
    return await AuditLog.getAuditLogs(filters, options);
  }

  static async getAuditLogsSummary(timeRange = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - timeRange);

    const pipeline = [
      {
        $match: {
          timestamp: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            category: "$metadata.category",
            success: "$success",
          },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: "$_id.category",
          successful: {
            $sum: {
              $cond: [{ $eq: ["$_id.success", true] }, "$count", 0],
            },
          },
          failed: {
            $sum: {
              $cond: [{ $eq: ["$_id.success", false] }, "$count", 0],
            },
          },
          total: { $sum: "$count" },
        },
      },
    ];

    const results = await AuditLog.aggregate(pipeline);

    // Also get top users and recent critical events
    const [topUsers, criticalEvents] = await Promise.all([
      AuditLog.aggregate([
        { $match: { timestamp: { $gte: startDate } } },
        {
          $group: {
            _id: "$userId",
            userName: { $first: "$userName" },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      AuditLog.find({
        timestamp: { $gte: startDate },
        "metadata.severity": "CRITICAL",
      })
        .sort({ timestamp: -1 })
        .limit(10)
        .lean(),
    ]);

    return {
      summary: results,
      topUsers,
      criticalEvents,
      timeRange,
    };
  }

  static async getUserActivity(userId, timeRange = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - timeRange);

    return await AuditLog.find({
      userId,
      timestamp: { $gte: startDate },
    })
      .sort({ timestamp: -1 })
      .limit(100)
      .lean();
  }
}

module.exports = AuditLogger;
