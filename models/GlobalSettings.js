// models/GlobalSettings.js
const mongoose = require("mongoose");

const GlobalSettingsSchema = new mongoose.Schema(
  {
    // School Information - Core branding and contact details
    schoolInformation: {
      name: { type: String, required: true, default: "ATIAM College" },
      address: { type: String, default: "" },
      phone: { type: String, default: "" },
      email: { type: String, default: "" },
      website: { type: String, default: "" },
      logo: { type: String, default: "" },
      favicon: { type: String, default: "" },
      primaryColor: { type: String, default: "#3B82F6" },
      secondaryColor: { type: String, default: "#10B981" },
      theme: {
        type: String,
        enum: ["light", "dark", "auto"],
        default: "light",
      },
      description: { type: String, default: "" },
      mission: { type: String, default: "" },
      vision: { type: String, default: "" },
    },

    // Academic Year - Simple academic year configuration
    academicYear: {
      startDate: { type: String, default: "2024-01-01" },
      endDate: { type: String, default: "2024-12-31" },
      currentYear: { type: String, default: "2024-2025" },
    },

    // Financial Settings - Basic payment configuration
    financialSettings: {
      currency: { type: String, default: "KES" },
      currencySymbol: { type: String, default: "KSh" },
      paymentMethods: [
        {
          id: { type: String, default: "cash" },
          name: { type: String, default: "Cash" },
          enabled: { type: Boolean, default: true },
        },
        {
          id: { type: String, default: "card" },
          name: { type: String, default: "Credit/Debit Card" },
          enabled: { type: Boolean, default: true },
        },
        {
          id: { type: String, default: "mobile" },
          name: { type: String, default: "Mobile Money" },
          enabled: { type: Boolean, default: true },
        },
      ],
      lateFeeEnabled: { type: Boolean, default: true },
      lateFeeAmount: { type: Number, default: 100 },
      dueDateReminder: { type: Boolean, default: true },
      reminderDays: { type: Number, default: 7 },
    },

    // Academic Configuration - Basic grading and attendance
    academicConfiguration: {
      passingGrade: { type: Number, default: 50, min: 0, max: 100 },
      minimumAttendance: { type: Number, default: 75, min: 0, max: 100 },
      gradingScale: {
        type: {
          type: String,
          enum: ["percentage", "gpa"],
          default: "percentage",
        },
        gpaScale: { type: Number, default: 4.0 },
      },
      gradeBoundaries: [
        {
          grade: { type: String, required: true },
          minScore: { type: Number, required: true },
          maxScore: { type: Number, required: true },
          points: { type: Number, required: true },
        },
      ],
    },

    // Contact Information - Key contacts
    contactInformation: {
      principalName: { type: String, default: "" },
      principalEmail: { type: String, default: "" },
      principalPhone: { type: String, default: "" },
      admissionsEmail: { type: String, default: "" },
      admissionsPhone: { type: String, default: "" },
      supportEmail: { type: String, default: "" },
      supportPhone: { type: String, default: "" },
    },

    // System Settings - Basic system configuration
    systemSettings: {
      maintenanceMode: {
        enabled: { type: Boolean, default: false },
        message: {
          type: String,
          default:
            "System is currently under maintenance. Please check back later.",
        },
      },
      allowRegistration: { type: Boolean, default: false },
      requireEmailVerification: { type: Boolean, default: true },
      sessionTimeout: { type: Number, default: 60 }, // minutes
      maxLoginAttempts: { type: Number, default: 5 },
      passwordMinLength: { type: Number, default: 8 },
    },

    // Notification Settings - Simple notification preferences
    notificationSettings: {
      emailNotifications: { type: Boolean, default: true },
      smsNotifications: { type: Boolean, default: false },
      feeReminders: { type: Boolean, default: true },
      examReminders: { type: Boolean, default: true },
      attendanceAlerts: { type: Boolean, default: true },
      systemUpdates: { type: Boolean, default: true },
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

// Pre-save middleware to update lastUpdated and initialize defaults
GlobalSettingsSchema.pre("save", function (next) {
  this.lastUpdated = new Date();

  // Initialize gradeBoundaries with defaults if empty
  if (
    !this.academicConfiguration ||
    !this.academicConfiguration.gradeBoundaries ||
    this.academicConfiguration.gradeBoundaries.length === 0
  ) {
    this.academicConfiguration = this.academicConfiguration || {};
    this.academicConfiguration.gradeBoundaries = [
      { grade: "A", minScore: 90, maxScore: 100, points: 4.0 },
      { grade: "B", minScore: 80, maxScore: 89, points: 3.0 },
      { grade: "C", minScore: 70, maxScore: 79, points: 2.0 },
      { grade: "D", minScore: 60, maxScore: 69, points: 1.0 },
      { grade: "F", minScore: 0, maxScore: 59, points: 0.0 },
    ];
  }

  next();
});

module.exports = mongoose.model("GlobalSettings", GlobalSettingsSchema);
