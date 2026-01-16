const mongoose = require("mongoose");

const scholarshipSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: [true, "Student reference is required"],
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: [true, "Branch reference is required"],
    },
    percentage: {
      type: Number,
      required: [true, "Scholarship percentage is required"],
      min: [0, "Percentage cannot be less than 0"],
      max: [100, "Percentage cannot be more than 100"],
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Assigned by is required"],
    },
    assignedDate: {
      type: Date,
      default: Date.now,
    },
    reason: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
scholarshipSchema.index({ studentId: 1, isActive: 1 });
scholarshipSchema.index({ branchId: 1 });

module.exports = mongoose.model("Scholarship", scholarshipSchema);
