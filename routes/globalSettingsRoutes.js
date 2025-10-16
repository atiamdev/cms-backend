// routes/globalSettingsRoutes.js
const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middlewares/auth");
const {
  getGlobalSettings,
  updateSchoolInformation,
  updateAcademicYear,
  updateContactInformation,
  updateFinancialSettings,
  updateAcademicConfiguration,
  updateSystemSettings,
  updateNotificationSettings,
} = require("../controllers/globalSettingsController");

// All routes require authentication first, then superadmin authorization
router.use(protect);
router.use(authorize(["superadmin"]));

// GET /api/global-settings
router.get("/", getGlobalSettings);

// PUT /api/global-settings/school-information
router.put("/school-information", updateSchoolInformation);

// PUT /api/global-settings/academic-year
router.put("/academic-year", updateAcademicYear);

// PUT /api/global-settings/contact-information
router.put("/contact-information", updateContactInformation);

// PUT /api/global-settings/financial-settings
router.put("/financial-settings", updateFinancialSettings);

// PUT /api/global-settings/academic-configuration
router.put("/academic-configuration", updateAcademicConfiguration);

// PUT /api/global-settings/system-settings
router.put("/system-settings", updateSystemSettings);

// PUT /api/global-settings/notification-settings
router.put("/notification-settings", updateNotificationSettings);

module.exports = router;
