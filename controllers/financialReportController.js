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

  // Get fee data from Fee collection (invoices) - NEW INVOICE-BASED SYSTEM
  const feeMatch = { ...branchFilter };
  if (Object.keys(dateFilter).length > 0) {
    // Filter by invoice period date, not creation date
    feeMatch.periodStart = dateFilter;
  }

  const feeAggregation = await Fee.aggregate([
    { $match: feeMatch },
    {
      $group: {
        _id: null,
        totalAmountDue: { $sum: "$totalAmountDue" },
        totalPaid: { $sum: "$amountPaid" },
        totalBalance: { $sum: "$balance" },
        totalScholarships: { $sum: "$scholarshipAmount" },
        totalDiscounts: { $sum: "$discountAmount" },
        paidCount: {
          $sum: { $cond: [{ $eq: ["$status", "paid"] }, 1, 0] },
        },
        partialCount: {
          $sum: { $cond: [{ $eq: ["$status", "partially_paid"] }, 1, 0] },
        },
        unpaidCount: {
          $sum: { $cond: [{ $eq: ["$status", "unpaid"] }, 1, 0] },
        },
        overdueCount: {
          $sum: { $cond: [{ $eq: ["$status", "overdue"] }, 1, 0] },
        },
        invoiceCount: { $sum: 1 },
      },
    },
  ]);

  // Get overdue amount separately
  const overdueMatch = {
    status: "overdue",
    ...branchFilter,
  };
  if (Object.keys(dateFilter).length > 0) {
    // Filter by invoice period date, not creation date
    overdueMatch.periodStart = dateFilter;
  }

  const overdueAggregation = await Fee.aggregate([
    { $match: overdueMatch },
    {
      $group: {
        _id: null,
        totalOverdue: { $sum: "$balance" },
      },
    },
  ]);

  const revenue = revenueAggregation[0] || { totalPaid: 0, count: 0 };
  const invoices = feeAggregation[0] || {
    totalAmountDue: 0,
    totalPaid: 0,
    totalBalance: 0,
    totalScholarships: 0,
    totalDiscounts: 0,
    paidCount: 0,
    partialCount: 0,
    unpaidCount: 0,
    overdueCount: 0,
    invoiceCount: 0,
  };
  const overdueData = overdueAggregation[0] || { totalOverdue: 0 };

  // Calculate totals from invoices
  const totalFeeCollection = invoices.totalAmountDue || 0;
  const totalPaid = invoices.totalPaid || 0;
  const totalPending = invoices.totalBalance || 0;
  const totalOverdue = overdueData.totalOverdue || 0;

  return {
    totalFeeCollection: totalFeeCollection,
    totalPaid: totalPaid,
    totalPending: totalPending,
    totalOverdue: totalOverdue,
    totalScholarships: invoices.totalScholarships || 0,
    totalDiscounts: invoices.totalDiscounts || 0,
    totalConcessions:
      (invoices.totalScholarships || 0) + (invoices.totalDiscounts || 0),
    collectionRate:
      totalFeeCollection > 0 ? (totalPaid / totalFeeCollection) * 100 : 0,
    overdueRate:
      totalFeeCollection > 0 ? (totalOverdue / totalFeeCollection) * 100 : 0,
    paidInvoices: invoices.paidCount,
    partialInvoices: invoices.partialCount,
    unpaidInvoices: invoices.unpaidCount,
    overdueInvoices: invoices.overdueCount,
    totalInvoices: invoices.invoiceCount,
    // Legacy fields for backward compatibility (will be same as invoice counts)
    paidStudents: invoices.paidCount,
    partialStudents: invoices.partialCount,
    unpaidStudents: invoices.unpaidCount,
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
  // Filter by invoice period date, not creation date
  if (Object.keys(dateFilter).length > 0) {
    feeScholarshipMatch.periodStart = dateFilter;
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

  return Array.from(trendsMap.values()).map((item) => {
    // Format month name for display
    let monthName = "";
    if (item.month) {
      const monthNames = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];
      monthName = `${monthNames[item.month - 1]} ${item.year}`;
    } else if (item.week) {
      monthName = `Week ${item.week}, ${item.year}`;
    } else if (item.quarter) {
      monthName = `Q${item.quarter} ${item.year}`;
    } else if (item.year) {
      monthName = `${item.year}`;
    }

    return {
      period: item,
      month: monthName, // Add formatted month for frontend
      revenue: item.revenue,
      expenses: item.expenses,
      netProfit: item.revenue - item.expenses,
      revenueCount: item.revenueCount,
      expenseCount: item.expenseCount,
    };
  });
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
        averageFeePerStudent: { $avg: "$totalAmountDue" },
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

// Helper function to get student statistics for export
const getStudentStatisticsForExport = async (branchId, dateFilter) => {
  const Student = require("../models/Student");
  const branchObjectId = new mongoose.Types.ObjectId(branchId);

  const hasDateFilter = dateFilter.$gte && dateFilter.$lte;
  const filterStartDate = dateFilter.$gte;
  const filterEndDate = dateFilter.$lte;

  // Calculate default date ranges
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59,
    999
  );
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  const [
    totalStudents,
    activeStudents,
    newEnrollmentsThisMonth,
    newEnrollmentsThisYear,
    statusCounts,
    departmentCounts,
    genderCounts,
    droppedThisYear,
    graduatedThisYear,
  ] = await Promise.all([
    Student.countDocuments({ branchId: branchObjectId }),
    Student.countDocuments({
      branchId: branchObjectId,
      academicStatus: "active",
    }),
    Student.countDocuments({
      branchId: branchObjectId,
      enrollmentDate: { $gte: startOfMonth, $lte: endOfMonth },
    }),
    Student.countDocuments({
      branchId: branchObjectId,
      enrollmentDate: { $gte: startOfYear },
    }),
    Student.aggregate([
      {
        $match: {
          branchId: branchObjectId,
          ...(hasDateFilter && {
            enrollmentDate: { $gte: filterStartDate, $lte: filterEndDate },
          }),
        },
      },
      { $group: { _id: "$academicStatus", count: { $sum: 1 } } },
    ]),
    Student.aggregate([
      {
        $match: {
          branchId: branchObjectId,
          ...(hasDateFilter && {
            enrollmentDate: { $gte: filterStartDate, $lte: filterEndDate },
          }),
        },
      },
      { $group: { _id: "$departmentId", count: { $sum: 1 } } },
      {
        $lookup: {
          from: "departments",
          localField: "_id",
          foreignField: "_id",
          as: "departmentInfo",
        },
      },
      {
        $unwind: { path: "$departmentInfo", preserveNullAndEmptyArrays: true },
      },
      { $sort: { count: -1 } },
    ]),
    Student.aggregate([
      {
        $match: {
          branchId: branchObjectId,
          ...(hasDateFilter && {
            enrollmentDate: { $gte: filterStartDate, $lte: filterEndDate },
          }),
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "userInfo",
        },
      },
      { $unwind: { path: "$userInfo", preserveNullAndEmptyArrays: true } },
      {
        $group: { _id: "$userInfo.profileDetails.gender", count: { $sum: 1 } },
      },
    ]),
    Student.countDocuments({
      branchId: branchObjectId,
      academicStatus: { $in: ["dropped", "transferred"] },
      ...(hasDateFilter
        ? {
            "statusHistory.changedAt": {
              $gte: filterStartDate,
              $lte: filterEndDate,
            },
          }
        : { "statusHistory.changedAt": { $gte: startOfYear } }),
    }),
    Student.countDocuments({
      branchId: branchObjectId,
      academicStatus: "graduated",
      ...(hasDateFilter
        ? {
            "statusHistory.changedAt": {
              $gte: filterStartDate,
              $lte: filterEndDate,
            },
          }
        : { "statusHistory.changedAt": { $gte: startOfYear } }),
    }),
  ]);

  // Process gender distribution
  const genderDistribution = { male: 0, female: 0, other: 0 };
  genderCounts.forEach((item) => {
    const gender = item._id?.toLowerCase() || "other";
    if (gender === "male") genderDistribution.male = item.count;
    else if (gender === "female") genderDistribution.female = item.count;
    else genderDistribution.other += item.count;
  });

  // Process status breakdown
  const statusBreakdown = {
    active: 0,
    inactive: 0,
    suspended: 0,
    graduated: 0,
    transferred: 0,
    dropped: 0,
  };
  statusCounts.forEach((item) => {
    if (item._id && statusBreakdown.hasOwnProperty(item._id)) {
      statusBreakdown[item._id] = item.count;
    }
  });

  return {
    totalStudents,
    activeStudents,
    inactiveStudents: totalStudents - activeStudents,
    newEnrollmentsThisMonth,
    newEnrollmentsThisYear,
    droppedThisYear,
    graduatedThisYear,
    retentionRate:
      totalStudents > 0
        ? Math.round(((totalStudents - droppedThisYear) / totalStudents) * 100)
        : 100,
    statusBreakdown,
    genderDistribution,
    departmentCounts: departmentCounts.map((item) => ({
      departmentName: item.departmentInfo?.name || "Unassigned",
      count: item.count,
    })),
  };
};

// Helper function to get teacher statistics for export
const getTeacherStatisticsForExport = async (branchId, dateFilter) => {
  const Teacher = require("../models/Teacher");
  const Student = require("../models/Student");
  const branchObjectId = new mongoose.Types.ObjectId(branchId);

  const hasDateFilter = dateFilter.$gte && dateFilter.$lte;
  const filterStartDate = dateFilter.$gte;
  const filterEndDate = dateFilter.$lte;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  const totalActiveStudents = await Student.countDocuments({
    branchId: branchObjectId,
    academicStatus: "active",
  });

  const [
    totalTeachers,
    activeTeachers,
    statusCounts,
    departmentCounts,
    employmentTypeCounts,
    attendanceStats,
    experienceStats,
    newHiresThisMonth,
    newHiresThisYear,
  ] = await Promise.all([
    Teacher.countDocuments({ branchId: branchObjectId }),
    Teacher.countDocuments({
      branchId: branchObjectId,
      employmentStatus: "active",
    }),
    Teacher.aggregate([
      {
        $match: {
          branchId: branchObjectId,
          ...(hasDateFilter && {
            joiningDate: { $gte: filterStartDate, $lte: filterEndDate },
          }),
        },
      },
      { $group: { _id: "$employmentStatus", count: { $sum: 1 } } },
    ]),
    Teacher.aggregate([
      {
        $match: {
          branchId: branchObjectId,
          ...(hasDateFilter && {
            joiningDate: { $gte: filterStartDate, $lte: filterEndDate },
          }),
        },
      },
      { $group: { _id: "$department", count: { $sum: 1 } } },
      {
        $lookup: {
          from: "departments",
          localField: "_id",
          foreignField: "_id",
          as: "departmentInfo",
        },
      },
      {
        $unwind: { path: "$departmentInfo", preserveNullAndEmptyArrays: true },
      },
      { $sort: { count: -1 } },
    ]),
    Teacher.aggregate([
      {
        $match: {
          branchId: branchObjectId,
          ...(hasDateFilter && {
            joiningDate: { $gte: filterStartDate, $lte: filterEndDate },
          }),
        },
      },
      { $group: { _id: "$employmentType", count: { $sum: 1 } } },
    ]),
    Teacher.aggregate([
      { $match: { branchId: branchObjectId, employmentStatus: "active" } },
      {
        $group: {
          _id: null,
          avgAttendanceRate: { $avg: "$attendance.attendancePercentage" },
          totalPresent: { $sum: "$attendance.daysPresent" },
          totalAbsent: { $sum: "$attendance.daysAbsent" },
        },
      },
    ]),
    Teacher.aggregate([
      {
        $match: {
          branchId: branchObjectId,
          ...(hasDateFilter && {
            joiningDate: { $gte: filterStartDate, $lte: filterEndDate },
          }),
        },
      },
      {
        $group: {
          _id: null,
          avgExperience: { $avg: "$qualification.experience.totalYears" },
        },
      },
    ]),
    Teacher.countDocuments({
      branchId: branchObjectId,
      joiningDate: { $gte: startOfMonth },
    }),
    Teacher.countDocuments({
      branchId: branchObjectId,
      joiningDate: { $gte: startOfYear },
    }),
  ]);

  // Process status breakdown
  const statusBreakdown = {
    active: 0,
    inactive: 0,
    terminated: 0,
    resigned: 0,
    on_leave: 0,
  };
  statusCounts.forEach((item) => {
    if (item._id && statusBreakdown.hasOwnProperty(item._id)) {
      statusBreakdown[item._id] = item.count;
    } else if (!item._id) {
      statusBreakdown.active += item.count;
    }
  });

  // Process employment type breakdown
  const employmentTypeBreakdown = { full_time: 0, part_time: 0, contract: 0 };
  employmentTypeCounts.forEach((item) => {
    if (item._id && employmentTypeBreakdown.hasOwnProperty(item._id)) {
      employmentTypeBreakdown[item._id] = item.count;
    }
  });

  const attendance = attendanceStats[0] || { avgAttendanceRate: 0 };
  const experience = experienceStats[0] || { avgExperience: 0 };

  return {
    totalTeachers,
    activeTeachers,
    inactiveTeachers: totalTeachers - activeTeachers,
    newHiresThisMonth,
    newHiresThisYear,
    studentTeacherRatio:
      activeTeachers > 0
        ? Math.round((totalActiveStudents / activeTeachers) * 10) / 10
        : 0,
    averageAttendanceRate:
      Math.round((attendance.avgAttendanceRate || 0) * 10) / 10,
    averageExperience: Math.round((experience.avgExperience || 0) * 10) / 10,
    statusBreakdown,
    employmentTypeBreakdown,
    departmentCounts: departmentCounts.map((item) => ({
      departmentName: item.departmentInfo?.name || "Unassigned",
      count: item.count,
    })),
  };
};

// Helper function to get course statistics for export
const getCourseStatisticsForExport = async (branchId) => {
  const Course = require("../models/Course");
  const branchObjectId = new mongoose.Types.ObjectId(branchId);

  const [totalCourses, activeCourses, coursesByDepartment] = await Promise.all([
    Course.countDocuments({ branchId: branchObjectId }),
    Course.countDocuments({ branchId: branchObjectId, status: "active" }),
    Course.aggregate([
      { $match: { branchId: branchObjectId } },
      { $group: { _id: "$departmentId", count: { $sum: 1 } } },
      {
        $lookup: {
          from: "departments",
          localField: "_id",
          foreignField: "_id",
          as: "departmentInfo",
        },
      },
      {
        $unwind: { path: "$departmentInfo", preserveNullAndEmptyArrays: true },
      },
      { $sort: { count: -1 } },
    ]),
  ]);

  return {
    totalCourses,
    activeCourses,
    inactiveCourses: totalCourses - activeCourses,
    coursesByDepartment: coursesByDepartment.map((item) => ({
      departmentName: item.departmentInfo?.name || "Unassigned",
      count: item.count,
    })),
  };
};

// Helper function to get attendance statistics for export
const getAttendanceStatisticsForExport = async (branchId, dateFilter) => {
  const Attendance = require("../models/Attendance");
  const branchObjectId = new mongoose.Types.ObjectId(branchId);

  const hasDateFilter = dateFilter.$gte && dateFilter.$lte;
  const dateQuery = hasDateFilter
    ? { date: { $gte: dateFilter.$gte, $lte: dateFilter.$lte } }
    : {};

  try {
    const attendanceStats = await Attendance.aggregate([
      { $match: { branchId: branchObjectId, ...dateQuery } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const statusMap = { present: 0, absent: 0, late: 0, excused: 0 };
    attendanceStats.forEach((stat) => {
      if (stat._id && statusMap.hasOwnProperty(stat._id)) {
        statusMap[stat._id] = stat.count;
      }
    });

    const totalRecords = Object.values(statusMap).reduce((a, b) => a + b, 0);
    const attendanceRate =
      totalRecords > 0
        ? Math.round((statusMap.present / totalRecords) * 100)
        : 0;

    return {
      totalRecords,
      present: statusMap.present,
      absent: statusMap.absent,
      late: statusMap.late,
      excused: statusMap.excused,
      attendanceRate,
    };
  } catch (error) {
    console.error("Error getting attendance stats:", error);
    return {
      totalRecords: 0,
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
      attendanceRate: 0,
    };
  }
};

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
      comprehensiveReport = false, // New flag for full dashboard export
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

    // If comprehensive report requested, add academic and operational data
    if (comprehensiveReport && effectiveBranchId) {
      try {
        // Get branch info
        const Branch = require("../models/Branch");
        const branch = await Branch.findById(effectiveBranchId);
        reportData.branchInfo = branch
          ? { name: branch.name, code: branch.code }
          : { name: "All Branches", code: "ALL" };

        // Get student statistics
        reportData.studentStatistics = await getStudentStatisticsForExport(
          effectiveBranchId,
          dateFilter
        );

        // Get teacher statistics
        reportData.teacherStatistics = await getTeacherStatisticsForExport(
          effectiveBranchId,
          dateFilter
        );

        // Get course statistics
        reportData.courseStatistics = await getCourseStatisticsForExport(
          effectiveBranchId
        );

        // Get attendance statistics
        reportData.attendanceStatistics =
          await getAttendanceStatisticsForExport(effectiveBranchId, dateFilter);
      } catch (error) {
        console.error("Error fetching comprehensive report data:", error);
        // Continue with partial data
      }
    }

    // Generate export based on format
    let buffer;
    let filename;
    let contentType;

    const reportPrefix = comprehensiveReport
      ? "comprehensive-branch-report"
      : "financial-report";

    switch (format) {
      case "pdf":
        buffer = await generatePDFReport(
          reportData,
          includeDetails,
          comprehensiveReport
        );
        filename = `${reportPrefix}-${
          new Date().toISOString().split("T")[0]
        }.pdf`;
        contentType = "application/pdf";
        break;

      case "excel":
        buffer = await generateExcelReport(
          reportData,
          includeDetails,
          comprehensiveReport
        );
        filename = `${reportPrefix}-${
          new Date().toISOString().split("T")[0]
        }.xlsx`;
        contentType =
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        break;

      case "csv":
        buffer = await generateCSVReport(reportData, includeDetails);
        filename = `${reportPrefix}-${
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
const generatePDFReport = async (
  reportData,
  includeDetails,
  comprehensiveReport = false
) => {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 612;
  const pageHeight = 792;

  // Use an object to hold mutable state so closures work correctly
  const state = {
    page: pdfDoc.addPage([pageWidth, pageHeight]),
    yPosition: pageHeight - 50,
  };

  // Helper function to add text - uses state.page
  const addText = (text, x, y, options = {}) => {
    try {
      state.page.drawText(String(text || ""), {
        x,
        y,
        size: options.size || 12,
        font: options.bold ? boldFont : font,
        color: options.color || rgb(0, 0, 0),
      });
    } catch (err) {
      console.error("Error drawing text:", text, err);
    }
  };

  // Helper function to check if we need a new page
  const checkNewPage = (requiredSpace = 50) => {
    if (state.yPosition < requiredSpace) {
      state.page = pdfDoc.addPage([pageWidth, pageHeight]);
      state.yPosition = pageHeight - 50;
    }
  };

  // Helper function to draw a section header with underline
  const drawSectionHeader = (title) => {
    checkNewPage(60);
    addText(title, 50, state.yPosition, {
      size: 16,
      bold: true,
      color: rgb(0.2, 0.3, 0.5),
    });
    state.page.drawLine({
      start: { x: 50, y: state.yPosition - 5 },
      end: { x: 560, y: state.yPosition - 5 },
      thickness: 1,
      color: rgb(0.2, 0.3, 0.5),
    });
    state.yPosition -= 30;
  };

  // Helper function to add a key-value pair
  const addKeyValue = (key, value, xKey = 50, xValue = 250) => {
    checkNewPage(25);
    addText(key, xKey, state.yPosition);
    addText(String(value || ""), xValue, state.yPosition, { bold: true });
    state.yPosition -= 18;
  };

  // =============================================
  // COVER PAGE (for comprehensive reports)
  // =============================================
  if (comprehensiveReport) {
    state.yPosition = pageHeight - 200;
    addText(
      "COMPREHENSIVE BRANCH REPORT",
      pageWidth / 2 - 150,
      state.yPosition,
      {
        size: 24,
        bold: true,
        color: rgb(0.2, 0.3, 0.5),
      }
    );
    state.yPosition -= 50;

    if (reportData.branchInfo) {
      addText(reportData.branchInfo.name, pageWidth / 2 - 80, state.yPosition, {
        size: 18,
        bold: true,
      });
      state.yPosition -= 30;
    }

    addText(
      `Generated: ${new Date().toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })}`,
      pageWidth / 2 - 100,
      state.yPosition,
      { size: 14 }
    );
    state.yPosition -= 30;

    if (reportData.summary.period) {
      addText(
        `Report Period: ${new Date(
          reportData.summary.period.startDate
        ).toLocaleDateString()} - ${new Date(
          reportData.summary.period.endDate
        ).toLocaleDateString()}`,
        pageWidth / 2 - 120,
        state.yPosition,
        { size: 12 }
      );
    }

    // Add a divider line
    state.yPosition -= 80;
    state.page.drawLine({
      start: { x: 100, y: state.yPosition },
      end: { x: 512, y: state.yPosition },
      thickness: 2,
      color: rgb(0.2, 0.3, 0.5),
    });

    state.yPosition -= 40;
    addText("This report includes:", pageWidth / 2 - 80, state.yPosition, {
      size: 14,
      bold: true,
    });
    state.yPosition -= 25;
    addText("• Financial Reports & Analytics", 180, state.yPosition, {
      size: 12,
    });
    state.yPosition -= 20;
    addText("• Student Statistics & Demographics", 180, state.yPosition, {
      size: 12,
    });
    state.yPosition -= 20;
    addText("• Teacher Statistics & Employment Data", 180, state.yPosition, {
      size: 12,
    });
    state.yPosition -= 20;
    addText("• Course & Department Distribution", 180, state.yPosition, {
      size: 12,
    });
    state.yPosition -= 20;
    addText("• Attendance Summary", 180, state.yPosition, { size: 12 });

    // Start new page for content
    state.page = pdfDoc.addPage([pageWidth, pageHeight]);
    state.yPosition = pageHeight - 50;
  }

  // =============================================
  // FINANCIAL SECTION
  // =============================================
  addText(
    comprehensiveReport ? "SECTION 1: FINANCIAL REPORTS" : "Financial Report",
    50,
    state.yPosition,
    { size: 20, bold: true, color: rgb(0.2, 0.3, 0.5) }
  );
  state.yPosition -= 30;

  if (!comprehensiveReport) {
    addText(
      `Generated: ${new Date().toLocaleDateString()}`,
      50,
      state.yPosition
    );
    state.yPosition -= 20;

    if (reportData.summary.period) {
      addText(
        `Period: ${new Date(
          reportData.summary.period.startDate
        ).toLocaleDateString()} - ${new Date(
          reportData.summary.period.endDate
        ).toLocaleDateString()}`,
        50,
        state.yPosition
      );
      state.yPosition -= 30;
    }
  }

  // Financial Summary
  drawSectionHeader("Financial Summary");

  addKeyValue(
    "Total Revenue:",
    `KSh ${(reportData.summary.totalRevenue || 0).toLocaleString()}`
  );
  addKeyValue(
    "Total Expenses:",
    `KSh ${(reportData.summary.totalExpenses || 0).toLocaleString()}`
  );
  addKeyValue(
    "Net Profit:",
    `KSh ${(reportData.summary.netProfit || 0).toLocaleString()}`
  );
  addKeyValue(
    "Profit Margin:",
    `${(reportData.summary.profitMargin || 0).toFixed(2)}%`
  );
  state.yPosition -= 20;

  // Revenue Analysis
  if (includeDetails) {
    drawSectionHeader("Revenue Analysis");

    addKeyValue(
      "Total Fee Collection:",
      `KSh ${(reportData.revenue?.totalFeeCollection || 0).toLocaleString()}`
    );
    addKeyValue(
      "Total Paid:",
      `KSh ${(reportData.revenue?.totalPaid || 0).toLocaleString()}`
    );
    addKeyValue(
      "Total Pending:",
      `KSh ${(reportData.revenue?.totalPending || 0).toLocaleString()}`
    );
    addKeyValue(
      "Total Overdue:",
      `KSh ${(reportData.revenue?.totalOverdue || 0).toLocaleString()}`
    );
    addKeyValue(
      "Collection Rate:",
      `${(reportData.revenue?.collectionRate || 0).toFixed(2)}%`
    );
    state.yPosition -= 20;

    // Expense Analysis
    drawSectionHeader("Expense Analysis");

    addKeyValue(
      "Total Expenses:",
      `KSh ${(reportData.expenses?.totalExpenses || 0).toLocaleString()}`
    );
    addKeyValue(
      "Approved Expenses:",
      `KSh ${(reportData.expenses?.approvedExpenses || 0).toLocaleString()}`
    );
    addKeyValue(
      "Pending Expenses:",
      `KSh ${(reportData.expenses?.pendingExpenses || 0).toLocaleString()}`
    );
    state.yPosition -= 20;

    // Student Fee Analysis
    drawSectionHeader("Student Fee Analysis");

    addKeyValue(
      "Total Students:",
      reportData.studentAnalysis?.totalStudents || 0
    );
    addKeyValue("Paid in Full:", reportData.studentAnalysis?.paidInFull || 0);
    addKeyValue(
      "Partially Paid:",
      reportData.studentAnalysis?.partiallyPaid || 0
    );
    addKeyValue("Unpaid:", reportData.studentAnalysis?.unpaid || 0);
    state.yPosition -= 20;
  }

  // =============================================
  // ACADEMIC SECTION (for comprehensive reports)
  // =============================================
  if (comprehensiveReport && reportData.studentStatistics) {
    // Start new page for academic section
    state.page = pdfDoc.addPage([pageWidth, pageHeight]);
    state.yPosition = pageHeight - 50;

    addText("SECTION 2: ACADEMIC REPORTS", 50, state.yPosition, {
      size: 20,
      bold: true,
      color: rgb(0.2, 0.3, 0.5),
    });
    state.yPosition -= 40;

    // Student Statistics
    drawSectionHeader("Student Statistics");
    const studentStats = reportData.studentStatistics;

    addKeyValue("Total Students:", studentStats.totalStudents || 0);
    addKeyValue("Active Students:", studentStats.activeStudents || 0);
    addKeyValue("Inactive Students:", studentStats.inactiveStudents || 0);
    addKeyValue(
      "New Enrollments (This Month):",
      studentStats.newEnrollmentsThisMonth || 0
    );
    addKeyValue(
      "New Enrollments (This Year):",
      studentStats.newEnrollmentsThisYear || 0
    );
    addKeyValue("Graduated (This Year):", studentStats.graduatedThisYear || 0);
    addKeyValue("Dropped (This Year):", studentStats.droppedThisYear || 0);
    addKeyValue("Retention Rate:", `${studentStats.retentionRate || 0}%`);
    state.yPosition -= 20;

    // Student Status Breakdown
    if (studentStats.statusBreakdown) {
      drawSectionHeader("Student Status Breakdown");
      Object.entries(studentStats.statusBreakdown).forEach(
        ([status, count]) => {
          addKeyValue(
            `${status.charAt(0).toUpperCase() + status.slice(1)}:`,
            count
          );
        }
      );
      state.yPosition -= 20;
    }

    // Gender Distribution
    if (studentStats.genderDistribution) {
      drawSectionHeader("Gender Distribution");
      addKeyValue("Male:", studentStats.genderDistribution.male || 0);
      addKeyValue("Female:", studentStats.genderDistribution.female || 0);
      addKeyValue("Other:", studentStats.genderDistribution.other || 0);
      state.yPosition -= 20;
    }

    // Department Distribution
    if (
      studentStats.departmentCounts &&
      studentStats.departmentCounts.length > 0
    ) {
      checkNewPage(150);
      drawSectionHeader("Students by Department");
      studentStats.departmentCounts.slice(0, 10).forEach((dept) => {
        addKeyValue(`${dept.departmentName}:`, dept.count);
      });
      state.yPosition -= 20;
    }
  }

  // =============================================
  // TEACHER SECTION (for comprehensive reports)
  // =============================================
  if (comprehensiveReport && reportData.teacherStatistics) {
    // Start new page for teacher section
    state.page = pdfDoc.addPage([pageWidth, pageHeight]);
    state.yPosition = pageHeight - 50;

    addText("SECTION 3: STAFF & TEACHER REPORTS", 50, state.yPosition, {
      size: 20,
      bold: true,
      color: rgb(0.2, 0.3, 0.5),
    });
    state.yPosition -= 40;

    // Teacher Statistics
    drawSectionHeader("Teacher Statistics");
    const teacherStats = reportData.teacherStatistics;

    addKeyValue("Total Teachers:", teacherStats.totalTeachers || 0);
    addKeyValue("Active Teachers:", teacherStats.activeTeachers || 0);
    addKeyValue("Inactive Teachers:", teacherStats.inactiveTeachers || 0);
    addKeyValue("New Hires (This Month):", teacherStats.newHiresThisMonth || 0);
    addKeyValue("New Hires (This Year):", teacherStats.newHiresThisYear || 0);
    addKeyValue(
      "Student-Teacher Ratio:",
      `${teacherStats.studentTeacherRatio || 0}:1`
    );
    addKeyValue(
      "Average Experience:",
      `${teacherStats.averageExperience || 0} years`
    );
    addKeyValue(
      "Average Attendance Rate:",
      `${teacherStats.averageAttendanceRate || 0}%`
    );
    state.yPosition -= 20;

    // Teacher Status Breakdown
    if (teacherStats.statusBreakdown) {
      drawSectionHeader("Teacher Status Breakdown");
      Object.entries(teacherStats.statusBreakdown).forEach(
        ([status, count]) => {
          if (count > 0) {
            const formattedStatus = status
              .replace(/_/g, " ")
              .replace(/\b\w/g, (l) => l.toUpperCase());
            addKeyValue(`${formattedStatus}:`, count);
          }
        }
      );
      state.yPosition -= 20;
    }

    // Employment Type Breakdown
    if (teacherStats.employmentTypeBreakdown) {
      checkNewPage(150);
      drawSectionHeader("Employment Type Breakdown");
      Object.entries(teacherStats.employmentTypeBreakdown).forEach(
        ([type, count]) => {
          if (count > 0) {
            const formattedType = type
              .replace(/_/g, " ")
              .replace(/\b\w/g, (l) => l.toUpperCase());
            addKeyValue(`${formattedType}:`, count);
          }
        }
      );
      state.yPosition -= 20;
    }

    // Teachers by Department
    if (
      teacherStats.departmentCounts &&
      teacherStats.departmentCounts.length > 0
    ) {
      checkNewPage(150);
      drawSectionHeader("Teachers by Department");
      teacherStats.departmentCounts.slice(0, 10).forEach((dept) => {
        addKeyValue(`${dept.departmentName}:`, dept.count);
      });
      state.yPosition -= 20;
    }
  }

  // =============================================
  // OPERATIONAL SECTION (for comprehensive reports)
  // =============================================
  if (
    comprehensiveReport &&
    (reportData.courseStatistics || reportData.attendanceStatistics)
  ) {
    // Start new page for operational section
    state.page = pdfDoc.addPage([pageWidth, pageHeight]);
    state.yPosition = pageHeight - 50;

    addText("SECTION 4: OPERATIONAL REPORTS", 50, state.yPosition, {
      size: 20,
      bold: true,
      color: rgb(0.2, 0.3, 0.5),
    });
    state.yPosition -= 40;

    // Course Statistics
    if (reportData.courseStatistics) {
      drawSectionHeader("Course Statistics");
      const courseStats = reportData.courseStatistics;

      addKeyValue("Total Courses:", courseStats.totalCourses || 0);
      addKeyValue("Active Courses:", courseStats.activeCourses || 0);
      addKeyValue("Inactive Courses:", courseStats.inactiveCourses || 0);
      state.yPosition -= 20;

      // Courses by Department
      if (
        courseStats.coursesByDepartment &&
        courseStats.coursesByDepartment.length > 0
      ) {
        drawSectionHeader("Courses by Department");
        courseStats.coursesByDepartment.slice(0, 10).forEach((dept) => {
          addKeyValue(`${dept.departmentName}:`, dept.count);
        });
        state.yPosition -= 20;
      }
    }

    // Attendance Statistics
    if (reportData.attendanceStatistics) {
      checkNewPage(200);
      drawSectionHeader("Attendance Summary");
      const attendanceStats = reportData.attendanceStatistics;

      addKeyValue("Total Records:", attendanceStats.totalRecords || 0);
      addKeyValue("Present:", attendanceStats.present || 0);
      addKeyValue("Absent:", attendanceStats.absent || 0);
      addKeyValue("Late:", attendanceStats.late || 0);
      addKeyValue("Excused:", attendanceStats.excused || 0);
      addKeyValue(
        "Attendance Rate:",
        `${attendanceStats.attendanceRate || 0}%`
      );
      state.yPosition -= 20;
    }
  }

  // =============================================
  // FOOTER ON LAST PAGE
  // =============================================
  if (comprehensiveReport) {
    checkNewPage(100);
    state.yPosition = 80;
    state.page.drawLine({
      start: { x: 50, y: state.yPosition },
      end: { x: 560, y: state.yPosition },
      thickness: 1,
      color: rgb(0.5, 0.5, 0.5),
    });
    state.yPosition -= 20;
    addText(
      "This report was generated automatically by the College Management System.",
      50,
      state.yPosition,
      { size: 10, color: rgb(0.5, 0.5, 0.5) }
    );
    state.yPosition -= 15;
    addText(
      `Report generated on ${new Date().toLocaleString()}`,
      50,
      state.yPosition,
      { size: 10, color: rgb(0.5, 0.5, 0.5) }
    );
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
};

// Helper function to generate Excel report
const generateExcelReport = async (
  reportData,
  includeDetails,
  comprehensiveReport = false
) => {
  const workbook = new ExcelJS.Workbook();

  // Header styling
  const headerStyle = {
    font: { bold: true, size: 14 },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF366092" } },
    font: { color: { argb: "FFFFFFFF" }, bold: true },
    alignment: { horizontal: "center" },
  };

  const sectionHeaderStyle = {
    font: { bold: true, size: 12 },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } },
    font: { color: { argb: "FFFFFFFF" }, bold: true },
  };

  // Summary sheet
  const summarySheet = workbook.addWorksheet("Financial Summary");

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
    column.width = 25;
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
  }

  // =============================================
  // ACADEMIC DATA (for comprehensive reports)
  // =============================================
  if (comprehensiveReport && reportData.studentStatistics) {
    const studentSheet = workbook.addWorksheet("Student Statistics");
    const studentStats = reportData.studentStatistics;

    studentSheet.addRow(["Student Statistics"]);
    studentSheet.getCell("A1").style = { font: { bold: true, size: 16 } };
    studentSheet.addRow([]);

    studentSheet.addRow(["Metric", "Value"]);
    studentSheet.getRow(3).eachCell((cell) => {
      cell.style = headerStyle;
    });

    studentSheet.addRow(["Total Students", studentStats.totalStudents || 0]);
    studentSheet.addRow(["Active Students", studentStats.activeStudents || 0]);
    studentSheet.addRow([
      "Inactive Students",
      studentStats.inactiveStudents || 0,
    ]);
    studentSheet.addRow([
      "New Enrollments (This Month)",
      studentStats.newEnrollmentsThisMonth || 0,
    ]);
    studentSheet.addRow([
      "New Enrollments (This Year)",
      studentStats.newEnrollmentsThisYear || 0,
    ]);
    studentSheet.addRow([
      "Graduated (This Year)",
      studentStats.graduatedThisYear || 0,
    ]);
    studentSheet.addRow([
      "Dropped (This Year)",
      studentStats.droppedThisYear || 0,
    ]);
    studentSheet.addRow([
      "Retention Rate (%)",
      studentStats.retentionRate || 0,
    ]);
    studentSheet.addRow([]);

    // Gender distribution
    if (studentStats.genderDistribution) {
      studentSheet.addRow(["Gender Distribution"]);
      studentSheet.addRow(["Male", studentStats.genderDistribution.male || 0]);
      studentSheet.addRow([
        "Female",
        studentStats.genderDistribution.female || 0,
      ]);
      studentSheet.addRow([
        "Other",
        studentStats.genderDistribution.other || 0,
      ]);
      studentSheet.addRow([]);
    }

    // Status breakdown
    if (studentStats.statusBreakdown) {
      studentSheet.addRow(["Status Breakdown"]);
      Object.entries(studentStats.statusBreakdown).forEach(
        ([status, count]) => {
          studentSheet.addRow([
            status.charAt(0).toUpperCase() + status.slice(1),
            count,
          ]);
        }
      );
      studentSheet.addRow([]);
    }

    // Department distribution
    if (
      studentStats.departmentCounts &&
      studentStats.departmentCounts.length > 0
    ) {
      studentSheet.addRow(["Students by Department"]);
      studentStats.departmentCounts.forEach((dept) => {
        studentSheet.addRow([dept.departmentName, dept.count]);
      });
    }

    studentSheet.columns.forEach((column) => {
      column.width = 30;
    });
  }

  // =============================================
  // TEACHER DATA (for comprehensive reports)
  // =============================================
  if (comprehensiveReport && reportData.teacherStatistics) {
    const teacherSheet = workbook.addWorksheet("Teacher Statistics");
    const teacherStats = reportData.teacherStatistics;

    teacherSheet.addRow(["Teacher Statistics"]);
    teacherSheet.getCell("A1").style = { font: { bold: true, size: 16 } };
    teacherSheet.addRow([]);

    teacherSheet.addRow(["Metric", "Value"]);
    teacherSheet.getRow(3).eachCell((cell) => {
      cell.style = headerStyle;
    });

    teacherSheet.addRow(["Total Teachers", teacherStats.totalTeachers || 0]);
    teacherSheet.addRow(["Active Teachers", teacherStats.activeTeachers || 0]);
    teacherSheet.addRow([
      "Inactive Teachers",
      teacherStats.inactiveTeachers || 0,
    ]);
    teacherSheet.addRow([
      "New Hires (This Month)",
      teacherStats.newHiresThisMonth || 0,
    ]);
    teacherSheet.addRow([
      "New Hires (This Year)",
      teacherStats.newHiresThisYear || 0,
    ]);
    teacherSheet.addRow([
      "Student-Teacher Ratio",
      `${teacherStats.studentTeacherRatio || 0}:1`,
    ]);
    teacherSheet.addRow([
      "Average Experience (Years)",
      teacherStats.averageExperience || 0,
    ]);
    teacherSheet.addRow([
      "Average Attendance Rate (%)",
      teacherStats.averageAttendanceRate || 0,
    ]);
    teacherSheet.addRow([]);

    // Status breakdown
    if (teacherStats.statusBreakdown) {
      teacherSheet.addRow(["Status Breakdown"]);
      Object.entries(teacherStats.statusBreakdown).forEach(
        ([status, count]) => {
          if (count > 0) {
            teacherSheet.addRow([
              status
                .replace(/_/g, " ")
                .replace(/\b\w/g, (l) => l.toUpperCase()),
              count,
            ]);
          }
        }
      );
      teacherSheet.addRow([]);
    }

    // Employment type breakdown
    if (teacherStats.employmentTypeBreakdown) {
      teacherSheet.addRow(["Employment Type Breakdown"]);
      Object.entries(teacherStats.employmentTypeBreakdown).forEach(
        ([type, count]) => {
          if (count > 0) {
            teacherSheet.addRow([
              type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
              count,
            ]);
          }
        }
      );
      teacherSheet.addRow([]);
    }

    // Department distribution
    if (
      teacherStats.departmentCounts &&
      teacherStats.departmentCounts.length > 0
    ) {
      teacherSheet.addRow(["Teachers by Department"]);
      teacherStats.departmentCounts.forEach((dept) => {
        teacherSheet.addRow([dept.departmentName, dept.count]);
      });
    }

    teacherSheet.columns.forEach((column) => {
      column.width = 30;
    });
  }

  // =============================================
  // OPERATIONAL DATA (for comprehensive reports)
  // =============================================
  if (
    comprehensiveReport &&
    (reportData.courseStatistics || reportData.attendanceStatistics)
  ) {
    const operationalSheet = workbook.addWorksheet("Operational Data");

    operationalSheet.addRow(["Operational Statistics"]);
    operationalSheet.getCell("A1").style = { font: { bold: true, size: 16 } };
    operationalSheet.addRow([]);

    // Course Statistics
    if (reportData.courseStatistics) {
      const courseStats = reportData.courseStatistics;

      operationalSheet.addRow(["Course Statistics"]);
      operationalSheet.addRow(["Metric", "Value"]);
      operationalSheet.addRow(["Total Courses", courseStats.totalCourses || 0]);
      operationalSheet.addRow([
        "Active Courses",
        courseStats.activeCourses || 0,
      ]);
      operationalSheet.addRow([
        "Inactive Courses",
        courseStats.inactiveCourses || 0,
      ]);
      operationalSheet.addRow([]);

      if (
        courseStats.coursesByDepartment &&
        courseStats.coursesByDepartment.length > 0
      ) {
        operationalSheet.addRow(["Courses by Department"]);
        courseStats.coursesByDepartment.forEach((dept) => {
          operationalSheet.addRow([dept.departmentName, dept.count]);
        });
        operationalSheet.addRow([]);
      }
    }

    // Attendance Statistics
    if (reportData.attendanceStatistics) {
      const attendanceStats = reportData.attendanceStatistics;

      operationalSheet.addRow(["Attendance Summary"]);
      operationalSheet.addRow(["Metric", "Value"]);
      operationalSheet.addRow([
        "Total Records",
        attendanceStats.totalRecords || 0,
      ]);
      operationalSheet.addRow(["Present", attendanceStats.present || 0]);
      operationalSheet.addRow(["Absent", attendanceStats.absent || 0]);
      operationalSheet.addRow(["Late", attendanceStats.late || 0]);
      operationalSheet.addRow(["Excused", attendanceStats.excused || 0]);
      operationalSheet.addRow([
        "Attendance Rate (%)",
        attendanceStats.attendanceRate || 0,
      ]);
    }

    operationalSheet.columns.forEach((column) => {
      column.width = 30;
    });
  }

  // Auto-fit all columns in all sheets
  workbook.eachSheet((sheet) => {
    sheet.columns.forEach((column) => {
      column.width = Math.max(column.width || 20, 20);
    });
  });

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
