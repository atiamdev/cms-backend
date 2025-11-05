const Notice = require("../models/Notice");
const mongoose = require("mongoose");

// Get notices for the current user based on their role
const getStudentNotices = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const branchId = req.user.branchId;
    const userRole = req.user.roles[0]; // Get primary role

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Define which target audiences this user can see
    let allowedAudiences = ["all"];
    const isAdmin = [
      "secretary",
      "branchadmin",
      "admin",
      "superadmin",
    ].includes(userRole);

    switch (userRole) {
      case "student":
        allowedAudiences = ["all", "students"];
        break;
      case "teacher":
        allowedAudiences = ["all", "teachers"];
        break;
      case "secretary":
      case "branchadmin":
      case "admin":
      case "superadmin":
        // Staff and admins can see general notices and staff-specific notices
        allowedAudiences = ["all", "staff"];
        break;
      case "parent":
        allowedAudiences = ["all", "parents"];
        break;
      default:
        allowedAudiences = ["all"];
    }

    // Find notices for the user's branch and role
    let query;

    // All users can see:
    // 1. General notices based on their role's allowed audiences (where specificRecipients is empty/null)
    // 2. Personal notices specifically addressed to them (regardless of targetAudience)
    query = {
      $and: [
        { branchId: branchId },
        { isActive: true },
        { publishDate: { $lte: new Date() } },
        {
          $or: [
            // General notices for this user's audience (must have no specific recipients)
            {
              targetAudience: { $in: allowedAudiences },
              specificRecipients: { $exists: false },
            },
            {
              targetAudience: { $in: allowedAudiences },
              specificRecipients: { $size: 0 },
            },
            {
              targetAudience: { $in: allowedAudiences },
              specificRecipients: null,
            },
            // Notices specifically addressed to this user (regardless of targetAudience)
            { specificRecipients: { $in: [userId] } },
          ],
        },
        {
          $or: [
            { expiryDate: { $exists: false } },
            { expiryDate: null },
            { expiryDate: { $gt: new Date() } },
          ],
        },
      ],
    };

    // Get total count for pagination
    const totalNotices = await Notice.countDocuments(query);

    const notices = await Notice.find(query)
      .populate("author.userId", "firstName lastName")
      .sort({ publishDate: -1 }) // Sort by publish date, newest first
      .skip(skip)
      .limit(limit);

    // Add read status for each notice
    const noticesWithReadStatus = notices.map((notice) => {
      const noticeObj = notice.toObject();
      noticeObj.isRead = notice.isReadByUser(userId);
      return noticeObj;
    });

    res.json({
      success: true,
      data: noticesWithReadStatus,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalNotices / limit),
        totalNotices,
        hasNextPage: page * limit < totalNotices,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Get notices error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching notices",
      error: error.message,
    });
  }
};

// Mark notice as read
const markNoticeAsRead = async (req, res) => {
  try {
    const { noticeId } = req.params;
    const userId = req.user.id;

    const notice = await Notice.findById(noticeId);
    if (!notice) {
      return res.status(404).json({
        success: false,
        message: "Notice not found",
      });
    }

    // Check if user is in the same branch
    if (notice.branchId.toString() !== req.user.branchId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    notice.markAsReadByUser(userId);
    await notice.save();

    res.json({
      success: true,
      message: "Notice marked as read",
    });
  } catch (error) {
    console.error("Mark notice as read error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while marking notice as read",
      error: error.message,
    });
  }
};

// Mark all notices as read for current user
const markAllNoticesAsRead = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const branchId = req.user.branchId;
    const userRole = req.user.roles[0];

    // Define which target audiences this user can see
    let allowedAudiences = ["all"];

    switch (userRole) {
      case "student":
        allowedAudiences = ["all", "students"];
        break;
      case "teacher":
        allowedAudiences = ["all", "teachers"];
        break;
      case "secretary":
      case "branchadmin":
      case "admin":
      case "superadmin":
        // Staff and admins can see general notices and staff-specific notices
        allowedAudiences = ["all", "staff"];
        break;
      case "parent":
        allowedAudiences = ["all", "parents"];
        break;
      default:
        allowedAudiences = ["all"];
    }

    // Find all unread notices for this user
    // All users can see:
    // 1. General notices based on their role's allowed audiences (where specificRecipients is empty/null)
    // 2. Personal notices specifically addressed to them (regardless of targetAudience)
    const query = {
      branchId,
      isActive: true,
      publishDate: { $lte: new Date() },
      $or: [
        { expiryDate: { $exists: false } },
        { expiryDate: null },
        { expiryDate: { $gt: new Date() } },
      ],
      $or: [
        // General notices for this user's audience (must have no specific recipients)
        {
          targetAudience: { $in: allowedAudiences },
          specificRecipients: { $exists: false },
        },
        {
          targetAudience: { $in: allowedAudiences },
          specificRecipients: { $size: 0 },
        },
        {
          targetAudience: { $in: allowedAudiences },
          specificRecipients: null,
        },
        // Notices specifically addressed to this user (regardless of targetAudience)
        { specificRecipients: { $in: [userId] } },
      ],
      readBy: { $not: { $elemMatch: { userId } } },
    };

    const unreadNotices = await Notice.find(query);

    // Mark each notice as read
    for (const notice of unreadNotices) {
      notice.markAsReadByUser(userId);
      await notice.save();
    }

    res.status(200).json({
      success: true,
      message: `${unreadNotices.length} notices marked as read`,
      data: { markedCount: unreadNotices.length },
    });
  } catch (error) {
    console.error("Mark all notices as read error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while marking notices as read",
      error: error.message,
    });
  }
};

// Get all notices (for admin use)
const getAllNotices = async (req, res) => {
  try {
    const branchId = req.user.branchId;
    const userId = req.user.id;
    const { page = 1, limit = 20, type, priority, targetAudience } = req.query;

    const filter = { branchId };

    if (type) filter.type = type;
    if (priority) filter.priority = priority;
    if (targetAudience) filter.targetAudience = targetAudience;

    const notices = await Notice.find(filter)
      .populate("author.userId", "firstName lastName")
      .sort({ publishDate: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Notice.countDocuments(filter);

    // Add read status for each notice
    const noticesWithReadStatus = notices.map((notice) => {
      const noticeObj = notice.toObject();
      noticeObj.isRead = notice.isReadByUser(userId);
      return noticeObj;
    });

    res.json({
      success: true,
      data: noticesWithReadStatus,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get all notices error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching notices",
      error: error.message,
    });
  }
};

// Create new notice
const createNotice = async (req, res) => {
  try {
    console.log("=== Notice Creation Request ===");
    console.log(
      "User:",
      req.user?.firstName,
      req.user?.lastName,
      "Role:",
      req.user?.roles
    );
    console.log("Request body:", req.body);
    console.log("Branch ID:", req.user?.branchId);

    const {
      title,
      content,
      type,
      priority,
      targetAudience,
      publishDate,
      expiryDate,
    } = req.body;

    // Role-based audience restrictions
    const userRole = req.user.roles[0]; // Get primary role
    let allowedAudiences = [];

    switch (userRole) {
      case "superadmin":
      case "admin":
      case "branchadmin":
        // Admins can target any audience
        allowedAudiences = ["all", "students", "teachers", "staff", "parents"];
        break;
      case "secretary":
        // Secretaries can target students, staff, and parents in their branch
        allowedAudiences = ["students", "staff", "parents", "all"];
        break;
      case "teacher":
        // Teachers can only target their students and parents
        allowedAudiences = ["students", "parents"];
        break;
      default:
        console.log("Invalid user role:", userRole);
        return res.status(403).json({
          success: false,
          message: "Insufficient permissions to create notices",
        });
    }

    console.log("User role:", userRole, "Allowed audiences:", allowedAudiences);

    // Validate target audience
    if (targetAudience && !allowedAudiences.includes(targetAudience)) {
      console.log("Invalid target audience:", targetAudience);
      return res.status(400).json({
        success: false,
        message: `You don't have permission to target '${targetAudience}'. Allowed audiences: ${allowedAudiences.join(
          ", "
        )}`,
      });
    }

    // Role-based type restrictions
    let allowedTypes = [];
    switch (userRole) {
      case "superadmin":
      case "admin":
      case "branchadmin":
        allowedTypes = ["urgent", "important", "academic", "info", "general"];
        break;
      case "secretary":
        allowedTypes = ["urgent", "important", "academic", "info", "general"];
        break;
      case "teacher":
        allowedTypes = ["academic", "info", "general"];
        break;
    }

    console.log("Allowed types:", allowedTypes);

    if (type && !allowedTypes.includes(type)) {
      console.log("Invalid notice type:", type);
      return res.status(400).json({
        success: false,
        message: `You don't have permission to create '${type}' notices. Allowed types: ${allowedTypes.join(
          ", "
        )}`,
      });
    }

    const noticeData = {
      branchId: req.user.branchId,
      title,
      content,
      type: type || "general",
      priority: priority || "medium",
      targetAudience:
        targetAudience || (userRole === "teacher" ? "students" : "all"),
      publishDate: publishDate || new Date(),
      expiryDate,
      author: {
        userId: req.user.id,
        name: `${req.user.firstName} ${req.user.lastName}`,
        department: req.user.department || "Administration",
      },
    };

    console.log("Creating notice with data:", noticeData);

    const notice = new Notice(noticeData);
    const savedNotice = await notice.save();

    console.log("Notice saved successfully:", savedNotice._id);

    res.status(201).json({
      success: true,
      data: savedNotice,
      message: "Notice created successfully",
    });
  } catch (error) {
    console.error("Create notice error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while creating notice",
      error: error.message,
    });
  }
};

// Update notice
const updateNotice = async (req, res) => {
  try {
    const { noticeId } = req.params;
    const updates = req.body;

    // First, find the notice to check ownership
    const existingNotice = await Notice.findOne({
      _id: noticeId,
      branchId: req.user.branchId,
    });

    if (!existingNotice) {
      return res.status(404).json({
        success: false,
        message: "Notice not found",
      });
    }

    // Check if user can edit this notice
    const isAdmin = req.user.hasAnyRole(["branchadmin", "admin", "superadmin"]);
    const isOwner = existingNotice.author.userId.toString() === req.user.id;

    if (!isAdmin && !isOwner) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only edit your own announcements",
      });
    }

    const notice = await Notice.findOneAndUpdate(
      { _id: noticeId, branchId: req.user.branchId },
      updates,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      data: notice,
      message: "Notice updated successfully",
    });
  } catch (error) {
    console.error("Update notice error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating notice",
      error: error.message,
    });
  }
};

// Delete notice
const deleteNotice = async (req, res) => {
  try {
    const { noticeId } = req.params;

    // First, find the notice to check ownership
    const existingNotice = await Notice.findOne({
      _id: noticeId,
      branchId: req.user.branchId,
    });

    if (!existingNotice) {
      return res.status(404).json({
        success: false,
        message: "Notice not found",
      });
    }

    // Check if user can delete this notice
    const isAdmin = req.user.hasAnyRole(["branchadmin", "admin", "superadmin"]);
    const isOwner = existingNotice.author.userId.toString() === req.user.id;

    if (!isAdmin && !isOwner) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only delete your own announcements",
      });
    }

    const notice = await Notice.findOneAndDelete({
      _id: noticeId,
      branchId: req.user.branchId,
    });

    res.json({
      success: true,
      message: "Notice deleted successfully",
    });
  } catch (error) {
    console.error("Delete notice error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while deleting notice",
      error: error.message,
    });
  }
};

module.exports = {
  getStudentNotices,
  markNoticeAsRead,
  markAllNoticesAsRead,
  getAllNotices,
  createNotice,
  updateNotice,
  deleteNotice,
};
