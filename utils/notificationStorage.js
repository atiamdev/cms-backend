const Notice = require("../models/Notice");
const User = require("../models/User");

/**
 * Store push notification as a notice in the database
 * @param {Object} options - Notification options
 * @param {Array|String} options.userIds - User ID(s) to send notification to
 * @param {String} options.title - Notification title
 * @param {String} options.content - Notification content/body
 * @param {String} options.type - Notice type (urgent, important, academic, info, general, fee_reminder)
 * @param {String} options.priority - Priority (high, medium, low)
 * @param {String} options.branchId - Branch ID (optional, will be derived from user if not provided)
 * @param {String} options.targetAudience - Target audience (all, students, teachers, staff, parents)
 * @param {Date} options.expiryDate - Expiry date for the notice (optional)
 */
async function storeNotificationAsNotice(options) {
  try {
    const {
      userIds,
      title,
      content,
      type = "info",
      priority = "medium",
      branchId,
      targetAudience,
      expiryDate,
    } = options;

    // Convert single userId to array
    const recipientIds = Array.isArray(userIds) ? userIds : [userIds];

    if (recipientIds.length === 0) {
      console.log(
        "[Notice Storage] No recipients provided, skipping notice creation"
      );
      return null;
    }

    // Get the first user's branch if branchId not provided
    let noticeBranchId = branchId;
    if (!noticeBranchId) {
      const firstUser = await User.findById(recipientIds[0]).select("branchId");
      if (firstUser && firstUser.branchId) {
        noticeBranchId = firstUser.branchId;
      }
    }

    if (!noticeBranchId) {
      console.log(
        "[Notice Storage] No branchId found, skipping notice creation"
      );
      return null;
    }

    // Determine target audience if not provided
    let audience = targetAudience;
    if (!audience && recipientIds.length > 0) {
      // Get the roles of recipients to determine audience
      const users = await User.find({ _id: { $in: recipientIds } }).select(
        "role"
      );
      const roles = users.map((u) => u.role);

      if (roles.every((r) => r === "student")) {
        audience = "students";
      } else if (roles.every((r) => r === "teacher")) {
        audience = "teachers";
      } else if (roles.every((r) => r === "staff" || r === "branch_admin")) {
        audience = "staff";
      } else {
        audience = "all";
      }
    }

    // Create notice
    const notice = new Notice({
      branchId: noticeBranchId,
      title: title,
      content: content,
      type: type,
      priority: priority,
      targetAudience: audience || "all",
      specificRecipients: recipientIds,
      author: {
        userId: recipientIds[0], // Use first recipient as placeholder
        name: "System",
        department: "Automated Notifications",
      },
      isActive: true,
      publishDate: new Date(),
      expiryDate: expiryDate,
    });

    await notice.save();

    console.log(
      `[Notice Storage] Created notice for ${recipientIds.length} recipient(s): ${title}`
    );

    return notice;
  } catch (error) {
    console.error("[Notice Storage] Error creating notice:", error);
    // Don't throw error - notification storage shouldn't break the main flow
    return null;
  }
}

/**
 * Store and send push notification
 * This combines push notification sending with database storage
 * @param {Object} pushController - Push controller instance
 * @param {Array|String} userIds - User ID(s) to send notification to
 * @param {Object} pushPayload - Push notification payload with title, body, icon, etc.
 * @param {Object} noticeOptions - Additional options for notice storage (type, priority, expiryDate)
 */
async function sendAndStoreNotification(
  pushController,
  userIds,
  pushPayload,
  noticeOptions = {}
) {
  try {
    // Store as notice in database
    await storeNotificationAsNotice({
      userIds: userIds,
      title: pushPayload.title,
      content: pushPayload.body,
      type: noticeOptions.type || "info",
      priority: noticeOptions.priority || "medium",
      branchId: noticeOptions.branchId,
      targetAudience: noticeOptions.targetAudience,
      expiryDate: noticeOptions.expiryDate,
    });

    // Send push notification
    await pushController.sendNotification(
      Array.isArray(userIds) ? userIds : [userIds],
      pushPayload
    );
  } catch (error) {
    console.error(
      "[Notification] Error sending and storing notification:",
      error
    );
    // Don't throw - allow process to continue even if notifications fail
  }
}

module.exports = {
  storeNotificationAsNotice,
  sendAndStoreNotification,
};
