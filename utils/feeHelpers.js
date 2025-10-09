const Fee = require("../models/Fee");
const FeeStructure = require("../models/FeeStructure");
const Payment = require("../models/Payment");

// Calculate late fees based on fee structure and current date
const calculateLateFee = (fee, feeStructure) => {
  const today = new Date();
  const dueDate = new Date(fee.dueDate);

  if (today <= dueDate || fee.status === "paid" || fee.status === "waived") {
    return 0;
  }

  const daysPastDue = Math.ceil((today - dueDate) / (1000 * 60 * 60 * 24));
  const gracePeriod = feeStructure?.lateFeeGracePeriod || 0;

  if (daysPastDue <= gracePeriod) {
    return 0;
  }

  return feeStructure?.lateFeeAmount || 0;
};

// Update fee status based on payments and due dates
const updateFeeStatus = async (feeId) => {
  try {
    const fee = await Fee.findById(feeId);
    if (!fee) return null;

    const today = new Date();
    const balance =
      fee.totalAmountDue -
      fee.amountPaid -
      fee.discountAmount +
      fee.lateFeeApplied;

    let newStatus = fee.status;

    if (balance <= 0) {
      newStatus = "paid";
    } else if (fee.amountPaid > 0) {
      newStatus = "partially_paid";
    } else if (today > fee.dueDate) {
      newStatus = "overdue";
    } else {
      newStatus = "unpaid";
    }

    if (newStatus !== fee.status) {
      fee.status = newStatus;
      await fee.save();
    }

    return fee;
  } catch (error) {
    console.error("Update fee status error:", error);
    throw error;
  }
};

// Apply late fees to overdue fees
const applyLateFees = async (branchId) => {
  try {
    const overdueDate = new Date();
    overdueDate.setHours(0, 0, 0, 0); // Start of today

    // Get all unpaid/partially paid fees that are past due
    const overdues = await Fee.find({
      branchId,
      status: { $in: ["unpaid", "partially_paid", "overdue"] },
      dueDate: { $lt: overdueDate },
      balance: { $gt: 0 },
    }).populate("feeStructureId");

    const updatedFees = [];

    for (const fee of overdues) {
      const feeStructure = fee.feeStructureId;
      if (!feeStructure) continue;

      const lateFee = calculateLateFee(fee, feeStructure);

      if (lateFee > 0 && lateFee > fee.lateFeeApplied) {
        fee.lateFeeApplied = lateFee;
        fee.status = "overdue";
        await fee.save();
        updatedFees.push(fee);
      }
    }

    return {
      processed: overdues.length,
      updated: updatedFees.length,
      updatedFees,
    };
  } catch (error) {
    console.error("Apply late fees error:", error);
    throw error;
  }
};

// Generate fee summary for a student
const generateStudentFeeSummary = async (studentId, academicYear = null) => {
  try {
    const query = { studentId };
    if (academicYear) query.academicYear = academicYear;

    const fees = await Fee.find(query).sort({ createdAt: -1 });

    const summary = {
      totalFees: 0,
      totalPaid: 0,
      totalBalance: 0,
      totalOverdue: 0,
      feeCount: fees.length,
      paidCount: 0,
      overdueCount: 0,
      partiallyPaidCount: 0,
      unpaidCount: 0,
      byTerm: {},
    };

    fees.forEach((fee) => {
      summary.totalFees += fee.totalAmountDue;
      summary.totalPaid += fee.amountPaid;
      summary.totalBalance += fee.balance;

      // Count by status
      switch (fee.status) {
        case "paid":
          summary.paidCount++;
          break;
        case "overdue":
          summary.overdueCount++;
          summary.totalOverdue += fee.balance;
          break;
        case "partially_paid":
          summary.partiallyPaidCount++;
          break;
        case "unpaid":
          summary.unpaidCount++;
          break;
      }

      // Group by term
      const termKey = `${fee.academicYear}-${fee.academicTerm}`;
      if (!summary.byTerm[termKey]) {
        summary.byTerm[termKey] = {
          academicYear: fee.academicYear,
          academicTerm: fee.academicTerm,
          totalDue: 0,
          totalPaid: 0,
          balance: 0,
          status: "unpaid",
        };
      }

      summary.byTerm[termKey].totalDue += fee.totalAmountDue;
      summary.byTerm[termKey].totalPaid += fee.amountPaid;
      summary.byTerm[termKey].balance += fee.balance;

      // Determine term status
      if (summary.byTerm[termKey].balance <= 0) {
        summary.byTerm[termKey].status = "paid";
      } else if (summary.byTerm[termKey].totalPaid > 0) {
        summary.byTerm[termKey].status = "partially_paid";
      } else if (new Date() > fee.dueDate) {
        summary.byTerm[termKey].status = "overdue";
      }
    });

    return summary;
  } catch (error) {
    console.error("Generate student fee summary error:", error);
    throw error;
  }
};

// Generate branch fee statistics
const generateBranchFeeStats = async (branchId, dateRange = {}) => {
  try {
    const { startDate, endDate } = dateRange;
    const matchQuery = { branchId };

    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
      if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
    }

    // Fee statistics
    const feeStats = await Fee.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalFees: { $sum: "$totalAmountDue" },
          totalPaid: { $sum: "$amountPaid" },
          totalBalance: { $sum: "$balance" },
          totalLateFees: { $sum: "$lateFeeApplied" },
          totalDiscounts: { $sum: "$discountAmount" },
          feeCount: { $sum: 1 },
          paidCount: {
            $sum: { $cond: [{ $eq: ["$status", "paid"] }, 1, 0] },
          },
          overdueCount: {
            $sum: { $cond: [{ $eq: ["$status", "overdue"] }, 1, 0] },
          },
          partiallyPaidCount: {
            $sum: { $cond: [{ $eq: ["$status", "partially_paid"] }, 1, 0] },
          },
          unpaidCount: {
            $sum: { $cond: [{ $eq: ["$status", "unpaid"] }, 1, 0] },
          },
        },
      },
    ]);

    // Payment statistics
    const paymentQuery = { branchId, status: "completed" };
    if (startDate || endDate) {
      paymentQuery.paymentDate = {};
      if (startDate) paymentQuery.paymentDate.$gte = new Date(startDate);
      if (endDate) paymentQuery.paymentDate.$lte = new Date(endDate);
    }

    const paymentStats = await Payment.aggregate([
      { $match: paymentQuery },
      {
        $group: {
          _id: null,
          totalPayments: { $sum: "$amount" },
          paymentCount: { $sum: 1 },
          mpesaPayments: {
            $sum: {
              $cond: [{ $eq: ["$paymentMethod", "mpesa"] }, "$amount", 0],
            },
          },
          cashPayments: {
            $sum: {
              $cond: [{ $eq: ["$paymentMethod", "cash"] }, "$amount", 0],
            },
          },
          bankPayments: {
            $sum: {
              $cond: [
                { $eq: ["$paymentMethod", "bank_transfer"] },
                "$amount",
                0,
              ],
            },
          },
        },
      },
    ]);

    // Payment method breakdown
    const paymentMethodStats = await Payment.aggregate([
      { $match: paymentQuery },
      {
        $group: {
          _id: "$paymentMethod",
          count: { $sum: 1 },
          total: { $sum: "$amount" },
        },
      },
    ]);

    return {
      fees: feeStats[0] || {
        totalFees: 0,
        totalPaid: 0,
        totalBalance: 0,
        totalLateFees: 0,
        totalDiscounts: 0,
        feeCount: 0,
        paidCount: 0,
        overdueCount: 0,
        partiallyPaidCount: 0,
        unpaidCount: 0,
      },
      payments: paymentStats[0] || {
        totalPayments: 0,
        paymentCount: 0,
        mpesaPayments: 0,
        cashPayments: 0,
        bankPayments: 0,
      },
      paymentMethods: paymentMethodStats,
      collectionRate: feeStats[0]
        ? ((feeStats[0].totalPaid / feeStats[0].totalFees) * 100).toFixed(2)
        : 0,
    };
  } catch (error) {
    console.error("Generate branch fee stats error:", error);
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

// Generate payment reference for M-Pesa
const generatePaymentReference = (studentId, academicTerm) => {
  const timestamp = Date.now().toString().slice(-6);
  return `${studentId}-${academicTerm.replace(/\s+/g, "")}-${timestamp}`;
};

// Validate academic year format
const validateAcademicYear = (year) => {
  const yearPattern = /^\d{4}\/\d{4}$|^\d{4}$/;
  return yearPattern.test(year);
};

// Generate next receipt number
const generateReceiptNumber = async (branchId, branchCode = "ATM") => {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");

    // Find the last receipt number for this month
    const lastPayment = await Payment.findOne({
      branchId,
      receiptNumber: new RegExp(`^${branchCode}-${year}-${month}-`),
    }).sort({ receiptNumber: -1 });

    let sequence = 1;
    if (lastPayment) {
      const lastSequence = parseInt(lastPayment.receiptNumber.split("-")[3]);
      sequence = lastSequence + 1;
    }

    return `${branchCode}-${year}-${month}-${String(sequence).padStart(
      4,
      "0"
    )}`;
  } catch (error) {
    console.error("Generate receipt number error:", error);
    // Fallback receipt number
    return `RCP-${Date.now()}`;
  }
};

module.exports = {
  calculateLateFee,
  updateFeeStatus,
  applyLateFees,
  generateStudentFeeSummary,
  generateBranchFeeStats,
  formatKenyanCurrency,
  generatePaymentReference,
  validateAcademicYear,
  generateReceiptNumber,
};
