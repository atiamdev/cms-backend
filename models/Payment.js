const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: [true, "Branch reference is required"],
    },
    feeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Fee",
      required: false, // Made optional for course-based payments
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ECourse",
      required: false, // Made optional for elearning course payments
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: [true, "Student reference is required"],
    },
    receiptNumber: {
      type: String,
      required: [true, "Receipt number is required"],
      unique: true,
      trim: true,
      uppercase: true,
    },
    amount: {
      type: Number,
      required: [true, "Payment amount is required"],
      min: [0, "Payment amount cannot be negative"],
    },
    paymentMethod: {
      type: String,
      enum: [
        "mpesa",
        "cash",
        "bank_transfer",
        "cheque",
        "card",
        "mobile_money",
        "equity",
      ],
      required: [true, "Payment method is required"],
    },
    paymentDate: {
      type: Date,
      required: [true, "Payment date is required"],
      default: Date.now,
    },

    // M-Pesa specific fields
    mpesaDetails: {
      phoneNumber: {
        type: String,
        trim: true,
      },
      transactionId: {
        type: String,
        trim: true,
        uppercase: true,
      },
      transactionDate: {
        type: Number, // M-Pesa format: YYYYMMDDHHMMSS
      },
      confirmedAmount: {
        type: Number,
      },
      confirmedPhoneNumber: {
        type: Number,
      },
      checkoutRequestId: {
        type: String,
        trim: true,
      },
      merchantRequestId: {
        type: String,
        trim: true,
      },
      resultCode: {
        type: Number,
      },
      resultDesc: {
        type: String,
        trim: true,
      },
      failureReason: {
        type: String,
        trim: true,
      },
      callbackReceived: {
        type: Boolean,
        default: false,
      },
      callbackData: {
        type: mongoose.Schema.Types.Mixed,
      },
    },

    // Equity Bank (Jenga) specific fields
    equityDetails: {
      orderReference: {
        type: String,
        trim: true,
      },
      transactionId: {
        type: String,
        trim: true,
      },
      paymentMode: {
        type: String,
        enum: ["CARD", "MPESA", "PWE", "EQUITEL", "PAYPAL"],
        trim: true,
      },
      transactionDate: {
        type: String, // ISO format from Jenga
      },
      confirmedAmount: {
        type: Number,
      },
      currency: {
        type: String,
        default: "KES",
      },
      billNumber: {
        type: String,
        trim: true,
      },
      serviceCharge: {
        type: Number,
      },
      status: {
        type: String,
        enum: ["SUCCESS", "FAILED"],
      },
      remarks: {
        type: String,
        trim: true,
      },
      callbackReceived: {
        type: Boolean,
        default: false,
      },
      callbackData: {
        type: mongoose.Schema.Types.Mixed,
      },
      ipnReceived: {
        type: Boolean,
        default: false,
      },
      ipnData: {
        type: mongoose.Schema.Types.Mixed,
      },
    },

    // Manual payment fields
    manualPaymentDetails: {
      referenceNumber: {
        type: String,
        trim: true,
        uppercase: true,
      },
      bankName: {
        type: String,
        trim: true,
      },
      chequeNumber: {
        type: String,
        trim: true,
        uppercase: true,
      },
      depositorName: {
        type: String,
        trim: true,
      },
      notes: {
        type: String,
        trim: true,
      },
    },

    status: {
      type: String,
      enum: [
        "pending",
        "processing",
        "completed",
        "failed",
        "cancelled",
        "refunded",
      ],
      default: "pending",
    },

    verificationStatus: {
      type: String,
      enum: ["unverified", "verified", "disputed"],
      default: "unverified",
    },

    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    verificationDate: {
      type: Date,
    },

    verificationNotes: {
      type: String,
      trim: true,
    },

    // Receipt details
    receiptGenerated: {
      type: Boolean,
      default: false,
    },

    receiptUrl: {
      type: String,
      trim: true,
    },

    receiptEmailSent: {
      type: Boolean,
      default: false,
    },

    receiptEmailSentAt: {
      type: Date,
    },

    // Refund details (if applicable)
    refundDetails: {
      refundAmount: {
        type: Number,
        min: [0, "Refund amount cannot be negative"],
      },
      refundReason: {
        type: String,
        trim: true,
      },
      refundDate: {
        type: Date,
      },
      refundedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      refundMethod: {
        type: String,
        enum: ["mpesa", "cash", "bank_transfer", "cheque"],
      },
      refundReference: {
        type: String,
        trim: true,
      },
    },

    // Audit fields
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
paymentSchema.index({ branchId: 1, paymentDate: -1 });
paymentSchema.index({ studentId: 1, paymentDate: -1 });
paymentSchema.index({ feeId: 1, status: 1 });
paymentSchema.index({ receiptNumber: 1 });
paymentSchema.index({ "mpesaDetails.transactionId": 1 });
paymentSchema.index({ "mpesaDetails.checkoutRequestId": 1 });
paymentSchema.index({ "equityDetails.transactionId": 1 });
paymentSchema.index({ "equityDetails.orderReference": 1 });
paymentSchema.index({ status: 1, paymentMethod: 1 });

// Pre-save middleware to generate receipt number
paymentSchema.pre("save", async function (next) {
  if (this.isNew && !this.receiptNumber) {
    try {
      // Get branch info for receipt prefix
      const Branch = mongoose.model("Branch");
      const branch = await Branch.findById(this.branchId).select("name");

      // Generate receipt number format: BRANCH-YEAR-MONTH-SEQUENCE
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const branchCode = branch
        ? branch.name.substring(0, 3).toUpperCase()
        : "ATM";

      // Find the last receipt number for this month
      const lastPayment = await this.constructor
        .findOne({
          branchId: this.branchId,
          receiptNumber: new RegExp(`^${branchCode}-${year}-${month}-`),
        })
        .sort({ receiptNumber: -1 });

      let sequence = 1;
      if (lastPayment) {
        const lastSequence = parseInt(lastPayment.receiptNumber.split("-")[3]);
        sequence = lastSequence + 1;
      }

      this.receiptNumber = `${branchCode}-${year}-${month}-${String(
        sequence
      ).padStart(4, "0")}`;
    } catch (error) {
      // Fallback receipt number generation
      this.receiptNumber = `RCP-${Date.now()}`;
    }
  }
  next();
});

// Virtual for formatted amount
paymentSchema.virtual("formattedAmount").get(function () {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
  }).format(this.amount);
});

// Virtual for payment age in days
paymentSchema.virtual("paymentAge").get(function () {
  const today = new Date();
  const diffTime = today - this.paymentDate;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Ensure virtuals are included in JSON output
paymentSchema.set("toJSON", { virtuals: true });
paymentSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Payment", paymentSchema);
