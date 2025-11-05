const mongoose = require("mongoose");

const LearningModuleSchema = new mongoose.Schema(
  {
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ECourse",
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    order: {
      type: Number,
      required: true,
      default: 1,
    },
    estimatedDuration: {
      type: Number, // Total module duration in minutes
      default: 0,
    },
    contents: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "CourseContent",
      },
    ],
    quizId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Quiz",
    },
    prerequisites: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "LearningModule",
      },
    ],
    isPublished: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["draft", "published", "archived", "deleted"],
      default: "draft",
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Learning objectives for this module
    learningObjectives: [
      {
        objective: String,
        achieved: { type: Boolean, default: false },
      },
    ],
    // Module settings
    settings: {
      allowSkip: { type: Boolean, default: false },
      requireCompletion: { type: Boolean, default: true },
      timeLimit: Number, // in minutes, 0 means no limit
      attempts: { type: Number, default: 1 }, // how many times can be attempted
    },
    // Analytics
    analytics: {
      enrollmentCount: { type: Number, default: 0 },
      completionCount: { type: Number, default: 0 },
      averageTimeToComplete: { type: Number, default: 0 },
      dropoffRate: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
LearningModuleSchema.index({ courseId: 1, order: 1 });
LearningModuleSchema.index({ branchId: 1 });
LearningModuleSchema.index({ createdBy: 1 });

// Virtual for completion rate
LearningModuleSchema.virtual("completionRate").get(function () {
  if (this.analytics.enrollmentCount === 0) return 0;
  return (
    (this.analytics.completionCount / this.analytics.enrollmentCount) * 100
  );
});

// Methods
LearningModuleSchema.methods.calculateDuration = async function () {
  const CourseContent = mongoose.model("CourseContent");
  const contents = await CourseContent.find({ _id: { $in: this.contents } });

  let totalDuration = 0;
  contents.forEach((content) => {
    if (content.estimatedDuration) {
      totalDuration += content.estimatedDuration;
    }
  });

  this.estimatedDuration = Math.ceil(totalDuration / 60); // Convert to minutes
  // Don't save here - let the pre-save middleware handle it
};

LearningModuleSchema.methods.addContent = function (contentId) {
  if (!this.contents.includes(contentId)) {
    this.contents.push(contentId);
    return this.save();
  }
  return Promise.resolve(this);
};

LearningModuleSchema.methods.removeContent = function (contentId) {
  this.contents = this.contents.filter(
    (id) => id.toString() !== contentId.toString()
  );
  return this.save();
};

LearningModuleSchema.methods.reorderContent = function (contentOrder) {
  // contentOrder should be an array of content IDs in the desired order
  this.contents = contentOrder;
  return this.save();
};

// Pre-save middleware to update duration
LearningModuleSchema.pre("save", async function (next) {
  if (
    this.isModified("contents") &&
    this.contents &&
    this.contents.length > 0
  ) {
    await this.calculateDuration();
  }
  next();
});

module.exports = mongoose.model("LearningModule", LearningModuleSchema);
