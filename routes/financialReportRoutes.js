const express = require("express");
const {
  getComprehensiveReport,
  getFinancialDashboard,
  getFinancialKPIs,
  exportFinancialReport,
} = require("../controllers/financialReportController");
const {
  protect,
  requireSuperAdmin,
  requireAdmin,
  requireBranchAdmin,
} = require("../middlewares/auth");

const router = express.Router();

// Apply authentication to all routes
router.use(protect);

// Financial report routes - allow branch admins to access their own data
router.get("/comprehensive", requireBranchAdmin, getComprehensiveReport);
router.get("/dashboard", requireBranchAdmin, getFinancialDashboard);
router.get("/kpis", requireBranchAdmin, getFinancialKPIs);

// Export routes - allow branch admins to export their own data
router.post("/export", requireBranchAdmin, exportFinancialReport);

// Additional specific report routes can be added here
// router.get("/revenue", requireAdmin, getRevenueAnalysis);
// router.get("/expenses", requireAdmin, getExpenseAnalysis);
// router.get("/profit-loss", requireAdmin, getProfitLossReport);
// router.get("/cash-flow", requireAdmin, getCashFlowReport);
// router.get("/branch-comparison", requireSuperAdmin, getBranchComparison);
// router.get("/payment-methods", requireAdmin, getPaymentMethodsAnalysis);
// router.get("/trends", requireAdmin, getFinancialTrends);
// router.get("/student-fees", requireAdmin, getStudentFeeAnalysis);
// router.get("/budget-comparison", requireAdmin, getBudgetComparison);
// router.post("/export", requireAdmin, exportFinancialReport);

module.exports = router;
