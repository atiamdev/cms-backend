const Notice = require("../models/Notice");
const mongoose = require("mongoose");
const pushController = require("./pushController");
const User = require("../models/User");
const Teacher = require("../models/Teacher");

// Helper function to send push notifications for a notice
const sendPushNotificationsForNotice = async (notice, branchId) => {
  try {
    console.log(
      "[Push] Preparing to send notifications for notice:",
      notice._id
    );

    // Don't send push for fee reminders (they're automated)
    if (notice.type === "fee_reminder") {
      console.log("[Push] Skipping push for fee reminder");
      return;
    }

    // Determine target users based on audience
    let targetUserIds = [];

    if (notice.specificRecipients && notice.specificRecipients.length > 0) {
      // Send to specific recipients
      targetUserIds = notice.specificRecipients;
      console.log(
        "[Push] Targeting specific recipients:",
        targetUserIds.length
      );
    } else {
      // Send to all users matching target audience and branch
      const query = { branchId: branchId };

      switch (notice.targetAudience) {
        case "students":
          query.roles = "student";
          break;
        case "teachers":
          query.roles = "teacher";
          break;
        case "staff":
          query.roles = { $in: ["secretary", "branchadmin", "admin"] };
          break;
        case "parents":
          query.roles = "parent";
          break;
        case "all":
        default:
          // Don't filter by role - send to all users in branch
          break;
      }

      const users = await User.find(query).select("_id");
      targetUserIds = users.map((u) => u._id);
      console.log(
        "[Push] Targeting audience:",
        notice.targetAudience,
        "Users:",
        targetUserIds.length
      );
    }

    if (targetUserIds.length === 0) {
      console.log("[Push] No target users found");
      return;
    }

    // Prepare push notification payload
    // Determine URL based on target audience
    let noticeUrl = "/notices"; // default
    switch (notice.targetAudience) {
      case "students":
        noticeUrl = "/student/notices";
        break;
      case "teachers":
        noticeUrl = "/teacher/announcements";
        break;
      case "staff":
        noticeUrl = "/admin/notices";
        break;
      case "parents":
        noticeUrl = "/parent/notices";
        break;
      case "all":
      default:
        noticeUrl = "/notices";
        break;
    }

    const payload = {
      title: notice.title,
      body:
        notice.content.substring(0, 100) +
        (notice.content.length > 100 ? "..." : ""),
      icon: "/logo.png",
      tag: `notice-${notice._id}`,
      type: notice.type,
      noticeId: notice._id.toString(),
      url: noticeUrl,
    };

    // Send push notifications
    const result = await pushController.sendNotification(
      targetUserIds,
      payload
    );
    console.log("[Push] Notifications sent:", result);
  } catch (error) {
    console.error("[Push] Error sending notifications:", error);
    throw error;
  }
};

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

    // Support for polling - get notices published after a specific timestamp
    const since = req.query.since;

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
    // Build base query conditions
    const baseConditions = [
      { branchId: branchId },
      { isActive: true },
      { publishDate: { $lte: new Date() } },
    ];

    // Add since filter if provided (for notification polling)
    if (since) {
      baseConditions.push({ publishDate: { $gt: new Date(since) } });
    }

    query = {
      $and: [
        ...baseConditions,
        {
          $or: [
            // General notices for this user's audience (must have NO specific recipients at all)
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
            {
              targetAudience: { $in: allowedAudiences },
              specificRecipients: [],
            },
            // Personal notices addressed to this user (these take precedence over general notices)
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
        // Exclude notices hidden by this user
        {
          $or: [
            { hiddenBy: { $exists: false } },
            { hiddenBy: null },
            { hiddenBy: { $size: 0 } },
            { hiddenBy: { $not: { $elemMatch: { userId } } } },
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
    const userRole = req.user.roles[0];
    const { page = 1, limit = 20, type, priority, targetAudience } = req.query;

    const filter = {
      branchId,
      // Only show notices that either:
      // 1. Have no specific recipients (general announcements)
      // 2. Have this user in the specific recipients list
      $or: [
        { specificRecipients: { $exists: false } },
        { specificRecipients: null },
        { specificRecipients: { $size: 0 } },
        { specificRecipients: new mongoose.Types.ObjectId(userId) },
      ],
      // Exclude notices hidden by this user
      $and: [
        {
          $or: [
            { hiddenBy: { $exists: false } },
            { hiddenBy: null },
            { hiddenBy: { $size: 0 } },
            {
              hiddenBy: {
                $not: {
                  $elemMatch: { userId: new mongoose.Types.ObjectId(userId) },
                },
              },
            },
          ],
        },
      ],
    };

    // Secretaries should not see auto-generated fee reminders
    // These are private messages to students about their payments
    if (userRole === "secretary") {
      filter.type = { $ne: "fee_reminder" };
    }

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
      courseId,
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
        // Secretaries can target students, teachers, staff, and parents in their branch
        allowedAudiences = ["students", "teachers", "staff", "parents", "all"];
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

    // Validate courseId for teachers
    if (userRole === "teacher" && courseId) {
      const teacher = await Teacher.findOne({
        userId: req.user._id,
        branchId: req.user.branchId,
      }).populate("classes.courses");

      if (!teacher) {
        return res.status(404).json({
          success: false,
          message: "Teacher profile not found",
        });
      }

      // Check if the teacher teaches this course
      const teachesCourse = teacher.classes.some((classAssignment) =>
        classAssignment.courses.some(
          (course) => course._id.toString() === courseId
        )
      );

      if (!teachesCourse) {
        return res.status(403).json({
          success: false,
          message: "You can only create announcements for courses you teach",
        });
      }
    }

    const noticeData = {
      branchId: req.user.branchId,
      title,
      content,
      type: type || "general",
      priority: priority || "medium",
      targetAudience:
        targetAudience || (userRole === "teacher" ? "students" : "all"),
      courseId: courseId || undefined,
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
    console.log("Notice details:", {
      title: savedNotice.title,
      type: savedNotice.type,
      targetAudience: savedNotice.targetAudience,
      branchId: req.user.branchId,
    });

    // Send push notifications to targeted users (non-blocking)
    console.log("[Push] About to call sendPushNotificationsForNotice...");
    sendPushNotificationsForNotice(savedNotice, req.user.branchId).catch(
      (error) => {
        console.error("[Push] Error sending notifications:", error);
        // Don't fail the notice creation if push notifications fail
      }
    );

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

// Hide notice for current user
const hideNotice = async (req, res) => {
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

    notice.hideForUser(userId);
    await notice.save();

    res.json({
      success: true,
      message: "Notice hidden successfully",
    });
  } catch (error) {
    console.error("Hide notice error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while hiding notice",
      error: error.message,
    });
  }
};

// Unhide notice for current user
const unhideNotice = async (req, res) => {
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

    notice.unhideForUser(userId);
    await notice.save();

    res.json({
      success: true,
      message: "Notice unhidden successfully",
    });
  } catch (error) {
    console.error("Unhide notice error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while unhiding notice",
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
  hideNotice,
  unhideNotice,
};
