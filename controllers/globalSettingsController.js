// controllers/globalSettingsController.js
const GlobalSettings = require("../models/GlobalSettings");

const { clearSettingsCache } = require("../utils/globalSettings");
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
          description: "",
          mission: "",
          vision: "",
        },
        academicYear: {
          startDate: new Date().getFullYear() + "-01-01",
          endDate: new Date().getFullYear() + "-12-31",
          currentYear: `${new Date().getFullYear()}-${
            new Date().getFullYear() + 1
          }`,
        },
        financialSettings: {
          currency: "KES",
          currencySymbol: "KSh",
          paymentMethods: [
            { id: "cash", name: "Cash", enabled: true },
            { id: "card", name: "Credit/Debit Card", enabled: true },
            { id: "mobile", name: "Mobile Money", enabled: true },
          ],
          lateFeeEnabled: true,
          lateFeeAmount: 100,
          dueDateReminder: true,
          reminderDays: 7,
        },
        academicConfiguration: {
          passingGrade: 50,
          minimumAttendance: 75,
          gradingScale: { type: "percentage", gpaScale: 4.0 },
          gradeBoundaries: [
            { grade: "A", minScore: 90, maxScore: 100, points: 4.0 },
            { grade: "B", minScore: 80, maxScore: 89, points: 3.0 },
            { grade: "C", minScore: 70, maxScore: 79, points: 2.0 },
            { grade: "D", minScore: 60, maxScore: 69, points: 1.0 },
            { grade: "F", minScore: 0, maxScore: 59, points: 0.0 },
          ],
        },
        contactInformation: {
          principalName: "",
          principalEmail: "",
          principalPhone: "",
          admissionsEmail: "",
          admissionsPhone: "",
          supportEmail: "",
          supportPhone: "",
        },
        systemSettings: {
          maintenanceMode: {
            enabled: false,
            message:
              "System is currently under maintenance. Please check back later.",
          },
          allowRegistration: false,
          requireEmailVerification: true,
          sessionTimeout: 60,
          maxLoginAttempts: 5,
          passwordMinLength: 8,
        },
        notificationSettings: {
          emailNotifications: true,
          smsNotifications: false,
          feeReminders: true,
          examReminders: true,
          attendanceAlerts: true,
          systemUpdates: true,
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

    // Clear cache to ensure fresh data
    clearSettingsCache();

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

// Update academic year
const updateAcademicYear = async (req, res) => {
  try {
    const settings = await GlobalSettings.findOneAndUpdate(
      {},
      {
        $set: {
          academicYear: req.body,
          lastUpdated: new Date(),
          updatedBy: req.user.id,
        },
      },
      { new: true, upsert: true }
    );

    // Clear cache to ensure fresh data
    clearSettingsCache();

    res.json({
      success: true,
      data: settings.academicYear,
    });
  } catch (error) {
    console.error("Error updating academic year:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update academic year",
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

    // Clear cache to ensure fresh data
    clearSettingsCache();

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

    // Clear cache to ensure fresh data
    clearSettingsCache();

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

    // Clear cache to ensure fresh data
    clearSettingsCache();

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

// Update system settings
const updateSystemSettings = async (req, res) => {
  try {
    const settings = await GlobalSettings.findOneAndUpdate(
      {},
      {
        $set: {
          systemSettings: req.body,
          lastUpdated: new Date(),
          updatedBy: req.user.id,
        },
      },
      { new: true, upsert: true }
    );

    // Clear cache to ensure fresh data
    clearSettingsCache();

    res.json({
      success: true,
      data: settings.systemSettings,
    });
  } catch (error) {
    console.error("Error updating system settings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update system settings",
      error: error.message,
    });
  }
};

// Update notification settings
const updateNotificationSettings = async (req, res) => {
  try {
    const settings = await GlobalSettings.findOneAndUpdate(
      {},
      {
        $set: {
          notificationSettings: req.body,
          lastUpdated: new Date(),
          updatedBy: req.user.id,
        },
      },
      { new: true, upsert: true }
    );

    // Clear cache to ensure fresh data
    clearSettingsCache();

    res.json({
      success: true,
      data: settings.notificationSettings,
    });
  } catch (error) {
    console.error("Error updating notification settings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update notification settings",
      error: error.message,
    });
  }
};

module.exports = {
  getGlobalSettings,
  updateSchoolInformation,
  updateAcademicYear,
  updateContactInformation,
  updateFinancialSettings,
  updateAcademicConfiguration,
  updateSystemSettings,
  updateNotificationSettings,
};
