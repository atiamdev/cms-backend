/**
 * WhatsApp Notification Service
 *
 * Handles sending WhatsApp notifications for:
 * - Fee invoices and payment receipts
 * - Weekly attendance reports
 * - Emergency contact notifications
 */

const WhatsAppService = require("./whatsappService");

class WhatsAppNotificationService {
  constructor() {
    this.whatsappService = WhatsAppService; // Use the singleton instance
  }

  /**
   * Send invoice notification to student
   * @param {Object} invoiceData - Invoice details
   * @param {string} studentPhone - Student's phone number
   * @param {Object} options - Additional options
   */
  async sendInvoiceNotification(invoiceData, studentPhone, options = {}) {
    try {
      const {
        studentName,
        studentId,
        academicYear,
        academicTerm,
        totalAmount,
        balance,
        dueDate,
        feeComponents = [],
        branchName = "ATIAM COLLEGE",
      } = invoiceData;

      // Format fee components
      const feeBreakdown = feeComponents
        .map(
          (component) =>
            `• ${component.name}: KES ${component.amount?.toLocaleString() || "N/A"}`,
        )
        .join("\n");

      const message = `🧾 *${branchName} - Fee Invoice*

👤 *Student:* ${studentName}
🆔 *Student ID:* ${studentId}
📅 *Academic Year:* ${academicYear}
📆 *Term:* ${academicTerm}

💰 *Fee Breakdown:*
${feeBreakdown}

💵 *Total Amount:* KES ${totalAmount?.toLocaleString() || "N/A"}
⏰ *Due Date:* ${dueDate ? new Date(dueDate).toLocaleDateString() : "N/A"}
💸 *Outstanding Balance:* KES ${balance?.toLocaleString() || "0"}

📞 *Payment Options:*
• M-Pesa: Paybill xxxx
• Bank Transfer: Account details available on portal
• Equity Bank: Jenga Pay

🔗 *View Details:* https://portal.atiamcollege.com/student/fees

For any queries, contact: admin@atiamcollege.com
📅 Generated: ${new Date().toLocaleString()}`;

      const result = await this.whatsappService.sendMessage(
        studentPhone,
        message,
        {
          type: "invoice",
          studentId,
          ...options,
        },
      );

      console.log(
        `📤 Invoice notification sent to ${studentName} (${studentId})`,
      );
      return result;
    } catch (error) {
      console.error("❌ Failed to send invoice notification:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send invoice notification to emergency contact
   * @param {Object} invoiceData - Invoice details
   * @param {string} contactPhone - Emergency contact's phone number
   * @param {Object} options - Additional options
   */
  async sendEmergencyContactInvoiceNotification(
    invoiceData,
    contactPhone,
    options = {},
  ) {
    try {
      const {
        studentName,
        studentId,
        contactName,
        relationship,
        academicYear,
        academicTerm,
        totalAmount,
        balance,
        dueDate,
        feeComponents = [],
        branchName = "ATIAM COLLEGE",
      } = invoiceData;

      // Format fee components
      const feeBreakdown = feeComponents
        .map(
          (component) =>
            `• ${component.name}: KES ${component.amount?.toLocaleString() || "N/A"}`,
        )
        .join("\n");

      const message = `📄 *${branchName} - Invoice Notification*

👨‍👩‍👧‍👦 *Student:* ${studentName}
🆔 *Student ID:* ${studentId}
👤 *Contact:* ${contactName} (${relationship})
📅 *Academic Year:* ${academicYear}
📆 *Term:* ${academicTerm}

💰 *Fee Breakdown:*
${feeBreakdown}

💵 *Total Amount:* KES ${totalAmount?.toLocaleString() || "N/A"}
⏰ *Due Date:* ${dueDate ? new Date(dueDate).toLocaleDateString() : "N/A"}
💸 *Outstanding Balance:* KES ${balance?.toLocaleString() || "0"}

📞 *Payment Options:*
• M-Pesa: Paybill xxxx
• Bank Transfer: Account details available on portal
• Equity Bank: Jenga Pay

🔗 *View Details:* https://portal.atiamcollege.com/student/fees

Please ensure payment is made on time. For any queries, contact: admin@atiamcollege.com
📅 Generated: ${new Date().toLocaleString()}`;

      const result = await this.whatsappService.sendMessage(
        contactPhone,
        message,
        {
          type: "invoice",
          studentId,
          recipientType: "emergency_contact",
          ...options,
        },
      );

      console.log(
        `📤 Emergency contact invoice notification sent to ${contactName} (${relationship}) for ${studentName}`,
      );
      return result;
    } catch (error) {
      console.error(
        "❌ Failed to send emergency contact invoice notification:",
        error,
      );
      return { success: false, error: error.message };
    }
  }

  /**
   * Send weekly attendance report to student or emergency contact
   * @param {Object} reportData - Attendance report data
   * @param {string} recipientPhone - Recipient's phone number
   * @param {Object} options - Additional options
   */
  async sendWeeklyAttendanceReport(reportData, recipientPhone, options = {}) {
    try {
      const {
        studentName,
        studentId,
        weekStart,
        weekEnd,
        totalDays,
        presentDays,
        absentDays,
        attendancePercentage,
        className,
        branchName = "ATIAM COLLEGE",
        statusEmoji = "📊",
        statusText = "Good",
        statusMessage = "Keep up the good work!",
        customMessage,
        recipientType = "student",
        contactName,
        relationship,
        isAlternate = false,
      } = reportData;

      // Customize message based on recipient type
      const recipientPrefix =
        recipientType === "emergency_contact"
          ? `*${branchName} - Student Attendance Report*\n\n *Regarding:* ${studentName} (${studentId})`
          : `${statusEmoji} *${branchName} - Weekly Attendance Report*`;

      const contactInfo =
        recipientType === "emergency_contact"
          ? `\n📞 *Contact:* ${contactName}${relationship ? ` (${relationship})` : ""}${isAlternate ? " (Alternate)" : ""}`
          : "";

      const actionMessage =
        recipientType === "emergency_contact"
          ? "\n💡 *Please discuss attendance with your child and contact the school if needed.*"
          : `\n💡 *${statusMessage}*`;

      // Add missed days information for emergency contacts
      const missedDaysInfo = reportData.missedDaysText || "";

      const message = `${recipientPrefix}${contactInfo}

*Class:* ${className}

*Report Period:*
${new Date(weekStart).toLocaleDateString()} - ${new Date(weekEnd).toLocaleDateString()}

*Attendance Summary:*
• Total School Days: ${totalDays}
• Days Present: ${presentDays} ✅${"✅".repeat(Math.max(0, presentDays - 1))}
• Days Absent: ${absentDays} ❌${"❌".repeat(Math.max(0, absentDays - 1))}
• Attendance Rate: ${attendancePercentage.toFixed(1)}%${missedDaysInfo}

${statusEmoji} *Status:* ${statusText}${actionMessage}

${customMessage ? `\n💬 *Note:* ${customMessage}\n` : ""}

📞 *Contact Teachers:*
For attendance concerns, reach out to the class teacher


${recipientType === "student" ? "Keep up the good work! 🎓" : "Thank you for your attention to this matter. 📚"}
📅 Generated: ${new Date().toLocaleString()}`;

      const result = await this.whatsappService.sendMessage(
        recipientPhone,
        message,
        {
          type: "attendance_report",
          studentId,
          recipientType,
          ...options,
        },
      );

      const recipientDesc =
        recipientType === "emergency_contact"
          ? `${contactName} (${relationship || "Guardian"})`
          : studentName;

      console.log(
        `📤 Weekly attendance report sent to ${recipientType}: ${recipientDesc} for student ${studentName} (${studentId})`,
      );
      return result;
    } catch (error) {
      console.error("❌ Failed to send weekly attendance report:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send payment receipt notification
   * @param {Object} receiptData - Receipt details
   * @param {string} studentPhone - Student's phone number
   * @param {Object} options - Additional options
   */
  async sendPaymentReceiptNotification(
    receiptData,
    studentPhone,
    options = {},
  ) {
    try {
      const {
        studentName,
        studentId,
        receiptNumber,
        paymentDate,
        paymentMethod,
        amountPaid,
        transactionRef,
        balance,
        branchName = "ATIAM COLLEGE",
      } = receiptData;

      const message = `✅ *${branchName} - Payment Receipt*

*Student:* ${studentName}
*Student ID:* ${studentId}
*Receipt No:* ${receiptNumber}

*Payment Details:*
• Amount Paid: KES ${amountPaid?.toLocaleString() || "N/A"}
• Payment Method: ${paymentMethod || "N/A"}
• Transaction Ref: ${transactionRef || "N/A"}
• Payment Date: ${paymentDate ? new Date(paymentDate).toLocaleString() : "N/A"}

*Account Status:*
• Outstanding Balance: KES ${balance?.toLocaleString() || "0"}

✅ *Payment Confirmed!*
Thank you for your payment. Your account has been updated.

🔗 *Download Receipt:* https://portal.atiamcollege.com/student/receipts/${receiptNumber}

For any discrepancies, contact: admin@atiamcollege.com
Generated: ${new Date().toLocaleString()}`;

      const result = await this.whatsappService.sendMessage(
        studentPhone,
        message,
        {
          type: "receipt",
          studentId,
          receiptNumber,
          ...options,
        },
      );

      console.log(
        `📤 Payment receipt notification sent to ${studentName} (${studentId})`,
      );
      return result;
    } catch (error) {
      console.error("❌ Failed to send payment receipt notification:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send weekly attendance report to student
   * @param {Object} attendanceData - Attendance report data
   * @param {string} studentPhone - Student's phone number
   * @param {Object} options - Additional options
   */
  async sendWeeklyAttendanceReport(attendanceData, studentPhone, options = {}) {
    try {
      const {
        studentName,
        studentId,
        weekStart,
        weekEnd,
        totalDays,
        presentDays,
        absentDays,
        attendancePercentage,
        className,
        branchName = "ATIAM COLLEGE",
      } = attendanceData;

      // Calculate attendance status
      let statusEmoji = "🟢";
      let statusText = "Good";
      if (attendancePercentage < 75) {
        statusEmoji = "🟡";
        statusText = "Needs Improvement";
      }
      if (attendancePercentage < 50) {
        statusEmoji = "🔴";
        statusText = "Critical";
      }

      const message = `*${branchName} - Weekly Attendance Report*

*Student:* ${studentName}
*Student ID:* ${studentId}
*Class:* ${className}

*Report Period:*
${new Date(weekStart).toLocaleDateString()} - ${new Date(weekEnd).toLocaleDateString()}

*Attendance Summary:*
• Total School Days: ${totalDays}
• Days Present: ${presentDays} ${"✅".repeat(Math.min(presentDays, 5))}
• Days Absent: ${absentDays} ${absentDays > 0 ? "❌".repeat(Math.min(absentDays, 3)) : ""}
• Attendance Rate: ${attendancePercentage?.toFixed(1) || "0"}%

${statusEmoji} *Status:* ${statusText}


📞 *Contact Teachers:*
For attendance concerns, reach out to your class teacher or:
*Email:* admin@atiamcollege.com

🔗 *View Full Report:* https://portal.atiamcollege.com/student/attendance

Keep up the good work! 🎓
Generated: ${new Date().toLocaleString()}`;

      const result = await this.whatsappService.sendMessage(
        studentPhone,
        message,
        {
          type: "attendance",
          studentId,
          weekStart,
          weekEnd,
          ...options,
        },
      );

      console.log(
        `📤 Weekly attendance report sent to ${studentName} (${studentId})`,
      );
      return result;
    } catch (error) {
      console.error("❌ Failed to send weekly attendance report:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send emergency contact notification
   * @param {Object} emergencyData - Emergency notification data
   * @param {string} contactPhone - Emergency contact phone number
   * @param {Object} options - Additional options
   */
  async sendEmergencyNotification(emergencyData, contactPhone, options = {}) {
    try {
      const {
        studentName,
        studentId,
        emergencyType,
        message,
        contactPerson,
        branchName = "ATIAM COLLEGE",
        urgency = "normal",
      } = emergencyData;

      const urgencyEmoji =
        urgency === "high" ? "🚨" : urgency === "medium" ? "⚠️" : "ℹ️";

      const fullMessage = `${urgencyEmoji} *${branchName} - Emergency Notification*

*Student:* ${studentName}
*Student ID:* ${studentId}
*Contact:* ${contactPerson}

*${emergencyType}*

${message}

*Time:* ${new Date().toLocaleString()}

Please contact the school immediately if you need to discuss this matter.

*School Contacts:*
• Main Office: +254 793 746 046
• Email: admin@atiamcollege.com

🔗 *More Info:* https://portal.atiamcollege.com/emergency`;

      const result = await this.whatsappService.sendMessage(
        contactPhone,
        fullMessage,
        {
          type: "emergency",
          studentId,
          urgency,
          ...options,
        },
      );

      console.log(
        `📤 Emergency notification sent to contact for ${studentName} (${studentId})`,
      );
      return result;
    } catch (error) {
      console.error("❌ Failed to send emergency notification:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send bulk notifications (for scheduled jobs)
   * @param {Array} notifications - Array of notification objects
   * @param {Object} options - Bulk options
   */
  async sendBulkNotifications(notifications, options = {}) {
    const results = [];
    const delay = options.delay || 1000; // 1 second between messages

    console.log(
      `📤 Starting bulk notification send: ${notifications.length} messages`,
    );

    for (let i = 0; i < notifications.length; i++) {
      const notification = notifications[i];

      try {
        let result;

        switch (notification.type) {
          case "invoice":
            result = await this.sendInvoiceNotification(
              notification.data,
              notification.phone,
              notification.options,
            );
            break;
          case "receipt":
            result = await this.sendPaymentReceiptNotification(
              notification.data,
              notification.phone,
              notification.options,
            );
            break;
          case "attendance_report":
            result = await this.sendWeeklyAttendanceReport(
              notification.data,
              notification.phone,
              notification.options,
            );
            break;
          case "emergency":
            result = await this.sendEmergencyNotification(
              notification.data,
              notification.phone,
              notification.options,
            );
            break;
          default:
            result = { success: false, error: "Unknown notification type" };
        }

        results.push({
          index: i,
          type: notification.type,
          success: result.success,
          error: result.error,
        });

        // Rate limiting delay
        if (i < notifications.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      } catch (error) {
        results.push({
          index: i,
          type: notification.type,
          success: false,
          error: error.message,
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    console.log(
      `📤 Bulk notification complete: ${successCount}/${notifications.length} successful`,
    );

    return {
      total: notifications.length,
      successful: successCount,
      failed: notifications.length - successCount,
      results,
    };
  }

  /**
   * Send 5-day fee reminder (early warning)
   * @param {Object} reminderData - Reminder details
   * @param {string} recipientPhone - Recipient's phone number
   * @param {Object} options - Additional options
   */
  async sendFiveDayFeeReminder(reminderData, recipientPhone, options = {}) {
    try {
      const {
        studentName,
        regNumber,
        dueDate,
        recipientType = "student", // 'student' or 'emergency_contact'
      } = reminderData;

      const formattedDueDate = new Date(dueDate).toLocaleDateString("en-GB");

      // English message
      const englishMessage = `Dear ${studentName}, your school fee is due in 5 days. Please pay before ${formattedDueDate} to ensure uninterrupted access to the school.

M-Pesa Paybill: 720303
Account: ${regNumber}

Thank you, Management.`;

      // Somali translation
      const somaliMessage = `Ardayga Sharafta leh ${studentName}, waxaan ku xasuusinaynaa in bixinta fiiska iskuulka ay ka dhiman tahay 5 maalmood. Fadlan bixi ka hor ${formattedDueDate} si aadan carqalad ugalakulmin gelitaanka iskuulka.

M-Pesa Paybill: 720303
Account: ${regNumber}

Mahadsanid, Maamulka.`;

      // Combined bilingual message
      const message = `${englishMessage}\n\n---\n\n${somaliMessage}`;

      const result = await this.whatsappService.sendMessage(
        recipientPhone,
        message,
        {
          type: "fee_reminder_5day",
          recipientType,
          regNumber,
          ...options,
        },
      );

      console.log(
        `📤 5-day fee reminder sent to ${recipientType} for ${studentName} (${regNumber})`,
      );
      return result;
    } catch (error) {
      console.error("❌ Failed to send 5-day fee reminder:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send 1-day fee reminder (final notice)
   * @param {Object} reminderData - Reminder details
   * @param {string} recipientPhone - Recipient's phone number
   * @param {Object} options - Additional options
   */
  async sendOneDayFeeReminder(reminderData, recipientPhone, options = {}) {
    try {
      const {
        studentName,
        regNumber,
        dueDate,
        recipientType = "student", // 'student' or 'emergency_contact'
      } = reminderData;

      const formattedDueDate = new Date(dueDate).toLocaleDateString("en-GB");

      // English message
      const englishMessage = `FINAL NOTICE: ${studentName}, your fee is due tomorrow, ${formattedDueDate}. Unpaid accounts will be locked out of the biometric gate system by 8:00 AM tomorrow.

M-Pesa Paybill: 720303
Account: ${regNumber}

Pay now to avoid inconvenience.`;

      // Somali translation
      const somaliMessage = `OGAYSIIS kama dambays ah: ${studentName}, fiiskaaga waxaa kuugu dambaysa berri oo taariikhdu tahay ${formattedDueDate}. Ardayga aan bixin fiiska waxaa si toos ah looga xiri doonaa qalabka faraha, iyo galitaanka iskuulka.

M-Pesa Paybill: 720303
Account: ${regNumber}`;

      // Combined bilingual message
      const message = `${englishMessage}\n\n---\n\n${somaliMessage}`;

      const result = await this.whatsappService.sendMessage(
        recipientPhone,
        message,
        {
          type: "fee_reminder_1day",
          recipientType,
          regNumber,
          ...options,
        },
      );

      console.log(
        `📤 1-day FINAL fee reminder sent to ${recipientType} for ${studentName} (${regNumber})`,
      );
      return result;
    } catch (error) {
      console.error("❌ Failed to send 1-day fee reminder:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      enabled: this.whatsappService.isEnabled,
      initialized: this.whatsappService.wasender !== null,
      rateLimitDelay: this.whatsappService.rateLimitDelay,
      maxRetries: this.whatsappService.maxRetries,
    };
  }
}

module.exports = WhatsAppNotificationService;
