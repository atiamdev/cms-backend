// cms-backend/models/UserRoleAssignment.js
const mongoose = require("mongoose");

const userRoleAssignmentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    roleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Role",
      required: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null, // null means global assignment
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    assignedAt: {
      type: Date,
      default: Date.now,
    },
    validFrom: {
      type: Date,
      default: Date.now,
    },
    validUntil: {
      type: Date,
      default: null, // null means no expiration
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    reason: {
      type: String,
      default: "",
    },
    revokedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    revokedAt: {
      type: Date,
    },
    revokeReason: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes
userRoleAssignmentSchema.index(
  { userId: 1, roleId: 1, branchId: 1 },
  { unique: true }
);
userRoleAssignmentSchema.index({ userId: 1, isActive: 1 });
userRoleAssignmentSchema.index({ roleId: 1 });
userRoleAssignmentSchema.index({ validFrom: 1, validUntil: 1 });

// Method to check if assignment is currently valid
userRoleAssignmentSchema.methods.isCurrentlyValid = function () {
  const now = new Date();
  const validFrom = this.validFrom || now;
  const validUntil = this.validUntil || new Date("2099-12-31");

  return this.isActive && now >= validFrom && now <= validUntil;
};

module.exports = mongoose.model("UserRoleAssignment", userRoleAssignmentSchema);
