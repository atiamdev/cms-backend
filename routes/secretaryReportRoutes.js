const express = require("express");
const {
  saveDailyChecklist,
  getDailyChecklists,
  getDailyChecklistById,
  saveWeeklyReport,
  getWeeklyReports,
  getWeeklyReportById,
} = require("../controllers/secretaryReportController");
const { protect, authorize } = require("../middlewares/auth");
const { filterByBranch } = require("../middlewares/branchAutoAssociation");

const router = express.Router();

router.use(protect);
router.use(authorize(["secretary", "branchadmin", "admin", "superadmin"]));

router.get("/daily-checklists", filterByBranch, getDailyChecklists);
router.post("/daily-checklists", filterByBranch, saveDailyChecklist);
router.get("/daily-checklists/:id", filterByBranch, getDailyChecklistById);

router.get("/weekly-reports", filterByBranch, getWeeklyReports);
router.post("/weekly-reports", filterByBranch, saveWeeklyReport);
router.get("/weekly-reports/:id", filterByBranch, getWeeklyReportById);

module.exports = router;
