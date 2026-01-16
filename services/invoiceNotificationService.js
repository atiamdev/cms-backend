/**
 * Invoice Notification Service
 * 
 * Handles notifications for invoice generation, sending alerts to students
 * via email, SMS, push notifications, and in-app notices.
 */

const Notice = require("../models/Notice");
const Student = require("../models/Student");
const Fee = require("../models/Fee");

// Import email service (optional - graceful degradation)
let sendEmail = null;
try {
  const emailService = require("../utils/emailService");
  sendEmail = emailService.sendEmail;
} catch (err) {
  console.warn("Email service not available - email notifications will be skipped");
}

// Import push controller for push notifications (optional - graceful degradation)
let pushController = null;
try {
  pushController = require("../controllers/pushController");
} catch (err) {
  console.warn("Push notification controller not available - push notifications will be skipped");
}

/**
 * Send notification to student about new invoice
 * @param {Object} params - Notification parameters
 * @param {String} params.studentId - Student ID
 * @param {String} params.feeId - Fee/Invoice ID
 * @param {Number} params.amount - Invoice amount
 * @param {Date} params.dueDate - Payment due date
 * @param {String} params.period - Period description (e.g., "January 2026")
 * @param {String} params.branchId - Branch ID
 */
async function notifyStudentOfInvoice({ studentId, feeId, amount, dueDate, period, branchId }) {
  try {
    // Load Student model if not loaded
    let Student;
    try {
      Student = require("../models/Student");
    } catch (err) {
      console.error("Student model not available");
      return { success: false, reason: "model_unavailable" };
    }

    const student = await Student.findById(studentId).lean();

    if (!student) {
      console.error(`Cannot notify student ${studentId}: Student not found`);
      return { success: false, reason: "student_not_found" };
    }

    // Try to get user details if userId exists and User model is available
    let user = null;
    if (student.userId) {
      try {
        const User = require("../models/User");
        user = await User.findById(student.userId).select("firstName lastName email phoneNumber").lean();
      } catch (err) {
        // User model not loaded or user not found - we'll use student data instead
        console.warn(`Could not load user for student ${studentId}, using student data`);
      }
    }

    // Fallback to student data if user not available
    const firstName = user?.firstName || student.firstName || "Student";
    const lastName = user?.lastName || student.lastName || "";
    const email = user?.email || student.email || null;
    const phoneNumber = user?.phoneNumber || student.phoneNumber || null;
    const studentName = `${firstName} ${lastName}`.trim();
    
    // Format amount and due date
    const formattedAmount = new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES'
    }).format(amount);
    
    const formattedDueDate = new Date(dueDate).toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Create in-app notice (only if userId exists)
    if (student.userId) {
      const noticeTitle = `New Invoice for ${period}`;
      const noticeContent = `Your invoice for ${period} has been generated. Amount due: ${formattedAmount}. Due date: ${formattedDueDate}. Please make payment before the due date to avoid inconvenience.`;

      try {
        await Notice.create({
          branchId,
          title: noticeTitle,
          content: noticeContent,
          targetAudience: "students", // Note: plural form
          specificRecipients: [student.userId],
          priority: "high",
          type: "fee_reminder",
          author: {
            userId: student.userId,
            name: "System",
            department: "Finance"
          },
          isActive: true,
        });
      } catch (noticeError) {
        console.error("Error creating notice:", noticeError.message);
      }
    }

    // Email notifications disabled for invoice generation - only in-app notices and push notifications
    // Students will receive notifications via the portal and push notifications only

    // Send push notification (if available)
    if (pushController && pushController.sendNotificationToUser) {
      try {
        await pushController.sendNotificationToUser({
          userId: student.userId._id,
          title: noticeTitle,
          body: `Amount: ${formattedAmount} | Due: ${formattedDueDate}`,
          data: {
            type: "invoice",
            feeId,
            studentId,
            url: "/student/fees"
          },
        });
      } catch (pushError) {
        console.error("Error sending push notification:", pushError.message);
      }
    }

    return { success: true, studentId, methods: ["notice", "push"] };
  } catch (error) {
    console.error("Error in notifyStudentOfInvoice:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Send bulk notifications for multiple invoices
 * @param {Array} invoices - Array of invoice objects with {studentId, feeId, amount, dueDate, period, branchId}
 * @returns {Object} Summary of notifications sent
 */
async function notifyStudentsOfInvoices(invoices) {
  const results = {
    total: invoices.length,
    successful: 0,
    failed: 0,
    errors: [],
  };

  // Process notifications in batches to avoid overwhelming the system
  const batchSize = 10;
  for (let i = 0; i < invoices.length; i += batchSize) {
    const batch = invoices.slice(i, i + batchSize);
    
    const promises = batch.map(invoice => notifyStudentOfInvoice(invoice));
    const batchResults = await Promise.allSettled(promises);

    batchResults.forEach((result, idx) => {
      if (result.status === "fulfilled" && result.value.success) {
        results.successful++;
      } else {
        results.failed++;
        results.errors.push({
          invoice: batch[idx],
          error: result.reason || result.value?.error || "Unknown error",
        });
      }
    });

    // Small delay between batches to prevent rate limiting
    if (i + batchSize < invoices.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return results;
}

/**
 * Send payment reminder notification
 * @param {Object} params - Reminder parameters
 * @param {String} params.studentId - Student ID
 * @param {String} params.feeId - Fee/Invoice ID
 * @param {Number} params.balance - Outstanding balance
 * @param {Date} params.dueDate - Payment due date
 * @param {Number} params.daysOverdue - Days past due (0 if not overdue)
 */
async function sendPaymentReminder({ studentId, feeId, balance, dueDate, daysOverdue = 0 }) {
  try {
    const student = await Student.findById(studentId)
      .populate("userId", "firstName lastName email")
      .lean();

    if (!student || !student.userId) return { success: false, reason: "no_user" };

    const user = student.userId;
    const formattedBalance = new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES'
    }).format(balance);

    const isOverdue = daysOverdue > 0;
    const urgency = isOverdue ? "URGENT: " : "";
    const overdueText = isOverdue ? ` (${daysOverdue} days overdue)` : "";

    const message = `${urgency}Payment Reminder: You have an outstanding balance of ${formattedBalance}${overdueText}. Please make payment as soon as possible.`;

    // Create notice
    await Notice.create({
      branchId: student.branchId,
      title: `${urgency}Payment Reminder`,
      message,
      targetAudience: "student",
      targetUsers: [student.userId._id],
      priority: isOverdue ? "urgent" : "high",
      type: "fee",
      metadata: { feeId, studentId, balance, dueDate, daysOverdue },
      isActive: true,
      publishedBy: null,
    });

    // Send email if available
    if (user.email && sendEmail) {
      await sendEmail({
        to: user.email,
        subject: `${urgency}Payment Reminder`,
        html: `<p>Dear ${user.firstName} ${user.lastName},</p>${message}`,
      });
    }

    return { success: true };
  } catch (error) {
    console.error("Error sending payment reminder:", error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  notifyStudentOfInvoice,
  notifyStudentsOfInvoices,
  sendPaymentReminder,
};
