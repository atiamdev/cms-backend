/**
 * Notice WhatsApp Notification Service
 *
 * Handles sending WhatsApp notifications for announcements/notices to:
 * - Students
 * - Emergency contacts/guardians
 * Based on target audience and user preferences.
 *
 * Uses WhatsApp Queue Service for systematic rate-limited sending.
 */

const WhatsAppQueueService = require("./whatsappQueueService");
const Student = require("../models/Student");
const User = require("../models/User");

class NoticeWhatsAppService {
  constructor() {
    this.queueService = WhatsAppQueueService; // Use the queue service
  }

  /**
   * Build notice message based on recipient type
   * @param {Object} noticeData - Notice details
   * @param {string} recipientName - Recipient's name
   * @param {string} recipientType - 'student', 'user', or 'guardian'
   * @returns {string} Formatted message
   */
  buildNoticeMessage(noticeData, recipientName, recipientType = "student") {
    const {
      title,
      content,
      branchName = "ATIAM COLLEGE",
      authorName = "Administration",
    } = noticeData;

    // Note: WhatsApp has ~4096 character limit, but content is sent as-is
    const messageContent = content;

    // Build message based on recipient type
    if (recipientType === "guardian") {
      return `*${branchName} - Important Notice*

 *${title}*

*Dear Parent/Guardian,*

${messageContent}

`;
    } else {
      // Student/user message
      return `*${branchName} - New Notice*

*${title}*

${messageContent}

`;
    }
  }

  /**
   * Send notice notification to a single recipient (DEPRECATED - use queue instead)
   * @deprecated Use queueService.addToQueue() directly instead
   */
  async sendNoticeToRecipient(
    noticeData,
    phoneNumber,
    recipientName,
    recipientType = "student",
  ) {
    console.warn(
      "⚠️ sendNoticeToRecipient is deprecated. Messages are now queued automatically.",
    );

    try {
      const message = this.buildNoticeMessage(
        noticeData,
        recipientName,
        recipientType,
      );

      const queueId = await this.queueService.addToQueue({
        phoneNumber,
        message,
        metadata: {
          type: "notice",
          noticeType: noticeData.type,
          priority: noticeData.priority,
          recipientName,
          recipientType,
        },
        priority:
          noticeData.priority === "high"
            ? 1
            : noticeData.priority === "medium"
              ? 2
              : 3,
      });

      return { success: true, queueId };
    } catch (error) {
      console.error(
        `❌ Error sending notice notification to ${recipientName}:`,
        error,
      );
      return { success: false, error: error.message };
    }
  }

  /**
   * Send notice notifications to students based on target audience
   * @param {Object} notice - Notice document
   * @returns {Promise<Object>} Results summary
   */
  async sendNoticeNotifications(notice) {
    try {
      console.log(
        `📢 Processing WhatsApp notifications for notice: ${notice.title}`,
      );

      // Check if WhatsApp service is enabled
      if (!this.queueService.whatsappService.isEnabled) {
        console.log("⚠️ WhatsApp service is disabled, skipping notifications");
        return { success: true, skipped: true, reason: "service_disabled" };
      }

      // Prepare notice data
      const noticeData = {
        title: notice.title,
        content: notice.content,
        type: notice.type,
        priority: notice.priority,
        publishDate: notice.publishDate,
        expiryDate: notice.expiryDate,
        authorName: notice.author?.name || "Administration",
        branchName: "ATIAM COLLEGE",
      };

      const results = {
        total: 0,
        queued: 0,
        skipped: 0,
        queueIds: [],
        details: [],
      };

      // Collect all messages to queue in bulk
      const messagesToQueue = [];

      // Determine target users based on audience
      let targetUsers = [];

      if (notice.specificRecipients && notice.specificRecipients.length > 0) {
        // Specific recipients
        targetUsers = await User.find({
          _id: { $in: notice.specificRecipients },
        })
          .select("_id firstName lastName phoneNumber profileDetails roles")
          .lean();
      } else {
        // Audience-based targeting - targetAudience is now an array
        const query = { branchId: notice.branchId };

        // Ensure targetAudience is an array
        const audiences = Array.isArray(notice.targetAudience)
          ? notice.targetAudience
          : [notice.targetAudience];

        // If "all" is in the array, don't filter by role
        if (!audiences.includes("all")) {
          const roleMapping = [];

          if (audiences.includes("students")) {
            roleMapping.push("student");
          }
          if (audiences.includes("teachers")) {
            roleMapping.push("teacher");
          }
          if (audiences.includes("staff")) {
            roleMapping.push("secretary", "branchadmin", "admin");
          }
          if (audiences.includes("parents")) {
            roleMapping.push("parent");
          }

          // Only filter by roles if specific audiences are selected
          if (roleMapping.length > 0) {
            query.roles = { $in: roleMapping };
          }
        }

        targetUsers = await User.find(query)
          .select("_id firstName lastName phoneNumber profileDetails roles")
          .lean();
      }

      console.log(
        `📊 Found ${targetUsers.length} users matching target audience: ${Array.isArray(notice.targetAudience) ? notice.targetAudience.join(", ") : notice.targetAudience}`,
      );

      // Send to students and their guardians
      for (const user of targetUsers) {
        results.total++;

        const userName = `${user.firstName} ${user.lastName}`.trim();
        // Phone number can be in user.phoneNumber OR user.profileDetails.phone
        const userPhone = user.phoneNumber || user.profileDetails?.phone;

        // Check if user has WhatsApp notifications enabled
        // Default to true if preferences don't exist (for backward compatibility)
        const whatsappPrefs = user.profileDetails?.whatsappNotifications;
        const isEnabled = whatsappPrefs?.enabled !== false; // Default true if undefined
        const noticeAlertsEnabled = whatsappPrefs?.noticeAlerts !== false; // Default true if undefined

        if (!isEnabled || !noticeAlertsEnabled) {
          results.skipped++;
          continue;
        }

        if (!userPhone) {
          results.skipped++;
          continue;
        }

        // Ensure targetAudience is an array for checking
        const audiences = Array.isArray(notice.targetAudience)
          ? notice.targetAudience
          : [notice.targetAudience];

        // Determine if we should send to this user based on their role and target audience
        const userRoles = user.roles || [];
        const isStudent = userRoles.includes("student");
        const isTeacher = userRoles.includes("teacher");
        const isStaff = userRoles.some((role) =>
          ["secretary", "branchadmin", "admin"].includes(role),
        );
        const isParent = userRoles.includes("parent");

        // Check if this user's role matches the target audience
        const shouldSendToUser =
          audiences.includes("all") ||
          (isStudent && audiences.includes("students")) ||
          (isTeacher && audiences.includes("teachers")) ||
          (isStaff && audiences.includes("staff")) ||
          (isParent && audiences.includes("parents"));

        // Send to user directly if their role matches target audience
        if (shouldSendToUser && userPhone) {
          const message = this.buildNoticeMessage(
            noticeData,
            userName,
            isStudent ? "student" : "user",
          );

          messagesToQueue.push({
            phoneNumber: userPhone,
            message,
            metadata: {
              type: "notice",
              noticeType: noticeData.type,
              priority: noticeData.priority,
              recipientName: userName,
              recipientType: "user",
              userId: user._id,
            },
            priority:
              noticeData.priority === "high"
                ? 1
                : noticeData.priority === "medium"
                  ? 2
                  : 3,
          });

          results.details.push({
            recipient: userName,
            phone: userPhone,
            type: "user",
            status: "queued",
          });
        }

        // Send to emergency contact/guardian ONLY if "parents" is specifically targeted
        // Do NOT send student notices to parents - only parent-specific notices
        const shouldSendToGuardians =
          isStudent && audiences.includes("parents");

        if (shouldSendToGuardians) {
          try {
            const student = await Student.findOne({ userId: user._id })
              .select("parentGuardianInfo")
              .lean();

            if (student) {
              const emergencyContact =
                student.parentGuardianInfo?.emergencyContact;

              // Always prioritize emergency contact number for parents
              if (emergencyContact?.phone && emergencyContact?.name) {
                results.total++;

                const guardianMessage = this.buildNoticeMessage(
                  noticeData,
                  emergencyContact.name,
                  "guardian",
                );

                messagesToQueue.push({
                  phoneNumber: emergencyContact.phone,
                  message: guardianMessage,
                  metadata: {
                    type: "notice",
                    noticeType: noticeData.type,
                    priority: noticeData.priority,
                    recipientName: emergencyContact.name,
                    recipientType: "guardian",
                    studentName: userName,
                    relationship:
                      emergencyContact.relationship || "Emergency Contact",
                  },
                  priority:
                    noticeData.priority === "high"
                      ? 1
                      : noticeData.priority === "medium"
                        ? 2
                        : 3,
                });

                results.details.push({
                  recipient: emergencyContact.name,
                  phone: emergencyContact.phone,
                  type: "guardian",
                  relationship:
                    emergencyContact.relationship || "Emergency Contact",
                  studentName: userName,
                  status: "queued",
                });
              }
            }
          } catch (error) {
            console.error(
              `Error fetching guardian info for ${userName}:`,
              error.message,
            );
          }
        }
      }

      // Queue all messages at once for systematic processing
      if (messagesToQueue.length > 0) {
        console.log(`📦 Queuing ${messagesToQueue.length} notice messages...`);
        const queueIds =
          await this.queueService.addBulkToQueue(messagesToQueue);
        results.queueIds = queueIds;
        results.queued = messagesToQueue.length;
      }

      console.log(
        `✅ Notice WhatsApp notifications queued: ${results.queued}/${results.total} queued, ${results.skipped} skipped`,
      );

      return {
        success: true,
        results,
      };
    } catch (error) {
      console.error("❌ Error in sendNoticeNotifications:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Send notice notification to specific users
   * @param {Object} notice - Notice document
   * @param {Array<string>} userIds - Array of user IDs
   * @returns {Promise<Object>} Results summary
   */
  async sendNoticeToSpecificUsers(notice, userIds) {
    try {
      if (!userIds || userIds.length === 0) {
        return { success: true, skipped: true, reason: "no_recipients" };
      }

      console.log(`📢 Sending notice to ${userIds.length} specific users`);

      // Create a modified notice object with specific recipients
      const modifiedNotice = {
        ...(notice.toObject ? notice.toObject() : notice),
        specificRecipients: userIds,
      };

      return await this.sendNoticeNotifications(modifiedNotice);
    } catch (error) {
      console.error("❌ Error in sendNoticeToSpecificUsers:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

// Export singleton instance
module.exports = new NoticeWhatsAppService();
