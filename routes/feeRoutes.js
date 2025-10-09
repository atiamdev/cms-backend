const express = require("express");
const { body } = require("express-validator");
const { protect, authorize } = require("../middlewares/auth");
const { branchAuth } = require("../middlewares/branchAuth");
const {
  getFeeStructures,
  createFeeStructure,
  assignFeesToStudents,
  getStudentFees,
  getOutstandingFeesReport,
  updateFee,
  getBranchStudentFeeSummaries,
  sendFeeReminders,
} = require("../controllers/feeController");

const {
  initiateMpesaPayment,
  initiateStudentMpesaPayment,
  handleMpesaCallback,
  testMpesaCallback,
  recordManualPayment,
  verifyPayment,
  getPaymentStatus,
  getFeePaymentHistory,
  getPayments,
  getUnpaidStudents,
  sendPaymentReminders,
} = require("../controllers/paymentController");

const {
  generateReceipt,
  emailReceipt,
  getReceiptDownloadUrl,
} = require("../controllers/receiptController");

const {
  getFeeDashboard,
  getFeeReportByClass,
  getPaymentMethodAnalysis,
  getDefaultersReport,
  exportFeeReport,
} = require("../controllers/feeReportController");

/**
 * @swagger
 * components:
 *   schemas:
 *     FeeStructureComponent:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           description: Name of the fee component
 *         amount:
 *           type: number
 *           minimum: 0
 *           description: Amount for this fee component
 *         isOptional:
 *           type: boolean
 *           description: Whether this fee component is optional
 *         dueDate:
 *           type: string
 *           format: date
 *           description: Due date for this fee component
 *       example:
 *         name: Tuition Fee
 *         amount: 50000
 *         isOptional: false
 *         dueDate: "2024-03-15"
 *
 *     CreateFeeStructureRequest:
 *       type: object
 *       required:
 *         - name
 *         - class
 *         - feeComponents
 *         - academicYear
 *       properties:
 *         name:
 *           type: string
 *           description: Name of the fee structure
 *         class:
 *           type: string
 *           description: Class ID this fee structure applies to
 *         feeComponents:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/FeeStructureComponent'
 *         academicYear:
 *           type: string
 *           description: Academic year (e.g., "2024-2025")
 *         description:
 *           type: string
 *           description: Optional description
 *       example:
 *         name: Grade 12 Term 1 Fees
 *         class: 64f7c9b8e123456789abcdef
 *         academicYear: "2024-2025"
 *         feeComponents:
 *           - name: Tuition Fee
 *             amount: 50000
 *             isOptional: false
 *             dueDate: "2024-03-15"
 *           - name: Lab Fee
 *             amount: 5000
 *             isOptional: true
 *             dueDate: "2024-03-20"
 *
 *     InitiateMpesaPaymentRequest:
 *       type: object
 *       required:
 *         - feeId
 *         - amount
 *         - phoneNumber
 *       properties:
 *         feeId:
 *           type: string
 *           description: Fee ID to pay
 *         amount:
 *           type: number
 *           minimum: 1
 *           description: Amount to pay
 *         phoneNumber:
 *           type: string
 *           pattern: '^254[0-9]{9}$'
 *           description: M-Pesa phone number (format 254XXXXXXXXX)
 *       example:
 *         feeId: 64f7c9b8e123456789abcdef
 *         amount: 25000
 *         phoneNumber: "254712345678"
 *
 *     RecordManualPaymentRequest:
 *       type: object
 *       required:
 *         - feeId
 *         - amount
 *         - method
 *       properties:
 *         feeId:
 *           type: string
 *           description: Fee ID to pay
 *         amount:
 *           type: number
 *           minimum: 1
 *           description: Amount paid
 *         method:
 *           type: string
 *           enum: [cash, bank, card]
 *           description: Payment method
 *         reference:
 *           type: string
 *           description: Payment reference (bank slip number, etc.)
 *         notes:
 *           type: string
 *           description: Additional notes
 *       example:
 *         feeId: 64f7c9b8e123456789abcdef
 *         amount: 25000
 *         method: bank
 *         reference: "TXN123456789"
 *         notes: "Bank transfer received"
 *
 *     FeeDashboard:
 *       type: object
 *       properties:
 *         totalFees:
 *           type: number
 *           description: Total fees amount
 *         collectedFees:
 *           type: number
 *           description: Total collected fees
 *         pendingFees:
 *           type: number
 *           description: Total pending fees
 *         overdueAmount:
 *           type: number
 *           description: Total overdue amount
 *         collectionRate:
 *           type: number
 *           description: Collection rate percentage
 *         defaultersCount:
 *           type: number
 *           description: Number of students with overdue fees
 *         recentPayments:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Payment'
 *         paymentTrends:
 *           type: object
 *           description: Payment trends data for charts
 */

/**
 * @swagger
 * tags:
 *   name: Fee Management
 *   description: Fee structure management, payments, and reporting
 */

const router = express.Router();

// Fee Structure Routes

/**
 * @swagger
 * /fees/structures:
 *   get:
 *     summary: Get all fee structures
 *     tags: [Fee Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: class
 *         schema:
 *           type: string
 *         description: Filter by class ID
 *       - in: query
 *         name: academicYear
 *         schema:
 *           type: string
 *         description: Filter by academic year
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: List of fee structures
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
 *                     $ref: '#/components/schemas/FeeStructure'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  "/structures",
  protect,
  branchAuth,
  authorize(["admin", "secretary"]),
  getFeeStructures
);

router.post(
  "/structures",
  protect,
  branchAuth,
  authorize(["admin"]),
  [
    body("classId").notEmpty().withMessage("Class ID is required"),
    body("academicYear").notEmpty().withMessage("Academic year is required"),
    body("academicTerm")
      .isIn([
        "Term 1",
        "Term 2",
        "Term 3",
        "Semester 1",
        "Semester 2",
        "Annual",
      ])
      .withMessage("Invalid academic term"),
    body("feeComponents")
      .isArray({ min: 1 })
      .withMessage("At least one fee component is required"),
    body("feeComponents.*.name")
      .notEmpty()
      .withMessage("Fee component name is required"),
    body("feeComponents.*.amount")
      .isFloat({ min: 0 })
      .withMessage("Fee component amount must be a positive number"),
    body("dueDate").isISO8601().withMessage("Valid due date is required"),
  ],
  createFeeStructure
);

// Fee Assignment Routes
router.post(
  "/assign",
  protect,
  branchAuth,
  authorize(["admin", "secretary"]),
  [
    body("feeStructureId")
      .notEmpty()
      .withMessage("Fee structure ID is required"),
    body("studentIds")
      .isArray({ min: 1 })
      .withMessage("At least one student ID is required"),
    body("discountAmount")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Discount amount must be positive"),
  ],
  assignFeesToStudents
);

// Fee Management Routes
router.get("/student/:studentId", protect, branchAuth, getStudentFees);

router.get(
  "/branch/students",
  protect,
  branchAuth,
  authorize(["admin", "branchadmin", "secretary"]),
  getBranchStudentFeeSummaries
);

router.get(
  "/outstanding",
  protect,
  branchAuth,
  authorize(["admin", "secretary"]),
  getOutstandingFeesReport
);

router.post(
  "/send-reminders",
  protect,
  branchAuth,
  authorize(["admin", "branchadmin", "secretary"]),
  sendFeeReminders
);

router.put(
  "/:feeId",
  protect,
  branchAuth,
  authorize(["admin", "secretary"]),
  [
    body("discountAmount")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Discount amount must be positive"),
    body("lateFeeApplied")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Late fee must be positive"),
  ],
  updateFee
);

// Payment Routes
router.post(
  "/payments/mpesa/initiate",
  protect,
  branchAuth,
  [
    body("feeId").notEmpty().withMessage("Fee ID is required"),
    body("amount")
      .isFloat({ min: 1 })
      .withMessage("Amount must be greater than 0"),
    body("phoneNumber")
      .matches(/^(\+?254|0)?[17]\d{8}$/)
      .withMessage("Valid Kenyan phone number is required"),
  ],
  initiateMpesaPayment
);

// Student Course Fee Payment Route (no feeId required)
router.post(
  "/payments/student/mpesa/initiate",
  protect,
  branchAuth,
  [
    body("amount")
      .isFloat({ min: 1 })
      .withMessage("Amount must be greater than 0"),
    body("phoneNumber")
      .matches(/^(\+?254|0)?[17]\d{8}$/)
      .withMessage("Valid Kenyan phone number is required"),
    body("studentId")
      .optional()
      .isMongoId()
      .withMessage("Valid student ID is required when provided"),
  ],
  initiateStudentMpesaPayment
);

// M-Pesa callback (public endpoint)
router.post("/payments/mpesa/callback/:paymentId", handleMpesaCallback);
// Simple M-Pesa callback without payment ID
router.post("/payments/mpesa/callback", handleMpesaCallback);
// Test M-Pesa callback for webhook.site testing
router.post("/payments/mpesa/test-callback", testMpesaCallback);

router.post(
  "/payments/manual",
  protect,
  branchAuth,
  authorize(["admin", "secretary"]),
  [
    body("feeId").notEmpty().withMessage("Fee ID is required"),
    body("amount")
      .isFloat({ min: 1 })
      .withMessage("Amount must be greater than 0"),
    body("paymentMethod")
      .isIn(["cash", "bank_transfer", "cheque", "card", "mobile_money"])
      .withMessage("Invalid payment method"),
    body("paymentDate")
      .optional()
      .isISO8601()
      .withMessage("Valid payment date is required"),
  ],
  recordManualPayment
);

router.put(
  "/payments/:paymentId/verify",
  protect,
  branchAuth,
  authorize(["admin"]),
  verifyPayment
);

router.get(
  "/payments/:paymentId/status",
  protect,
  branchAuth,
  getPaymentStatus
);

router.get("/payments/fee/:feeId", protect, branchAuth, getFeePaymentHistory);

router.get("/payments", protect, branchAuth, getPayments);

// Secretary Routes
router.get(
  "/secretary/unpaid-students",
  protect,
  authorize("secretary", "admin", "superadmin"),
  branchAuth,
  getUnpaidStudents
);
router.post(
  "/secretary/send-reminders",
  protect,
  authorize("secretary", "admin", "superadmin"),
  branchAuth,
  sendPaymentReminders
);

// Receipt Routes
router.get("/receipts/:paymentId", protect, branchAuth, generateReceipt);

router.post(
  "/receipts/:paymentId/email",
  protect,
  branchAuth,
  [
    body("additionalEmails")
      .optional()
      .isArray()
      .withMessage("Additional emails must be an array"),
    body("additionalEmails.*")
      .optional()
      .isEmail()
      .withMessage("Invalid email format"),
  ],
  emailReceipt
);

router.get(
  "/receipts/:paymentId/download",
  protect,
  branchAuth,
  getReceiptDownloadUrl
);

// Reporting Routes
router.get(
  "/reports/dashboard",
  protect,
  branchAuth,
  authorize(["superadmin", "admin", "secretary"]),
  getFeeDashboard
);

router.get(
  "/reports/by-class",
  protect,
  branchAuth,
  authorize(["admin", "secretary"]),
  getFeeReportByClass
);

router.get(
  "/reports/payment-methods",
  protect,
  branchAuth,
  authorize(["admin", "secretary"]),
  getPaymentMethodAnalysis
);

router.get(
  "/reports/defaulters",
  protect,
  branchAuth,
  authorize(["admin", "secretary"]),
  getDefaultersReport
);

router.get(
  "/reports/export",
  protect,
  branchAuth,
  authorize(["admin", "secretary"]),
  exportFeeReport
);

module.exports = router;
