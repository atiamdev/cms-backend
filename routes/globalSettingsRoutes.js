// routes/globalSettingsRoutes.js
const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middlewares/auth");
const {
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
} = require("../controllers/globalSettingsController");

// All routes require authentication first, then superadmin authorization
router.use(protect);
router.use(authorize(["superadmin"]));

// GET /api/global-settings
router.get("/", getGlobalSettings);

// PUT /api/global-settings/school-information
router.put("/school-information", updateSchoolInformation);

// PUT /api/global-settings/academic-calendar
router.put("/academic-calendar", updateAcademicCalendar);

// PUT /api/global-settings/contact-information
router.put("/contact-information", updateContactInformation);

// PUT /api/global-settings/financial-settings
router.put("/financial-settings", updateFinancialSettings);

// PUT /api/global-settings/academic-configuration
router.put("/academic-configuration", updateAcademicConfiguration);

// PUT /api/global-settings/user-role-settings
router.put("/user-role-settings", updateUserRoleSettings);

// PUT /api/global-settings/communication-settings
router.put("/communication-settings", updateCommunicationSettings);

// PUT /api/global-settings/integration-settings
router.put("/integration-settings", updateIntegrationSettings);

// PUT /api/global-settings/emergency-compliance
router.put("/emergency-compliance", updateEmergencyCompliance);

module.exports = router;
