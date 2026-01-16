const mongoose = require("mongoose");

const ratingSchema = new mongoose.Schema(
  {
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ECourse",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    review: {
      type: String,
      trim: true,
      maxlength: [1000, "Review cannot exceed 1000 characters"],
    },
    isVerified: {
      type: Boolean,
      default: false, // True if user completed the course
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to ensure one rating per user per course
ratingSchema.index({ courseId: 1, userId: 1 }, { unique: true });

// Index for efficient queries
ratingSchema.index({ courseId: 1, createdAt: -1 });

module.exports = mongoose.model("Rating", ratingSchema);
