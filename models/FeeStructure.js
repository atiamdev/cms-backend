const mongoose = require("mongoose");

const feeComponentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Fee component name is required"],
    trim: true,
  },
  amount: {
    type: Number,
    required: [true, "Fee component amount is required"],
    min: [0, "Amount cannot be negative"],
  },
  isOptional: {
    type: Boolean,
    default: false,
  },
  description: {
    type: String,
    trim: true,
  },
});

const feeStructureSchema = new mongoose.Schema(
  {
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: [true, "Branch reference is required"],
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: [true, "Class reference is required"],
    },
    academicYear: {
      type: String,
      required: [true, "Academic year is required"],
      trim: true,
    },
    academicTermId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicTerm",
      required: [true, "Academic term reference is required"],
    },
    feeComponents: [feeComponentSchema],
    totalAmount: {
      type: Number,
      required: [true, "Total amount is required"],
      min: [0, "Total amount cannot be negative"],
    },
    dueDate: {
      type: Date,
      required: [true, "Due date is required"],
    },
    allowInstallments: {
      type: Boolean,
      default: false,
    },
    installmentSchedule: [
      {
        installmentNumber: {
          type: Number,
          required: true,
        },
        amount: {
          type: Number,
          required: true,
          min: [0, "Installment amount cannot be negative"],
        },
        dueDate: {
          type: Date,
          required: true,
        },
      },
    ],
    lateFeeAmount: {
      type: Number,
      default: 0,
      min: [0, "Late fee amount cannot be negative"],
    },
    lateFeeGracePeriod: {
      type: Number, // days
      default: 7,
      min: [0, "Grace period cannot be negative"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Creator reference is required"],
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient queries
feeStructureSchema.index({
  branchId: 1,
  classId: 1,
  academicYear: 1,
  academicTerm: 1,
});
feeStructureSchema.index({ branchId: 1, isActive: 1 });

// Pre-save middleware to calculate total amount
feeStructureSchema.pre("save", function (next) {
  if (this.feeComponents && this.feeComponents.length > 0) {
    this.totalAmount = this.feeComponents.reduce((total, component) => {
      return total + component.amount;
    }, 0);
  }
  next();
});

module.exports = mongoose.model("FeeStructure", feeStructureSchema);
