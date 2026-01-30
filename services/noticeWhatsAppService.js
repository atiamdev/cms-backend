/**
 * Notice WhatsApp Notification Service
 *
 * Handles sending WhatsApp notifications for announcements/notices to:
 * - Students
 * - Emergency contacts/guardians
 * Based on target audience and user preferences.
 */

const WhatsAppService = require("./whatsappService");
const Student = require("../models/Student");
const User = require("../models/User");

class NoticeWhatsAppService {
  constructor() {
    this.whatsappService = WhatsAppService; // Use the singleton instance
  }

  /**
   * Send notice notification to a single recipient
   * @param {Object} noticeData - Notice details
   * @param {string} phoneNumber - Recipient's phone number
   * @param {string} recipientName - Recipient's name
   * @param {string} recipientType - 'student' or 'guardian'
   * @returns {Promise<Object>} Result object
   */
  async sendNoticeToRecipient(
    noticeData,
    phoneNumber,
    recipientName,
    recipientType = "student",
  ) {
    try {
      const {
        title,
        content,
        type,
        priority,
        publishDate,
        expiryDate,
        branchName = "ATIAM COLLEGE",
        authorName = "Administration",
      } = noticeData;

      // Priority emoji mapping
      const priorityEmojis = {
        high: "🔴",
        medium: "🟡",
        low: "🟢",
      };

      // Type emoji mapping
      const typeEmojis = {
        urgent: "⚠️",
        important: "📌",
        academic: "📚",
        info: "ℹ️",
        general: "📢",
      };

      const priorityEmoji = priorityEmojis[priority] || "📢";
      const typeEmoji = typeEmojis[type] || "📢";

      // Truncate content if too long (WhatsApp has ~4096 char limit)
      const maxContentLength = 500;
      const truncatedContent =
        content.length > maxContentLength
          ? content.substring(0, maxContentLength) + "..."
          : content;

      // Build message based on recipient type
      let message;
      if (recipientType === "guardian") {
        message = `${typeEmoji} *${branchName} - Important Notice*

${priorityEmoji} *${title}*

👨‍👩‍👧‍👦 *Dear Parent/Guardian,*

${truncatedContent}

📋 *Notice Details:*
• Type: ${type.toUpperCase()}
• Priority: ${priority.toUpperCase()}
• Published: ${new Date(publishDate).toLocaleDateString()}${expiryDate ? `\n• Valid Until: ${new Date(expiryDate).toLocaleDateString()}` : ""}

✍️ *Issued by:* ${authorName}



For any queries, please contact the school administration.
📞 Contact: admin@atiamcollege.com`;
      } else {
        // Student message
        message = `${typeEmoji} *${branchName} - New Notice*

${priorityEmoji} *${title}*

${truncatedContent}

📋 *Details:*
• Type: ${type.toUpperCase()}
• Priority: ${priority.toUpperCase()}
• Published: ${new Date(publishDate).toLocaleDateString()}${expiryDate ? `\n• Valid Until: ${new Date(expiryDate).toLocaleDateString()}` : ""}

✍️ *From:* ${authorName}

🔗 *View Full Notice:* https://portal.atiamcollege.com/student/notices

Stay informed and check the portal regularly!`;
      }

      const result = await this.whatsappService.sendMessage(
        phoneNumber,
        message,
        {
          type: "notice",
          noticeType: type,
          priority,
        },
      );

      if (result.success) {
        console.log(
          `📤 Notice notification sent to ${recipientName} (${recipientType})`,
        );
      } else {
        console.log(
          `❌ Failed to send notice to ${recipientName}: ${result.reason || result.error}`,
        );
      }

      return result;
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
      if (!this.whatsappService.isEnabled) {
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
        sent: 0,
        failed: 0,
        skipped: 0,
        details: [],
      };

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

        // Check if user has WhatsApp notifications enabled
        const whatsappPrefs = user.profileDetails?.whatsappNotifications;
        if (!whatsappPrefs?.enabled || whatsappPrefs?.noticeAlerts === false) {
          console.log(
            `⏭️ Skipping ${user.firstName} ${user.lastName} - WhatsApp notices disabled`,
          );
          results.skipped++;
          continue;
        }

        const userName = `${user.firstName} ${user.lastName}`.trim();
        const userPhone = user.phoneNumber;

        // Send to user
        if (userPhone) {
          const result = await this.sendNoticeToRecipient(
            noticeData,
            userPhone,
            userName,
            user.roles?.includes("student") ? "student" : "user",
          );

          if (result.success) {
            results.sent++;
          } else {
            results.failed++;
          }

          results.details.push({
            recipient: userName,
            phone: userPhone,
            type: "user",
            status: result.success ? "sent" : "failed",
            reason: result.reason || result.error,
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

                const guardianResult = await this.sendNoticeToRecipient(
                  noticeData,
                  contactInfo.phone,
                  contactInfo.name,
                  "guardian",
                );

                if (guardianResult.success) {
                  results.sent++;
                } else {
                  results.failed++;
                }

                results.details.push({
                  recipient: contactInfo.name,
                  phone: contactInfo.phone,
                  type: "guardian",
                  relationship: contactInfo.relationship,
                  studentName: userName,
                  status: guardianResult.success ? "sent" : "failed",
                  reason: guardianResult.reason || guardianResult.error,
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

        // Rate limiting delay (already handled by WhatsAppService but adding small delay between users)
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      console.log(
        `✅ Notice WhatsApp notifications completed: ${results.sent}/${results.total} sent, ${results.failed} failed, ${results.skipped} skipped`,
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
