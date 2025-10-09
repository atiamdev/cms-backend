// controllers/globalSettingsController.js
const GlobalSettings = require("../models/GlobalSettings");

// Get all global settings
const getGlobalSettings = async (req, res) => {
  try {
    let settings = await GlobalSettings.findOne();

    // If no settings exist, create default settings
    if (!settings) {
      settings = new GlobalSettings({
        schoolInformation: {
          name: "ATIAM College",
          address: "",
          phone: "",
          email: "",
          website: "",
          primaryColor: "#3B82F6",
          secondaryColor: "#10B981",
          theme: "light",
        },
        academicCalendar: {
          academicYearStart: new Date().getFullYear() + "-01-01",
          academicYearEnd: new Date().getFullYear() + "-12-31",
          termDates: [],
          holidays: [],
        },
        contactInformation: {
          principalName: "",
          principalPhone: "",
          principalEmail: "",
          adminContacts: [],
          emergencyNumbers: [],
        },
        financialSettings: {
          defaultCurrency: "KES",
          exchangeRates: [],
          feeCategories: [],
          paymentMethods: [
            { id: "cash", name: "Cash", enabled: true },
            { id: "card", name: "Credit/Debit Card", enabled: true },
            { id: "mobile", name: "Mobile Money", enabled: true },
          ],
          latePaymentSettings: {
            gracePeriodDays: 7,
            penaltyRate: 5,
            interestRate: 2,
          },
          financialYear: {
            startMonth: 1,
            startDay: 1,
            endMonth: 12,
            endDay: 31,
          },
        },
        academicConfiguration: {
          gradingSystem: {
            type: "percentage",
            passMarks: 50,
            gradeRanges: [
              { grade: "A", minScore: 90, maxScore: 100, points: 4.0 },
              { grade: "B", minScore: 80, maxScore: 89, points: 3.0 },
              { grade: "C", minScore: 70, maxScore: 79, points: 2.0 },
              { grade: "D", minScore: 60, maxScore: 69, points: 1.0 },
              { grade: "F", minScore: 0, maxScore: 59, points: 0.0 },
            ],
            gpaScale: 4.0,
          },
          classLevels: [],
          subjectCategories: [],
          examTypes: [],
          reportCardTemplates: [],
        },
        userRoleSettings: {
          defaultRoles: [
            {
              role: "student",
              permissions: ["view_own_data", "update_profile"],
              description: "Student with limited access",
            },
            {
              role: "teacher",
              permissions: [
                "manage_classes",
                "view_students",
                "record_attendance",
              ],
              description: "Teacher with classroom management access",
            },
            {
              role: "admin",
              permissions: ["manage_branch", "manage_users", "view_reports"],
              description: "Branch administrator",
            },
            {
              role: "superadmin",
              permissions: ["full_access"],
              description: "System administrator with full access",
            },
          ],
          passwordPolicies: {
            minLength: 8,
            requireUppercase: true,
            requireLowercase: true,
            requireNumbers: true,
            requireSymbols: false,
            expiryDays: 90,
            preventReuse: 5,
          },
          userRegistration: {
            autoApproval: false,
            requiredFields: ["name", "email", "phone"],
            emailVerification: true,
            defaultRole: "student",
          },
          sessionManagement: {
            timeoutMinutes: 60,
            maxConcurrentSessions: 3,
            rememberMeDays: 30,
          },
        },
        communicationSettings: {
          emailConfiguration: {
            smtpHost: "",
            smtpPort: 587,
            smtpUsername: "",
            smtpPassword: "",
            encryption: "tls",
            fromEmail: "",
            fromName: "",
            templates: [],
          },
          smsSettings: {
            gateway: "",
            apiKey: "",
            senderId: "",
            enabled: false,
            templates: [],
          },
          notificationPreferences: {
            events: [
              {
                event: "student_enrolled",
                description: "Student enrollment",
                enabled: true,
                channels: ["email"],
              },
              {
                event: "fee_payment",
                description: "Fee payment received",
                enabled: true,
                channels: ["email", "sms"],
              },
              {
                event: "attendance_marked",
                description: "Attendance marked",
                enabled: false,
                channels: ["email"],
              },
            ],
            defaultChannels: ["email"],
          },
          announcementSettings: {
            defaultRecipients: ["all_users"],
            requireApproval: true,
            approvers: [],
            autoPublish: false,
          },
        },
        integrationSettings: {
          thirdPartyServices: [
            { service: "google_classroom", enabled: false },
            { service: "zoom", enabled: false },
            { service: "microsoft_teams", enabled: false },
          ],
          apiSettings: {
            enabled: true,
            rateLimit: 1000,
            allowedOrigins: ["localhost"],
            apiKeys: [],
          },
          exportFormats: [
            { format: "pdf", enabled: true },
            { format: "excel", enabled: true },
            { format: "csv", enabled: true },
          ],
          mobileAppSettings: {
            pushNotifications: true,
            appVersion: "1.0.0",
            forceUpdate: false,
            maintenanceMode: false,
          },
        },
        emergencyCompliance: {
          emergencyContacts: [],
          maintenanceMode: {
            enabled: false,
            message: "System under maintenance. Please check back later.",
            allowedRoles: ["superadmin"],
          },
          dataExportSettings: {
            allowStudentExport: false,
            exportFormats: ["pdf", "csv"],
            retentionDays: 90,
            requireApproval: true,
          },
        },
      });

      await settings.save();
    }

    res.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error("Error getting global settings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get global settings",
      error: error.message,
    });
  }
};

// Update school information
const updateSchoolInformation = async (req, res) => {
  try {
    const settings = await GlobalSettings.findOneAndUpdate(
      {},
      {
        $set: {
          schoolInformation: req.body,
          lastUpdated: new Date(),
          updatedBy: req.user.id,
        },
      },
      { new: true, upsert: true }
    );

    res.json({
      success: true,
      data: settings.schoolInformation,
    });
  } catch (error) {
    console.error("Error updating school information:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update school information",
      error: error.message,
    });
  }
};

// Update academic calendar
const updateAcademicCalendar = async (req, res) => {
  try {
    const settings = await GlobalSettings.findOneAndUpdate(
      {},
      {
        $set: {
          academicCalendar: req.body,
          lastUpdated: new Date(),
          updatedBy: req.user.id,
        },
      },
      { new: true, upsert: true }
    );

    res.json({
      success: true,
      data: settings.academicCalendar,
    });
  } catch (error) {
    console.error("Error updating academic calendar:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update academic calendar",
      error: error.message,
    });
  }
};

// Update contact information
const updateContactInformation = async (req, res) => {
  try {
    const settings = await GlobalSettings.findOneAndUpdate(
      {},
      {
        $set: {
          contactInformation: req.body,
          lastUpdated: new Date(),
          updatedBy: req.user.id,
        },
      },
      { new: true, upsert: true }
    );

    res.json({
      success: true,
      data: settings.contactInformation,
    });
  } catch (error) {
    console.error("Error updating contact information:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update contact information",
      error: error.message,
    });
  }
};

// Update financial settings
const updateFinancialSettings = async (req, res) => {
  try {
    const settings = await GlobalSettings.findOneAndUpdate(
      {},
      {
        $set: {
          financialSettings: req.body,
          lastUpdated: new Date(),
          updatedBy: req.user.id,
        },
      },
      { new: true, upsert: true }
    );

    res.json({
      success: true,
      data: settings.financialSettings,
    });
  } catch (error) {
    console.error("Error updating financial settings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update financial settings",
      error: error.message,
    });
  }
};

// Update academic configuration
const updateAcademicConfiguration = async (req, res) => {
  try {
    const settings = await GlobalSettings.findOneAndUpdate(
      {},
      {
        $set: {
          academicConfiguration: req.body,
          lastUpdated: new Date(),
          updatedBy: req.user.id,
        },
      },
      { new: true, upsert: true }
    );

    res.json({
      success: true,
      data: settings.academicConfiguration,
    });
  } catch (error) {
    console.error("Error updating academic configuration:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update academic configuration",
      error: error.message,
    });
  }
};

// Update user role settings
const updateUserRoleSettings = async (req, res) => {
  try {
    const settings = await GlobalSettings.findOneAndUpdate(
      {},
      {
        $set: {
          userRoleSettings: req.body,
          lastUpdated: new Date(),
          updatedBy: req.user.id,
        },
      },
      { new: true, upsert: true }
    );

    res.json({
      success: true,
      data: settings.userRoleSettings,
    });
  } catch (error) {
    console.error("Error updating user role settings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update user role settings",
      error: error.message,
    });
  }
};

// Update communication settings
const updateCommunicationSettings = async (req, res) => {
  try {
    const settings = await GlobalSettings.findOneAndUpdate(
      {},
      {
        $set: {
          communicationSettings: req.body,
          lastUpdated: new Date(),
          updatedBy: req.user.id,
        },
      },
      { new: true, upsert: true }
    );

    res.json({
      success: true,
      data: settings.communicationSettings,
    });
  } catch (error) {
    console.error("Error updating communication settings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update communication settings",
      error: error.message,
    });
  }
};

// Update integration settings
const updateIntegrationSettings = async (req, res) => {
  try {
    const settings = await GlobalSettings.findOneAndUpdate(
      {},
      {
        $set: {
          integrationSettings: req.body,
          lastUpdated: new Date(),
          updatedBy: req.user.id,
        },
      },
      { new: true, upsert: true }
    );

    res.json({
      success: true,
      data: settings.integrationSettings,
    });
  } catch (error) {
    console.error("Error updating integration settings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update integration settings",
      error: error.message,
    });
  }
};

// Update emergency compliance settings
const updateEmergencyCompliance = async (req, res) => {
  try {
    const settings = await GlobalSettings.findOneAndUpdate(
      {},
      {
        $set: {
          emergencyCompliance: req.body,
          lastUpdated: new Date(),
          updatedBy: req.user.id,
        },
      },
      { new: true, upsert: true }
    );

    res.json({
      success: true,
      data: settings.emergencyCompliance,
    });
  } catch (error) {
    console.error("Error updating emergency compliance settings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update emergency compliance settings",
      error: error.message,
    });
  }
};

module.exports = {
  getGlobalSettings,
  updateSchoolInformation,
  updateAcademicCalendar,
  updateContactInformation,
  updateFinancialSettings,
  updateAcademicConfiguration,
  updateUserRoleSettings,
  updateCommunicationSettings,
  updateIntegrationSettings,
  updateEmergencyCompliance,
};
