const mongoose = require("mongoose");

const DiscussionReplySchema = new mongoose.Schema(
  {
    discussionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Discussion",
      required: true,
    },
    parentReplyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DiscussionReply",
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
    },

    // Author information
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    authorType: {
      type: String,
      required: true,
      enum: ["Teacher", "Student"],
    },
    authorName: String,

    // Content
    content: {
      type: String,
      required: true,
    },
    formattedContent: String, // HTML formatted content
    attachments: [
      {
        fileName: String,
        fileUrl: String,
        fileType: String,
        fileSize: Number,
        uploadedAt: { type: Date, default: Date.now },
      },
    ],

    // Threading and hierarchy
    depth: { type: Number, default: 0 }, // Nesting level
    replyPath: [mongoose.Schema.Types.ObjectId], // Path to root for efficient queries

    // Engagement
    likes: { type: Number, default: 0 },
    dislikes: { type: Number, default: 0 },
    likedBy: [{ type: mongoose.Schema.Types.ObjectId }],
    dislikedBy: [{ type: mongoose.Schema.Types.ObjectId }],

    // Status
    isEdited: { type: Boolean, default: false },
    editedAt: Date,
    isDeleted: { type: Boolean, default: false },
    deletedAt: Date,
    deletedBy: mongoose.Schema.Types.ObjectId,

    // Moderation
    isFlagged: { type: Boolean, default: false },
    flaggedReason: String,
    flaggedAt: Date,
    flaggedBy: mongoose.Schema.Types.ObjectId,
    isApproved: { type: Boolean, default: true }, // Auto-approved unless moderation required
    approvedBy: mongoose.Schema.Types.ObjectId,
    approvedAt: Date,

    // Mentions and notifications
    mentions: [{ type: mongoose.Schema.Types.ObjectId }], // User IDs mentioned

    // Reply count for threaded replies
    replyCount: { type: Number, default: 0 },
    lastReplyAt: Date,
    lastReplyBy: {
      userId: mongoose.Schema.Types.ObjectId,
      userType: String,
      userName: String,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
DiscussionReplySchema.index({ discussionId: 1 });
DiscussionReplySchema.index({ parentReplyId: 1 });
DiscussionReplySchema.index({ courseId: 1 });
DiscussionReplySchema.index({ branchId: 1 });
DiscussionReplySchema.index({ authorId: 1, authorType: 1 });
DiscussionReplySchema.index({ replyPath: 1 });
DiscussionReplySchema.index({ depth: 1 });
DiscussionReplySchema.index({ createdAt: -1 });
DiscussionReplySchema.index({ likes: -1 });
DiscussionReplySchema.index({ isFlagged: 1 });

// Virtual for popularity
DiscussionReplySchema.virtual("popularity").get(function () {
  return this.likes - this.dislikes;
});

// Instance methods
DiscussionReplySchema.methods.addLike = function (userId) {
  if (!this.likedBy.includes(userId)) {
    this.likedBy.push(userId);
    this.likes += 1;

    // Remove dislike if exists
    this.dislikedBy = this.dislikedBy.filter((id) => !id.equals(userId));
    if (this.dislikes > 0) this.dislikes -= 1;

    return this.save();
  }
  return Promise.resolve(this);
};

DiscussionReplySchema.methods.removeLike = function (userId) {
  const index = this.likedBy.indexOf(userId);
  if (index > -1) {
    this.likedBy.splice(index, 1);
    this.likes = Math.max(0, this.likes - 1);
    return this.save();
  }
  return Promise.resolve(this);
};

DiscussionReplySchema.methods.addDislike = function (userId) {
  if (!this.dislikedBy.includes(userId)) {
    this.dislikedBy.push(userId);
    this.dislikes += 1;

    // Remove like if exists
    this.likedBy = this.likedBy.filter((id) => !id.equals(userId));
    if (this.likes > 0) this.likes -= 1;

    return this.save();
  }
  return Promise.resolve(this);
};

DiscussionReplySchema.methods.removeDislike = function (userId) {
  const index = this.dislikedBy.indexOf(userId);
  if (index > -1) {
    this.dislikedBy.splice(index, 1);
    this.dislikes = Math.max(0, this.dislikes - 1);
    return this.save();
  }
  return Promise.resolve(this);
};

DiscussionReplySchema.methods.flag = function (userId, reason) {
  this.isFlagged = true;
  this.flaggedReason = reason;
  this.flaggedAt = new Date();
  this.flaggedBy = userId;
  return this.save();
};

DiscussionReplySchema.methods.approve = function (moderatorId) {
  this.isApproved = true;
  this.approvedBy = moderatorId;
  this.approvedAt = new Date();
  return this.save();
};

DiscussionReplySchema.methods.reject = function (moderatorId) {
  this.isApproved = false;
  this.approvedBy = moderatorId;
  this.approvedAt = new Date();
  return this.save();
};

DiscussionReplySchema.methods.softDelete = function (userId) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = userId;
  return this.save();
};

DiscussionReplySchema.methods.edit = function (newContent, formattedContent) {
  this.content = newContent;
  this.formattedContent = formattedContent;
  this.isEdited = true;
  this.editedAt = new Date();
  return this.save();
};

DiscussionReplySchema.methods.addReply = function (replyData) {
  this.replyCount += 1;
  this.lastReplyAt = new Date();
  this.lastReplyBy = {
    userId: replyData.authorId,
    userType: replyData.authorType,
    userName: replyData.authorName,
  };
  return this.save();
};

// Static methods
DiscussionReplySchema.statics.findByDiscussion = function (
  discussionId,
  options = {}
) {
  const query = { discussionId, isDeleted: false };

  if (options.includeUnapproved !== true) {
    query.isApproved = true;
  }

  let mongoQuery = this.find(query).sort({ createdAt: 1 });

  if (options.limit) {
    mongoQuery = mongoQuery.limit(options.limit);
  }

  return mongoQuery;
};

DiscussionReplySchema.statics.findThreadedReplies = function (
  discussionId,
  maxDepth = 3
) {
  return this.find({
    discussionId,
    isDeleted: false,
    isApproved: true,
    depth: { $lte: maxDepth },
  })
    .sort({ createdAt: 1 })
    .populate("authorId", "name");
};

DiscussionReplySchema.statics.getReplyCount = function (discussionId) {
  return this.countDocuments({
    discussionId,
    isDeleted: false,
    isApproved: true,
  });
};

DiscussionReplySchema.statics.getFlaggedReplies = function (branchId) {
  return this.find({
    branchId,
    isFlagged: true,
    isDeleted: false,
  })
    .sort({ flaggedAt: -1 })
    .populate("authorId", "name")
    .populate("discussionId", "title");
};

// Pre-save middleware
DiscussionReplySchema.pre("save", function (next) {
  // Set reply path for threading
  if (this.parentReplyId && !this.replyPath) {
    // Find parent reply to build path
    this.constructor
      .findById(this.parentReplyId)
      .then((parentReply) => {
        if (parentReply) {
          this.replyPath = [...parentReply.replyPath, parentReply._id];
          this.depth = parentReply.depth + 1;
        } else {
          this.replyPath = [];
          this.depth = 0;
        }
        next();
      })
      .catch(next);
  } else if (!this.parentReplyId) {
    this.replyPath = [];
    this.depth = 0;
    next();
  } else {
    next();
  }
});

module.exports = mongoose.model("DiscussionReply", DiscussionReplySchema);
