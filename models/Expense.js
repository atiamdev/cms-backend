const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema(
  {
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: false, // Allow null for school-wide expenses
    },
    date: {
      type: Date,
      required: [true, "Expense date is required"],
      default: Date.now,
    },
    category: {
      type: String,
      required: [true, "Expense category is required"],
      enum: [
        "Salaries",
        "Utilities",
        "Maintenance",
        "Supplies",
        "Transport",
        "Marketing",
        "Insurance",
        "Equipment",
        "Food & Catering",
        "Professional Services",
        "Rent",
        "Communication",
        "Training",
        "Technology",
        "Security",
        "Cleaning",
        "Medical",
        "Miscellaneous",
      ],
      trim: true,
    },
    subcategory: {
      type: String,
      trim: true,
    },
    amount: {
      type: Number,
      required: [true, "Expense amount is required"],
      min: [0, "Amount cannot be negative"],
    },
    description: {
      type: String,
      required: [true, "Expense description is required"],
      trim: true,
      maxlength: [500, "Description cannot exceed 500 characters"],
    },
    vendor: {
      name: {
        type: String,
        trim: true,
      },
      contact: {
        phone: String,
        email: String,
        address: String,
      },
    },
    paymentMethod: {
      type: String,
      enum: ["cash", "bank_transfer", "cheque", "mpesa", "card", "other"],
      required: [true, "Payment method is required"],
    },
    paymentReference: {
      type: String,
      trim: true,
    },
    receiptNumber: {
      type: String,
      trim: true,
      uppercase: true,
    },
    attachments: [
      {
        filename: {
          type: String,
          required: true,
        },
        url: {
          type: String,
          required: true,
        },
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
        size: Number,
        mimetype: String,
      },
    ],
    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected", "on_hold"],
      default: "pending",
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    approvalDate: {
      type: Date,
    },
    approvalNotes: {
      type: String,
      trim: true,
    },
    budgetCategory: {
      type: String,
      trim: true,
    },
    isRecurring: {
      type: Boolean,
      default: false,
    },
    recurringDetails: {
      frequency: {
        type: String,
        enum: ["monthly", "quarterly", "annually"],
      },
      nextDueDate: Date,
      endDate: Date,
    },
    tags: [
      {
        type: String,
        trim: true,
        lowercase: true,
      },
    ],
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Recorder reference is required"],
    },
    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient queries
expenseSchema.index({ branchId: 1, date: -1 });
expenseSchema.index({ branchId: 1, category: 1, date: -1 });
expenseSchema.index({ branchId: 1, approvalStatus: 1 });
expenseSchema.index({ branchId: 1, paymentMethod: 1 });
expenseSchema.index({ receiptNumber: 1 });

// Text index for search functionality
expenseSchema.index({
  description: "text",
  "vendor.name": "text",
  notes: "text",
});

// Virtual for formatted amount
expenseSchema.virtual("formattedAmount").get(function () {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
  }).format(this.amount);
});

// Virtual for expense age in days
expenseSchema.virtual("ageInDays").get(function () {
  const today = new Date();
  const diffTime = today - this.date;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for approval status display
expenseSchema.virtual("approvalStatusDisplay").get(function () {
  const statusMap = {
    pending: "Pending Approval",
    approved: "Approved",
    rejected: "Rejected",
    on_hold: "On Hold",
  };
  return statusMap[this.approvalStatus] || this.approvalStatus;
});

// Pre-save middleware to update lastModifiedBy
expenseSchema.pre("save", function (next) {
  if (this.isModified() && !this.isNew) {
    this.updatedAt = new Date();
  }
  next();
});

// Static method to get expense categories
expenseSchema.statics.getCategories = function () {
  return this.schema.paths.category.enumValues;
};

// Static method to get payment methods
expenseSchema.statics.getPaymentMethods = function () {
  return this.schema.paths.paymentMethod.enumValues;
};

// Instance method to calculate monthly average for recurring expenses
expenseSchema.methods.calculateMonthlyAverage = async function () {
  if (!this.isRecurring) return this.amount;

  const frequency = this.recurringDetails?.frequency;
  switch (frequency) {
    case "monthly":
      return this.amount;
    case "quarterly":
      return this.amount / 3;
    case "annually":
      return this.amount / 12;
    default:
      return this.amount;
  }
};

// Ensure virtuals are included in JSON output
expenseSchema.set("toJSON", { virtuals: true });
expenseSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Expense", expenseSchema);
