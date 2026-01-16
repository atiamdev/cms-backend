const mongoose = require("mongoose");

const feeSchema = new mongoose.Schema(
  {
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: [true, "Branch reference is required"],
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: [true, "Student reference is required"],
    },
    feeStructureId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FeeStructure",
      required: false, // Made optional for course-based fees
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: false, // Used for course-based fees when feeStructureId is null
    },
    academicYear: {
      type: String,
      required: [true, "Academic year is required"],
      trim: true,
    },
    academicTermId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicTerm",
      required: false, // Made optional for monthly billing cycles
    },
    feeComponents: [
      {
        name: {
          type: String,
          required: true,
          trim: true,
        },
        amount: {
          type: Number,
          required: true,
          min: [0, "Amount cannot be negative"],
        },
        isOptional: {
          type: Boolean,
          default: false,
        },
        description: String,
      },
    ],
    totalAmountDue: {
      type: Number,
      required: [true, "Total amount due is required"],
      min: [0, "Total amount due cannot be negative"],
    },
    amountPaid: {
      type: Number,
      default: 0,
      min: [0, "Amount paid cannot be negative"],
    },
    balance: {
      type: Number,
      default: 0,
    },
    discountAmount: {
      type: Number,
      default: 0,
      min: [0, "Discount amount cannot be negative"],
    },
    discountReason: {
      type: String,
      trim: true,
    },
    scholarshipAmount: {
      type: Number,
      default: 0,
      min: [0, "Scholarship amount cannot be negative"],
    },
    dueDate: {
      type: Date,
      required: [true, "Due date is required"],
    },
    status: {
      type: String,
      enum: ["unpaid", "partially_paid", "paid", "overdue", "waived"],
      default: "unpaid",
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "processing", "completed", "failed", "cancelled"],
      default: "pending",
    },
    isInstallmentPlan: {
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
        paidAmount: {
          type: Number,
          default: 0,
          min: [0, "Paid amount cannot be negative"],
        },
        status: {
          type: String,
          enum: ["pending", "paid", "overdue"],
          default: "pending",
        },
        paidDate: Date,
      },
    ],
    notes: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false, // Made optional for automated/system-generated invoices
    },
    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    // Invoice metadata
    invoiceType: {
      type: String,
      enum: ["term", "weekly", "monthly", "quarterly", "annual"],
      default: "term",
    },
    // Period start date (for weekly/monthly/quarterly/annual invoices)
    periodStart: {
      type: Date,
    },
    // Legacy/monthly fields (kept for backward compatibility)
    periodYear: {
      type: Number,
    },
    periodMonth: {
      type: Number,
      min: 1,
      max: 12,
    },
    // Optional link to course for course-level invoices
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
    },
    // Consolidated invoice support
    isConsolidated: {
      type: Boolean,
      default: false,
    },
    consolidatedFeeStructures: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "FeeStructure",
    }],
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient queries
feeSchema.index({
  branchId: 1,
  studentId: 1,
  academicYear: 1,
  academicTermId: 1,
});
// Ensure we don't create duplicate monthly invoices for same student and feeStructure for a period
feeSchema.index({ feeStructureId: 1, studentId: 1, periodYear: 1, periodMonth: 1 }, { unique: true, partialFilterExpression: { periodYear: { $exists: true } } });
// Unique invoice per feeStructure/student/periodStart to support multiple frequencies
feeSchema.index({ feeStructureId: 1, studentId: 1, periodStart: 1 }, { unique: true, partialFilterExpression: { periodStart: { $exists: true } } });
feeSchema.index({ branchId: 1, status: 1 });
feeSchema.index({ branchId: 1, status: 1 });
feeSchema.index({ branchId: 1, dueDate: 1 });
feeSchema.index({ studentId: 1, status: 1 });

// Pre-save middleware to calculate balance and update status
feeSchema.pre("save", function (next) {
  // Calculate balance
  this.balance =
    this.totalAmountDue -
    this.amountPaid -
    this.discountAmount -
    this.scholarshipAmount;

  // Update status based on payment
  if (this.balance <= 0) {
    this.status = "paid";
    this.paymentStatus = "completed";
  } else if (this.amountPaid > 0) {
    this.status = "partially_paid";
  } else if (new Date() > this.dueDate && this.balance > 0) {
    this.status = "overdue";
  } else {
    this.status = "unpaid";
  }

  next();
});

// Virtual for payment percentage
feeSchema.virtual("paymentPercentage").get(function () {
  if (this.totalAmountDue === 0) return 100;
  return Math.round((this.amountPaid / this.totalAmountDue) * 100);
});

// Virtual for days overdue
feeSchema.virtual("daysOverdue").get(function () {
  if (this.status !== "overdue") return 0;
  const today = new Date();
  const diffTime = today - this.dueDate;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Ensure virtuals are included in JSON output
feeSchema.set("toJSON", { virtuals: true });
feeSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Fee", feeSchema);
