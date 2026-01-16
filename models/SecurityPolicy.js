// cms-backend/models/SecurityPolicy.js
const mongoose = require("mongoose");

const securityPolicySchema = new mongoose.Schema(
  {
    // There should only be one security policy document
    _id: {
      type: String,
      default: "security-policy",
    },
    passwordPolicy: {
      minLength: {
        type: Number,
        default: 8,
        min: 6,
        max: 128,
      },
      requireUppercase: {
        type: Boolean,
        default: true,
      },
      requireLowercase: {
        type: Boolean,
        default: true,
      },
      requireNumbers: {
        type: Boolean,
        default: true,
      },
      requireSpecialChars: {
        type: Boolean,
        default: false,
      },
      passwordHistory: {
        type: Number,
        default: 3,
        min: 0,
        max: 10,
      },
      maxAge: {
        type: Number,
        default: 0, // 0 = never expires
        min: 0,
      },
    },
    sessionPolicy: {
      maxSessionDuration: {
        type: Number,
        default: 480, // 8 hours in minutes
        min: 30,
      },
      idleTimeout: {
        type: Number,
        default: 60, // 1 hour in minutes
        min: 10,
      },
      maxConcurrentSessions: {
        type: Number,
        default: 3,
        min: 1,
      },
      requireReauth: {
        type: Boolean,
        default: false,
      },
    },
    loginPolicy: {
      maxFailedAttempts: {
        type: Number,
        default: 5,
        min: 3,
      },
      lockoutDuration: {
        type: Number,
        default: 30, // 30 minutes
        min: 5,
      },
      allowedIpRanges: [
        {
          type: String,
        },
      ],
      requireTwoFactor: {
        type: Boolean,
        default: false,
      },
      allowedLoginHours: {
        enabled: {
          type: Boolean,
          default: false,
        },
        start: {
          type: String,
          default: "00:00",
        },
        end: {
          type: String,
          default: "23:59",
        },
        timezone: {
          type: String,
          default: "UTC",
        },
      },
    },
    apiSecurity: {
      rateLimiting: {
        enabled: {
          type: Boolean,
          default: true,
        },
        requestsPerMinute: {
          type: Number,
          default: 100,
        },
        requestsPerHour: {
          type: Number,
          default: 1000,
        },
      },
      corsPolicy: {
        allowedOrigins: [
          {
            type: String,
            default: "*",
          },
        ],
        allowCredentials: {
          type: Boolean,
          default: true,
        },
      },
      apiKeys: {
        enabled: {
          type: Boolean,
          default: false,
        },
        expirationDays: {
          type: Number,
          default: 90,
        },
        allowedIps: [
          {
            type: String,
          },
        ],
      },
    },
    dataProtection: {
      encryptionEnabled: {
        type: Boolean,
        default: true,
      },
      dataRetentionDays: {
        type: Number,
        default: 2555, // ~7 years
        min: 30,
      },
      autoLogout: {
        type: Boolean,
        default: true,
      },
      screenLockTimeout: {
        type: Number,
        default: 15, // 15 minutes
        min: 5,
      },
      allowDataExport: {
        type: Boolean,
        default: true,
      },
      requireApprovalForExport: {
        type: Boolean,
        default: true,
      },
    },
    auditSettings: {
      enabled: {
        type: Boolean,
        default: true,
      },
      logLevel: {
        type: String,
        enum: ["minimal", "standard", "comprehensive"],
        default: "standard",
      },
      retentionDays: {
        type: Number,
        default: 365,
        min: 30,
      },
      realTimeAlerts: {
        type: Boolean,
        default: false,
      },
      alertEmail: {
        type: String,
        default: "",
      },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("SecurityPolicy", securityPolicySchema);
