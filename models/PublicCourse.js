const mongoose = require("mongoose");

const publicCourseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Course title is required"],
      trim: true,
      maxlength: [100, "Title cannot exceed 100 characters"],
    },
    description: {
      type: String,
      required: [true, "Course description is required"],
      trim: true,
      maxlength: [500, "Description cannot exceed 500 characters"],
    },
    shortDescription: {
      type: String,
      trim: true,
      maxlength: [150, "Short description cannot exceed 150 characters"],
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
    category: {
      type: String,
      enum: ["language", "technology", "business", "design", "other"],
      default: "other",
    },
    level: {
      type: String,
      enum: ["Beginner", "Intermediate", "Advanced"],
      default: "Beginner",
    },
    duration: {
      type: String,
      trim: true,
      maxlength: [50, "Duration cannot exceed 50 characters"],
    },
    modules: [
      {
        type: String,
        trim: true,
        maxlength: [100, "Module name cannot exceed 100 characters"],
      },
    ],
    curriculum: [
      {
        type: String,
        trim: true,
        maxlength: [200, "Curriculum item cannot exceed 200 characters"],
      },
    ],
    requirements: [
      {
        type: String,
        trim: true,
        maxlength: [200, "Requirement item cannot exceed 200 characters"],
      },
    ],
    fee: {
      amount: {
        type: Number,
        min: 0,
      },
      currency: {
        type: String,
        enum: ["KES"],
        default: "KES",
        trim: true,
      },
      formatted: {
        type: String,
        trim: true,
      },
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    displayOrder: {
      type: Number,
      default: 0,
      min: 0,
    },
    featured: {
      type: Boolean,
      default: false,
    },
    // Optional reference to internal Course model
    internalCourseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for performance
publicCourseSchema.index({ status: 1 });
publicCourseSchema.index({ category: 1 });
publicCourseSchema.index({ level: 1 });
publicCourseSchema.index({ displayOrder: 1 });
publicCourseSchema.index({ status: 1, displayOrder: 1 });
publicCourseSchema.index({ status: 1, featured: 1, displayOrder: 1 });

// Virtual for checking if course is active
publicCourseSchema.virtual("isActive").get(function () {
  return this.status === "active";
});

// Virtual for formatted fee
publicCourseSchema.virtual("formattedFee").get(function () {
  if (this.fee.formatted) {
    return this.fee.formatted;
  }
  if (this.fee.amount && this.fee.currency) {
    return `${this.fee.currency} ${this.fee.amount.toLocaleString()}`;
  }
  return "Contact for pricing";
});

// Static method to get active courses ordered by display order
publicCourseSchema.statics.getActive = function () {
  return this.find({ status: "active" }).sort({
    displayOrder: 1,
    createdAt: -1,
  });
};

// Static method to get featured courses
publicCourseSchema.statics.getFeatured = function () {
  return this.find({ status: "active", featured: true }).sort({
    displayOrder: 1,
  });
};

// Static method to get courses by category
publicCourseSchema.statics.getByCategory = function (category) {
  return this.find({ status: "active", category }).sort({ displayOrder: 1 });
};

module.exports = mongoose.model("PublicCourse", publicCourseSchema);
