const { Discussion, DiscussionReply } = require("../../models/elearning");
const User = require("../../models/User");
const Student = require("../../models/Student");
const Teacher = require("../../models/Teacher");
const Branch = require("../../models/Branch");
const Course = require("../../models/Course");
const { ECourse, Enrollment } = require("../../models/elearning");
const { validationResult } = require("express-validator");

class DiscussionController {
  constructor() {
    // All helper methods are now static, no binding needed
  }

  // Get all discussions for a course
  async getCourseDiscussions(req, res) {
    try {
      const { courseId } = req.params;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const skip = (page - 1) * limit;

      // Check if user has access to this course
      const hasAccess = await DiscussionController.checkCourseAccess(
        req.user,
        courseId
      );
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "Access denied to this course",
        });
      }

      const filter = { courseId, status: { $ne: "deleted" } };

      // Add additional filters
      if (req.query.type) filter.type = req.query.type;
      if (req.query.category) filter.category = req.query.category;
      if (req.query.status) filter.status = req.query.status;
      if (req.query.isPinned === "true") filter.isPinned = true;

      // Search functionality
      if (req.query.search) {
        filter.$text = { $search: req.query.search };
      }

      let sortOption = { isPinned: -1, createdAt: -1 };
      if (req.query.sortBy === "popular") {
        sortOption = { "votes.totalVotes": -1, views: -1 };
      } else if (req.query.sortBy === "recent") {
        sortOption = { lastReplyAt: -1, createdAt: -1 };
      }

      const discussions = await Discussion.find(filter)
        .populate({
          path: "authorId",
          select: "firstName lastName name",
        })
        .populate("lastReplyBy.userId", "firstName lastName name")
        .sort(sortOption)
        .skip(skip)
        .limit(limit);

      const total = await Discussion.countDocuments(filter);

      res.json({
        success: true,
        data: {
          discussions,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
          },
        },
      });
    } catch (error) {
      console.error("Error fetching course discussions:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching discussions",
      });
    }
  }

  // Get a single discussion with replies
  async getDiscussion(req, res) {
    try {
      const { discussionId } = req.params;

      const discussion = await Discussion.findById(discussionId)
        .populate({
          path: "authorId",
          select: "firstName lastName name",
        })
        .populate("lastReplyBy.userId", "firstName lastName name");

      if (!discussion) {
        return res.status(404).json({
          success: false,
          message: "Discussion not found",
        });
      }

      // Check access
      const hasAccess = await DiscussionController.checkCourseAccess(
        req.user,
        discussion.courseId
      );
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "Access denied to this discussion",
        });
      }

      // Add view if not already viewed
      await discussion.addView(
        req.user._id,
        req.user.roles?.includes("teacher") ? "teacher" : "student"
      );

      // Get replies
      const replies = await DiscussionReply.findByDiscussion(discussionId, {
        includeUnapproved: req.user.roles?.includes("teacher"),
      })
        .populate({
          path: "authorId",
          select: "firstName lastName name",
        })
        .sort({ createdAt: 1 });

      // Organize replies into threaded structure
      const replyMap = new Map();
      const topLevelReplies = [];

      // First pass: create reply objects
      replies.forEach((reply) => {
        const replyObj = {
          _id: reply._id,
          discussionId: reply.discussionId,
          parentReplyId: reply.parentReplyId,
          authorId: reply.authorId?._id || reply.authorId || null,
          authorName:
            reply.authorId?.firstName && reply.authorId?.lastName
              ? `${reply.authorId.firstName} ${reply.authorId.lastName}`
              : reply.authorId?.name || "Unknown Author",
          authorType: reply.authorType,
          content: reply.content,
          formattedContent: reply.formattedContent,
          attachments: reply.attachments || [],
          likes: reply.likes || 0,
          dislikes: reply.dislikes || 0,
          likedBy: reply.likedBy || [],
          dislikedBy: reply.dislikedBy || [],
          isEdited: reply.isEdited || false,
          editedAt: reply.editedAt,
          isDeleted: reply.isDeleted || false,
          deletedAt: reply.deletedAt,
          deletedBy: reply.deletedBy,
          isFlagged: reply.isFlagged || false,
          flaggedReason: reply.flaggedReason,
          isApproved: reply.isApproved !== false,
          approvedBy: reply.approvedBy,
          replies: [],
          mentions: reply.mentions || [],
          createdAt: reply.createdAt,
          updatedAt: reply.updatedAt,
        };
        replyMap.set(reply._id.toString(), replyObj);
      });

      // Second pass: organize into threads
      replies.forEach((reply) => {
        const replyObj = replyMap.get(reply._id.toString());
        if (reply.parentReplyId) {
          const parent = replyMap.get(reply.parentReplyId.toString());
          if (parent) {
            parent.replies.push(replyObj);
          }
        } else {
          topLevelReplies.push(replyObj);
        }
      });

      // Create posts array with discussion as first post
      const posts = [
        {
          _id: discussion._id,
          discussionId: discussion._id,
          parentReplyId: null,
          authorId: discussion.authorId?._id || discussion.authorId || null,
          authorName:
            discussion.authorId?.firstName && discussion.authorId?.lastName
              ? `${discussion.authorId.firstName} ${discussion.authorId.lastName}`
              : discussion.authorId?.name || "Unknown Author",
          authorType: discussion.authorType,
          content: discussion.content,
          formattedContent: discussion.formattedContent,
          attachments: discussion.attachments || [],
          likes: discussion.votes?.upVotes || 0,
          dislikes: discussion.votes?.downVotes || 0,
          likedBy:
            discussion.votes?.voters
              ?.filter((v) => v.voteType === "up")
              .map((v) => v.userId) || [],
          dislikedBy:
            discussion.votes?.voters
              ?.filter((v) => v.voteType === "down")
              .map((v) => v.userId) || [],
          isEdited: false,
          editedAt: null,
          isDeleted: discussion.status === "deleted",
          deletedAt: null,
          deletedBy: null,
          isFlagged: discussion.moderation?.isReported || false,
          flaggedReason: null,
          isApproved: true,
          approvedBy: null,
          isPinned: discussion.isPinned || false,
          replies: topLevelReplies,
          mentions: [],
          createdAt: discussion.createdAt,
          updatedAt: discussion.updatedAt,
        },
      ];

      res.json({
        success: true,
        data: {
          discussion,
          posts,
          totalReplies: replies.length,
        },
      });
    } catch (error) {
      console.error("Error fetching discussion:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching discussion",
      });
    }
  }

  // Create a new discussion
  async createDiscussion(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation errors",
          errors: errors.array(),
        });
      }

      const { courseId } = req.params;
      const {
        title,
        description,
        content,
        type = "general",
        category = "course_content",
        tags = [],
        visibility = "class_only",
      } = req.body;

      // Check if user has access to create discussions in this course
      const hasAccess = await DiscussionController.checkCourseAccess(
        req.user,
        courseId
      );
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "Access denied to this course",
        });
      }

      // Get branch ID
      const branchId = await DiscussionController.getCourseBranchId(courseId);

      const discussion = new Discussion({
        title,
        description,
        courseId,
        branchId,
        authorId: req.user._id,
        authorType: req.user.roles?.includes("teacher") ? "Teacher" : "Student",
        content,
        type,
        category,
        tags,
        visibility,
      });

      await discussion.save();

      // Populate author info
      await discussion.populate({
        path: "authorId",
        select: "firstName lastName name",
      });

      res.status(201).json({
        success: true,
        data: discussion,
        message: "Discussion created successfully",
      });
    } catch (error) {
      console.error("Error creating discussion:", error);
      res.status(500).json({
        success: false,
        message: "Error creating discussion",
      });
    }
  }

  // Update a discussion
  async updateDiscussion(req, res) {
    try {
      const { discussionId } = req.params;
      const updates = req.body;

      const discussion = await Discussion.findById(discussionId);
      if (!discussion) {
        return res.status(404).json({
          success: false,
          message: "Discussion not found",
        });
      }

      // Check if user can edit this discussion
      const canEdit = await DiscussionController.canModifyDiscussion(
        req.user,
        discussion
      );
      if (!canEdit) {
        return res.status(403).json({
          success: false,
          message: "You don't have permission to edit this discussion",
        });
      }

      // Update allowed fields
      const allowedFields = [
        "title",
        "description",
        "content",
        "type",
        "category",
        "tags",
        "visibility",
      ];

      allowedFields.forEach((field) => {
        if (updates[field] !== undefined) {
          discussion[field] = updates[field];
        }
      });

      await discussion.save();
      await discussion.populate({
        path: "authorId",
        select: "firstName lastName name",
      });

      res.json({
        success: true,
        data: discussion,
        message: "Discussion updated successfully",
      });
    } catch (error) {
      console.error("Error updating discussion:", error);
      res.status(500).json({
        success: false,
        message: "Error updating discussion",
      });
    }
  }

  // Delete a discussion
  async deleteDiscussion(req, res) {
    try {
      const { discussionId } = req.params;

      const discussion = await Discussion.findById(discussionId);
      if (!discussion) {
        return res.status(404).json({
          success: false,
          message: "Discussion not found",
        });
      }

      // Check if user can delete this discussion
      const canDelete = await DiscussionController.canModifyDiscussion(
        req.user,
        discussion
      );
      if (!canDelete) {
        return res.status(403).json({
          success: false,
          message: "You don't have permission to delete this discussion",
        });
      }

      // Soft delete
      discussion.status = "deleted";
      await discussion.save();

      // Also soft delete all replies
      await DiscussionReply.updateMany(
        { discussionId },
        { isDeleted: true, deletedAt: new Date(), deletedBy: req.user._id }
      );

      res.json({
        success: true,
        message: "Discussion deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting discussion:", error);
      res.status(500).json({
        success: false,
        message: "Error deleting discussion",
      });
    }
  }

  // Vote on a discussion
  async voteDiscussion(req, res) {
    try {
      const { discussionId } = req.params;
      const { voteType } = req.body; // "up" or "down"

      if (!["up", "down"].includes(voteType)) {
        return res.status(400).json({
          success: false,
          message: "Invalid vote type",
        });
      }

      const discussion = await Discussion.findById(discussionId);
      if (!discussion) {
        return res.status(404).json({
          success: false,
          message: "Discussion not found",
        });
      }

      // Check access
      const hasAccess = await DiscussionController.checkCourseAccess(
        req.user,
        discussion.courseId
      );
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "Access denied to this discussion",
        });
      }

      await discussion.vote(
        req.user._id,
        req.user.roles?.includes("teacher") ? "teacher" : "student",
        voteType
      );

      res.json({
        success: true,
        data: {
          votes: discussion.votes,
        },
        message: "Vote recorded successfully",
      });
    } catch (error) {
      console.error("Error voting on discussion:", error);
      res.status(500).json({
        success: false,
        message: "Error recording vote",
      });
    }
  }

  // Pin/unpin discussion (teacher only)
  async togglePinDiscussion(req, res) {
    try {
      const { discussionId } = req.params;

      const discussion = await Discussion.findById(discussionId);
      if (!discussion) {
        return res.status(404).json({
          success: false,
          message: "Discussion not found",
        });
      }

      // Only teachers can pin/unpin
      if (!req.user.roles?.includes("teacher")) {
        return res.status(403).json({
          success: false,
          message: "Only teachers can pin discussions",
        });
      }

      // Check if teacher has access to this course
      const hasAccess = await DiscussionController.checkCourseAccess(
        req.user,
        discussion.courseId
      );
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "Access denied to this course",
        });
      }

      discussion.isPinned = !discussion.isPinned;
      await discussion.save();

      res.json({
        success: true,
        data: { isPinned: discussion.isPinned },
        message: `Discussion ${
          discussion.isPinned ? "pinned" : "unpinned"
        } successfully`,
      });
    } catch (error) {
      console.error("Error toggling pin:", error);
      res.status(500).json({
        success: false,
        message: "Error updating discussion pin status",
      });
    }
  }

  // Moderate discussion (teacher only)
  async moderateDiscussion(req, res) {
    try {
      const { discussionId } = req.params;
      const { action, notes } = req.body;

      if (!["approve", "reject", "delete"].includes(action)) {
        return res.status(400).json({
          success: false,
          message: "Invalid moderation action",
        });
      }

      const discussion = await Discussion.findById(discussionId);
      if (!discussion) {
        return res.status(404).json({
          success: false,
          message: "Discussion not found",
        });
      }

      // Only teachers can moderate
      if (!req.user.roles?.includes("teacher")) {
        return res.status(403).json({
          success: false,
          message: "Only teachers can moderate discussions",
        });
      }

      // Check if teacher has access to this course
      const hasAccess = await DiscussionController.checkCourseAccess(
        req.user,
        discussion.courseId
      );
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "Access denied to this course",
        });
      }

      await discussion.moderate(req.user._id, action, notes);

      res.json({
        success: true,
        message: `Discussion ${action}d successfully`,
      });
    } catch (error) {
      console.error("Error moderating discussion:", error);
      res.status(500).json({
        success: false,
        message: "Error moderating discussion",
      });
    }
  }

  // Create a reply
  async createReply(req, res) {
    try {
      const { discussionId } = req.params;
      const { content, parentReplyId } = req.body;

      const discussion = await Discussion.findById(discussionId);
      if (!discussion) {
        return res.status(404).json({
          success: false,
          message: "Discussion not found",
        });
      }

      // Check access
      const hasAccess = await DiscussionController.checkCourseAccess(
        req.user,
        discussion.courseId
      );
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "Access denied to this discussion",
        });
      }

      // Check if discussion allows replies
      if (!discussion.settings.allowReplies) {
        return res.status(400).json({
          success: false,
          message: "Replies are not allowed for this discussion",
        });
      }

      const reply = new DiscussionReply({
        discussionId,
        parentReplyId,
        courseId: discussion.courseId,
        branchId: discussion.branchId,
        authorId: req.user._id,
        authorType: req.user.roles?.includes("teacher") ? "Teacher" : "Student",
        authorName: req.user.firstName + " " + req.user.lastName,
        content,
      });

      await reply.save();

      // Update discussion reply count
      await discussion.addReply({
        authorId: req.user._id,
        authorType: req.user.roles?.includes("teacher") ? "Teacher" : "Student",
        authorName: req.user.firstName + " " + req.user.lastName,
      });

      // If this is a reply to another reply, update parent reply count
      if (parentReplyId) {
        const parentReply = await DiscussionReply.findById(parentReplyId);
        if (parentReply) {
          await parentReply.addReply({
            authorId: req.user._id,
            authorType: req.user.roles?.includes("teacher")
              ? "Teacher"
              : "Student",
            authorName: req.user.firstName + " " + req.user.lastName,
          });
        }
      }

      await reply.populate({
        path: "authorId",
        select: "firstName lastName name",
      });

      // Emit Socket.IO event for real-time updates
      const io = req.app.get("io");
      if (io) {
        io.to(`discussion-${discussionId}`).emit("new-post", {
          discussionId,
          post: reply,
        });
      }

      res.status(201).json({
        success: true,
        data: reply,
        message: "Reply created successfully",
      });
    } catch (error) {
      console.error("Error creating reply:", error);
      res.status(500).json({
        success: false,
        message: "Error creating reply",
      });
    }
  }

  // Update a reply
  async updateReply(req, res) {
    try {
      const { replyId } = req.params;
      const { content } = req.body;

      const reply = await DiscussionReply.findById(replyId);
      if (!reply) {
        return res.status(404).json({
          success: false,
          message: "Reply not found",
        });
      }

      // Check if user can edit this reply
      if (
        !reply.authorId ||
        reply.authorId.toString() !== req.user._id.toString()
      ) {
        return res.status(403).json({
          success: false,
          message: "You can only edit your own replies",
        });
      }

      await reply.edit(content);

      res.json({
        success: true,
        data: reply,
        message: "Reply updated successfully",
      });
    } catch (error) {
      console.error("Error updating reply:", error);
      res.status(500).json({
        success: false,
        message: "Error updating reply",
      });
    }
  }

  // Delete a reply
  async deleteReply(req, res) {
    try {
      const { replyId } = req.params;

      const reply = await DiscussionReply.findById(replyId);
      if (!reply) {
        return res.status(404).json({
          success: false,
          message: "Reply not found",
        });
      }

      // Check if user can delete this reply
      const canDelete =
        (reply.authorId &&
          reply.authorId.toString() === req.user._id.toString()) ||
        req.user.roles?.includes("teacher");

      if (!canDelete) {
        return res.status(403).json({
          success: false,
          message: "You don't have permission to delete this reply",
        });
      }

      await reply.softDelete(req.user._id);

      res.json({
        success: true,
        message: "Reply deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting reply:", error);
      res.status(500).json({
        success: false,
        message: "Error deleting reply",
      });
    }
  }

  // Vote on a reply
  async voteReply(req, res) {
    try {
      const { replyId } = req.params;
      const { voteType } = req.body; // "like" or "dislike"

      const reply = await DiscussionReply.findById(replyId);
      if (!reply) {
        return res.status(404).json({
          success: false,
          message: "Reply not found",
        });
      }

      if (voteType === "like") {
        // Check if user already liked this reply
        if (reply.likedBy.includes(req.user._id)) {
          // User already liked, remove the like (toggle off)
          await reply.removeLike(req.user._id);
        } else {
          // User hasn't liked, add the like
          await reply.addLike(req.user._id);
        }
      } else if (voteType === "dislike") {
        // Check if user already disliked this reply
        if (reply.dislikedBy.includes(req.user._id)) {
          // User already disliked, remove the dislike (toggle off)
          await reply.removeDislike(req.user._id);
        } else {
          // User hasn't disliked, add the dislike
          await reply.addDislike(req.user._id);
        }
      } else {
        return res.status(400).json({
          success: false,
          message: "Invalid vote type",
        });
      }

      res.json({
        success: true,
        data: {
          likes: reply.likes,
          dislikes: reply.dislikes,
        },
        message: "Vote recorded successfully",
      });
    } catch (error) {
      console.error("Error voting on reply:", error);
      res.status(500).json({
        success: false,
        message: "Error recording vote",
      });
    }
  }

  // Moderate reply (teacher only)
  async moderateReply(req, res) {
    try {
      const { replyId } = req.params;
      const { action } = req.body;

      const reply = await DiscussionReply.findById(replyId);
      if (!reply) {
        return res.status(404).json({
          success: false,
          message: "Reply not found",
        });
      }

      // Only teachers can moderate
      if (!req.user.roles?.includes("teacher")) {
        return res.status(403).json({
          success: false,
          message: "Only teachers can moderate replies",
        });
      }

      if (action === "approve") {
        await reply.approve(req.user._id);
      } else if (action === "reject") {
        await reply.reject(req.user._id);
      } else {
        return res.status(400).json({
          success: false,
          message: "Invalid moderation action",
        });
      }

      res.json({
        success: true,
        message: `Reply ${action}d successfully`,
      });
    } catch (error) {
      console.error("Error moderating reply:", error);
      res.status(500).json({
        success: false,
        message: "Error moderating reply",
      });
    }
  }

  // Helper methods
  static async checkCourseAccess(user, courseId) {
    try {
      // For teachers: check if they are the instructor of the course
      if (user.roles && user.roles.includes("teacher")) {
        const course = await ECourse.findOne({
          _id: courseId,
          instructor: user._id,
        });
        return !!course;
      }

      // For students: check if they are enrolled in the course OR if the course exists (more permissive)
      if (user.roles && user.roles.includes("student")) {
        // First check enrollment in ECourse
        const enrollment = await Enrollment.findOne({
          courseId,
          studentId: user._id,
          status: "active",
        });

        if (enrollment) {
          return true;
        }

        // If no enrollment, check if course exists in either collection (more permissive access)
        const eCourse = await ECourse.findById(courseId);
        const course = await Course.findById(courseId);

        if (eCourse || course) {
          return true;
        }

        return false;
      }

      // For branch admins: check if course belongs to their branch
      if (user.roles && user.roles.includes("branchadmin")) {
        const course = await ECourse.findOne({
          _id: courseId,
          branchId: user.branchId,
        });
        return !!course;
      }

      return false;
    } catch (error) {
      console.error("Error checking course access:", error);
      return false;
    }
  }

  static async canModifyDiscussion(user, discussion) {
    // Author can always modify their own discussion
    if (
      discussion.authorId &&
      discussion.authorId.toString() === user._id.toString()
    ) {
      return true;
    }

    // Teachers can modify any discussion in their courses
    if (user.roles?.includes("teacher")) {
      const course = await ECourse.findOne({
        _id: discussion.courseId,
        instructor: user._id,
      });
      return !!course;
    }

    return false;
  }

  static async getCourseBranchId(courseId) {
    const course = await ECourse.findById(courseId);
    return course ? course.branchId : null;
  }
}

module.exports = new DiscussionController();
