const mongoose = require("mongoose");

const CourseContentSchema = new mongoose.Schema(
  {
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true, // Required again since content is now tied to specific e-courses
    },
    moduleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LearningModule",
      required: false, // Made optional since content can exist without being assigned to a module
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
    type: {
      type: String,
      enum: [
        "video",
        "document",
        "image",
        "audio",
        "text",
        "link",
        "quiz",
        "assignment",
        "live_session",
        "interactive",
      ],
      required: true,
    },
    content: {
      // For videos - Cloudflare Stream
      streamUid: String, // Cloudflare Stream UID
      playbackUrl: String, // Stream playback URL
      thumbnailUrl: String, // Auto-generated thumbnail
      duration: Number, // Video duration in seconds
      videoType: {
        type: String,
        enum: ["youtube", "uploaded"],
        required: false, // Only required for video content type
      }, // To distinguish between YouTube and uploaded videos

      // For images
      imageUrl: String, // Image URL

      // For audio
      audioUrl: String, // Audio file URL

      // For files - Cloudflare R2
      r2Key: String, // R2 object key
      fileUrl: String, // Public or signed URL
      fileName: String, // Original filename
      fileSize: Number, // File size in bytes
      mimeType: String, // File MIME type

      // Common content
      htmlContent: String, // Rich text content
      externalLink: String, // External resource link
    },
    // Additional materials and resources
    materials: [
      {
        id: String,
        name: String,
        type: {
          type: String,
          enum: ["file", "link"],
          required: true,
        },
        description: String,
        url: String, // For links
        fileUrl: String, // For uploaded files
        fileName: String, // Original file name
        fileSize: Number, // File size in bytes
        mimeType: String, // File MIME type
        createdAt: { type: Date, default: Date.now },
      },
    ],
    // Tags for content categorization
    tags: [String],
    // Content visibility settings
    visibility: {
      type: String,
      enum: ["public", "private", "restricted"],
      default: "public",
    },
    // Estimated duration in minutes
    estimatedDuration: {
      type: Number,
      default: 0,
    },
    order: {
      type: Number,
      required: true,
      default: 1,
    },
    prerequisites: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "CourseContent",
      },
    ],
    isPublished: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
    },
    metadata: {
      fileSize: Number,
      mimeType: String,
      uploadDate: Date,
      lastModified: Date,
    },
    // Resource sharing configuration
    sharing: {
      isShared: { type: Boolean, default: false },
      shareLevel: {
        type: String,
        enum: ["branch_only", "system_wide", "custom_branches"],
        default: "branch_only",
      },
      sharedWithBranches: [
        { type: mongoose.Schema.Types.ObjectId, ref: "Branch" },
      ],
      originalBranch: { type: mongoose.Schema.Types.ObjectId, ref: "Branch" },
      sourceType: {
        type: String,
        enum: ["original", "shared_library", "copied"],
        default: "original",
      },
      sourceId: { type: mongoose.Schema.Types.ObjectId, ref: "CourseContent" },
    },
    // Analytics
    analytics: {
      viewCount: { type: Number, default: 0 },
      completionCount: { type: Number, default: 0 },
      averageTimeSpent: { type: Number, default: 0 },
      lastViewed: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
CourseContentSchema.index({ courseId: 1, moduleId: 1, order: 1 });
CourseContentSchema.index({ branchId: 1, type: 1 });
CourseContentSchema.index({ "sharing.isShared": 1, "sharing.shareLevel": 1 });
CourseContentSchema.index({ createdBy: 1 });

// Virtual for estimated reading time
CourseContentSchema.virtual("estimatedTime").get(function () {
  if (this.type === "video" && this.content.duration) {
    return this.content.duration; // seconds
  }
  if (this.type === "document" && this.content.htmlContent) {
    // Estimate 200 words per minute reading speed
    const wordCount = this.content.htmlContent.split(" ").length;
    return Math.ceil((wordCount / 200) * 60); // seconds
  }
  return 0;
});

// Methods
CourseContentSchema.methods.markAsViewed = function (userId) {
  this.analytics.viewCount += 1;
  this.analytics.lastViewed = new Date();
  return this.save();
};

CourseContentSchema.methods.canAccess = function (user) {
  // Check if user has access to this content
  if (this.branchId.toString() === user.branchId.toString()) {
    return true;
  }

  // Check if content is shared with user's branch
  if (this.sharing.isShared) {
    if (this.sharing.shareLevel === "system_wide") {
      return true;
    }
    if (
      this.sharing.shareLevel === "custom_branches" &&
      this.sharing.sharedWithBranches.includes(user.branchId)
    ) {
      return true;
    }
  }

  return false;
};

module.exports = mongoose.model("CourseContent", CourseContentSchema);
