const Payment = require("../models/Payment");
const Fee = require("../models/Fee");
const Student = require("../models/Student");
const mongoose = require("mongoose");

/**
 * Payment Reconciliation Service
 *
 * Handles payment application logic:
 * 1. If student has outstanding invoices (debt), apply payment to oldest invoices first
 * 2. If no debt or payment exceeds total debt, carry forward as credit to future invoices
 */

/**
 * Apply payment to student's invoices with smart reconciliation
 *
 * @param {Object} params - Payment parameters
 * @param {String} params.studentId - Student ID
 * @param {Number} params.amount - Payment amount
 * @param {String} params.paymentMethod - Payment method (mpesa, cash, etc)
 * @param {Date} params.paymentDate - Payment date
 * @param {String} params.receiptNumber - Receipt/transaction reference
 * @param {String} params.branchId - Branch ID
 * @param {String} params.recordedBy - User who recorded the payment
 * @param {Object} params.additionalDetails - Additional payment details (mpesa, equity, etc)
 * @returns {Object} - Payment reconciliation result
 */
async function reconcilePayment({
  studentId,
  amount,
  paymentMethod,
  paymentDate = new Date(),
  receiptNumber,
  branchId,
  recordedBy,
  additionalDetails = {},
}) {
  // Try to use transactions if MongoDB supports them (replica set)
  // Fall back to non-transactional operations for standalone MongoDB
  let session = null;
  let useTransaction = false;

  // Check if we're running on a replica set by checking the connection
  const isReplicaSet =
    mongoose.connection.db?.admin &&
    mongoose.connection.db?.topology?.constructor?.name === "ReplSet";

  if (isReplicaSet) {
    try {
      session = await mongoose.startSession();
      await session.startTransaction();
      useTransaction = true;
    } catch (error) {
      console.log(
        "⚠️  MongoDB transactions failed to start. Proceeding without transaction.",
      );
      if (session) {
        session.endSession();
        session = null;
      }
      useTransaction = false;
    }
  } else {
    console.log(
      "⚠️  MongoDB standalone detected. Proceeding without transactions.",
    );
    useTransaction = false;
  }

  try {
    // Validate student exists
    const student = useTransaction
      ? await Student.findById(studentId).session(session)
      : await Student.findById(studentId);

    if (!student) {
      throw new Error("Student not found");
    }

    // Get all unpaid/partially paid/overdue invoices for this student, ordered by date (oldest first)
    const query = Fee.find({
      studentId: studentId,
      branchId: branchId,
      invoiceType: "monthly",
      status: { $in: ["unpaid", "partially_paid", "overdue"] },
    }).sort({ periodYear: 1, periodMonth: 1 }); // Oldest first

    const outstandingInvoices = useTransaction
      ? await query.session(session)
      : await query;

    console.log(`\n=== PAYMENT RECONCILIATION ===`);
    console.log(`Student: ${studentId}`);
    console.log(`Payment Amount: ${amount}`);
    console.log(`Outstanding Invoices: ${outstandingInvoices.length}`);

    let remainingAmount = amount;
    const appliedPayments = [];
    const paidInvoices = [];
    let creditAmount = 0;

    // Apply payment to outstanding invoices (oldest first)
    for (const invoice of outstandingInvoices) {
      if (remainingAmount <= 0) break;

      const invoiceBalance = invoice.totalAmountDue - invoice.amountPaid;

      if (invoiceBalance <= 0) continue; // Skip fully paid invoices

      const amountToApply = Math.min(remainingAmount, invoiceBalance);

      console.log(
        `\nApplying ${amountToApply} to invoice ${invoice._id} (${invoice.periodYear}-${invoice.periodMonth})`,
      );
      console.log(`  Invoice balance before: ${invoiceBalance}`);

      // Create unique receipt number for each payment record to avoid duplicates
      const uniqueReceiptNumber =
        appliedPayments.length === 0
          ? receiptNumber // First payment gets the original receipt number
          : `${receiptNumber}-${appliedPayments.length + 1}`; // Subsequent payments get suffixed

      // Create payment record for this invoice
      const payment = new Payment({
        branchId: branchId,
        feeId: invoice._id,
        studentId: studentId,
        receiptNumber: uniqueReceiptNumber,
        amount: amountToApply,
        paymentMethod: paymentMethod,
        paymentDate: paymentDate,
        status: "completed",
        verificationStatus: "verified",
        ...(paymentMethod === "mpesa" && additionalDetails.mpesaDetails
          ? { mpesaDetails: additionalDetails.mpesaDetails }
          : {}),
        ...(paymentMethod === "equity" && additionalDetails.equityDetails
          ? { equityDetails: additionalDetails.equityDetails }
          : {}),
        ...(additionalDetails.manualPaymentDetails
          ? { manualPaymentDetails: additionalDetails.manualPaymentDetails }
          : {}),
        recordedBy: recordedBy,
      });

      if (useTransaction) {
        await payment.save({ session });
      } else {
        await payment.save();
      }

      // Update invoice
      invoice.amountPaid += amountToApply;

      // Update invoice status
      if (invoice.amountPaid >= invoice.totalAmountDue) {
        invoice.status = "paid";
        paidInvoices.push({
          invoiceId: invoice._id,
          period: `${invoice.periodYear}-${String(invoice.periodMonth).padStart(2, "0")}`,
          amount: invoice.totalAmountDue,
          amountApplied: amountToApply,
        });
      } else if (invoice.amountPaid > 0) {
        invoice.status = "partially_paid";
      }

      if (useTransaction) {
        await invoice.save({ session });
      } else {
        await invoice.save();
      }

      appliedPayments.push({
        invoiceId: invoice._id,
        period: `${invoice.periodYear}-${String(invoice.periodMonth).padStart(2, "0")}`,
        amountApplied: amountToApply,
        previousBalance: invoiceBalance,
        newBalance: invoiceBalance - amountToApply,
      });

      remainingAmount -= amountToApply;

      console.log(`  Amount applied: ${amountToApply}`);
      console.log(`  Invoice balance after: ${invoiceBalance - amountToApply}`);
      console.log(`  Remaining payment amount: ${remainingAmount}`);
    }

    // If there's still money left, it's a credit for future invoices
    if (remainingAmount > 0) {
      creditAmount = remainingAmount;
      console.log(
        `\n💰 Credit Amount: ${creditAmount} (carried forward to future invoices)`,
      );

      // Create unique receipt number for credit (if there were applied payments)
      const creditReceiptNumber =
        appliedPayments.length === 0
          ? receiptNumber // If no invoices were paid, credit gets the original receipt number
          : `${receiptNumber}-CREDIT`; // If invoices were paid, credit gets suffixed

      // Create a payment record without a specific feeId (general credit)
      const creditPayment = new Payment({
        branchId: branchId,
        feeId: null, // No specific invoice - this is credit
        studentId: studentId,
        receiptNumber: creditReceiptNumber,
        amount: creditAmount,
        paymentMethod: paymentMethod,
        paymentDate: paymentDate,
        status: "completed",
        verificationStatus: "verified",
        ...(paymentMethod === "mpesa" && additionalDetails.mpesaDetails
          ? { mpesaDetails: additionalDetails.mpesaDetails }
          : {}),
        ...(paymentMethod === "equity" && additionalDetails.equityDetails
          ? { equityDetails: additionalDetails.equityDetails }
          : {}),
        ...(additionalDetails.manualPaymentDetails
          ? {
              manualPaymentDetails: {
                ...additionalDetails.manualPaymentDetails,
                notes: `${additionalDetails.manualPaymentDetails?.notes || ""} [CREDIT: Advance payment for future invoices]`,
              },
            }
          : {}),
        recordedBy: recordedBy,
      });

      if (useTransaction) {
        await creditPayment.save({ session });
      } else {
        await creditPayment.save();
      }
    }

    if (useTransaction && session) {
      await session.commitTransaction();
      session.endSession();
    }

    const result = {
      success: true,
      totalAmount: amount,
      appliedToInvoices: amount - creditAmount,
      creditAmount: creditAmount,
      invoicesUpdated: appliedPayments.length,
      invoicesPaid: paidInvoices.length,
      appliedPayments: appliedPayments,
      paidInvoices: paidInvoices,
      receiptNumber: receiptNumber,
      message:
        creditAmount > 0
          ? `Payment of ${amount} processed. ${amount - creditAmount} applied to ${appliedPayments.length} invoice(s), ${creditAmount} carried forward as credit.`
          : `Payment of ${amount} processed and applied to ${appliedPayments.length} invoice(s).`,
    };

    console.log(`\n=== RECONCILIATION COMPLETE ===`);
    console.log(`Total amount: ${amount}`);
    console.log(`Applied to invoices: ${amount - creditAmount}`);
    console.log(`Credit amount: ${creditAmount}`);
    console.log(`Invoices updated: ${appliedPayments.length}`);
    console.log(`Invoices fully paid: ${paidInvoices.length}`);

    return result;
  } catch (error) {
    if (useTransaction && session) {
      await session.abortTransaction();
      session.endSession();
    }
    console.error("Payment reconciliation error:", error);
    throw error;
  }
}

/**
 * Get student's credit balance (payments without assigned invoices)
 *
 * @param {String} studentId - Student ID
 * @returns {Number} - Total credit amount
 */
async function getStudentCreditBalance(studentId) {
  // Find all completed payments without feeId (credits)
  const creditPayments = await Payment.find({
    studentId: studentId,
    feeId: null,
    status: "completed",
  });

  const totalCredit = creditPayments.reduce(
    (sum, payment) => sum + payment.amount,
    0,
  );

  return totalCredit;
}

/**
 * Apply existing credit to new invoices
 * Called when new invoices are generated
 *
 * @param {String} studentId - Student ID
 * @param {String} newInvoiceId - Newly created invoice ID
 */
async function applyCreditToNewInvoice(studentId, newInvoiceId) {
  // Try to use transactions if MongoDB supports them (replica set)
  let session = null;
  let useTransaction = false;

  // Check if we're running on a replica set
  const isReplicaSet =
    mongoose.connection.db?.admin &&
    mongoose.connection.db?.topology?.constructor?.name === "ReplSet";

  if (isReplicaSet) {
    try {
      session = await mongoose.startSession();
      await session.startTransaction();
      useTransaction = true;
    } catch (error) {
      console.log(
        "⚠️  MongoDB transactions failed to start. Proceeding without transaction.",
      );
      if (session) {
        session.endSession();
        session = null;
      }
      useTransaction = false;
    }
  } else {
    console.log(
      "⚠️  MongoDB standalone detected. Proceeding without transactions.",
    );
    useTransaction = false;
  }

  try {
    // Get student's available credit
    const creditBalance = await getStudentCreditBalance(studentId);

    if (creditBalance <= 0) {
      if (useTransaction && session) {
        await session.commitTransaction();
        session.endSession();
      }
      return { applied: false, reason: "No credit available" };
    }

    // Get the new invoice
    const invoice = useTransaction
      ? await Fee.findById(newInvoiceId).session(session)
      : await Fee.findById(newInvoiceId);

    if (!invoice) {
      throw new Error("Invoice not found");
    }

    const invoiceBalance = invoice.totalAmountDue - invoice.amountPaid;
    if (invoiceBalance <= 0) {
      if (useTransaction && session) {
        await session.commitTransaction();
        session.endSession();
      }
      return { applied: false, reason: "Invoice already paid" };
    }

    // Determine how much credit to apply
    const amountToApply = Math.min(creditBalance, invoiceBalance);

    // Get credit payments
    const query = Payment.find({
      studentId: studentId,
      feeId: null,
      status: "completed",
    }).sort({ createdAt: 1 }); // Oldest first

    const creditPayments = useTransaction
      ? await query.session(session)
      : await query;

    let remainingToApply = amountToApply;

    // Re-assign credit payments to this invoice
    for (const creditPayment of creditPayments) {
      if (remainingToApply <= 0) break;

      const amountFromThisPayment = Math.min(
        creditPayment.amount,
        remainingToApply,
      );

      // Update payment to link to this invoice
      creditPayment.feeId = invoice._id;

      // If only using part of the payment, we need to split it
      if (amountFromThisPayment < creditPayment.amount) {
        // Keep the remaining as credit
        const remainingCredit = creditPayment.amount - amountFromThisPayment;
        creditPayment.amount = amountFromThisPayment;

        // Create new payment record for remaining credit
        const remainingPayment = new Payment({
          branchId: creditPayment.branchId,
          feeId: null, // Still credit
          studentId: studentId,
          receiptNumber: creditPayment.receiptNumber + "-SPLIT",
          amount: remainingCredit,
          paymentMethod: creditPayment.paymentMethod,
          paymentDate: creditPayment.paymentDate,
          status: "completed",
          verificationStatus: "verified",
          recordedBy: creditPayment.recordedBy,
        });

        if (useTransaction) {
          await remainingPayment.save({ session });
        } else {
          await remainingPayment.save();
        }
      }

      if (useTransaction) {
        await creditPayment.save({ session });
      } else {
        await creditPayment.save();
      }

      remainingToApply -= amountFromThisPayment;
    }

    // Update invoice
    invoice.amountPaid += amountToApply;
    if (invoice.amountPaid >= invoice.totalAmountDue) {
      invoice.status = "paid";
    } else if (invoice.amountPaid > 0) {
      invoice.status = "partially_paid";
    }

    if (useTransaction) {
      await invoice.save({ session });
    } else {
      await invoice.save();
    }

    if (useTransaction && session) {
      await session.commitTransaction();
      session.endSession();
    }

    console.log(`Applied ${amountToApply} credit to invoice ${newInvoiceId}`);

    return {
      applied: true,
      amount: amountToApply,
      invoiceId: newInvoiceId,
      invoiceStatus: invoice.status,
    };
  } catch (error) {
    if (useTransaction && session) {
      await session.abortTransaction();
      session.endSession();
    }
    console.error("Apply credit to invoice error:", error);
    throw error;
  }
}

/**
 * Get student's payment summary
 *
 * @param {String} studentId - Student ID
 * @returns {Object} - Payment summary
 */
async function getStudentPaymentSummary(studentId) {
  const invoices = await Fee.find({
    studentId: studentId,
    invoiceType: "monthly",
  });

  const creditBalance = await getStudentCreditBalance(studentId);

  const totalExpected = invoices.reduce(
    (sum, inv) => sum + inv.totalAmountDue,
    0,
  );
  const totalPaid = invoices.reduce((sum, inv) => sum + inv.amountPaid, 0);
  const totalBalance = totalExpected - totalPaid;

  const unpaidInvoices = invoices.filter(
    (inv) => inv.status === "unpaid",
  ).length;
  const partiallyPaidInvoices = invoices.filter(
    (inv) => inv.status === "partially_paid",
  ).length;
  const paidInvoices = invoices.filter((inv) => inv.status === "paid").length;

  return {
    totalExpected,
    totalPaid,
    totalBalance,
    creditBalance,
    effectiveBalance: totalBalance - creditBalance, // What student actually owes after credit
    unpaidInvoices,
    partiallyPaidInvoices,
    paidInvoices,
    totalInvoices: invoices.length,
  };
}

module.exports = {
  reconcilePayment,
  getStudentCreditBalance,
  applyCreditToNewInvoice,
  getStudentPaymentSummary,
};
