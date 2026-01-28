/**
 * Equity Bank Biller API Integration Controller
 *
 * Handles three core endpoints:
 * 1. POST /api/equity/auth - Authentication
 * 2. POST /api/equity/validation - Student validation
 * 3. POST /api/equity/notification - Payment notification
 */

const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Student = require("../models/Student");
const Payment = require("../models/Payment");
const EquityAPILog = require("../models/EquityAPILog");
const { reconcilePaymentToFees } = require("../services/equityPaymentService");
const WhatsAppNotificationService = require("../services/whatsappNotificationService");

const whatsappService = new WhatsAppNotificationService();

/**
 * @route   POST /api/equity/auth
 * @desc    Authenticate Equity Bank and return JWT tokens
 * @access  Public (with credentials)
 */
const authenticateEquity = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
      return res.status(400).json({
        error: "Missing credentials",
        message: "Username and password are required",
      });
    }

    // Find Equity Bank user - match against configured username
    // regardless of email domain
    const configuredUsername = process.env.EQUITY_API_USERNAME;

    if (username !== configuredUsername) {
      return res.status(401).json({
        error: "Authentication failed",
        message: "Invalid credentials",
      });
    }

    // Find user by email pattern (username@any-domain)
    const user = await User.findOne({
      email: new RegExp(`^${username}@`, "i"),
    });

    if (!user) {
      return res.status(401).json({
        error: "Authentication failed",
        message: "Invalid credentials",
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        error: "Authentication failed",
        message: "Invalid credentials",
      });
    }

    // Check if user is active
    if (user.status !== "active") {
      return res.status(401).json({
        error: "Authentication failed",
        message: "User account is not active",
      });
    }

    // Generate access token (short-lived: 1 hour)
    const accessToken = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        type: "access",
      },
      process.env.EQUITY_JWT_SECRET,
      { expiresIn: process.env.EQUITY_JWT_EXPIRE || "1h" },
    );

    // Generate refresh token (long-lived: 24 hours)
    const refreshToken = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        type: "refresh",
      },
      process.env.EQUITY_JWT_SECRET,
      { expiresIn: process.env.EQUITY_REFRESH_JWT_EXPIRE || "24h" },
    );

    // Log successful authentication
    console.log(`✅ Equity Bank authenticated: ${username} from ${req.ip}`);

    // Return tokens in Equity Bank's expected format
    return res.json({
      access: accessToken,
      refresh: refreshToken,
    });
  } catch (error) {
    console.error("Equity authentication error:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: "Authentication failed",
    });
  }
};

/**
 * @route   POST /api/equity/refresh
 * @desc    Refresh access token using refresh token
 * @access  Public (with valid refresh token)
 */
const refreshAccessToken = async (req, res) => {
  try {
    const { refresh } = req.body;

    if (!refresh) {
      return res.status(400).json({
        error: "Missing token",
        message: "Refresh token is required",
      });
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(refresh, process.env.EQUITY_JWT_SECRET);
    } catch (error) {
      return res.status(401).json({
        error: "Invalid token",
        message: "Refresh token is invalid or expired",
      });
    }

    // Check if it's a refresh token
    if (decoded.type !== "refresh") {
      return res.status(401).json({
        error: "Invalid token",
        message: "Not a refresh token",
      });
    }

    // Find user
    const user = await User.findById(decoded.userId);

    if (!user || user.status !== "active") {
      return res.status(401).json({
        error: "Invalid token",
        message: "User not found or inactive",
      });
    }

    // Generate new access token
    const accessToken = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        type: "access",
      },
      process.env.EQUITY_JWT_SECRET,
      { expiresIn: process.env.EQUITY_JWT_EXPIRE || "1h" },
    );

    return res.json({
      access: accessToken,
    });
  } catch (error) {
    console.error("Token refresh error:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: "Token refresh failed",
    });
  }
};

/**
 * @route   POST /api/equity/validation
 * @desc    Validate student ID and return if student exists in system
 * @access  Private (requires JWT)
 */
const validateStudent = async (req, res) => {
  try {
    const { billNumber, amount } = req.body;

    // Validate input
    if (!billNumber) {
      console.log("❌ Validation failed: Bill number is required");
      return res.json({
        responseCode: "400",
        responseMessage: "Bill number is required",
      });
    }

    // Find student by studentId
    const student = await Student.findOne({ studentId: billNumber })
      .populate("userId", "firstName lastName")
      .populate("branchId", "name");

    // If student not found
    if (!student) {
      console.log(`❌ Validation failed: Student ${billNumber} not found`);
      return res.json({
        responseCode: "404",
        responseMessage: "Student not found",
      });
    }

    // Check if student is active
    if (student.academicStatus !== "active") {
      console.log(
        `❌ Validation failed: Student ${billNumber} is ${student.academicStatus}`,
      );
      return res.json({
        responseCode: "403",
        responseMessage: "Student account is not active",
      });
    }

    // Get student's full name
    const customerName = student.userId
      ? `${student.userId.firstName} ${student.userId.lastName}`
      : "Unknown Student";

    console.log(`✅ Validation successful: ${billNumber} - ${customerName}`);

    // Return success with student details
    return res.json({
      responseCode: "200",
      responseMessage: "Success",
      customerName: customerName,
      billNumber: billNumber,
    });
  } catch (error) {
    console.error("Student validation error:", error);
    return res.json({
      responseCode: "500",
      responseMessage: "Internal server error",
    });
  }
};

/**
 * @route   POST /api/equity/notification
 * @desc    Receive payment notification from Equity Bank
 * @access  Private (requires JWT)
 */
const processPaymentNotification = async (req, res) => {
  try {
    const { billNumber, amount, bankReference, transactionDate } = req.body;

    // Validate required fields
    if (!billNumber || !amount || !bankReference || !transactionDate) {
      return res.json({
        responseCode: "400",
        responseMessage: "Missing required fields",
      });
    }

    // Check for duplicate transaction
    const existingPayment = await Payment.findOne({
      "equityBillerDetails.bankReference": bankReference,
    });

    if (existingPayment) {
      console.log(`⚠️  Duplicate transaction detected: ${bankReference}`);
      return res.json({
        responseCode: "400",
        responseMessage: "Duplicate transaction",
      });
    }

    // Find student
    const student = await Student.findOne({ studentId: billNumber })
      .populate("userId")
      .populate("branchId");

    if (!student) {
      return res.json({
        responseCode: "404",
        responseMessage: "Student not found",
      });
    }

    // Parse amount
    const paymentAmount = parseFloat(amount);

    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      return res.json({
        responseCode: "400",
        responseMessage: "Invalid amount",
      });
    }

    // Generate receipt number
    const receiptNumber = await generateEquityReceiptNumber();

    // Create payment record
    const payment = await Payment.create({
      branchId: student.branchId._id,
      studentId: student._id,
      amount: paymentAmount,
      paymentMethod: "equity",
      paymentDate: new Date(transactionDate),
      receiptNumber: receiptNumber,
      recordedBy: req.equityUser.userId, // Equity Bank system user
      equityBillerDetails: {
        bankReference: bankReference,
        billNumber: billNumber,
        transactionDate: new Date(transactionDate),
        confirmedAmount: paymentAmount,
        notificationReceived: true,
        notificationData: req.body,
      },
      status: "completed",
      verificationStatus: "verified",
    });

    console.log(
      `✅ Payment created: ${receiptNumber} - ${paymentAmount} KES for ${billNumber}`,
    );

    // Reconcile payment to student fees
    let reconciliationResult = null;
    try {
      console.log(`🔄 Reconciling payment ${receiptNumber} to student fees...`);

      reconciliationResult = await reconcilePaymentToFees(payment, student);

      if (reconciliationResult.success) {
        console.log(
          `✅ Payment reconciled: ${reconciliationResult.feesUpdated} fees updated`,
        );
        console.log(
          `   Total allocated: ${reconciliationResult.totalAllocated} KES`,
        );
        console.log(
          `   Remaining balance: ${reconciliationResult.remainingAmount} KES`,
        );

        if (reconciliationResult.creditCreated) {
          console.log(
            `   💳 Credit created: ${reconciliationResult.creditCreated.amount} KES`,
          );
        }
      } else {
        console.error(
          `❌ Reconciliation failed: ${reconciliationResult.message}`,
        );
      }
    } catch (reconcileError) {
      console.error(`❌ Error reconciling payment:`, reconcileError);
      // Continue even if reconciliation fails - payment is still recorded
    }

    // Send WhatsApp notification to student
    try {
      console.log(`📱 Sending WhatsApp payment confirmation to student...`);

      const studentPhone =
        student.userId?.phoneNumber ||
        student.parentGuardianInfo?.emergencyContact?.phone;

      if (studentPhone) {
        const studentName = student.userId
          ? `${student.userId.firstName} ${student.userId.lastName}`
          : "Student";

        const receiptData = {
          studentName,
          studentId: student.studentId,
          receiptNumber,
          paymentDate: new Date(transactionDate),
          paymentMethod: "Equity Bank",
          amountPaid: paymentAmount,
          transactionRef: bankReference,
          balance:
            reconciliationResult?.remainingAmount > 0
              ? 0 // All fees paid, only credit remains
              : await getStudentRemainingBalance(student._id),
          branchName: student.branchId?.name || "ATIAM COLLEGE",
        };

        await whatsappService.sendPaymentReceiptNotification(
          receiptData,
          studentPhone,
          { source: "equity_bank" },
        );

        console.log(`✅ WhatsApp notification sent to ${studentPhone}`);
      } else {
        console.log(`⚠️  No phone number found for student ${billNumber}`);
      }
    } catch (whatsappError) {
      console.error(
        `⚠️  Failed to send WhatsApp notification:`,
        whatsappError.message,
      );
      // Don't fail the payment if WhatsApp fails
    }

    // Return success response
    return res.json({
      responseCode: "200",
      responseMessage: "Success",
    });
  } catch (error) {
    console.error("Payment notification error:", error);
    return res.json({
      responseCode: "500",
      responseMessage: error.message || "Internal server error",
    });
  }
};

/**
 * Helper function to get student's remaining balance
 * @param {ObjectId} studentId - Student's MongoDB ObjectId
 * @returns {Promise<number>} - Remaining balance
 */
const getStudentRemainingBalance = async (studentId) => {
  try {
    const Fee = require("../models/Fee");
    const fees = await Fee.find({
      studentId: studentId,
      status: { $in: ["unpaid", "partially_paid", "overdue"] },
    });

    const totalBalance = fees.reduce((sum, fee) => sum + fee.balance, 0);
    return totalBalance;
  } catch (error) {
    console.error("Error calculating remaining balance:", error);
    return 0;
  }
};

/**
 * Helper function to generate Equity Bank receipt number
 * @returns {Promise<string>} - Receipt number in format RCPT-EQB-YYYYMMDD-XXXX
 */
const generateEquityReceiptNumber = async () => {
  try {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");

    // Get count of equity payments today
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    const count = await Payment.countDocuments({
      paymentMethod: "equity",
      createdAt: {
        $gte: startOfDay,
        $lt: endOfDay,
      },
    });

    const sequence = String(count + 1).padStart(4, "0");
    return `RCPT-EQB-${dateStr}-${sequence}`;
  } catch (error) {
    console.error("Error generating receipt number:", error);
    // Fallback receipt number
    return `RCPT-EQB-${Date.now()}`;
  }
};

module.exports = {
  authenticateEquity,
  refreshAccessToken,
  validateStudent,
  processPaymentNotification,
};
