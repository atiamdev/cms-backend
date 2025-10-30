const express = require("express");
const mongoose = require("mongoose");
const { body } = require("express-validator");
const { protect, authorize } = require("../middlewares/auth");
const { branchAuth } = require("../middlewares/branchAuth");
const {
  autoAssociateBranch,
  validateBranchOwnership,
  filterByBranch,
  logBranchAdminAction,
} = require("../middlewares/branchAutoAssociation");
const Expense = require("../models/Expense");
const {
  getExpenses,
  getExpenseById,
  createExpense,
  updateExpense,
  deleteExpense,
  updateExpenseApproval,
  getExpenseCategories,
  getExpensesSummary,
} = require("../controllers/expenseController");

const {
  getExpenseDashboard,
  getExpenseReportByCategory,
  getExpenseTrendAnalysis,
  getVendorAnalysisReport,
  exportExpenseReport,
} = require("../controllers/expenseReportController");

/**
 * @swagger
 * components:
 *   schemas:
 *     CreateExpenseRequest:
 *       type: object
 *       required:
 *         - category
 *         - amount
 *         - description
 *         - paymentMethod
 *       properties:
 *         category:
 *           type: string
 *           enum: [utilities, maintenance, supplies, salary, equipment, transport, other]
 *           description: Expense category
 *         amount:
 *           type: number
 *           minimum: 0
 *           description: Expense amount
 *         description:
 *           type: string
 *           maxLength: 500
 *           description: Expense description
 *         paymentMethod:
 *           type: string
 *           enum: [cash, bank_transfer, cheque, mpesa, card, other]
 *           description: Payment method used
 *         date:
 *           type: string
 *           format: date
 *           description: Expense date (defaults to today)
 *         vendor:
 *           type: object
 *           properties:
 *             name:
 *               type: string
 *               maxLength: 100
 *               description: Vendor name
 *             contact:
 *               type: string
 *               description: Vendor contact information
 *             address:
 *               type: string
 *               description: Vendor address
 *         receiptNumber:
 *           type: string
 *           maxLength: 50
 *           description: Receipt or invoice number
 *         receiptUrl:
 *           type: string
 *           description: URL to receipt image/document
 *         notes:
 *           type: string
 *           description: Additional notes
 *       example:
 *         category: utilities
 *         amount: 15000
 *         description: Monthly electricity bill payment
 *         paymentMethod: bank_transfer
 *         date: "2024-03-15"
 *         vendor:
 *           name: "Kenya Power"
 *           contact: "+254700123456"
 *           address: "Nairobi, Kenya"
 *         receiptNumber: "KP-2024-001234"
 *         notes: "March 2024 electricity bill"
 *
 *     UpdateExpenseRequest:
 *       type: object
 *       properties:
 *         category:
 *           type: string
 *           enum: [utilities, maintenance, supplies, salary, equipment, transport, other]
 *           description: Expense category
 *         amount:
 *           type: number
 *           minimum: 0
 *           description: Expense amount
 *         description:
 *           type: string
 *           maxLength: 500
 *           description: Expense description
 *         paymentMethod:
 *           type: string
 *           enum: [cash, bank_transfer, cheque, mpesa, card, other]
 *           description: Payment method used
 *         date:
 *           type: string
 *           format: date
 *           description: Expense date
 *         vendor:
 *           type: object
 *           properties:
 *             name:
 *               type: string
 *               maxLength: 100
 *             contact:
 *               type: string
 *             address:
 *               type: string
 *         receiptNumber:
 *           type: string
 *           maxLength: 50
 *         receiptUrl:
 *           type: string
 *         notes:
 *           type: string
 *
 *     ExpenseApprovalRequest:
 *       type: object
 *       required:
 *         - approvalStatus
 *       properties:
 *         approvalStatus:
 *           type: string
 *           enum: [approved, rejected, on_hold]
 *           description: Approval decision
 *         approvalNotes:
 *           type: string
 *           maxLength: 500
 *           description: Notes about the approval decision
 *       example:
 *         approvalStatus: approved
 *         approvalNotes: "Expense approved for Q1 utilities budget"
 *
 *     ExpenseSummary:
 *       type: object
 *       properties:
 *         totalExpenses:
 *           type: number
 *           description: Total expenses amount
 *         pendingExpenses:
 *           type: number
 *           description: Total pending approval expenses
 *         approvedExpenses:
 *           type: number
 *           description: Total approved expenses
 *         rejectedExpenses:
 *           type: number
 *           description: Total rejected expenses
 *         expensesByCategory:
 *           type: object
 *           description: Breakdown by category
 *         monthlyTrend:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               month:
 *                 type: string
 *               amount:
 *                 type: number
 *           description: Monthly expense trends
 *
 *     ExpenseDashboard:
 *       type: object
 *       properties:
 *         totalExpensesThisMonth:
 *           type: number
 *           description: Total expenses for current month
 *         totalExpensesLastMonth:
 *           type: number
 *           description: Total expenses for previous month
 *         pendingApprovals:
 *           type: number
 *           description: Number of expenses pending approval
 *         averageExpenseAmount:
 *           type: number
 *           description: Average expense amount
 *         topCategories:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               category:
 *                 type: string
 *               amount:
 *                 type: number
 *               count:
 *                 type: number
 *           description: Top expense categories
 *         recentExpenses:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Expense'
 *           description: Recent expense entries
 *         monthlyComparison:
 *           type: object
 *           description: Month-over-month comparison data
 */

/**
 * @swagger
 * tags:
 *   name: Expense Management
 *   description: Expense tracking, approval workflows, and financial reporting (Super Admin, Admin, and Secretary)
 */

const router = express.Router();

// Expense Management Routes

/**
 * @swagger
 * /expenses:
 *   get:
 *     summary: Get all expenses (Super Admin, Admin, Secretary, and Branch Admin)
 *     tags: [Expense Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Number of items per page
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [utilities, maintenance, supplies, salary, equipment, transport, other]
 *         description: Filter by expense category
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, approved, rejected]
 *         description: Filter by approval status
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter expenses from this date
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter expenses up to this date
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in description, vendor name, or receipt number
 *     responses:
 *       200:
 *         description: List of expenses
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/PaginatedResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Expense'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get(
  "/",
  protect,
  branchAuth,
  authorize(["superadmin", "admin", "branchadmin", "secretary"]),
  filterByBranch,
  getExpenses
);

/**
 * @swagger
 * /expenses/categories:
 *   get:
 *     summary: Get expense categories
 *     tags: [Expense Management]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of available expense categories
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       category:
 *                         type: string
 *                       description:
 *                         type: string
 *                       icon:
 *                         type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get(
  "/categories",
  protect,
  branchAuth,
  authorize(["superadmin", "admin", "secretary"]),
  getExpenseCategories
);

/**
 * @swagger
 * /expenses/summary:
 *   get:
 *     summary: Get expenses summary
 *     tags: [Expense Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [week, month, quarter, year]
 *         description: Time period for summary
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *         description: Specific year for summary
 *     responses:
 *       200:
 *         description: Expense summary data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/ExpenseSummary'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get(
  "/summary",
  protect,
  branchAuth,
  authorize(["superadmin", "admin", "secretary"]),
  getExpensesSummary
);

/**
 * @swagger
 * /expenses/{id}:
 *   get:
 *     summary: Get expense by ID
 *     tags: [Expense Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Expense ID
 *     responses:
 *       200:
 *         description: Expense details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Expense'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get(
  "/:id",
  protect,
  branchAuth,
  authorize(["superadmin", "admin"]),
  getExpenseById
);

/**
 * @swagger
 * /expenses:
 *   post:
 *     summary: Create a new expense (Super Admin, Admin, Secretary, and Branch Admin)
 *     tags: [Expense Management]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateExpenseRequest'
 *         multipart/form-data:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/CreateExpenseRequest'
 *               - type: object
 *                 properties:
 *                   receipt:
 *                     type: string
 *                     format: binary
 *                     description: Receipt file upload
 *     responses:
 *       201:
 *         description: Expense created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Expense'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.post(
  "/",
  protect,
  branchAuth,
  authorize(["superadmin", "admin", "branchadmin", "secretary"]),
  autoAssociateBranch,
  logBranchAdminAction("CREATE_EXPENSE"),
  [
    body("category").notEmpty().withMessage("Category is required"),
    body("amount")
      .isFloat({ min: 0 })
      .withMessage("Amount must be a positive number"),
    body("description")
      .notEmpty()
      .withMessage("Description is required")
      .isLength({ max: 500 })
      .withMessage("Description cannot exceed 500 characters"),
    body("paymentMethod")
      .isIn(["cash", "bank_transfer", "cheque", "mpesa", "card", "other"])
      .withMessage("Invalid payment method"),
    body("date").optional().isISO8601().withMessage("Invalid date format"),
    body("vendor.name")
      .optional()
      .isLength({ max: 100 })
      .withMessage("Vendor name too long"),
    body("receiptNumber")
      .optional()
      .isLength({ max: 50 })
      .withMessage("Receipt number too long"),
    // Optional branchId validation - only validate if present
    body("branchId")
      .optional()
      .custom((value) => {
        if (value && !mongoose.Types.ObjectId.isValid(value)) {
          throw new Error("Invalid branch ID format");
        }
        return true;
      }),
  ],
  createExpense
);

/**
 * @swagger
 * /expenses/{id}:
 *   put:
 *     summary: Update an expense
 *     tags: [Expense Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Expense ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateExpenseRequest'
 *         multipart/form-data:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/UpdateExpenseRequest'
 *               - type: object
 *                 properties:
 *                   receipt:
 *                     type: string
 *                     format: binary
 *                     description: Receipt file upload
 *     responses:
 *       200:
 *         description: Expense updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Expense'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.put(
  "/:id",
  protect,
  branchAuth,
  authorize(["superadmin", "admin", "branchadmin", "secretary"]),
  validateBranchOwnership(Expense),
  logBranchAdminAction("UPDATE_EXPENSE"),
  [
    body("category")
      .optional()
      .notEmpty()
      .withMessage("Category cannot be empty"),
    body("amount")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Amount must be a positive number"),
    body("description")
      .optional()
      .notEmpty()
      .withMessage("Description cannot be empty")
      .isLength({ max: 500 })
      .withMessage("Description cannot exceed 500 characters"),
    body("paymentMethod")
      .optional()
      .isIn(["cash", "bank_transfer", "cheque", "mpesa", "card", "other"])
      .withMessage("Invalid payment method"),
    body("date").optional().isISO8601().withMessage("Invalid date format"),
  ],
  updateExpense
);

/**
 * @swagger
 * /expenses/{id}:
 *   delete:
 *     summary: Delete an expense (Super Admin and Admin only)
 *     tags: [Expense Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Expense ID
 *     responses:
 *       200:
 *         description: Expense deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.delete(
  "/:id",
  protect,
  branchAuth,
  authorize(["superadmin", "admin", "branchadmin", "secretary"]),
  validateBranchOwnership(Expense),
  logBranchAdminAction("DELETE_EXPENSE"),
  deleteExpense
);

/**
 * @swagger
 * /expenses/{id}/approval:
 *   put:
 *     summary: Update expense approval status (Super Admin and Admin only)
 *     tags: [Expense Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Expense ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ExpenseApprovalRequest'
 *     responses:
 *       200:
 *         description: Expense approval status updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Expense'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.put(
  "/:id/approval",
  protect,
  branchAuth,
  authorize(["superadmin", "admin", "secretary", "branchadmin"]),
  [
    body("approvalStatus")
      .isIn(["approved", "rejected", "on_hold"])
      .withMessage("Invalid approval status"),
    body("approvalNotes")
      .optional()
      .isLength({ max: 500 })
      .withMessage("Approval notes cannot exceed 500 characters"),
  ],
  updateExpenseApproval
);

// Reporting Routes

/**
 * @swagger
 * /expenses/reports/dashboard:
 *   get:
 *     summary: Get expense dashboard analytics
 *     tags: [Expense Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [week, month, quarter, year]
 *         description: Time period for dashboard data
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *         description: Specific year for dashboard
 *     responses:
 *       200:
 *         description: Expense dashboard data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/ExpenseDashboard'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get(
  "/reports/dashboard",
  protect,
  branchAuth,
  authorize(["superadmin", "admin", "secretary"]),
  getExpenseDashboard
);

/**
 * @swagger
 * /expenses/reports/by-category:
 *   get:
 *     summary: Get expense report by category
 *     tags: [Expense Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for report
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for report
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [utilities, maintenance, supplies, salary, equipment, transport, other]
 *         description: Specific category to analyze
 *     responses:
 *       200:
 *         description: Category-wise expense report
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     categoryBreakdown:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           category:
 *                             type: string
 *                           amount:
 *                             type: number
 *                           count:
 *                             type: number
 *                           percentage:
 *                             type: number
 *                     totalAmount:
 *                       type: number
 *                     totalCount:
 *                       type: number
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get(
  "/reports/by-category",
  protect,
  branchAuth,
  authorize(["superadmin", "admin", "secretary"]),
  getExpenseReportByCategory
);

/**
 * @swagger
 * /expenses/reports/trends:
 *   get:
 *     summary: Get expense trend analysis
 *     tags: [Expense Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [daily, weekly, monthly, quarterly]
 *         description: Trend analysis period
 *       - in: query
 *         name: months
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 24
 *         description: Number of months to analyze
 *     responses:
 *       200:
 *         description: Expense trend analysis
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     trends:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           period:
 *                             type: string
 *                           amount:
 *                             type: number
 *                           count:
 *                             type: number
 *                           growth:
 *                             type: number
 *                     averageExpense:
 *                       type: number
 *                     highestPeriod:
 *                       type: object
 *                     lowestPeriod:
 *                       type: object
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get(
  "/reports/trends",
  protect,
  branchAuth,
  authorize(["superadmin", "admin", "secretary"]),
  getExpenseTrendAnalysis
);

/**
 * @swagger
 * /expenses/reports/vendors:
 *   get:
 *     summary: Get vendor analysis report
 *     tags: [Expense Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for analysis
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for analysis
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *         description: Number of top vendors to return
 *     responses:
 *       200:
 *         description: Vendor analysis report
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     topVendors:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           vendorName:
 *                             type: string
 *                           totalAmount:
 *                             type: number
 *                           transactionCount:
 *                             type: number
 *                           averageAmount:
 *                             type: number
 *                           categories:
 *                             type: array
 *                             items:
 *                               type: string
 *                     totalVendors:
 *                       type: number
 *                     totalAmount:
 *                       type: number
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get(
  "/reports/vendors",
  protect,
  branchAuth,
  authorize(["superadmin", "admin", "secretary"]),
  getVendorAnalysisReport
);

/**
 * @swagger
 * /expenses/reports/export:
 *   get:
 *     summary: Export expense report
 *     tags: [Expense Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [excel, csv, pdf]
 *         description: Export format
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for export
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for export
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [utilities, maintenance, supplies, salary, equipment, transport, other]
 *         description: Filter by category
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, approved, rejected]
 *         description: Filter by approval status
 *       - in: query
 *         name: includeDetails
 *         schema:
 *           type: boolean
 *         description: Include detailed expense information
 *     responses:
 *       200:
 *         description: Expense report exported successfully
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get(
  "/reports/export",
  protect,
  branchAuth,
  authorize(["superadmin", "admin", "secretary"]),
  exportExpenseReport
);

module.exports = router;
