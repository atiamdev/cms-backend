const mongoose = require("mongoose");

const newsSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "News title is required"],
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    content: {
      type: String,
      required: [true, "News content is required"],
      trim: true,
    },
    excerpt: {
      type: String,
      trim: true,
      maxlength: [300, "Excerpt cannot exceed 300 characters"],
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
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft",
    },
    publishDate: {
      type: Date,
      default: Date.now,
    },
    author: {
      name: {
        type: String,
        required: true,
        trim: true,
      },
      role: {
        type: String,
        default: "Administrator",
        trim: true,
      },
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    featured: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for performance
newsSchema.index({ status: 1 });
newsSchema.index({ publishDate: -1 });
newsSchema.index({ featured: 1 });
newsSchema.index({ status: 1, publishDate: -1 });
newsSchema.index({ status: 1, featured: 1, publishDate: -1 });

// Virtual for checking if news is published
newsSchema.virtual("isPublished").get(function () {
  return this.status === "published" && this.publishDate <= new Date();
});

// Static method to get published news
newsSchema.statics.getPublished = function (limit = 10, featured = false) {
  const query = { status: "published", publishDate: { $lte: new Date() } };
  if (featured) {
    query.featured = true;
  }
  return this.find(query).sort({ publishDate: -1 }).limit(limit);
};

module.exports = mongoose.model("News", newsSchema);
