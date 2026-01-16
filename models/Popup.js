const mongoose = require("mongoose");

const popupSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Popup title is required"],
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    content: {
      type: String,
      trim: true,
      maxlength: [500, "Content cannot exceed 500 characters"],
    },
    contentType: {
      type: String,
      enum: ["image", "text"],
      required: [true, "Content type is required"],
      default: "text",
    },
    image: {
      url: {
        type: String,
        trim: true,
      },
      alt: {
        type: String,
        trim: true,
        maxlength: [100, "Alt text cannot exceed 100 characters"],
      },
    },
    buttonText: {
      type: String,
      trim: true,
      maxlength: [50, "Button text cannot exceed 50 characters"],
    },
    buttonLink: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft",
    },
    displayDuration: {
      type: Number, // Duration in seconds
      default: 5,
      min: [1, "Display duration must be at least 1 second"],
      max: [60, "Display duration cannot exceed 60 seconds"],
    },
    delayBeforeShow: {
      type: Number, // Delay in milliseconds before showing popup
      default: 2000,
      min: [0, "Delay cannot be negative"],
      max: [30000, "Delay cannot exceed 30 seconds"],
    },
    showOnce: {
      type: Boolean,
      default: true, // If true, show popup only once per session
    },
    publishDate: {
      type: Date,
      default: Date.now,
    },
    expiryDate: {
      type: Date,
    },
    priority: {
      type: Number,
      default: 0, // Higher priority popups are shown first
    },
    author: {
      name: {
        type: String,
        required: true,
        trim: true,
      },
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    },
    statistics: {
      views: {
        type: Number,
        default: 0,
      },
      clicks: {
        type: Number,
        default: 0,
      },
      dismissals: {
        type: Number,
        default: 0,
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for checking if popup is currently active
popupSchema.virtual("isActive").get(function () {
  const now = new Date();
  const isPublished = this.status === "published";
  const isNotExpired = !this.expiryDate || this.expiryDate > now;
  return isPublished && isNotExpired;
});

// Index for efficient querying
popupSchema.index({ status: 1, priority: -1, publishDate: -1 });
popupSchema.index({ expiryDate: 1 });

// Static method to get active popup
popupSchema.statics.getActivePopup = async function () {
  const now = new Date();
  return this.findOne({
    status: "published",
    $or: [{ expiryDate: { $gt: now } }, { expiryDate: null }],
  })
    .sort({ priority: -1, publishDate: -1 })
    .exec();
};

const Popup = mongoose.model("Popup", popupSchema);

module.exports = Popup;
