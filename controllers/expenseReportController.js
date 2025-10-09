const Expense = require("../models/Expense");
const mongoose = require("mongoose");

// @desc    Get expense dashboard data
// @route   GET /api/expenses/reports/dashboard
// @access  Private (Admin, Secretary)
const getExpenseDashboard = async (req, res) => {
  try {
    const branchId = req.user.branchId;
    const now = new Date();

    // Current month expenses
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // Previous month expenses
    const previousMonthStart = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1
    );
    const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);

    // Current month statistics
    const currentMonthStats = await Expense.aggregate([
      {
        $match: {
          branchId,
          date: { $gte: currentMonthStart, $lt: currentMonthEnd },
        },
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$amount" },
          totalCount: { $sum: 1 },
          approvedAmount: {
            $sum: {
              $cond: [{ $eq: ["$approvalStatus", "approved"] }, "$amount", 0],
            },
          },
          pendingAmount: {
            $sum: {
              $cond: [{ $eq: ["$approvalStatus", "pending"] }, "$amount", 0],
            },
          },
          pendingCount: {
            $sum: { $cond: [{ $eq: ["$approvalStatus", "pending"] }, 1, 0] },
          },
        },
      },
    ]);

    // Previous month statistics for comparison
    const previousMonthStats = await Expense.aggregate([
      {
        $match: {
          branchId,
          date: { $gte: previousMonthStart, $lt: previousMonthEnd },
        },
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$amount" },
          approvedAmount: {
            $sum: {
              $cond: [{ $eq: ["$approvalStatus", "approved"] }, "$amount", 0],
            },
          },
        },
      },
    ]);

    // Top expense categories for current month
    const topCategories = await Expense.aggregate([
      {
        $match: {
          branchId,
          date: { $gte: currentMonthStart, $lt: currentMonthEnd },
          approvalStatus: "approved",
        },
      },
      {
        $group: {
          _id: "$category",
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { totalAmount: -1 } },
      { $limit: 5 },
    ]);

    // Recent expenses (last 10)
    const recentExpenses = await Expense.find({
      branchId,
    })
      .populate("recordedBy", "firstName lastName")
      .sort({ createdAt: -1 })
      .limit(10)
      .select("date category amount description approvalStatus recordedBy");

    // Monthly expense trend (last 12 months)
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const monthlyTrend = await Expense.aggregate([
      {
        $match: {
          branchId,
          date: { $gte: twelveMonthsAgo },
          approvalStatus: "approved",
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$date" },
            month: { $month: "$date" },
          },
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1 },
      },
    ]);

    // Format monthly trend data
    const monthlyData = [];
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;

      const monthData = monthlyTrend.find(
        (item) => item._id.year === year && item._id.month === month
      );

      monthlyData.push({
        month: date.toLocaleString("default", {
          month: "short",
          year: "numeric",
        }),
        amount: monthData ? monthData.totalAmount : 0,
        count: monthData ? monthData.count : 0,
      });
    }

    // Calculate percentage changes
    const currentTotal = currentMonthStats[0]?.totalAmount || 0;
    const previousTotal = previousMonthStats[0]?.totalAmount || 0;
    const percentageChange =
      previousTotal > 0
        ? (((currentTotal - previousTotal) / previousTotal) * 100).toFixed(2)
        : 0;

    res.json({
      success: true,
      data: {
        currentMonth: currentMonthStats[0] || {
          totalAmount: 0,
          totalCount: 0,
          approvedAmount: 0,
          pendingAmount: 0,
          pendingCount: 0,
        },
        comparison: {
          previousMonthTotal: previousTotal,
          percentageChange: parseFloat(percentageChange),
          trend:
            percentageChange > 0
              ? "increase"
              : percentageChange < 0
              ? "decrease"
              : "same",
        },
        topCategories,
        recentExpenses,
        monthlyTrend: monthlyData,
      },
    });
  } catch (error) {
    console.error("Get expense dashboard error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Get expense reports by category
// @route   GET /api/expenses/reports/by-category
// @access  Private (Admin, Secretary)
const getExpenseReportByCategory = async (req, res) => {
  try {
    const { startDate, endDate, page = 1, limit = 10 } = req.query;

    let dateFilter = { branchId: req.user.branchId };

    if (startDate || endDate) {
      dateFilter.date = {};
      if (startDate) dateFilter.date.$gte = new Date(startDate);
      if (endDate) dateFilter.date.$lte = new Date(endDate);
    }

    const categoryReport = await Expense.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: "$category",
          totalAmount: { $sum: "$amount" },
          totalCount: { $sum: 1 },
          approvedAmount: {
            $sum: {
              $cond: [{ $eq: ["$approvalStatus", "approved"] }, "$amount", 0],
            },
          },
          pendingAmount: {
            $sum: {
              $cond: [{ $eq: ["$approvalStatus", "pending"] }, "$amount", 0],
            },
          },
          rejectedAmount: {
            $sum: {
              $cond: [{ $eq: ["$approvalStatus", "rejected"] }, "$amount", 0],
            },
          },
          avgAmount: { $avg: "$amount" },
          maxAmount: { $max: "$amount" },
          minAmount: { $min: "$amount" },
        },
      },
      {
        $addFields: {
          approvalRate: {
            $multiply: [{ $divide: ["$approvedAmount", "$totalAmount"] }, 100],
          },
        },
      },
      { $sort: { totalAmount: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: parseInt(limit) },
    ]);

    // Get total for pagination
    const totalCategories = await Expense.aggregate([
      { $match: dateFilter },
      { $group: { _id: "$category" } },
      { $count: "total" },
    ]);

    const total = totalCategories[0]?.total || 0;

    res.json({
      success: true,
      data: categoryReport,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Get expense report by category error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Get expense trend analysis
// @route   GET /api/expenses/reports/trends
// @access  Private (Admin, Secretary)
const getExpenseTrendAnalysis = async (req, res) => {
  try {
    const { period = "monthly", year } = req.query;
    const targetYear = year ? parseInt(year) : new Date().getFullYear();

    let groupByPeriod;
    let sortField;

    switch (period) {
      case "daily":
        groupByPeriod = {
          year: { $year: "$date" },
          month: { $month: "$date" },
          day: { $dayOfMonth: "$date" },
        };
        sortField = { "_id.year": 1, "_id.month": 1, "_id.day": 1 };
        break;
      case "weekly":
        groupByPeriod = {
          year: { $year: "$date" },
          week: { $week: "$date" },
        };
        sortField = { "_id.year": 1, "_id.week": 1 };
        break;
      case "quarterly":
        groupByPeriod = {
          year: { $year: "$date" },
          quarter: {
            $ceil: { $divide: [{ $month: "$date" }, 3] },
          },
        };
        sortField = { "_id.year": 1, "_id.quarter": 1 };
        break;
      default: // monthly
        groupByPeriod = {
          year: { $year: "$date" },
          month: { $month: "$date" },
        };
        sortField = { "_id.year": 1, "_id.month": 1 };
    }

    const trendData = await Expense.aggregate([
      {
        $match: {
          branchId: req.user.branchId,
          date: {
            $gte: new Date(targetYear, 0, 1),
            $lt: new Date(targetYear + 1, 0, 1),
          },
        },
      },
      {
        $group: {
          _id: groupByPeriod,
          totalAmount: { $sum: "$amount" },
          approvedAmount: {
            $sum: {
              $cond: [{ $eq: ["$approvalStatus", "approved"] }, "$amount", 0],
            },
          },
          totalCount: { $sum: 1 },
          avgAmount: { $avg: "$amount" },
          categories: { $addToSet: "$category" },
        },
      },
      { $sort: sortField },
    ]);

    // Category trends
    const categoryTrends = await Expense.aggregate([
      {
        $match: {
          branchId: req.user.branchId,
          date: {
            $gte: new Date(targetYear, 0, 1),
            $lt: new Date(targetYear + 1, 0, 1),
          },
          approvalStatus: "approved",
        },
      },
      {
        $group: {
          _id: {
            category: "$category",
            period: groupByPeriod,
          },
          amount: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: "$_id.category",
          data: {
            $push: {
              period: "$_id.period",
              amount: "$amount",
              count: "$count",
            },
          },
          totalAmount: { $sum: "$amount" },
        },
      },
      { $sort: { totalAmount: -1 } },
      { $limit: 10 }, // Top 10 categories
    ]);

    res.json({
      success: true,
      data: {
        period,
        year: targetYear,
        overallTrend: trendData,
        categoryTrends,
      },
    });
  } catch (error) {
    console.error("Get expense trend analysis error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Get vendor analysis report
// @route   GET /api/expenses/reports/vendors
// @access  Private (Admin, Secretary)
const getVendorAnalysisReport = async (req, res) => {
  try {
    const { startDate, endDate, minAmount = 0 } = req.query;

    let dateFilter = {
      branchId: req.user.branchId,
      "vendor.name": { $exists: true, $ne: null, $ne: "" },
      amount: { $gte: parseFloat(minAmount) },
    };

    if (startDate || endDate) {
      dateFilter.date = {};
      if (startDate) dateFilter.date.$gte = new Date(startDate);
      if (endDate) dateFilter.date.$lte = new Date(endDate);
    }

    const vendorReport = await Expense.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: "$vendor.name",
          totalAmount: { $sum: "$amount" },
          totalTransactions: { $sum: 1 },
          avgTransactionAmount: { $avg: "$amount" },
          categories: { $addToSet: "$category" },
          lastTransaction: { $max: "$date" },
          contactInfo: { $first: "$vendor.contact" },
        },
      },
      {
        $addFields: {
          categoryCount: { $size: "$categories" },
        },
      },
      { $sort: { totalAmount: -1 } },
    ]);

    // Payment method distribution
    const paymentMethodDistribution = await Expense.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: "$paymentMethod",
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { totalAmount: -1 } },
    ]);

    res.json({
      success: true,
      data: {
        vendors: vendorReport,
        paymentMethodDistribution,
        summary: {
          totalVendors: vendorReport.length,
          totalAmount: vendorReport.reduce(
            (sum, vendor) => sum + vendor.totalAmount,
            0
          ),
          totalTransactions: vendorReport.reduce(
            (sum, vendor) => sum + vendor.totalTransactions,
            0
          ),
        },
      },
    });
  } catch (error) {
    console.error("Get vendor analysis report error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Export expense reports
// @route   GET /api/expenses/reports/export
// @access  Private (Admin, Secretary)
const exportExpenseReport = async (req, res) => {
  try {
    const {
      type = "all",
      format = "excel",
      startDate,
      endDate,
      category,
      approvalStatus,
    } = req.query;

    // Build query
    const query = { branchId: req.user.branchId };

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    if (category) query.category = category;
    if (approvalStatus) query.approvalStatus = approvalStatus;

    let data = [];
    let filename = "";

    switch (type) {
      case "summary":
        // Export summary by category
        const summaryData = await Expense.aggregate([
          { $match: query },
          {
            $group: {
              _id: "$category",
              totalAmount: { $sum: "$amount" },
              count: { $sum: 1 },
              approvedAmount: {
                $sum: {
                  $cond: [
                    { $eq: ["$approvalStatus", "approved"] },
                    "$amount",
                    0,
                  ],
                },
              },
              avgAmount: { $avg: "$amount" },
            },
          },
          { $sort: { totalAmount: -1 } },
        ]);

        data = summaryData.map((item) => ({
          Category: item._id,
          TotalAmount: item.totalAmount,
          Count: item.count,
          ApprovedAmount: item.approvedAmount,
          AverageAmount: Math.round(item.avgAmount),
          ApprovalRate: `${(
            (item.approvedAmount / item.totalAmount) *
            100
          ).toFixed(2)}%`,
        }));

        filename = `Expense_Summary_${new Date().toISOString().split("T")[0]}`;
        break;

      default: // all expenses
        const expenses = await Expense.find(query)
          .populate("recordedBy", "firstName lastName")
          .populate("approvedBy", "firstName lastName")
          .sort({ date: -1 });

        data = expenses.map((expense) => ({
          Date: expense.date.toISOString().split("T")[0],
          Category: expense.category,
          Subcategory: expense.subcategory || "",
          Description: expense.description,
          Amount: expense.amount,
          PaymentMethod: expense.paymentMethod,
          VendorName: expense.vendor?.name || "",
          ReceiptNumber: expense.receiptNumber || "",
          ApprovalStatus: expense.approvalStatus,
          RecordedBy: expense.recordedBy
            ? `${expense.recordedBy.firstName} ${expense.recordedBy.lastName}`
            : "",
          ApprovedBy: expense.approvedBy
            ? `${expense.approvedBy.firstName} ${expense.approvedBy.lastName}`
            : "",
          Notes: expense.notes || "",
        }));

        filename = `Expenses_Report_${new Date().toISOString().split("T")[0]}`;
    }

    if (format === "excel") {
      const ExcelJS = require("exceljs");
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Expense Report");

      if (data.length > 0) {
        // Add headers
        const headers = Object.keys(data[0]);
        worksheet.addRow(headers);

        // Add data
        data.forEach((row) => {
          worksheet.addRow(Object.values(row));
        });

        // Style headers
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFE6E6FA" },
        };

        // Auto-fit columns
        worksheet.columns.forEach((column) => {
          column.width = Math.max(12, column.header.length + 2);
        });
      }

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}.xlsx"`
      );

      await workbook.xlsx.write(res);
    } else {
      // CSV format
      const fields = data.length > 0 ? Object.keys(data[0]) : [];
      const { Parser } = require("json2csv");
      const json2csvParser = new Parser({ fields });
      const csv = json2csvParser.parse(data);

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}.csv"`
      );
      res.send(csv);
    }
  } catch (error) {
    console.error("Export expense report error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export report",
      error: error.message,
    });
  }
};

module.exports = {
  getExpenseDashboard,
  getExpenseReportByCategory,
  getExpenseTrendAnalysis,
  getVendorAnalysisReport,
  exportExpenseReport,
};
