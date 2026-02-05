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
          .select("_id firstName lastName phoneNumber profileDetails")
          .lean();
      } else {
        // Audience-based targeting
        const query = { branchId: notice.branchId };

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
            // All users in the branch
            break;
        }

        targetUsers = await User.find(query)
          .select("_id firstName lastName phoneNumber profileDetails roles")
          .lean();
      }

      console.log(
        `📊 Found ${targetUsers.length} users matching target audience: ${notice.targetAudience}`,
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

        // Prepare message for user
        if (userPhone) {
          const message = this.buildNoticeMessage(
            noticeData,
            userName,
            user.roles?.includes("student") ? "student" : "user",
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

        // If user is a student, also send to emergency contact/guardian
        // Only send to guardians if target audience is "all" or "students"
        const shouldSendToGuardians =
          user.roles?.includes("student") &&
          (notice.targetAudience === "all" ||
            notice.targetAudience === "students");

        if (shouldSendToGuardians) {
          try {
            const student = await Student.findOne({ userId: user._id })
              .select("parentGuardianInfo")
              .lean();

            if (student) {
              const emergencyContact =
                student.parentGuardianInfo?.emergencyContact;
              const guardian = student.parentGuardianInfo?.guardian;

              // Try emergency contact first, then guardian
              const contactInfo =
                emergencyContact?.phone && emergencyContact?.name
                  ? {
                      phone: emergencyContact.phone,
                      name: emergencyContact.name,
                      relationship:
                        emergencyContact.relationship || "Emergency Contact",
                    }
                  : guardian?.phone && guardian?.name
                    ? {
                        phone: guardian.phone,
                        name: guardian.name,
                        relationship: guardian.relationship || "Guardian",
                      }
                    : null;

              if (contactInfo) {
                results.total++;

                const guardianMessage = this.buildNoticeMessage(
                  noticeData,
                  contactInfo.name,
                  "guardian",
                );

                messagesToQueue.push({
                  phoneNumber: contactInfo.phone,
                  message: guardianMessage,
                  metadata: {
                    type: "notice",
                    noticeType: noticeData.type,
                    priority: noticeData.priority,
                    recipientName: contactInfo.name,
                    recipientType: "guardian",
                    studentName: userName,
                    relationship: contactInfo.relationship,
                  },
                  priority:
                    noticeData.priority === "high"
                      ? 1
                      : noticeData.priority === "medium"
                        ? 2
                        : 3,
                });

                results.details.push({
                  recipient: contactInfo.name,
                  phone: contactInfo.phone,
                  type: "guardian",
                  relationship: contactInfo.relationship,
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
