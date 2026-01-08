// models/AuditLog.js
const mongoose = require("mongoose");

// Constants for audit log configuration
const DEFAULT_AUDIT_LOG_RETENTION_DAYS = 730; // Default 2 years

const auditLogSchema = new mongoose.Schema(
  {
    // Who performed the action
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false, // Made optional to prevent validation errors
    },
    userName: {
      type: String,
      required: true,
    },
    userEmail: {
      type: String,
      required: true,
    },

    // What action was performed
    action: {
      type: String,
      required: true,
      enum: [
        "ROLE_CREATED",
        "ROLE_UPDATED",
        "ROLE_DELETED",
        "ROLE_ASSIGNED",
        "ROLE_REVOKED",
        "PERMISSION_CREATED",
        "PERMISSION_UPDATED",
        "PERMISSION_DELETED",
        "SECURITY_POLICY_UPDATED",
        "USER_LOGIN",
        "USER_LOGOUT",
        "USER_LOGIN_FAILED",
        "USER_CREATED",
        "USER_UPDATED",
        "USER_DELETED",
        "USER_PASSWORD_CHANGED",
        "USER_STATUS_CHANGED",
        "BRANCH_CREATED",
        "BRANCH_UPDATED",
        "BRANCH_DELETED",
        "STUDENT_CREATED",
        "STUDENT_UPDATED",
        "STUDENT_DELETED",
        "TEACHER_CREATED",
        "TEACHER_UPDATED",
        "TEACHER_DELETED",
        "FEE_CREATED",
        "FEE_UPDATED",
        "FEE_DELETED",
        "PAYMENT_CREATED",
        "PAYMENT_UPDATED",
        "EXPENSE_CREATED",
        "EXPENSE_UPDATED",
        "EXPENSE_DELETED",
        "SYSTEM_SETTINGS_CHANGED",
        "DATA_EXPORT",
        "DATA_IMPORT",
        "BACKUP_CREATED",
        "BACKUP_RESTORED",
        "AUDIT_LOGS_VIEWED",
        "SYNC_TOKEN_GENERATED",
        "ENROLLMENT_CREATED",
        "ENROLLMENT_UPDATED",
        "ENROLLMENT_DELETED",
      ],
    },

    // What resource was affected
    resourceType: {
      type: String,
      required: true,
      enum: [
        "ROLE",
        "PERMISSION",
        "USER",
        "USER_ROLE_ASSIGNMENT",
        "SECURITY_POLICY",
        "BRANCH",
        "STUDENT",
        "TEACHER",
        "CLASS",
        "COURSE",
        "FEE",
        "PAYMENT",
        "EXPENSE",
        "ATTENDANCE",
        "SYSTEM_SETTINGS",
        "AUTH_TOKEN",
        "ENROLLMENT",
      ],
    },

    // ID of the affected resource
    resourceId: {
      type: String,
      required: false,
    },

    // Name/identifier of the affected resource
    resourceName: {
      type: String,
      required: false,
    },

    // Target user (for actions affecting other users)
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    targetUserName: {
      type: String,
      required: false,
    },

    // Detailed description of the action
    description: {
      type: String,
      required: true,
    },

    // Before and after values (for updates)
    oldValues: {
      type: mongoose.Schema.Types.Mixed,
      required: false,
    },
    newValues: {
      type: mongoose.Schema.Types.Mixed,
      required: false,
    },

    // Additional metadata
    metadata: {
      ipAddress: String,
      userAgent: String,
      sessionId: String,
      branchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Branch",
      },
      severity: {
        type: String,
        enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
        default: "MEDIUM",
      },
      category: {
        type: String,
        enum: [
          "AUTHENTICATION",
          "AUTHORIZATION",
          "DATA_CHANGE",
          "SYSTEM",
          "SECURITY",
        ],
        required: true,
      },
    },

    // Success or failure
    success: {
      type: Boolean,
      default: true,
    },

    // Error details if action failed
    errorMessage: {
      type: String,
      required: false,
    },

    // Timestamp
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    // Add indexes for better query performance
    indexes: [
      { userId: 1, timestamp: -1 },
      { action: 1, timestamp: -1 },
      { resourceType: 1, timestamp: -1 },
      { "metadata.category": 1, timestamp: -1 },
      { timestamp: -1 },
      { success: 1, timestamp: -1 },
    ],
  }
);

// Add a compound index for efficient filtering
auditLogSchema.index({
  timestamp: -1,
  "metadata.category": 1,
  action: 1,
  userId: 1,
});

// Add a TTL index for automatic cleanup (configurable via env variable, defaults to 2 years)
const auditLogRetentionDays =
  parseInt(process.env.AUDIT_LOG_RETENTION_DAYS) ||
  DEFAULT_AUDIT_LOG_RETENTION_DAYS;
const auditLogTTL = auditLogRetentionDays * 24 * 60 * 60; // Convert days to seconds
auditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: auditLogTTL });

// Instance method to get formatted log entry
auditLogSchema.methods.getFormattedEntry = function () {
  return {
    id: this._id,
    user: `${this.userName} (${this.userEmail})`,
    action: this.action.replace(/_/g, " ").toLowerCase(),
    resource: this.resourceType.toLowerCase(),
    resourceName: this.resourceName,
    description: this.description,
    timestamp: this.timestamp,
    success: this.success,
    severity: this.metadata?.severity || "MEDIUM",
    category: this.metadata?.category,
    ipAddress: this.metadata?.ipAddress,
  };
};

// Static method to create audit log entry
auditLogSchema.statics.createEntry = async function (logData) {
  try {
    const auditLog = new this(logData);
    await auditLog.save();
    return auditLog;
  } catch (error) {
    console.error("Failed to create audit log entry:", error);
    // Don't throw error to prevent breaking the main operation
    return null;
  }
};

// Static method to get audit logs with filtering
auditLogSchema.statics.getAuditLogs = async function (
  filters = {},
  options = {}
) {
  const {
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
  } = filters;

  const {
    page = 1,
    limit = 50,
    sortBy = "timestamp",
    sortOrder = -1,
  } = options;

  // Build query
  const query = {};

  if (userId) query.userId = userId;
  if (action) query.action = action;
  if (resourceType) query.resourceType = resourceType;
  if (category) query["metadata.category"] = category;
  if (severity) query["metadata.severity"] = severity;
  if (success !== undefined) query.success = success;
  if (targetUserId) query.targetUserId = targetUserId;
  if (branchId) query["metadata.branchId"] = branchId;

  // Date range filter
  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) query.timestamp.$gte = new Date(startDate);
    if (endDate) query.timestamp.$lte = new Date(endDate);
  }

  // Execute query with pagination
  const skip = (page - 1) * limit;
  const sort = { [sortBy]: sortOrder };

  const [logs, total] = await Promise.all([
    this.find(query)
      .populate("userId", "name email role")
      .populate("targetUserId", "name email")
      .populate("metadata.branchId", "name")
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    this.countDocuments(query),
  ]);

  return {
    logs,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      itemsPerPage: limit,
      hasNextPage: page < Math.ceil(total / limit),
      hasPreviousPage: page > 1,
    },
  };
};

module.exports = mongoose.model("AuditLog", auditLogSchema);
