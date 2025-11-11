const mongoose = require("mongoose");

const noticeSchema = new mongoose.Schema(
  {
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: [true, "Branch reference is required"],
    },
    title: {
      type: String,
      required: [true, "Notice title is required"],
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    content: {
      type: String,
      required: [true, "Notice content is required"],
      trim: true,
    },
    type: {
      type: String,
      enum: [
        "urgent",
        "important",
        "academic",
        "info",
        "general",
        "fee_reminder",
      ],
      default: "general",
    },
    priority: {
      type: String,
      enum: ["high", "medium", "low"],
      default: "medium",
    },
    targetAudience: {
      type: String,
      enum: ["all", "students", "teachers", "staff", "parents"],
      default: "all",
    },
    specificRecipients: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    author: {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      name: {
        type: String,
        required: true,
      },
      department: {
        type: String,
        default: "Administration",
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    publishDate: {
      type: Date,
      default: Date.now,
    },
    expiryDate: {
      type: Date,
    },
    attachments: [
      {
        filename: String,
        url: String,
        size: Number,
        mimeType: String,
      },
    ],
    readBy: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        readAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    hiddenBy: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        hiddenAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for performance
noticeSchema.index({ branchId: 1 });
noticeSchema.index({ type: 1 });
noticeSchema.index({ priority: 1 });
noticeSchema.index({ targetAudience: 1 });
noticeSchema.index({ isActive: 1 });
noticeSchema.index({ publishDate: -1 });
noticeSchema.index({ expiryDate: 1 });

// Compound indexes
noticeSchema.index({ branchId: 1, isActive: 1, publishDate: -1 });
noticeSchema.index({ branchId: 1, targetAudience: 1, isActive: 1 });

// Virtual for checking if notice is expired
noticeSchema.virtual("isExpired").get(function () {
  return this.expiryDate && this.expiryDate < new Date();
});

// Virtual for checking if notice is current
noticeSchema.virtual("isCurrent").get(function () {
  const now = new Date();
  return (
    this.isActive &&
    this.publishDate <= now &&
    (!this.expiryDate || this.expiryDate > now)
  );
});

// Virtual for read status by user
noticeSchema.methods.isReadByUser = function (userId) {
  return this.readBy.some(
    (read) => read.userId.toString() === userId.toString()
  );
};

// Virtual for hidden status by user
noticeSchema.methods.isHiddenByUser = function (userId) {
  return this.hiddenBy.some(
    (hidden) => hidden.userId.toString() === userId.toString()
  );
};

// Method to mark as read by user
noticeSchema.methods.markAsReadByUser = function (userId) {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  if (!this.isReadByUser(userObjectId)) {
    this.readBy.push({ userId: userObjectId });
  }
};

// Method to hide notice for user
noticeSchema.methods.hideForUser = function (userId) {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  if (!this.isHiddenByUser(userObjectId)) {
    this.hiddenBy.push({ userId: userObjectId });
  }
};

// Method to unhide notice for user
noticeSchema.methods.unhideForUser = function (userId) {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  this.hiddenBy = this.hiddenBy.filter(
    (hidden) => hidden.userId.toString() !== userObjectId.toString()
  );
};

module.exports = mongoose.model("Notice", noticeSchema);
