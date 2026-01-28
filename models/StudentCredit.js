/**
 * Student Credit Model
 * Tracks credit balances from overpayments
 */

const mongoose = require("mongoose");

const studentCreditSchema = new mongoose.Schema(
  {
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
    amount: {
      type: Number,
      required: [true, "Credit amount is required"],
      min: [0, "Credit amount cannot be negative"],
    },
    source: {
      type: String,
      enum: [
        "equity_overpayment",
        "mpesa_overpayment",
        "manual_credit",
        "refund",
        "other",
      ],
      required: [true, "Credit source is required"],
    },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      index: true,
    },
    status: {
      type: String,
      enum: ["available", "used", "refunded", "expired"],
      default: "available",
    },
    usedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    remainingAmount: {
      type: Number,
      default: function () {
        return this.amount;
      },
    },
    notes: {
      type: String,
      trim: true,
    },
    expiryDate: {
      type: Date,
      // Credits expire after 1 year by default
      default: function () {
        const oneYearFromNow = new Date();
        oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
        return oneYearFromNow;
      },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for efficient queries
studentCreditSchema.index({ studentId: 1, status: 1 });
studentCreditSchema.index({ branchId: 1, status: 1 });
studentCreditSchema.index({ expiryDate: 1 });

// Pre-save hook to update remaining amount
studentCreditSchema.pre("save", function (next) {
  this.remainingAmount = this.amount - this.usedAmount;

  // Auto-mark as used if fully utilized
  if (this.remainingAmount <= 0 && this.status === "available") {
    this.status = "used";
  }

  next();
});

// Static method to get available credits for a student
studentCreditSchema.statics.getAvailableCredits = async function (studentId) {
  const credits = await this.find({
    studentId: studentId,
    status: "available",
    remainingAmount: { $gt: 0 },
    expiryDate: { $gt: new Date() },
  }).sort({ createdAt: 1 }); // Oldest first

  const totalAvailable = credits.reduce(
    (sum, credit) => sum + credit.remainingAmount,
    0,
  );

  return {
    credits,
    totalAvailable,
  };
};

// Static method to use credit
studentCreditSchema.statics.useCredit = async function (
  studentId,
  amountToUse,
) {
  const { credits } = await this.getAvailableCredits(studentId);

  let remainingToUse = amountToUse;
  const usedCredits = [];

  for (const credit of credits) {
    if (remainingToUse <= 0) break;

    const amountFromThisCredit = Math.min(
      credit.remainingAmount,
      remainingToUse,
    );

    credit.usedAmount += amountFromThisCredit;
    credit.remainingAmount -= amountFromThisCredit;

    if (credit.remainingAmount <= 0) {
      credit.status = "used";
    }

    await credit.save();

    usedCredits.push({
      creditId: credit._id,
      amountUsed: amountFromThisCredit,
    });

    remainingToUse -= amountFromThisCredit;
  }

  return {
    success: remainingToUse === 0,
    usedCredits,
    amountUsed: amountToUse - remainingToUse,
    remainingNeeded: remainingToUse,
  };
};

// Instance method to check if credit is usable
studentCreditSchema.methods.isUsable = function () {
  return (
    this.status === "available" &&
    this.remainingAmount > 0 &&
    this.expiryDate > new Date()
  );
};

module.exports = mongoose.model("StudentCredit", studentCreditSchema);
