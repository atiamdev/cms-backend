const mongoose = require("mongoose");

const studentApplicationSchema = new mongoose.Schema(
  {
    // Branch context
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
      index: true,
    },

    // Personal Information
    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
    },
    lastName: {
      type: String,
      required: [true, "Last name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      trim: true,
      lowercase: true,
      index: true,
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
    },
    dateOfBirth: {
      type: Date,
      required: [true, "Date of birth is required"],
    },
    gender: {
      type: String,
      enum: ["male", "female", "other"],
      required: true,
    },

    // Academic Information
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: [true, "Department is required"],
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: [true, "Course is required"],
    },
    previousEducation: {
      type: String,
      trim: true,
    },
    previousInstitution: {
      type: String,
      trim: true,
    },

    // Contact Information
    address: {
      street: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      postalCode: { type: String, trim: true },
      country: { type: String, trim: true, default: "Kenya" },
    },

    // Guardian Information (for minors)
    guardianName: {
      type: String,
      trim: true,
    },
    guardianPhone: {
      type: String,
      trim: true,
    },
    guardianEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    guardianRelationship: {
      type: String,
      trim: true,
    },

    // Application Status
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "cancelled"],
      default: "pending",
      index: true,
    },

    // Processing Information
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    reviewedAt: {
      type: Date,
    },
    reviewNotes: {
      type: String,
      trim: true,
    },

    // If approved, link to created student record
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
    },

    // Additional Information
    message: {
      type: String,
      trim: true,
    },

    // Application metadata
    applicationNumber: {
      type: String,
      unique: true,
      index: true,
    },
    submittedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Generate unique application number before saving
studentApplicationSchema.pre("save", async function (next) {
  if (!this.applicationNumber) {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, "0");
    const count = await mongoose.models.StudentApplication.countDocuments();
    this.applicationNumber = `APP-${year}${month}-${String(count + 1).padStart(
      5,
      "0"
    )}`;
  }
  next();
});

// Indexes for efficient queries
studentApplicationSchema.index({ branchId: 1, status: 1 });
studentApplicationSchema.index({ email: 1, branchId: 1 });
studentApplicationSchema.index({ createdAt: -1 });

// Virtual for full name
studentApplicationSchema.virtual("fullName").get(function () {
  return `${this.firstName} ${this.lastName}`;
});

// Ensure virtuals are included in JSON
studentApplicationSchema.set("toJSON", { virtuals: true });
studentApplicationSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("StudentApplication", studentApplicationSchema);
