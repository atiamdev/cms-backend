const Expense = require("../models/Expense");
const { validationResult } = require("express-validator");
const mongoose = require("mongoose");
const {
  isSuperAdmin,
  isAdmin,
  getBranchFilter,
  canAccessResource,
  hasAdminPrivileges,
  canAccessExpense,
  canEditExpense,
} = require("../utils/accessControl");

// @desc    Get all expenses for a branch
// @route   GET /api/expenses
// @access  Private (Admin, Secretary)
const getExpenses = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      category,
      subcategory,
      startDate,
      endDate,
      approvalStatus,
      paymentMethod,
      minAmount,
      maxAmount,
      search,
      sortBy = "date",
      sortOrder = "desc",
      branchId, // Allow filtering by specific branch for superadmin
    } = req.query;

    // Build query based on user role using access control utility
    const query = getBranchFilter(req.user);

    if (isSuperAdmin(req.user) && branchId) {
      // Superadmin can filter by specific branch
      query.branchId = branchId;
    }

    if (category) query.category = category;
    if (subcategory) query.subcategory = subcategory;
    if (approvalStatus) query.approvalStatus = approvalStatus;
    if (paymentMethod) query.paymentMethod = paymentMethod;

    // Date range filter
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    // Amount range filter
    if (minAmount || maxAmount) {
      query.amount = {};
      if (minAmount) query.amount.$gte = parseFloat(minAmount);
      if (maxAmount) query.amount.$lte = parseFloat(maxAmount);
    }

    // Text search
    if (search) {
      query.$text = { $search: search };
    }

    // Sort configuration
    const sortConfig = {};
    sortConfig[sortBy] = sortOrder === "desc" ? -1 : 1;

    const expenses = await Expense.find(query)
      .populate("recordedBy", "firstName lastName")
      .populate("approvedBy", "firstName lastName")
      .populate("lastModifiedBy", "firstName lastName")
      .sort(sortConfig)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Expense.countDocuments(query);

    // Calculate summary statistics
    const summaryStats = await Expense.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 },
          avgAmount: { $avg: "$amount" },
          pendingCount: {
            $sum: { $cond: [{ $eq: ["$approvalStatus", "pending"] }, 1, 0] },
          },
          approvedCount: {
            $sum: { $cond: [{ $eq: ["$approvalStatus", "approved"] }, 1, 0] },
          },
          rejectedCount: {
            $sum: { $cond: [{ $eq: ["$approvalStatus", "rejected"] }, 1, 0] },
          },
        },
      },
    ]);

    res.json({
      success: true,
      data: expenses,
      summary: summaryStats[0] || {
        totalAmount: 0,
        count: 0,
        avgAmount: 0,
        pendingCount: 0,
        approvedCount: 0,
        rejectedCount: 0,
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Get expenses error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Get single expense by ID
// @route   GET /api/expenses/:id
// @access  Private (Admin, Secretary)
const getExpenseById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid expense ID",
      });
    }

    const expense = await Expense.findById(id)
      .populate("recordedBy", "firstName lastName email")
      .populate("approvedBy", "firstName lastName email")
      .populate("lastModifiedBy", "firstName lastName email");

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: "Expense not found",
      });
    }

    // Check if user can access this expense
    if (!canAccessExpense(req.user, expense)) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. You do not have permission to access this expense",
      });
    }

    res.json({
      success: true,
      data: expense,
    });
  } catch (error) {
    console.error("Get expense by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Create new expense
// @route   POST /api/expenses
// @access  Private (Admin, Secretary)
const createExpense = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    const {
      date,
      category,
      subcategory,
      amount,
      description,
      vendor,
      paymentMethod,
      paymentReference,
      receiptNumber,
      budgetCategory,
      isRecurring,
      recurringDetails,
      tags,
      notes,
      branchId, // Allow branchId to be specified in request body
    } = req.body;

    // Determine which branchId to use
    let targetBranchId;
    if (isSuperAdmin(req.user)) {
      // Superadmin can specify branchId or leave it null for school-wide expenses
      targetBranchId = branchId || null;
    } else {
      // Regular users use their own branchId
      if (!req.user.branchId) {
        return res.status(400).json({
          success: false,
          message: "No branch association found",
        });
      }
      targetBranchId = req.user.branchId;
    }

    // Check for duplicate receipt number within the target branch (or school-wide if null)
    if (receiptNumber) {
      const existingExpense = await Expense.findOne({
        branchId: targetBranchId,
        receiptNumber: receiptNumber.toUpperCase(),
      });

      if (existingExpense) {
        return res.status(400).json({
          success: false,
          message: "Receipt number already exists",
        });
      }
    }

    const expense = new Expense({
      branchId: targetBranchId,
      date: date || new Date(),
      category,
      subcategory,
      amount,
      description,
      vendor,
      paymentMethod,
      paymentReference,
      receiptNumber: receiptNumber?.toUpperCase(),
      budgetCategory,
      isRecurring,
      recurringDetails: isRecurring ? recurringDetails : undefined,
      tags: tags ? tags.map((tag) => tag.toLowerCase().trim()) : [],
      recordedBy: req.user._id,
      notes,
    });

    await expense.save();

    await expense.populate("recordedBy", "firstName lastName");

    res.status(201).json({
      success: true,
      message: "Expense created successfully",
      data: expense,
    });
  } catch (error) {
    console.error("Create expense error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Update expense
// @route   PUT /api/expenses/:id
// @access  Private (Admin, Secretary)
const updateExpense = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    const { id } = req.params;
    const updateData = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid expense ID",
      });
    }

    const expense = await Expense.findById(id);

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: "Expense not found",
      });
    }

    // Check if user can edit this expense
    if (!canEditExpense(req.user, expense)) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. You do not have permission to edit this expense",
      });
    }

    // Check if expense is approved and prevent certain modifications
    if (
      expense.approvalStatus === "approved" &&
      !hasAdminPrivileges(req.user)
    ) {
      return res.status(403).json({
        success: false,
        message: "Cannot modify approved expenses. Contact administrator.",
      });
    }

    // Check for duplicate receipt number if being updated
    if (
      updateData.receiptNumber &&
      updateData.receiptNumber !== expense.receiptNumber
    ) {
      const existingExpense = await Expense.findOne({
        branchId: req.user.branchId,
        receiptNumber: updateData.receiptNumber.toUpperCase(),
        _id: { $ne: id },
      });

      if (existingExpense) {
        return res.status(400).json({
          success: false,
          message: "Receipt number already exists",
        });
      }
    }

    // Update fields
    Object.keys(updateData).forEach((key) => {
      if (key === "receiptNumber") {
        expense[key] = updateData[key]?.toUpperCase();
      } else if (key === "tags") {
        expense[key] = updateData[key]
          ? updateData[key].map((tag) => tag.toLowerCase().trim())
          : [];
      } else {
        expense[key] = updateData[key];
      }
    });

    expense.lastModifiedBy = req.user._id;

    await expense.save();

    await expense.populate([
      { path: "recordedBy", select: "firstName lastName" },
      { path: "approvedBy", select: "firstName lastName" },
      { path: "lastModifiedBy", select: "firstName lastName" },
    ]);

    res.json({
      success: true,
      message: "Expense updated successfully",
      data: expense,
    });
  } catch (error) {
    console.error("Update expense error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Delete expense
// @route   DELETE /api/expenses/:id
// @access  Private (Admin only)
const deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid expense ID",
      });
    }

    const expense = await Expense.findById(id);

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: "Expense not found",
      });
    }

    // Check if user can access this expense
    if (!canAccessExpense(req.user, expense)) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. You do not have permission to access this expense",
      });
    }

    // Prevent deletion of approved expenses unless admin
    if (
      expense.approvalStatus === "approved" &&
      !hasAdminPrivileges(req.user)
    ) {
      return res.status(403).json({
        success: false,
        message: "Cannot delete approved expenses. Contact administrator.",
      });
    }

    await Expense.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "Expense deleted successfully",
    });
  } catch (error) {
    console.error("Delete expense error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Approve or reject expense
// @route   PUT /api/expenses/:id/approval
// @access  Private (Admin only)
const updateExpenseApproval = async (req, res) => {
  try {
    const { id } = req.params;
    const { approvalStatus, approvalNotes } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid expense ID",
      });
    }

    if (!["approved", "rejected", "on_hold"].includes(approvalStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid approval status",
      });
    }

    const expense = await Expense.findById(id);

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: "Expense not found",
      });
    }

    // Check if user can access this expense for approval
    if (!canAccessExpense(req.user, expense)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Cannot access expense from other branches",
      });
    }

    expense.approvalStatus = approvalStatus;
    expense.approvedBy = req.user._id;
    expense.approvalDate = new Date();
    expense.approvalNotes = approvalNotes;
    expense.lastModifiedBy = req.user._id;

    await expense.save();

    await expense.populate([
      { path: "recordedBy", select: "firstName lastName" },
      { path: "approvedBy", select: "firstName lastName" },
    ]);

    res.json({
      success: true,
      message: `Expense ${approvalStatus} successfully`,
      data: expense,
    });
  } catch (error) {
    console.error("Update expense approval error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Get expense categories and subcategories
// @route   GET /api/expenses/categories
// @access  Private (Admin, Secretary)
const getExpenseCategories = async (req, res) => {
  try {
    const categories = Expense.getCategories();

    // Get actual subcategories used in the branch
    const subcategoriesByCategory = await Expense.aggregate([
      { $match: { branchId: req.user.branchId } },
      {
        $group: {
          _id: "$category",
          subcategories: { $addToSet: "$subcategory" },
        },
      },
    ]);

    const categoriesWithSubcategories = categories.map((category) => {
      const categoryData = subcategoriesByCategory.find(
        (item) => item._id === category
      );
      return {
        name: category,
        subcategories: categoryData
          ? categoryData.subcategories.filter(Boolean)
          : [],
      };
    });

    res.json({
      success: true,
      data: {
        categories: categoriesWithSubcategories,
        paymentMethods: Expense.getPaymentMethods(),
      },
    });
  } catch (error) {
    console.error("Get expense categories error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Get expenses summary statistics
// @route   GET /api/expenses/summary
// @access  Private (Admin, Secretary)
const getExpensesSummary = async (req, res) => {
  try {
    const { period = "all", year, month } = req.query;

    let startDate, endDate;
    const now = new Date();

    switch (period) {
      case "today":
        startDate = new Date(
          Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
        );
        endDate = new Date(
          Date.UTC(
            now.getFullYear(),
            now.getMonth(),
            now.getDate() + 1,
            0,
            0,
            0,
            0
          )
        );
        break;
      case "week":
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        startDate = new Date(
          Date.UTC(
            weekStart.getFullYear(),
            weekStart.getMonth(),
            weekStart.getDate(),
            0,
            0,
            0,
            0
          )
        );
        endDate = new Date(
          Date.UTC(
            weekStart.getFullYear(),
            weekStart.getMonth(),
            weekStart.getDate() + 7,
            0,
            0,
            0,
            0
          )
        );
        break;
      case "month":
        const targetYear = year ? parseInt(year) : now.getFullYear();
        const targetMonth = month ? parseInt(month) - 1 : now.getMonth();

        // Create dates in UTC to avoid timezone issues
        startDate = new Date(Date.UTC(targetYear, targetMonth, 1, 0, 0, 0, 0));
        endDate = new Date(
          Date.UTC(targetYear, targetMonth + 1, 1, 0, 0, 0, 0)
        );
        break;
      case "quarter":
        const quarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(
          Date.UTC(now.getFullYear(), quarter * 3, 1, 0, 0, 0, 0)
        );
        endDate = new Date(
          Date.UTC(now.getFullYear(), (quarter + 1) * 3, 1, 0, 0, 0, 0)
        );
        break;
      case "year":
        const summaryYear = year ? parseInt(year) : now.getFullYear();
        startDate = new Date(Date.UTC(summaryYear, 0, 1, 0, 0, 0, 0));
        endDate = new Date(Date.UTC(summaryYear + 1, 0, 1, 0, 0, 0, 0));
        break;
      case "all":
        // No date filters for all-time summary
        startDate = null;
        endDate = null;
        break;
      default:
        startDate = new Date(
          Date.UTC(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
        );
        endDate = new Date(
          Date.UTC(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0)
        );
    }

    const summary = await Expense.aggregate([
      {
        $match: {
          // Only filter by branch for non-admin users
          ...(hasAdminPrivileges(req.user)
            ? {}
            : { branchId: req.user.branchId }),
          // Only apply date filter if dates are specified
          ...(startDate && endDate
            ? { date: { $gte: startDate, $lt: endDate } }
            : {}),
        },
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$amount" },
          totalCount: { $sum: 1 },
          avgAmount: { $avg: "$amount" },
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
        },
      },
    ]);

    // Category breakdown
    const categoryBreakdown = await Expense.aggregate([
      {
        $match: {
          // Only filter by branch for non-admin users
          ...(hasAdminPrivileges(req.user)
            ? {}
            : { branchId: req.user.branchId }),
          // Only apply date filter if dates are specified
          ...(startDate && endDate
            ? { date: { $gte: startDate, $lt: endDate } }
            : {}),
          approvalStatus: "approved",
        },
      },
      {
        $group: {
          _id: "$category",
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 },
          avgAmount: { $avg: "$amount" },
        },
      },
      { $sort: { totalAmount: -1 } },
    ]);

    res.json({
      success: true,
      data: {
        totalExpenses: summary[0]?.totalAmount || 0,
        monthlyTotal: summary[0]?.totalAmount || 0, // For current month
        pendingApproval: summary[0]?.pendingAmount || 0,
        approvedExpenses: summary[0]?.approvedAmount || 0,
        // Keep the detailed data for future use
        period: {
          type: period,
          startDate,
          endDate,
        },
        summary: summary[0] || {
          totalAmount: 0,
          totalCount: 0,
          avgAmount: 0,
          approvedAmount: 0,
          pendingAmount: 0,
          rejectedAmount: 0,
        },
        categoryBreakdown,
      },
    });
  } catch (error) {
    console.error("Get expenses summary error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

module.exports = {
  getExpenses,
  getExpenseById,
  createExpense,
  updateExpense,
  deleteExpense,
  updateExpenseApproval,
  getExpenseCategories,
  getExpensesSummary,
};
