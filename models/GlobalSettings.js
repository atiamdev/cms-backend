// models/GlobalSettings.js
const mongoose = require("mongoose");

const GlobalSettingsSchema = new mongoose.Schema(
  {
    schoolInformation: {
      name: { type: String, required: true, default: "ATIAM Academy" },
      address: String,
      phone: String,
      email: String,
      website: String,
      logo: String,
      favicon: String,
      primaryColor: { type: String, default: "#3B82F6" },
      secondaryColor: { type: String, default: "#10B981" },
      theme: {
        type: String,
        enum: ["light", "dark", "auto"],
        default: "light",
      },
    },

    academicCalendar: {
      academicYearStart: Date,
      academicYearEnd: Date,
      termDates: [
        {
          id: String,
          name: String,
          startDate: Date,
          endDate: Date,
          type: { type: String, enum: ["term", "semester"] },
        },
      ],
      holidays: [
        {
          id: String,
          name: String,
          date: Date,
          description: String,
        },
      ],
    },

    contactInformation: {
      principalName: String,
      principalPhone: String,
      principalEmail: String,
      adminContacts: [
        {
          id: String,
          name: String,
          role: String,
          phone: String,
          email: String,
        },
      ],
      emergencyNumbers: [
        {
          id: String,
          type: String,
          number: String,
          description: String,
        },
      ],
    },

    financialSettings: {
      currency: { type: String, default: "KES" },
      currencySymbol: { type: String, default: "KSh" },
      decimalPlaces: { type: Number, default: 2 },
      taxRate: { type: Number, default: 0 },
      lateFee: { type: Number, default: 0 },
      discountThreshold: { type: Number, default: 0 },
      autoCalculateFees: { type: Boolean, default: false },
      defaultCurrency: { type: String, default: "KES" },
      exchangeRates: [
        {
          currency: String,
          rate: Number,
          lastUpdated: Date,
        },
      ],
      feeCategories: [
        {
          id: String,
          name: String,
          description: String,
          type: { type: String, enum: ["mandatory", "optional"] },
          defaultAmount: Number,
        },
      ],
      paymentMethods: [
        {
          id: String,
          name: String,
          enabled: { type: Boolean, default: true },
          processingFee: Number,
          settings: mongoose.Schema.Types.Mixed,
        },
      ],
      latePaymentSettings: {
        gracePeriodDays: { type: Number, default: 7 },
        penaltyRate: { type: Number, default: 5 },
        interestRate: { type: Number, default: 2 },
        maxPenaltyAmount: Number,
      },
      financialYear: {
        startMonth: { type: Number, default: 1 },
        startDay: { type: Number, default: 1 },
        endMonth: { type: Number, default: 12 },
        endDay: { type: Number, default: 31 },
      },
    },

    academicConfiguration: {
      academicYearStart: { type: String, default: "2024-01-01" },
      academicYearEnd: { type: String, default: "2024-12-31" },
      semestersPerYear: { type: Number, default: 2 },
      minimumAttendance: { type: Number, default: 75 },
      gradingScale: { type: String, default: "percentage" },
      passingGrade: { type: Number, default: 50 },
      gradeLevels: [
        {
          level: String,
          description: String,
        },
      ],
      gradingSystem: {
        type: {
          type: String,
          enum: ["percentage", "gpa", "letter"],
          default: "percentage",
        },
        passMarks: { type: Number, default: 50 },
        gradeRanges: [
          {
            grade: String,
            minScore: Number,
            maxScore: Number,
            points: Number,
          },
        ],
        gpaScale: Number,
      },
      classLevels: [
        {
          id: String,
          name: String,
          description: String,
          minAge: Number,
          maxAge: Number,
          order: Number,
        },
      ],
      subjectCategories: [
        {
          id: String,
          name: String,
          type: { type: String, enum: ["core", "elective", "extracurricular"] },
          required: Boolean,
          maxSubjects: Number,
        },
      ],
      examTypes: [
        {
          id: String,
          name: String,
          weight: Number,
          frequency: { type: String, enum: ["once", "multiple"] },
          description: String,
        },
      ],
      reportCardTemplates: [
        {
          id: String,
          name: String,
          template: String,
          isDefault: Boolean,
        },
      ],
    },

    userRoleSettings: {
      passwordPolicy: {
        minLength: { type: Number, default: 8 },
        requireUppercase: { type: Boolean, default: true },
        requireNumbers: { type: Boolean, default: true },
        requireSpecialChars: { type: Boolean, default: false },
        expiryDays: { type: Number, default: 90 },
        maxAttempts: { type: Number, default: 5 },
        lockoutDuration: { type: Number, default: 30 },
      },
      rolePermissions: {
        type: mongoose.Schema.Types.Mixed,
        default: {
          admin: {
            manageUsers: true,
            manageStudents: true,
            manageFees: true,
            viewReports: true,
          },
          teacher: {
            manageClasses: true,
            viewStudents: true,
            manageAttendance: true,
          },
          secretary: {
            manageStudents: true,
            manageFees: true,
            viewReports: true,
          },
          student: {
            viewProfile: true,
            viewFees: true,
            viewAttendance: true,
          },
        },
      },
      allowSelfRegistration: { type: Boolean, default: false },
      requireEmailVerification: { type: Boolean, default: true },
      requireAdminApproval: { type: Boolean, default: true },
      defaultRole: { type: String, default: "student" },
      defaultRoles: [
        {
          role: String,
          permissions: [String],
          description: String,
        },
      ],
      passwordPolicies: {
        minLength: { type: Number, default: 8 },
        requireUppercase: { type: Boolean, default: true },
        requireLowercase: { type: Boolean, default: true },
        requireNumbers: { type: Boolean, default: true },
        requireSymbols: { type: Boolean, default: false },
        expiryDays: Number,
        preventReuse: Number,
      },
      userRegistration: {
        autoApproval: { type: Boolean, default: false },
        requiredFields: [String],
        emailVerification: { type: Boolean, default: true },
        defaultRole: { type: String, default: "student" },
      },
      sessionManagement: {
        timeoutMinutes: { type: Number, default: 60 },
        maxConcurrentSessions: { type: Number, default: 3 },
        rememberMeDays: { type: Number, default: 30 },
      },
    },

    communicationSettings: {
      emailConfig: {
        smtpHost: { type: String, default: "" },
        smtpPort: { type: Number, default: 587 },
        username: { type: String, default: "" },
        password: { type: String, default: "" },
        fromName: { type: String, default: "ATIAM College" },
        useTLS: { type: Boolean, default: true },
      },
      smsConfig: {
        provider: { type: String, default: "" },
        apiKey: { type: String, default: "" },
        senderId: { type: String, default: "" },
        enabled: { type: Boolean, default: false },
      },
      enableEmailNotifications: { type: Boolean, default: true },
      enableSmsNotifications: { type: Boolean, default: false },
      enablePushNotifications: { type: Boolean, default: false },
      emailConfiguration: {
        smtpHost: String,
        smtpPort: { type: Number, default: 587 },
        smtpUsername: String,
        smtpPassword: String,
        encryption: {
          type: String,
          enum: ["tls", "ssl", "none"],
          default: "tls",
        },
        fromEmail: String,
        fromName: String,
        templates: [
          {
            id: String,
            name: String,
            subject: String,
            body: String,
            type: String,
          },
        ],
      },
      smsSettings: {
        gateway: String,
        apiKey: String,
        senderId: String,
        enabled: { type: Boolean, default: false },
        templates: [
          {
            id: String,
            name: String,
            message: String,
            type: String,
          },
        ],
      },
      notificationPreferences: {
        events: [
          {
            event: String,
            description: String,
            enabled: Boolean,
            channels: [{ type: String, enum: ["email", "sms", "push"] }],
          },
        ],
        defaultChannels: [{ type: String, enum: ["email", "sms", "push"] }],
      },
      announcementSettings: {
        defaultRecipients: [String],
        requireApproval: { type: Boolean, default: true },
        approvers: [String],
        autoPublish: { type: Boolean, default: false },
      },
    },

    integrationSettings: {
      paymentGateway: {
        provider: { type: String, default: "" },
        mode: { type: String, default: "sandbox" },
        publicKey: { type: String, default: "" },
        secretKey: { type: String, default: "" },
        enabled: { type: Boolean, default: false },
      },
      googleAnalytics: {
        trackingId: { type: String, default: "" },
        enabled: { type: Boolean, default: false },
      },
      apiSettings: {
        enabled: { type: Boolean, default: true },
        rateLimit: { type: Number, default: 1000 },
        allowedOrigins: [String],
        apiKeys: [
          {
            id: String,
            name: String,
            key: String,
            permissions: [String],
            expiresAt: Date,
          },
        ],
      },
      thirdPartyServices: [
        {
          service: String,
          enabled: { type: Boolean, default: false },
          apiKey: String,
          settings: mongoose.Schema.Types.Mixed,
        },
      ],
      exportFormats: [
        {
          format: String,
          enabled: { type: Boolean, default: true },
          settings: mongoose.Schema.Types.Mixed,
        },
      ],
      mobileAppSettings: {
        pushNotifications: { type: Boolean, default: true },
        appVersion: { type: String, default: "1.0.0" },
        forceUpdate: { type: Boolean, default: false },
        maintenanceMode: { type: Boolean, default: false },
      },
    },

    emergencyCompliance: {
      emergencyContacts: [
        {
          name: { type: String, default: "" },
          phone: { type: String, default: "" },
          email: { type: String, default: "" },
          role: { type: String, default: "" },
        },
      ],
      privacyPolicyUrl: { type: String, default: "" },
      termsOfServiceUrl: { type: String, default: "" },
      dataRetentionDays: { type: Number, default: 365 },
      gdprCompliant: { type: Boolean, default: false },
      coppaCompliant: { type: Boolean, default: false },
      ferpaCompliant: { type: Boolean, default: false },
      backupFrequency: { type: String, default: "daily" },
      backupRetentionDays: { type: Number, default: 30 },
      autoBackup: { type: Boolean, default: true },
      maintenanceMode: {
        enabled: { type: Boolean, default: false },
        message: {
          type: String,
          default: "System under maintenance. Please check back later.",
        },
        startTime: Date,
        endTime: Date,
        allowedRoles: [String],
      },
      dataExportSettings: {
        allowStudentExport: { type: Boolean, default: false },
        exportFormats: [String],
        retentionDays: { type: Number, default: 90 },
        requireApproval: { type: Boolean, default: true },
      },
    },

    lastUpdated: { type: Date, default: Date.now },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  {
    timestamps: true,
  }
);

// Ensure only one settings document exists
GlobalSettingsSchema.index({}, { unique: true });

module.exports = mongoose.model("GlobalSettings", GlobalSettingsSchema);
