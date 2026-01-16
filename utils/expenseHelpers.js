const Expense = require("../models/Expense");

// Calculate expense statistics for a given period
const calculateExpenseStats = async (branchId, startDate, endDate) => {
  try {
    const query = { branchId };

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const stats = await Expense.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalExpenses: { $sum: "$amount" },
          totalCount: { $sum: 1 },
          avgExpense: { $avg: "$amount" },
          maxExpense: { $max: "$amount" },
          minExpense: { $min: "$amount" },
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
          approvedCount: {
            $sum: { $cond: [{ $eq: ["$approvalStatus", "approved"] }, 1, 0] },
          },
          pendingCount: {
            $sum: { $cond: [{ $eq: ["$approvalStatus", "pending"] }, 1, 0] },
          },
          rejectedCount: {
            $sum: { $cond: [{ $eq: ["$approvalStatus", "rejected"] }, 1, 0] },
          },
        },
      },
    ]);

    return (
      stats[0] || {
        totalExpenses: 0,
        totalCount: 0,
        avgExpense: 0,
        maxExpense: 0,
        minExpense: 0,
        approvedAmount: 0,
        pendingAmount: 0,
        rejectedAmount: 0,
        approvedCount: 0,
        pendingCount: 0,
        rejectedCount: 0,
      }
    );
  } catch (error) {
    console.error("Calculate expense stats error:", error);
    throw error;
  }
};

// Get expense breakdown by category
const getExpenseBreakdownByCategory = async (branchId, startDate, endDate) => {
  try {
    const query = { branchId, approvalStatus: "approved" };

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const breakdown = await Expense.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$category",
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 },
          avgAmount: { $avg: "$amount" },
          subcategories: { $addToSet: "$subcategory" },
        },
      },
      { $sort: { totalAmount: -1 } },
    ]);

    return breakdown.map((item) => ({
      category: item._id,
      totalAmount: item.totalAmount,
      count: item.count,
      avgAmount: Math.round(item.avgAmount),
      subcategories: item.subcategories.filter(Boolean),
    }));
  } catch (error) {
    console.error("Get expense breakdown error:", error);
    throw error;
  }
};

// Generate monthly expense comparison
const generateMonthlyComparison = async (
  branchId,
  year = new Date().getFullYear()
) => {
  try {
    const comparison = await Expense.aggregate([
      {
        $match: {
          branchId,
          date: {
            $gte: new Date(year, 0, 1),
            $lt: new Date(year + 1, 0, 1),
          },
          approvalStatus: "approved",
        },
      },
      {
        $group: {
          _id: { $month: "$date" },
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 },
          categories: { $addToSet: "$category" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Format data for all 12 months
    const monthlyData = Array.from({ length: 12 }, (_, i) => {
      const monthData = comparison.find((item) => item._id === i + 1);
      const monthName = new Date(year, i).toLocaleString("default", {
        month: "long",
      });

      return {
        month: monthName,
        monthNumber: i + 1,
        totalAmount: monthData ? monthData.totalAmount : 0,
        count: monthData ? monthData.count : 0,
        categories: monthData ? monthData.categories : [],
      };
    });

    return monthlyData;
  } catch (error) {
    console.error("Generate monthly comparison error:", error);
    throw error;
  }
};

// Calculate budget variance (if budget data is available)
const calculateBudgetVariance = async (branchId, period = "month") => {
  try {
    // This is a placeholder for future budget management integration
    // For now, we'll calculate averages to establish baseline budgets

    const now = new Date();
    let periodStart, periodEnd;

    switch (period) {
      case "week":
        periodStart = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() - 7
        );
        periodEnd = now;
        break;
      case "quarter":
        const quarter = Math.floor(now.getMonth() / 3);
        periodStart = new Date(now.getFullYear(), quarter * 3, 1);
        periodEnd = new Date(now.getFullYear(), (quarter + 1) * 3, 1);
        break;
      case "year":
        periodStart = new Date(now.getFullYear(), 0, 1);
        periodEnd = new Date(now.getFullYear() + 1, 0, 1);
        break;
      default: // month
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    }

    const currentPeriodExpenses = await Expense.aggregate([
      {
        $match: {
          branchId,
          date: { $gte: periodStart, $lt: periodEnd },
          approvalStatus: "approved",
        },
      },
      {
        $group: {
          _id: "$category",
          actualAmount: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]);

    // Calculate historical average for the same period type
    const historicalAverage = await Expense.aggregate([
      {
        $match: {
          branchId,
          date: { $lt: periodStart },
          approvalStatus: "approved",
        },
      },
      {
        $group: {
          _id: "$category",
          totalAmount: { $sum: "$amount" },
          totalCount: { $sum: 1 },
        },
      },
    ]);

    // Combine current and historical data
    const variance = currentPeriodExpenses.map((current) => {
      const historical = historicalAverage.find((h) => h._id === current._id);
      const historicalAvg = historical
        ? historical.totalAmount / (historical.totalCount || 1)
        : 0;
      const variance =
        historicalAvg > 0
          ? ((current.actualAmount - historicalAvg) / historicalAvg) * 100
          : 0;

      return {
        category: current._id,
        actualAmount: current.actualAmount,
        historicalAverage: Math.round(historicalAvg),
        variance: parseFloat(variance.toFixed(2)),
        status: variance > 10 ? "over" : variance < -10 ? "under" : "within",
      };
    });

    return variance;
  } catch (error) {
    console.error("Calculate budget variance error:", error);
    throw error;
  }
};

// Get top vendors by spend
const getTopVendors = async (branchId, limit = 10, startDate, endDate) => {
  try {
    const query = {
      branchId,
      "vendor.name": { $exists: true, $ne: null, $ne: "" },
      approvalStatus: "approved",
    };

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const topVendors = await Expense.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$vendor.name",
          totalSpend: { $sum: "$amount" },
          transactionCount: { $sum: 1 },
          avgTransactionAmount: { $avg: "$amount" },
          categories: { $addToSet: "$category" },
          lastTransaction: { $max: "$date" },
          paymentMethods: { $addToSet: "$paymentMethod" },
        },
      },
      {
        $addFields: {
          categoryCount: { $size: "$categories" },
        },
      },
      { $sort: { totalSpend: -1 } },
      { $limit: limit },
    ]);

    return topVendors.map((vendor) => ({
      vendorName: vendor._id,
      totalSpend: vendor.totalSpend,
      transactionCount: vendor.transactionCount,
      avgTransactionAmount: Math.round(vendor.avgTransactionAmount),
      categories: vendor.categories,
      categoryCount: vendor.categoryCount,
      lastTransaction: vendor.lastTransaction,
      paymentMethods: vendor.paymentMethods,
    }));
  } catch (error) {
    console.error("Get top vendors error:", error);
    throw error;
  }
};

// Format currency for Kenya
const formatKenyanCurrency = (amount) => {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
  }).format(amount);
};

// Generate expense insights
const generateExpenseInsights = async (branchId) => {
  try {
    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const previousMonthEnd = currentMonth;

    // Current month stats
    const currentStats = await calculateExpenseStats(
      branchId,
      currentMonth,
      currentMonthEnd
    );

    // Previous month stats
    const previousStats = await calculateExpenseStats(
      branchId,
      previousMonth,
      previousMonthEnd
    );

    // Calculate trends
    const totalChange =
      previousStats.totalExpenses > 0
        ? ((currentStats.totalExpenses - previousStats.totalExpenses) /
            previousStats.totalExpenses) *
          100
        : 0;

    const insights = [
      {
        type: "trend",
        title: "Monthly Expense Trend",
        description:
          totalChange > 5
            ? `Expenses increased by ${totalChange.toFixed(1)}% from last month`
            : totalChange < -5
            ? `Expenses decreased by ${Math.abs(totalChange).toFixed(
                1
              )}% from last month`
            : "Expenses are relatively stable compared to last month",
        value: `${totalChange.toFixed(1)}%`,
        status:
          totalChange > 5
            ? "warning"
            : totalChange < -5
            ? "positive"
            : "neutral",
      },
      {
        type: "approval",
        title: "Pending Approvals",
        description: `${currentStats.pendingCount} expenses awaiting approval`,
        value: currentStats.pendingCount,
        status: currentStats.pendingCount > 10 ? "warning" : "info",
      },
      {
        type: "average",
        title: "Average Expense Amount",
        description: `Average expense amount this month`,
        value: formatKenyanCurrency(currentStats.avgExpense),
        status: "info",
      },
    ];

    // Add category-specific insights
    const categoryBreakdown = await getExpenseBreakdownByCategory(
      branchId,
      currentMonth,
      currentMonthEnd
    );
    if (categoryBreakdown.length > 0) {
      const topCategory = categoryBreakdown[0];
      insights.push({
        type: "category",
        title: "Top Expense Category",
        description: `${topCategory.category} accounts for the highest expenses this month`,
        value: formatKenyanCurrency(topCategory.totalAmount),
        status: "info",
      });
    }

    return insights;
  } catch (error) {
    console.error("Generate expense insights error:", error);
    throw error;
  }
};

// Validate expense data
const validateExpenseData = (expenseData) => {
  const errors = [];

  if (!expenseData.category) {
    errors.push("Category is required");
  }

  if (!expenseData.amount || expenseData.amount <= 0) {
    errors.push("Amount must be greater than 0");
  }

  if (!expenseData.description || expenseData.description.trim().length === 0) {
    errors.push("Description is required");
  }

  if (expenseData.description && expenseData.description.length > 500) {
    errors.push("Description cannot exceed 500 characters");
  }

  if (!expenseData.paymentMethod) {
    errors.push("Payment method is required");
  }

  if (expenseData.receiptNumber && expenseData.receiptNumber.length > 50) {
    errors.push("Receipt number cannot exceed 50 characters");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

// Generate expense tags automatically
const generateExpenseTags = (expense) => {
  const tags = [];

  // Add category-based tags
  tags.push(expense.category.toLowerCase().replace(/\s+/g, "_"));

  // Add amount-based tags
  if (expense.amount > 100000) {
    tags.push("high_value");
  } else if (expense.amount < 1000) {
    tags.push("low_value");
  }

  // Add vendor-based tags
  if (expense.vendor?.name) {
    tags.push("vendor_expense");
  }

  // Add recurring tags
  if (expense.isRecurring) {
    tags.push("recurring");
  }

  // Add payment method tags
  tags.push(`payment_${expense.paymentMethod}`);

  return [...new Set(tags)]; // Remove duplicates
};

module.exports = {
  calculateExpenseStats,
  getExpenseBreakdownByCategory,
  generateMonthlyComparison,
  calculateBudgetVariance,
  getTopVendors,
  formatKenyanCurrency,
  generateExpenseInsights,
  validateExpenseData,
  generateExpenseTags,
};
