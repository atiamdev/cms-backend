const mongoose = require("mongoose");

const branchSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Branch name is required"],
      trim: true,
      maxlength: [100, "Branch name cannot exceed 100 characters"],
    },
    address: {
      street: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      zipCode: { type: String, trim: true },
      country: { type: String, trim: true, default: "Kenya" },
    },
    contactInfo: {
      phone: { type: String, trim: true },
      email: { type: String, trim: true, lowercase: true },
      website: { type: String, trim: true },
    },
    logoUrl: {
      type: String,
      trim: true,
    },
    academicTerms: [
      {
        name: {
          type: String,
          required: true,
          trim: true,
        },
        startDate: {
          type: Date,
          required: true,
        },
        endDate: {
          type: Date,
          required: true,
        },
        isActive: {
          type: Boolean,
          default: false,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    configuration: {
      currency: {
        type: String,
        default: "KES",
        enum: ["KES", "USD", "EUR", "GBP"],
      },
      receiptPrefix: {
        type: String,
        default: "RCP",
        maxlength: [10, "Receipt prefix cannot exceed 10 characters"],
      },
      studentIdPrefix: {
        type: String,
        default: "STU",
        maxlength: [10, "Student ID prefix cannot exceed 10 characters"],
      },
      teacherIdPrefix: {
        type: String,
        default: "TCH",
        maxlength: [10, "Teacher ID prefix cannot exceed 10 characters"],
      },
      timezone: {
        type: String,
        default: "Africa/Nairobi",
      },
      academicYear: {
        type: String,
        default: () => new Date().getFullYear().toString(),
      },
    },
    status: {
      type: String,
      enum: ["active", "inactive", "suspended"],
      default: "active",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for performance
branchSchema.index({ name: 1 });
branchSchema.index({ status: 1 });
branchSchema.index({ "contactInfo.email": 1 });

// Virtual for active academic term
branchSchema.virtual("activeAcademicTerm").get(function () {
  return Array.isArray(this.academicTerms)
    ? this.academicTerms.find((term) => term.isActive)
    : null;
});

// Middleware to update updatedAt before saving
branchSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

// Method to get current academic term
branchSchema.methods.getCurrentAcademicTerm = function () {
  const now = new Date();
  return this.academicTerms.find(
    (term) => term.startDate <= now && term.endDate >= now
  );
};

// Method to activate academic term
branchSchema.methods.activateAcademicTerm = function (termId) {
  // Deactivate all terms first
  this.academicTerms.forEach((term) => {
    term.isActive = false;
  });

  // Activate the specified term
  const termToActivate = this.academicTerms.id(termId);
  if (termToActivate) {
    termToActivate.isActive = true;
    return true;
  }
  return false;
};

module.exports = mongoose.model("Branch", branchSchema);
