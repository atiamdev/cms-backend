// cms-backend/models/Permission.js
const mongoose = require("mongoose");

const permissionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    resource: {
      type: String,
      required: true,
      trim: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        "create",
        "read",
        "update",
        "delete",
        "manage",
        "view",
        "export",
        "import",
      ],
    },
    description: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      required: true,
      enum: [
        "Academic",
        "Financial",
        "Administrative",
        "System",
        "Reports",
        "Communication",
      ],
    },
    isSystemPermission: {
      type: Boolean,
      default: false, // System permissions can't be deleted
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for resource + action uniqueness
permissionSchema.index({ resource: 1, action: 1 }, { unique: true });

module.exports = mongoose.model("Permission", permissionSchema);
