// cms-backend/models/Role.js
const mongoose = require("mongoose");

const roleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    permissions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Permission",
      },
    ],
    isSystemRole: {
      type: Boolean,
      default: false, // System roles (superadmin, admin, etc.) can't be deleted
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    color: {
      type: String,
      default: "#3B82F6", // Blue color for UI
    },
    priority: {
      type: Number,
      default: 0, // Higher number = higher priority
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null, // null means global role
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
roleSchema.index({ name: 1, branchId: 1 }, { unique: true });
roleSchema.index({ isActive: 1 });
roleSchema.index({ priority: -1 });

module.exports = mongoose.model("Role", roleSchema);
