// utils/globalSettings.js
const GlobalSettings = require("../models/GlobalSettings");

// Cache for settings to avoid frequent DB queries
let settingsCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Get global settings with caching
 */
const getGlobalSettings = async () => {
  const now = Date.now();

  if (
    settingsCache &&
    cacheTimestamp &&
    now - cacheTimestamp < CACHE_DURATION
  ) {
    return settingsCache;
  }

  try {
    const settings = await GlobalSettings.findOne();
    if (settings) {
      settingsCache = settings;
      cacheTimestamp = now;
      return settings;
    }

    // Return default settings if none exist
    return {
      schoolInformation: {
        name: "ATIAM College",
        primaryColor: "#3B82F6",
        secondaryColor: "#10B981",
        theme: "light",
      },
      financialSettings: {
        currency: "KES",
        currencySymbol: "KSh",
      },
      academicConfiguration: {
        passingGrade: 50,
        minimumAttendance: 75,
      },
      systemSettings: {
        maintenanceMode: { enabled: false },
      },
    };
  } catch (error) {
    console.error("Error fetching global settings:", error);
    return null;
  }
};

/**
 * Clear settings cache (call when settings are updated)
 */
const clearSettingsCache = () => {
  settingsCache = null;
  cacheTimestamp = null;
};

/**
 * Get school branding information
 */
const getSchoolBranding = async () => {
  const settings = await getGlobalSettings();
  if (!settings) return null;

  return {
    name: settings.schoolInformation?.name || "ATIAM College",
    logo: settings.schoolInformation?.logo,
    favicon: settings.schoolInformation?.favicon,
    primaryColor: settings.schoolInformation?.primaryColor || "#3B82F6",
    secondaryColor: settings.schoolInformation?.secondaryColor || "#10B981",
    theme: settings.schoolInformation?.theme || "light",
    description: settings.schoolInformation?.description,
    mission: settings.schoolInformation?.mission,
    vision: settings.schoolInformation?.vision,
  };
};

/**
 * Get financial configuration
 */
const getFinancialConfig = async () => {
  const settings = await getGlobalSettings();
  if (!settings) return null;

  return {
    currency: settings.financialSettings?.currency || "KES",
    currencySymbol: settings.financialSettings?.currencySymbol || "KSh",
    paymentMethods: settings.financialSettings?.paymentMethods || [],
    lateFeeEnabled: settings.financialSettings?.lateFeeEnabled ?? true,
    lateFeeAmount: settings.financialSettings?.lateFeeAmount || 100,
    dueDateReminder: settings.financialSettings?.dueDateReminder ?? true,
    reminderDays: settings.financialSettings?.reminderDays || 7,
  };
};

/**
 * Get academic configuration
 */
const getAcademicConfig = async () => {
  const settings = await getGlobalSettings();
  if (!settings) return null;

  return {
    passingGrade: settings.academicConfiguration?.passingGrade || 50,
    minimumAttendance: settings.academicConfiguration?.minimumAttendance || 75,
    gradingScale: settings.academicConfiguration?.gradingScale || {
      type: "percentage",
    },
    gradeBoundaries: settings.academicConfiguration?.gradeBoundaries || [],
    academicYear: settings.academicYear,
  };
};

/**
 * Get system configuration
 */
const getSystemConfig = async () => {
  const settings = await getGlobalSettings();
  if (!settings) return null;

  return {
    maintenanceMode: settings.systemSettings?.maintenanceMode || {
      enabled: false,
    },
    allowRegistration: settings.systemSettings?.allowRegistration || false,
    requireEmailVerification:
      settings.systemSettings?.requireEmailVerification ?? true,
    sessionTimeout: settings.systemSettings?.sessionTimeout || 60,
    maxLoginAttempts: settings.systemSettings?.maxLoginAttempts || 5,
    passwordMinLength: settings.systemSettings?.passwordMinLength || 8,
  };
};

/**
 * Get contact information
 */
const getContactInfo = async () => {
  const settings = await getGlobalSettings();
  if (!settings) return null;

  return settings.contactInformation || {};
};

/**
 * Get notification settings
 */
const getNotificationConfig = async () => {
  const settings = await getGlobalSettings();
  if (!settings) return null;

  return settings.notificationSettings || {};
};

/**
 * Check if system is in maintenance mode
 */
const isMaintenanceMode = async () => {
  const config = await getSystemConfig();
  return config?.maintenanceMode?.enabled || false;
};

/**
 * Get maintenance mode message
 */
const getMaintenanceMessage = async () => {
  const config = await getSystemConfig();
  return (
    config?.maintenanceMode?.message ||
    "System is currently under maintenance. Please check back later."
  );
};

/**
 * Format currency amount
 */
const formatCurrency = async (amount) => {
  const config = await getFinancialConfig();
  if (!config) return `${amount}`;

  return `${config.currencySymbol} ${amount.toLocaleString()}`;
};

/**
 * Get grade letter from score
 */
const getGradeFromScore = async (score) => {
  const config = await getAcademicConfig();
  if (!config || !config.gradeBoundaries) return "F";

  for (const boundary of config.gradeBoundaries) {
    if (score >= boundary.minScore && score <= boundary.maxScore) {
      return boundary.grade;
    }
  }

  return "F";
};

/**
 * Check if score is passing
 */
const isPassingScore = async (score) => {
  const config = await getAcademicConfig();
  if (!config) return false;

  return score >= config.passingGrade;
};

module.exports = {
  getGlobalSettings,
  clearSettingsCache,
  getSchoolBranding,
  getFinancialConfig,
  getAcademicConfig,
  getSystemConfig,
  getContactInfo,
  getNotificationConfig,
  isMaintenanceMode,
  getMaintenanceMessage,
  formatCurrency,
  getGradeFromScore,
  isPassingScore,
};
