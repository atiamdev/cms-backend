/**
 * Payment Fee Linking Model
 * Links payments to specific fees for detailed tracking
 */

const mongoose = require("mongoose");

const paymentFeeSchema = new mongoose.Schema(
  {
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      required: [true, "Payment reference is required"],
      index: true,
    },
    feeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Fee",
      required: [true, "Fee reference is required"],
      index: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: [true, "Student reference is required"],
      index: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: [true, "Branch reference is required"],
      index: true,
    },
    amountApplied: {
      type: Number,
      required: [true, "Amount applied is required"],
      min: [0, "Amount applied cannot be negative"],
    },
    appliedDate: {
      type: Date,
      default: Date.now,
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

// Compound indexes for efficient queries
paymentFeeSchema.index({ paymentId: 1, feeId: 1 }, { unique: true });
paymentFeeSchema.index({ studentId: 1, appliedDate: -1 });
paymentFeeSchema.index({ branchId: 1, appliedDate: -1 });

// Static method to get fee payment history
paymentFeeSchema.statics.getFeePaymentHistory = async function (feeId) {
  return await this.find({ feeId })
    .populate("paymentId", "receiptNumber amount paymentMethod paymentDate")
    .sort({ appliedDate: -1 });
};

// Static method to get payment allocation breakdown
paymentFeeSchema.statics.getPaymentAllocation = async function (paymentId) {
  return await this.find({ paymentId })
    .populate("feeId", "feeType totalAmountDue academicYear")
    .sort({ appliedDate: 1 });
};

// Static method to get student payment summary
paymentFeeSchema.statics.getStudentPaymentSummary = async function (
  studentId,
  startDate,
  endDate,
) {
  const query = { studentId };

  if (startDate || endDate) {
    query.appliedDate = {};
    if (startDate) query.appliedDate.$gte = startDate;
    if (endDate) query.appliedDate.$lte = endDate;
  }

  const allocations = await this.find(query)
    .populate("paymentId", "receiptNumber paymentMethod paymentDate")
    .populate("feeId", "feeType academicYear")
    .sort({ appliedDate: -1 });

  const totalAllocated = allocations.reduce(
    (sum, alloc) => sum + alloc.amountApplied,
    0,
  );

  return {
    allocations,
    totalAllocated,
    count: allocations.length,
  };
};

module.exports = mongoose.model("PaymentFee", paymentFeeSchema);
