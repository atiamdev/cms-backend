const Fee = require("../models/Fee");
const Payment = require("../models/Payment");
const Expense = require("../models/Expense");
const Student = require("../models/Student");
const Branch = require("../models/Branch");
const Scholarship = require("../models/Scholarship");
const mongoose = require("mongoose");
const ExcelJS = require("exceljs");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const { Parser } = require("json2csv");

// Helper function to get effective branch ID
const getEffectiveBranchId = (req, requestedBranchId) => {
  // For branch admins, enforce they can only access their own branch
  if (
    req.user.hasRole("branchadmin") &&
    !req.user.hasAnyRole(["admin", "superadmin"])
  ) {
    // Branch admin can only access their own branch
    // Convert ObjectId to string if necessary
    return req.user.branchId ? req.user.branchId.toString() : null;
  }
  return requestedBranchId;
};

// @desc    Get comprehensive financial report
// @route   GET /api/financial-reports/comprehensive
// @access  Private (BranchAdmin, Admin, SuperAdmin)
const getComprehensiveReport = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      branchId,
      academicYear,
      reportType = "summary",
      groupBy = "month",
    } = req.query;

    // Get effective branch ID using helper function
    const effectiveBranchId = getEffectiveBranchId(req, branchId);

    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    let branchFilter = {};
    if (effectiveBranchId) {
      // Validate that effectiveBranchId is a valid ObjectId string
      if (
        typeof effectiveBranchId === "string" &&
        effectiveBranchId.length === 24
      ) {
        branchFilter.branchId = new mongoose.Types.ObjectId(effectiveBranchId);
      } else {
        return res.status(400).json({
          success: false,
          message: "Invalid branch ID format",
        });
      }
    }

    // Revenue Analysis
    const revenueData = await getRevenueAnalysis(dateFilter, branchFilter);

    // Expense Analysis
    const expenseData = await getExpenseAnalysis(dateFilter, branchFilter);

    // Scholarships Analysis
    const scholarshipsData = await getScholarshipsAnalysis(
      dateFilter,
      branchFilter
    );

    // Financial Summary
    const summary = {
      totalRevenue: revenueData.totalPaid,
      totalExpenses: expenseData.totalExpenses,
      approvedExpenses: expenseData.approvedExpenses,
      netProfit: revenueData.totalPaid - expenseData.approvedExpenses,
      profitMargin:
        ((revenueData.totalPaid - expenseData.approvedExpenses) /
          revenueData.totalPaid) *
          100 || 0,
      period: { startDate, endDate },
    };

    // Monthly Trends
    const monthlyTrends = await getMonthlyTrends(
      dateFilter,
      branchFilter,
      groupBy
    );

    // Branch Reports
    const branchReports = await getBranchReports(dateFilter);

    // Payment Methods Analysis
    const paymentMethods = await getPaymentMethodsAnalysis(
      dateFilter,
      branchFilter
    );

    // Student Analysis
    const studentAnalysis = await getStudentAnalysis(dateFilter, branchFilter);

    // Cash Flow
    const cashFlow = await getCashFlowData(dateFilter, branchFilter);

    // Top Expense Categories
    const topExpenseCategories = await getTopExpenseCategories(
      dateFilter,
      branchFilter
    );

    // Recent Transactions
    const recentTransactions = await getRecentTransactions(
      dateFilter,
      branchFilter
    );

    const comprehensiveReport = {
      summary,
      revenue: revenueData,
      expenses: expenseData,
      scholarships: scholarshipsData,
      monthlyTrends,
      branchReports,
      paymentMethods,
      studentAnalysis,
      cashFlow,
      topExpenseCategories,
      recentTransactions,
    };

    res.json({
      success: true,
      data: comprehensiveReport,
    });
  } catch (error) {
    console.error("Get comprehensive financial report error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while generating comprehensive financial report",
    });
  }
};

// @desc    Get financial dashboard
// @route   GET /api/financial-reports/dashboard
// @access  Private (BranchAdmin, Admin, SuperAdmin)
const getFinancialDashboard = async (req, res) => {
  try {
    const { startDate, endDate, branchId } = req.query;

    // Get effective branch ID using helper function
    const effectiveBranchId = getEffectiveBranchId(req, branchId);

    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    } else {
      // Default to current month
      const now = new Date();
      dateFilter = {
        $gte: new Date(now.getFullYear(), now.getMonth(), 1),
        $lte: new Date(now.getFullYear(), now.getMonth() + 1, 0),
      };
    }

    let branchFilter = {};
    if (effectiveBranchId) {
      // Validate that effectiveBranchId is a valid ObjectId string
      if (
        typeof effectiveBranchId === "string" &&
        effectiveBranchId.length === 24
      ) {
        branchFilter.branchId = new mongoose.Types.ObjectId(effectiveBranchId);
      } else {
        return res.status(400).json({
          success: false,
          message: "Invalid branch ID format",
        });
      }
    }

    // Quick statistics
    const [revenueStats, expenseStats, studentStats] = await Promise.all([
      getRevenueAnalysis(dateFilter, branchFilter),
      getExpenseAnalysis(dateFilter, branchFilter),
      getStudentAnalysis(dateFilter, branchFilter),
    ]);

    const dashboard = {
      revenue: revenueStats,
      expenses: expenseStats,
      students: studentStats,
      netProfit: revenueStats.totalPaid - expenseStats.totalExpenses,
      profitMargin:
        ((revenueStats.totalPaid - expenseStats.totalExpenses) /
          revenueStats.totalPaid) *
          100 || 0,
    };

    res.json({
      success: true,
      data: dashboard,
    });
  } catch (error) {
    console.error("Get financial dashboard error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while generating financial dashboard",
    });
  }
};

// @desc    Get financial KPIs
// @route   GET /api/financial-reports/kpis
// @access  Private (BranchAdmin, Admin, SuperAdmin)
const getFinancialKPIs = async (req, res) => {
  try {
    const { startDate, endDate, branchId } = req.query;

    // Get effective branch ID using helper function
    const effectiveBranchId = getEffectiveBranchId(req, branchId);

    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    let branchFilter = {};
    if (effectiveBranchId) {
      // Validate that effectiveBranchId is a valid ObjectId string
      if (
        typeof effectiveBranchId === "string" &&
        effectiveBranchId.length === 24
      ) {
        branchFilter.branchId = new mongoose.Types.ObjectId(effectiveBranchId);
      } else {
        return res.status(400).json({
          success: false,
          message: "Invalid branch ID format",
        });
      }
    }

    // Current period data
    const [currentRevenue, currentExpenses, currentStudents] =
      await Promise.all([
        getRevenueAnalysis(dateFilter, branchFilter),
        getExpenseAnalysis(dateFilter, branchFilter),
        getStudentAnalysis(dateFilter, branchFilter),
      ]);

    // Previous period for comparison
    const previousPeriodStart = new Date(startDate);
    previousPeriodStart.setMonth(previousPeriodStart.getMonth() - 1);
    const previousPeriodEnd = new Date(endDate);
    previousPeriodEnd.setMonth(previousPeriodEnd.getMonth() - 1);

    const previousDateFilter = {
      $gte: previousPeriodStart,
      $lte: previousPeriodEnd,
    };

    const [previousRevenue, previousExpenses] = await Promise.all([
      getRevenueAnalysis(previousDateFilter, branchFilter),
      getExpenseAnalysis(previousDateFilter, branchFilter),
    ]);

    const kpis = [
      {
        name: "Total Revenue",
        value: currentRevenue.totalPaid,
        target: previousRevenue.totalPaid * 1.1, // 10% growth target
        trend:
          currentRevenue.totalPaid > previousRevenue.totalPaid ? "up" : "down",
        trendPercentage:
          ((currentRevenue.totalPaid - previousRevenue.totalPaid) /
            previousRevenue.totalPaid) *
            100 || 0,
        period: "Monthly",
      },
      {
        name: "Net Profit",
        value: currentRevenue.totalPaid - currentExpenses.approvedExpenses,
        trend:
          currentRevenue.totalPaid - currentExpenses.approvedExpenses >
          previousRevenue.totalPaid - previousExpenses.approvedExpenses
            ? "up"
            : "down",
        trendPercentage:
          ((currentRevenue.totalPaid -
            currentExpenses.approvedExpenses -
            (previousRevenue.totalPaid - previousExpenses.approvedExpenses)) /
            (previousRevenue.totalPaid - previousExpenses.approvedExpenses)) *
            100 || 0,
        period: "Monthly",
      },
      {
        name: "Collection Rate",
        value: currentRevenue.collectionRate,
        target: 85, // Target 85% collection rate
        trend:
          currentRevenue.collectionRate > (previousRevenue.collectionRate || 0)
            ? "up"
            : "down",
        trendPercentage:
          currentRevenue.collectionRate - (previousRevenue.collectionRate || 0),
        period: "Monthly",
      },
      {
        name: "Student Count",
        value: currentStudents.totalStudents,
        trend:
          currentStudents.totalStudents > (previousRevenue.totalStudents || 0)
            ? "up"
            : "down",
        trendPercentage: 0, // Would need historical student data
        period: "Monthly",
      },
    ];

    res.json({
      success: true,
      data: kpis,
    });
  } catch (error) {
    console.error("Get financial KPIs error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while generating financial KPIs",
    });
  }
};

// Helper functions
async function getRevenueAnalysis(dateFilter, branchFilter) {
  const paymentMatch = { status: "completed", ...branchFilter };
  if (Object.keys(dateFilter).length > 0) {
    paymentMatch.paymentDate = dateFilter;
  }

  const revenueAggregation = await Payment.aggregate([
    { $match: paymentMatch },
    {
      $group: {
        _id: null,
        totalPaid: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
  ]);

  const feeMatch = { ...branchFilter };
  if (Object.keys(dateFilter).length > 0) {
    feeMatch.dueDate = dateFilter;
  }

  const feeAggregation = await Fee.aggregate([
    { $match: feeMatch },
    {
      $group: {
        _id: null,
        totalFeeCollection: { $sum: "$totalAmount" },
        totalPending: {
          $sum: { $cond: [{ $eq: ["$status", "pending"] }, "$balance", 0] },
        },
        totalOverdue: {
          $sum: { $cond: [{ $eq: ["$status", "overdue"] }, "$balance", 0] },
        },
      },
    },
  ]);

  const revenue = revenueAggregation[0] || { totalPaid: 0, count: 0 };
  const fees = feeAggregation[0] || {
    totalFeeCollection: 0,
    totalPending: 0,
    totalOverdue: 0,
  };

  return {
    totalFeeCollection: fees.totalFeeCollection,
    totalPaid: revenue.totalPaid,
    totalPending: fees.totalPending,
    totalOverdue: fees.totalOverdue,
    collectionRate:
      fees.totalFeeCollection > 0
        ? (revenue.totalPaid / fees.totalFeeCollection) * 100
        : 0,
    overdueRate:
      fees.totalFeeCollection > 0
        ? (fees.totalOverdue / fees.totalFeeCollection) * 100
        : 0,
  };
}

async function getScholarshipsAnalysis(dateFilter, branchFilter) {
  const scholarshipMatch = { isActive: true, ...branchFilter };
  if (Object.keys(dateFilter).length > 0) {
    scholarshipMatch.assignedDate = dateFilter;
  }

  const scholarshipAggregation = await Scholarship.aggregate([
    { $match: scholarshipMatch },
    {
      $group: {
        _id: null,
        totalScholarships: { $sum: 1 },
        totalPercentage: { $sum: "$percentage" },
        averagePercentage: { $avg: "$percentage" },
      },
    },
  ]);

  // Get total scholarship amount from fees
  const feeScholarshipMatch = {
    scholarshipAmount: { $gt: 0 },
    ...branchFilter,
  };
  if (Object.keys(dateFilter).length > 0) {
    feeScholarshipMatch.createdAt = dateFilter;
  }

  const feeScholarshipAggregation = await Fee.aggregate([
    { $match: feeScholarshipMatch },
    {
      $group: {
        _id: null,
        totalScholarshipAmount: { $sum: "$scholarshipAmount" },
      },
    },
  ]);

  const scholarships = scholarshipAggregation[0] || {
    totalScholarships: 0,
    totalPercentage: 0,
    averagePercentage: 0,
  };
  const feeScholarships = feeScholarshipAggregation[0] || {
    totalScholarshipAmount: 0,
  };

  return {
    totalScholarships: scholarships.totalScholarships,
    totalPercentage: scholarships.totalPercentage,
    averagePercentage: scholarships.averagePercentage || 0,
    totalScholarshipAmount: feeScholarships.totalScholarshipAmount,
  };
}

async function getExpenseAnalysis(dateFilter, branchFilter) {
  const expenseMatch = { ...branchFilter };
  if (Object.keys(dateFilter).length > 0) {
    expenseMatch.date = dateFilter;
  }

  const expenseAggregation = await Expense.aggregate([
    { $match: expenseMatch },
    {
      $group: {
        _id: null,
        totalExpenses: { $sum: "$amount" },
        approvedExpenses: {
          $sum: {
            $cond: [{ $eq: ["$approvalStatus", "approved"] }, "$amount", 0],
          },
        },
        pendingExpenses: {
          $sum: {
            $cond: [{ $eq: ["$approvalStatus", "pending"] }, "$amount", 0],
          },
        },
      },
    },
  ]);

  const categoryAggregation = await Expense.aggregate([
    { $match: { ...expenseMatch, approvalStatus: "approved" } },
    {
      $group: {
        _id: "$category",
        amount: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
    { $sort: { amount: -1 } },
  ]);

  const expenses = expenseAggregation[0] || {
    totalExpenses: 0,
    approvedExpenses: 0,
    pendingExpenses: 0,
  };
  const total = expenses.totalExpenses;

  return {
    totalExpenses: expenses.totalExpenses,
    approvedExpenses: expenses.approvedExpenses,
    pendingExpenses: expenses.pendingExpenses,
    expensesByCategory: categoryAggregation.map((cat) => ({
      category: cat._id,
      amount: cat.amount,
      count: cat.count,
      percentage: total > 0 ? (cat.amount / total) * 100 : 0,
    })),
  };
}

async function getMonthlyTrends(dateFilter, branchFilter, groupBy) {
  const paymentMatch = { status: "completed", ...branchFilter };
  const expenseMatch = { approvalStatus: "approved", ...branchFilter };

  if (Object.keys(dateFilter).length > 0) {
    paymentMatch.paymentDate = dateFilter;
    expenseMatch.date = dateFilter;
  }

  // Group by format based on groupBy parameter
  let groupFormat;
  switch (groupBy) {
    case "week":
      groupFormat = {
        year: { $year: "$paymentDate" },
        week: { $week: "$paymentDate" },
      };
      break;
    case "quarter":
      groupFormat = {
        year: { $year: "$paymentDate" },
        quarter: {
          $ceil: { $divide: [{ $month: "$paymentDate" }, 3] },
        },
      };
      break;
    case "year":
      groupFormat = { year: { $year: "$paymentDate" } };
      break;
    default: // month
      groupFormat = {
        year: { $year: "$paymentDate" },
        month: { $month: "$paymentDate" },
      };
  }

  // Revenue trends
  const revenueAggregation = await Payment.aggregate([
    { $match: paymentMatch },
    {
      $group: {
        _id: groupFormat,
        revenue: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
    {
      $sort: { "_id.year": 1, "_id.month": 1, "_id.week": 1, "_id.quarter": 1 },
    },
  ]);

  // Expense trends
  const expenseGroupFormat = Object.keys(groupFormat).reduce((acc, key) => {
    acc[key] = groupFormat[key].$year
      ? { $year: "$date" }
      : groupFormat[key].$month
      ? { $month: "$date" }
      : groupFormat[key].$week
      ? { $week: "$date" }
      : groupFormat[key].$ceil
      ? { $ceil: { $divide: [{ $month: "$date" }, 3] } }
      : { $year: "$date" };
    return acc;
  }, {});

  const expenseAggregation = await Expense.aggregate([
    { $match: expenseMatch },
    {
      $group: {
        _id: expenseGroupFormat,
        expenses: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
    {
      $sort: { "_id.year": 1, "_id.month": 1, "_id.week": 1, "_id.quarter": 1 },
    },
  ]);

  // Combine and format results
  const trendsMap = new Map();

  revenueAggregation.forEach((item) => {
    const key = JSON.stringify(item._id);
    trendsMap.set(key, {
      ...item._id,
      revenue: item.revenue,
      revenueCount: item.count,
      expenses: 0,
      expenseCount: 0,
    });
  });

  expenseAggregation.forEach((item) => {
    const key = JSON.stringify(item._id);
    if (trendsMap.has(key)) {
      const existing = trendsMap.get(key);
      existing.expenses = item.expenses;
      existing.expenseCount = item.count;
    } else {
      trendsMap.set(key, {
        ...item._id,
        revenue: 0,
        revenueCount: 0,
        expenses: item.expenses,
        expenseCount: item.count,
      });
    }
  });

  return Array.from(trendsMap.values()).map((item) => ({
    period: item,
    revenue: item.revenue,
    expenses: item.expenses,
    netProfit: item.revenue - item.expenses,
    revenueCount: item.revenueCount,
    expenseCount: item.expenseCount,
  }));
}

async function getBranchReports(dateFilter) {
  const branches = await Branch.find({ isActive: true });

  const branchReports = await Promise.all(
    branches.map(async (branch) => {
      const branchFilter = { branchId: branch._id };

      // Revenue for this branch
      const revenueData = await getRevenueAnalysis(dateFilter, branchFilter);

      // Expenses for this branch
      const expenseData = await getExpenseAnalysis(dateFilter, branchFilter);

      // Student count for this branch
      const studentCount = await Student.countDocuments({
        branchId: branch._id,
        isActive: true,
      });

      return {
        branchId: branch._id,
        branchName: branch.name,
        location: branch.location,
        revenue: revenueData.totalPaid,
        expenses: expenseData.totalExpenses,
        netProfit: revenueData.totalPaid - expenseData.totalExpenses,
        profitMargin:
          revenueData.totalPaid > 0
            ? ((revenueData.totalPaid - expenseData.totalExpenses) /
                revenueData.totalPaid) *
              100
            : 0,
        studentCount,
        collectionRate: revenueData.collectionRate,
        revenuePerStudent:
          studentCount > 0 ? revenueData.totalPaid / studentCount : 0,
      };
    })
  );

  return branchReports.sort((a, b) => b.revenue - a.revenue);
}

async function getPaymentMethodsAnalysis(dateFilter, branchFilter) {
  const paymentMatch = { status: "completed", ...branchFilter };
  if (Object.keys(dateFilter).length > 0) {
    paymentMatch.paymentDate = dateFilter;
  }

  const methodsAggregation = await Payment.aggregate([
    { $match: paymentMatch },
    {
      $group: {
        _id: "$paymentMethod",
        amount: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
    { $sort: { amount: -1 } },
  ]);

  const total = methodsAggregation.reduce(
    (sum, method) => sum + method.amount,
    0
  );

  return methodsAggregation.map((method) => ({
    method: method._id,
    amount: method.amount,
    count: method.count,
    percentage: total > 0 ? (method.amount / total) * 100 : 0,
  }));
}

async function getStudentAnalysis(dateFilter, branchFilter) {
  const feeMatch = { ...branchFilter };
  if (Object.keys(dateFilter).length > 0) {
    feeMatch.dueDate = dateFilter;
  }

  const studentAggregation = await Fee.aggregate([
    { $match: feeMatch },
    {
      $group: {
        _id: null,
        totalStudents: { $addToSet: "$studentId" },
        paidInFull: {
          $sum: { $cond: [{ $eq: ["$status", "paid"] }, 1, 0] },
        },
        partiallyPaid: {
          $sum: {
            $cond: [
              { $and: [{ $gt: ["$paidAmount", 0] }, { $gt: ["$balance", 0] }] },
              1,
              0,
            ],
          },
        },
        unpaid: {
          $sum: { $cond: [{ $eq: ["$paidAmount", 0] }, 1, 0] },
        },
        overdue: {
          $sum: { $cond: [{ $eq: ["$status", "overdue"] }, 1, 0] },
        },
        averageFeePerStudent: { $avg: "$totalAmount" },
      },
    },
    {
      $addFields: {
        totalStudents: { $size: "$totalStudents" },
      },
    },
  ]);

  return (
    studentAggregation[0] || {
      totalStudents: 0,
      paidInFull: 0,
      partiallyPaid: 0,
      unpaid: 0,
      overdue: 0,
      averageFeePerStudent: 0,
    }
  );
}

async function getCashFlowData(dateFilter, branchFilter) {
  // Get cash inflow (payments)
  const paymentMatch = { status: "completed", ...branchFilter };
  if (Object.keys(dateFilter).length > 0) {
    paymentMatch.paymentDate = dateFilter;
  }

  const cashInflow = await Payment.aggregate([
    { $match: paymentMatch },
    {
      $group: {
        _id: {
          year: { $year: "$paymentDate" },
          month: { $month: "$paymentDate" },
          day: { $dayOfMonth: "$paymentDate" },
        },
        inflow: { $sum: "$amount" },
        inflowCount: { $sum: 1 },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
  ]);

  // Get cash outflow (expenses)
  const expenseMatch = { approvalStatus: "approved", ...branchFilter };
  if (Object.keys(dateFilter).length > 0) {
    expenseMatch.date = dateFilter;
  }

  const cashOutflow = await Expense.aggregate([
    { $match: expenseMatch },
    {
      $group: {
        _id: {
          year: { $year: "$date" },
          month: { $month: "$date" },
          day: { $dayOfMonth: "$date" },
        },
        outflow: { $sum: "$amount" },
        outflowCount: { $sum: 1 },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
  ]);

  // Combine cash flow data
  const cashFlowMap = new Map();

  cashInflow.forEach((item) => {
    const key = `${item._id.year}-${item._id.month}-${item._id.day}`;
    cashFlowMap.set(key, {
      date: new Date(item._id.year, item._id.month - 1, item._id.day),
      inflow: item.inflow,
      outflow: 0,
      netCashFlow: item.inflow,
      inflowCount: item.inflowCount,
      outflowCount: 0,
    });
  });

  cashOutflow.forEach((item) => {
    const key = `${item._id.year}-${item._id.month}-${item._id.day}`;
    if (cashFlowMap.has(key)) {
      const existing = cashFlowMap.get(key);
      existing.outflow = item.outflow;
      existing.netCashFlow = existing.inflow - item.outflow;
      existing.outflowCount = item.outflowCount;
    } else {
      cashFlowMap.set(key, {
        date: new Date(item._id.year, item._id.month - 1, item._id.day),
        inflow: 0,
        outflow: item.outflow,
        netCashFlow: -item.outflow,
        inflowCount: 0,
        outflowCount: item.outflowCount,
      });
    }
  });

  return Array.from(cashFlowMap.values()).sort((a, b) => a.date - b.date);
}

async function getTopExpenseCategories(dateFilter, branchFilter) {
  const expenseMatch = { approvalStatus: "approved", ...branchFilter };
  if (Object.keys(dateFilter).length > 0) {
    expenseMatch.date = dateFilter;
  }

  const categoryAggregation = await Expense.aggregate([
    { $match: expenseMatch },
    {
      $group: {
        _id: "$category",
        amount: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
    { $sort: { amount: -1 } },
    { $limit: 10 },
  ]);

  const total = categoryAggregation.reduce((sum, cat) => sum + cat.amount, 0);

  return categoryAggregation.map((cat) => ({
    category: cat._id,
    amount: cat.amount,
    count: cat.count,
    percentage: total > 0 ? (cat.amount / total) * 100 : 0,
  }));
}

async function getRecentTransactions(dateFilter, branchFilter) {
  const paymentMatch = { status: "completed", ...branchFilter };
  if (Object.keys(dateFilter).length > 0) {
    paymentMatch.paymentDate = dateFilter;
  }

  const recentPayments = await Payment.find(paymentMatch)
    .populate("studentId", "studentId userId")
    .populate({
      path: "studentId.userId",
      select: "firstName lastName",
    })
    .populate("branchId", "name")
    .sort({ paymentDate: -1 })
    .limit(10);

  const recentExpenses = await Expense.find({
    ...branchFilter,
    ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
  })
    .populate("branchId", "name")
    .sort({ date: -1 })
    .limit(10);

  const transactions = [
    ...recentPayments.map((payment) => ({
      _id: payment._id,
      type: "income",
      amount: payment.amount,
      description: `Fee payment - ${payment.receiptNumber}`,
      date: payment.paymentDate,
      method: payment.paymentMethod,
      studentName: payment.studentId?.userId
        ? `${payment.studentId.userId.firstName} ${payment.studentId.userId.lastName}`
        : "Unknown Student",
      branchName: payment.branchId?.name || "Unknown Branch",
    })),
    ...recentExpenses.map((expense) => ({
      _id: expense._id,
      type: "expense",
      amount: expense.amount,
      description: expense.description,
      date: expense.date,
      category: expense.category,
      branchName: expense.branchId?.name || "Unknown Branch",
    })),
  ];

  return transactions
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 20);
}

// @desc    Export financial report
// @route   POST /api/financial-reports/export
// @access  Private (Admin, SuperAdmin)
const exportFinancialReport = async (req, res) => {
  try {
    const {
      format,
      includeCharts = false,
      includeDetails = true,
      dateRange,
      branchIds,
    } = req.body;

    // Validate format
    if (!["pdf", "excel", "csv"].includes(format)) {
      return res.status(400).json({
        success: false,
        message: "Invalid export format. Must be pdf, excel, or csv.",
      });
    }

    // Get effective branch ID using helper function
    const effectiveBranchId = getEffectiveBranchId(req, branchIds?.[0]);

    let dateFilter = {};
    if (dateRange?.startDate && dateRange?.endDate) {
      dateFilter = {
        $gte: new Date(dateRange.startDate),
        $lte: new Date(dateRange.endDate),
      };
    }

    let branchFilter = {};
    if (effectiveBranchId) {
      if (
        typeof effectiveBranchId === "string" &&
        effectiveBranchId.length === 24
      ) {
        branchFilter.branchId = new mongoose.Types.ObjectId(effectiveBranchId);
      }
    }

    // Get comprehensive report data
    const revenueData = await getRevenueAnalysis(dateFilter, branchFilter);
    const expenseData = await getExpenseAnalysis(dateFilter, branchFilter);
    const monthlyTrends = await getMonthlyTrends(
      dateFilter,
      branchFilter,
      "month"
    );
    const paymentMethods = await getPaymentMethodsAnalysis(
      dateFilter,
      branchFilter
    );
    const studentAnalysis = await getStudentAnalysis(dateFilter, branchFilter);
    const recentTransactions = await getRecentTransactions(
      dateFilter,
      branchFilter
    );

    const summary = {
      totalRevenue: revenueData.totalPaid,
      totalExpenses: expenseData.totalExpenses,
      netProfit: revenueData.totalPaid - expenseData.totalExpenses,
      profitMargin:
        ((revenueData.totalPaid - expenseData.totalExpenses) /
          revenueData.totalPaid) *
          100 || 0,
      period: dateRange,
    };

    const reportData = {
      summary,
      revenue: revenueData,
      expenses: expenseData,
      monthlyTrends,
      paymentMethods,
      studentAnalysis,
      recentTransactions,
    };

    // Generate export based on format
    let buffer;
    let filename;
    let contentType;

    switch (format) {
      case "pdf":
        buffer = await generatePDFReport(reportData, includeDetails);
        filename = `financial-report-${
          new Date().toISOString().split("T")[0]
        }.pdf`;
        contentType = "application/pdf";
        break;

      case "excel":
        buffer = await generateExcelReport(reportData, includeDetails);
        filename = `financial-report-${
          new Date().toISOString().split("T")[0]
        }.xlsx`;
        contentType =
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        break;

      case "csv":
        buffer = await generateCSVReport(reportData, includeDetails);
        filename = `financial-report-${
          new Date().toISOString().split("T")[0]
        }.csv`;
        contentType = "text/csv";
        break;
    }

    // Set response headers
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", buffer.length);

    // Send the file
    res.send(buffer);
  } catch (error) {
    console.error("Error exporting financial report:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export financial report",
      error: error.message,
    });
  }
};

// Helper function to generate PDF report
const generatePDFReport = async (reportData, includeDetails) => {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page = pdfDoc.addPage([612, 792]); // Letter size
  const { width, height } = page.getSize();
  let yPosition = height - 50;

  // Helper function to add text
  const addText = (text, x, y, options = {}) => {
    page.drawText(text, {
      x,
      y,
      size: options.size || 12,
      font: options.bold ? boldFont : font,
      color: options.color || rgb(0, 0, 0),
    });
  };

  // Helper function to check if we need a new page
  const checkNewPage = (requiredSpace = 50) => {
    if (yPosition < requiredSpace) {
      page = pdfDoc.addPage([612, 792]);
      yPosition = height - 50;
    }
  };

  // Header
  addText("Financial Report", 50, yPosition, { size: 20, bold: true });
  yPosition -= 30;

  addText(`Generated: ${new Date().toLocaleDateString()}`, 50, yPosition);
  yPosition -= 20;

  if (reportData.summary.period) {
    addText(
      `Period: ${new Date(
        reportData.summary.period.startDate
      ).toLocaleDateString()} - ${new Date(
        reportData.summary.period.endDate
      ).toLocaleDateString()}`,
      50,
      yPosition
    );
    yPosition -= 30;
  }

  // Financial Summary
  checkNewPage(150);
  addText("Financial Summary", 50, yPosition, { size: 16, bold: true });
  yPosition -= 25;

  addText(
    `Total Revenue: KSh ${reportData.summary.totalRevenue.toLocaleString()}`,
    50,
    yPosition
  );
  yPosition -= 20;
  addText(
    `Total Expenses: KSh ${reportData.summary.totalExpenses.toLocaleString()}`,
    50,
    yPosition
  );
  yPosition -= 20;
  addText(
    `Net Profit: KSh ${reportData.summary.netProfit.toLocaleString()}`,
    50,
    yPosition
  );
  yPosition -= 20;
  addText(
    `Profit Margin: ${reportData.summary.profitMargin.toFixed(2)}%`,
    50,
    yPosition
  );
  yPosition -= 40;

  // Revenue Analysis
  if (includeDetails) {
    checkNewPage(200);
    addText("Revenue Analysis", 50, yPosition, { size: 16, bold: true });
    yPosition -= 25;

    addText(
      `Total Fee Collection: KSh ${reportData.revenue.totalFeeCollection.toLocaleString()}`,
      50,
      yPosition
    );
    yPosition -= 20;
    addText(
      `Total Paid: KSh ${reportData.revenue.totalPaid.toLocaleString()}`,
      50,
      yPosition
    );
    yPosition -= 20;
    addText(
      `Total Pending: KSh ${reportData.revenue.totalPending.toLocaleString()}`,
      50,
      yPosition
    );
    yPosition -= 20;
    addText(
      `Collection Rate: ${reportData.revenue.collectionRate.toFixed(2)}%`,
      50,
      yPosition
    );
    yPosition -= 40;

    // Expense Analysis
    checkNewPage(150);
    addText("Expense Analysis", 50, yPosition, { size: 16, bold: true });
    yPosition -= 25;

    addText(
      `Total Expenses: KSh ${reportData.expenses.totalExpenses.toLocaleString()}`,
      50,
      yPosition
    );
    yPosition -= 20;
    addText(
      `Approved Expenses: KSh ${reportData.expenses.approvedExpenses.toLocaleString()}`,
      50,
      yPosition
    );
    yPosition -= 20;
    addText(
      `Pending Expenses: KSh ${reportData.expenses.pendingExpenses.toLocaleString()}`,
      50,
      yPosition
    );
    yPosition -= 40;

    // Student Analysis
    checkNewPage(150);
    addText("Student Fee Analysis", 50, yPosition, { size: 16, bold: true });
    yPosition -= 25;

    addText(
      `Total Students: ${reportData.studentAnalysis.totalStudents}`,
      50,
      yPosition
    );
    yPosition -= 20;
    addText(
      `Paid in Full: ${reportData.studentAnalysis.paidInFull}`,
      50,
      yPosition
    );
    yPosition -= 20;
    addText(
      `Partially Paid: ${reportData.studentAnalysis.partiallyPaid}`,
      50,
      yPosition
    );
    yPosition -= 20;
    addText(`Unpaid: ${reportData.studentAnalysis.unpaid}`, 50, yPosition);
    yPosition -= 40;
  }

  return await pdfDoc.save();
};

// Helper function to generate Excel report
const generateExcelReport = async (reportData, includeDetails) => {
  const workbook = new ExcelJS.Workbook();

  // Summary sheet
  const summarySheet = workbook.addWorksheet("Financial Summary");

  // Header styling
  const headerStyle = {
    font: { bold: true, size: 14 },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF366092" } },
    font: { color: { argb: "FFFFFFFF" }, bold: true },
    alignment: { horizontal: "center" },
  };

  // Add headers and data for summary
  summarySheet.addRow(["Financial Report Summary"]);
  summarySheet.getCell("A1").style = { font: { bold: true, size: 16 } };
  summarySheet.addRow([]);

  summarySheet.addRow(["Metric", "Value"]);
  summarySheet.getRow(3).eachCell((cell) => {
    cell.style = headerStyle;
  });

  summarySheet.addRow([
    "Total Revenue",
    `KSh ${reportData.summary.totalRevenue.toLocaleString()}`,
  ]);
  summarySheet.addRow([
    "Total Expenses",
    `KSh ${reportData.summary.totalExpenses.toLocaleString()}`,
  ]);
  summarySheet.addRow([
    "Net Profit",
    `KSh ${reportData.summary.netProfit.toLocaleString()}`,
  ]);
  summarySheet.addRow([
    "Profit Margin",
    `${reportData.summary.profitMargin.toFixed(2)}%`,
  ]);

  // Auto-fit columns
  summarySheet.columns.forEach((column) => {
    column.width = 20;
  });

  if (includeDetails) {
    // Revenue sheet
    const revenueSheet = workbook.addWorksheet("Revenue Analysis");
    revenueSheet.addRow(["Revenue Metric", "Amount"]);
    revenueSheet.getRow(1).eachCell((cell) => {
      cell.style = headerStyle;
    });

    revenueSheet.addRow([
      "Total Fee Collection",
      reportData.revenue.totalFeeCollection,
    ]);
    revenueSheet.addRow(["Total Paid", reportData.revenue.totalPaid]);
    revenueSheet.addRow(["Total Pending", reportData.revenue.totalPending]);
    revenueSheet.addRow(["Total Overdue", reportData.revenue.totalOverdue]);
    revenueSheet.addRow([
      "Collection Rate (%)",
      reportData.revenue.collectionRate,
    ]);

    // Expenses sheet
    const expenseSheet = workbook.addWorksheet("Expense Analysis");
    expenseSheet.addRow(["Expense Metric", "Amount"]);
    expenseSheet.getRow(1).eachCell((cell) => {
      cell.style = headerStyle;
    });

    expenseSheet.addRow(["Total Expenses", reportData.expenses.totalExpenses]);
    expenseSheet.addRow([
      "Approved Expenses",
      reportData.expenses.approvedExpenses,
    ]);
    expenseSheet.addRow([
      "Pending Expenses",
      reportData.expenses.pendingExpenses,
    ]);

    // Monthly trends sheet
    if (reportData.monthlyTrends && reportData.monthlyTrends.length > 0) {
      const trendsSheet = workbook.addWorksheet("Monthly Trends");
      trendsSheet.addRow([
        "Month",
        "Revenue",
        "Expenses",
        "Profit",
        "Student Count",
      ]);
      trendsSheet.getRow(1).eachCell((cell) => {
        cell.style = headerStyle;
      });

      reportData.monthlyTrends.forEach((trend) => {
        trendsSheet.addRow([
          trend.month,
          trend.revenue,
          trend.expenses,
          trend.profit,
          trend.studentCount,
        ]);
      });
    }

    // Recent transactions sheet
    if (
      reportData.recentTransactions &&
      reportData.recentTransactions.length > 0
    ) {
      const transactionsSheet = workbook.addWorksheet("Recent Transactions");
      transactionsSheet.addRow([
        "Date",
        "Type",
        "Amount",
        "Description",
        "Method",
        "Student/Category",
      ]);
      transactionsSheet.getRow(1).eachCell((cell) => {
        cell.style = headerStyle;
      });

      reportData.recentTransactions.forEach((transaction) => {
        transactionsSheet.addRow([
          new Date(transaction.date).toLocaleDateString(),
          transaction.type,
          transaction.amount,
          transaction.description,
          transaction.method || "N/A",
          transaction.studentName || transaction.category || "N/A",
        ]);
      });
    }

    // Auto-fit all columns in all sheets
    workbook.eachSheet((sheet) => {
      sheet.columns.forEach((column) => {
        column.width = 20;
      });
    });
  }

  return await workbook.xlsx.writeBuffer();
};

// Helper function to generate CSV report
const generateCSVReport = async (reportData, includeDetails) => {
  let csvData = [];

  // Summary data
  csvData.push({
    section: "Summary",
    metric: "Total Revenue",
    value: reportData.summary.totalRevenue,
    unit: "KSh",
  });
  csvData.push({
    section: "Summary",
    metric: "Total Expenses",
    value: reportData.summary.totalExpenses,
    unit: "KSh",
  });
  csvData.push({
    section: "Summary",
    metric: "Net Profit",
    value: reportData.summary.netProfit,
    unit: "KSh",
  });
  csvData.push({
    section: "Summary",
    metric: "Profit Margin",
    value: reportData.summary.profitMargin,
    unit: "%",
  });

  if (includeDetails) {
    // Revenue data
    csvData.push({
      section: "Revenue",
      metric: "Total Fee Collection",
      value: reportData.revenue.totalFeeCollection,
      unit: "KSh",
    });
    csvData.push({
      section: "Revenue",
      metric: "Total Paid",
      value: reportData.revenue.totalPaid,
      unit: "KSh",
    });
    csvData.push({
      section: "Revenue",
      metric: "Collection Rate",
      value: reportData.revenue.collectionRate,
      unit: "%",
    });

    // Expense data
    csvData.push({
      section: "Expenses",
      metric: "Total Expenses",
      value: reportData.expenses.totalExpenses,
      unit: "KSh",
    });
    csvData.push({
      section: "Expenses",
      metric: "Approved Expenses",
      value: reportData.expenses.approvedExpenses,
      unit: "KSh",
    });

    // Monthly trends
    if (reportData.monthlyTrends) {
      reportData.monthlyTrends.forEach((trend) => {
        csvData.push({
          section: "Monthly Trends",
          metric: `${trend.month} Revenue`,
          value: trend.revenue,
          unit: "KSh",
        });
        csvData.push({
          section: "Monthly Trends",
          metric: `${trend.month} Expenses`,
          value: trend.expenses,
          unit: "KSh",
        });
        csvData.push({
          section: "Monthly Trends",
          metric: `${trend.month} Profit`,
          value: trend.profit,
          unit: "KSh",
        });
      });
    }
  }

  const fields = ["section", "metric", "value", "unit"];
  const parser = new Parser({ fields });
  return Buffer.from(parser.parse(csvData));
};

module.exports = {
  getComprehensiveReport,
  getFinancialDashboard,
  getFinancialKPIs,
  exportFinancialReport,
};
