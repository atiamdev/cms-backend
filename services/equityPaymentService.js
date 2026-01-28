/**
 * Equity Bank Payment Service
 *
 * Handles payment reconciliation and balance calculations
 * for Equity Bank Biller API integration
 */

const Payment = require("../models/Payment");
const Fee = require("../models/Fee");
const Student = require("../models/Student");
const StudentCredit = require("../models/StudentCredit");
const PaymentFee = require("../models/PaymentFee");

/**
 * Calculate student's outstanding balance from all fees
 * @param {ObjectId} studentId - Student's MongoDB ObjectId
 * @returns {Promise<Object>} - Balance details
 */
const calculateStudentBalance = async (studentId) => {
  try {
    // Get all unpaid and partially paid fees for the student
    const fees = await Fee.find({
      studentId: studentId,
      status: { $in: ["unpaid", "partially_paid", "overdue"] },
    }).sort({ dueDate: 1 }); // Oldest first

    // Calculate totals
    let totalDue = 0;
    let totalPaid = 0;
    let totalOutstanding = 0;
    let overdueAmount = 0;
    let feeCount = 0;

    for (const fee of fees) {
      totalDue += fee.totalAmountDue;
      totalPaid += fee.amountPaid;
      totalOutstanding += fee.balance;

      if (fee.status === "overdue") {
        overdueAmount += fee.balance;
      }

      feeCount++;
    }

    return {
      totalDue,
      totalPaid,
      totalOutstanding,
      overdueAmount,
      feeCount,
      fees, // Include fee details for reconciliation
    };
  } catch (error) {
    console.error("Error calculating student balance:", error);
    throw error;
  }
};

/**
 * Get detailed fee breakdown for a student
 * @param {ObjectId} studentId - Student's MongoDB ObjectId
 * @returns {Promise<Array>} - Array of fee details
 */
const getStudentFeeBreakdown = async (studentId) => {
  try {
    const fees = await Fee.find({
      studentId: studentId,
      status: { $in: ["unpaid", "partially_paid", "overdue"] },
    })
      .populate("feeStructureId", "name category")
      .populate("academicTermId", "name")
      .sort({ dueDate: 1 });

    return fees.map((fee) => ({
      feeId: fee._id,
      name: fee.feeStructureId?.name || "Custom Fee",
      category: fee.feeStructureId?.category || "other",
      totalAmount: fee.totalAmountDue,
      amountPaid: fee.amountPaid,
      balance: fee.balance,
      dueDate: fee.dueDate,
      status: fee.status,
      isOverdue: fee.status === "overdue",
    }));
  } catch (error) {
    console.error("Error getting fee breakdown:", error);
    throw error;
  }
};

/**
 * Reconcile payment to student fees
 * Applies payment to oldest unpaid fees first
 * Creates PaymentFee linking records
 * Handles overpayments by creating StudentCredit
 * @param {Object} payment - Payment document
 * @param {Object} student - Student document
 * @returns {Promise<Object>} - Reconciliation result
 */
const reconcilePaymentToFees = async (payment, student) => {
  try {
    // Get all outstanding fees ordered by due date (oldest first)
    const outstandingFees = await Fee.find({
      studentId: student._id,
      status: { $in: ["unpaid", "partially_paid", "overdue"] },
    }).sort({ dueDate: 1 });

    let remainingAmount = payment.amount;
    let appliedAmount = 0;
    let feesUpdated = 0;
    const updatedFees = [];
    const paymentFeeLinks = [];

    // Apply payment to fees
    for (const fee of outstandingFees) {
      if (remainingAmount <= 0) break;

      const feeBalance = fee.balance;
      const paymentToApply = Math.min(remainingAmount, feeBalance);

      // Update fee
      fee.amountPaid += paymentToApply;
      // Balance is auto-calculated in pre-save hook
      await fee.save();

      // Create PaymentFee linking record
      const paymentFeeLink = await PaymentFee.create({
        paymentId: payment._id,
        feeId: fee._id,
        studentId: student._id,
        branchId: student.branchId,
        amountApplied: paymentToApply,
        appliedDate: payment.paymentDate,
      });

      paymentFeeLinks.push(paymentFeeLink._id);
      appliedAmount += paymentToApply;
      remainingAmount -= paymentToApply;
      feesUpdated++;

      updatedFees.push({
        feeId: fee._id,
        amountApplied: paymentToApply,
        newBalance: fee.balance,
        newStatus: fee.status,
      });

      console.log(
        `✅ Applied ${paymentToApply} KES to fee ${fee._id} (${fee.feeType})`,
      );
    }

    // Handle overpayment - create credit balance
    let creditCreated = null;
    if (remainingAmount > 0) {
      console.log(
        `💳 Creating credit balance: ${remainingAmount} KES for student ${student.studentId}`,
      );

      creditCreated = await StudentCredit.create({
        studentId: student._id,
        branchId: student.branchId,
        amount: remainingAmount,
        source: "equity_overpayment",
        paymentId: payment._id,
        status: "available",
        notes: `Overpayment from Equity Bank transaction ${payment.equityBillerDetails?.bankReference || payment.receiptNumber}`,
      });

      console.log(
        `✅ Credit balance created: ${remainingAmount} KES (Credit ID: ${creditCreated._id})`,
      );
    }

    // Update payment with reconciliation info
    payment.reconciliationInfo = {
      reconciledAt: new Date(),
      feesUpdated: feesUpdated,
      amountApplied: appliedAmount,
      remainingAmount: remainingAmount,
      updatedFees: updatedFees,
      paymentFeeLinks: paymentFeeLinks,
      creditCreated: creditCreated ? creditCreated._id : null,
    };
    await payment.save();

    console.log(
      `💰 Payment reconciliation complete: ${appliedAmount} KES applied to ${feesUpdated} fees${remainingAmount > 0 ? `, ${remainingAmount} KES credited` : ""}`,
    );

    return {
      success: true,
      appliedAmount,
      remainingAmount,
      feesUpdated,
      updatedFees,
      creditCreated: creditCreated
        ? {
            creditId: creditCreated._id,
            amount: remainingAmount,
          }
        : null,
      totalAllocated: appliedAmount,
      message:
        remainingAmount > 0
          ? `Payment applied to ${feesUpdated} fee(s), ${remainingAmount} KES credited to student account`
          : `Payment applied to ${feesUpdated} fee(s)`,
    };
  } catch (error) {
    console.error("Error reconciling payment:", error);
    throw error;
  }
};

/**
 * Check if student has any outstanding fees
 * @param {ObjectId} studentId - Student's MongoDB ObjectId
 * @returns {Promise<Boolean>} - True if student has outstanding fees
 */
const hasOutstandingFees = async (studentId) => {
  try {
    const count = await Fee.countDocuments({
      studentId: studentId,
      status: { $in: ["unpaid", "partially_paid", "overdue"] },
    });

    return count > 0;
  } catch (error) {
    console.error("Error checking outstanding fees:", error);
    return false;
  }
};

/**
 * Get student's payment history
 * @param {ObjectId} studentId - Student's MongoDB ObjectId
 * @param {Number} limit - Number of recent payments to return
 * @returns {Promise<Array>} - Array of payment records
 */
const getStudentPaymentHistory = async (studentId, limit = 10) => {
  try {
    const payments = await Payment.find({
      studentId: studentId,
      status: "completed",
    })
      .sort({ paymentDate: -1 })
      .limit(limit)
      .select("amount paymentMethod paymentDate receiptNumber");

    return payments;
  } catch (error) {
    console.error("Error getting payment history:", error);
    return [];
  }
};

/**
 * Validate if student can make a payment
 * @param {Object} student - Student document
 * @returns {Object} - Validation result
 */
const validateStudentForPayment = (student) => {
  if (!student) {
    return {
      valid: false,
      reason: "Student not found",
    };
  }

  if (student.status !== "active") {
    return {
      valid: false,
      reason: `Student account is ${student.status}`,
    };
  }

  if (!student.branchId) {
    return {
      valid: false,
      reason: "Student has no branch assigned",
    };
  }

  return {
    valid: true,
  };
};

module.exports = {
  calculateStudentBalance,
  getStudentFeeBreakdown,
  reconcilePaymentToFees,
  hasOutstandingFees,
  getStudentPaymentHistory,
  validateStudentForPayment,
};
