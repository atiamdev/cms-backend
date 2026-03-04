/**
 * Invoice Payment Reminder Service
 *
 * This service manages payment reminders for student invoices.
 * It checks for invoices with incomplete payment status (paymentStatus != "completed")
 * and sends reminders via:
 * - WhatsApp (bilingual: English/Somali) to student and emergency contact
 * - Push notifications to student's account
 * - In-app notices
 *
 * Reminder Schedule:
 * - 5 days before due date: Early warning (low urgency)
 * - 1 day before due date: Final notice (high urgency)
 *
 * Scheduling is managed centrally in scheduledJobs.js:
 * - Morning run: 8:00 AM daily (Africa/Nairobi timezone)
 * - Afternoon run: 2:00 PM daily (Africa/Nairobi timezone)
 */

const cron = require("node-cron");
const Fee = require("../models/Fee");
const Student = require("../models/Student");
const pushController = require("../controllers/pushController");
const { storeNotificationAsNotice } = require("../utils/notificationStorage");
const moment = require("moment-timezone");
const WhatsAppNotificationService = require("./whatsappNotificationService");

// Initialize WhatsApp notification service
const whatsappNotificationService = new WhatsAppNotificationService();

/**
 * Check for invoices that need payment reminders
 *
 * This function checks for invoices with incomplete payment status and sends reminders
 * when the due date is exactly 5 days away (early warning) or 1 day away (final notice).
 */
async function checkFeeReminders() {
  try {
    console.log("[Fee Reminder] Checking for invoice payment reminders...");

    const now = moment().tz("Africa/Nairobi");
    const fiveDaysFromNow = moment(now).add(5, "days");
    const oneDayFromNow = moment(now).add(1, "days");

    // Find invoices that need reminders (payment not completed)
    const fees = await Fee.find({
      paymentStatus: { $ne: "completed" },
      $or: [
        // Due in 5 days (early warning)
        {
          dueDate: {
            $gte: fiveDaysFromNow.clone().startOf("day").toDate(),
            $lte: fiveDaysFromNow.clone().endOf("day").toDate(),
          },
        },
        // Due in 1 day (final notice)
        {
          dueDate: {
            $gte: oneDayFromNow.clone().startOf("day").toDate(),
            $lte: oneDayFromNow.clone().endOf("day").toDate(),
          },
        },
      ],
    }).populate({
      path: "studentId",
      populate: { path: "userId" },
    });

    console.log(
      `[Fee Reminder] Found ${fees.length} invoices requiring reminders`,
    );

    for (const fee of fees) {
      if (!fee.studentId || !fee.studentId.userId) {
        continue;
      }

      const dueDate = moment(fee.dueDate);
      const daysUntilDue = dueDate.diff(now, "days");

      // Only process 5-day and 1-day reminders
      if (daysUntilDue !== 5 && daysUntilDue !== 1) {
        continue;
      }

      const studentData = await Student.findById(fee.studentId._id);
      if (!studentData) {
        console.log(
          `[Fee Reminder] Student data not found for invoice ${fee._id}`,
        );
        continue;
      }

      const reminderData = {
        studentName: `${studentData.firstName} ${studentData.lastName}`,
        regNumber: studentData.regNumber || studentData.studentId,
        dueDate: fee.dueDate,
        amount: fee.balance,
        invoiceNumber: fee.invoiceNumber || fee._id.toString().slice(-8),
      };

      let title, body, urgency;

      if (daysUntilDue === 5) {
        title = "📢 Invoice Payment Reminder";
        body = `Your invoice of KES ${fee.balance.toLocaleString()} is due in 5 days. Please pay before ${dueDate.format("DD-MM-YYYY")}`;
        urgency = "low";

        // Send WhatsApp to student
        if (studentData.phone) {
          try {
            await whatsappNotificationService.sendFiveDayFeeReminder(
              { ...reminderData, recipientType: "student" },
              studentData.phone,
            );
          } catch (error) {
            console.error(
              `[Fee Reminder] WhatsApp error (student) for invoice ${fee._id}:`,
              error,
            );
          }
        }

        // Send WhatsApp to emergency contact
        if (
          studentData.emergencyContact &&
          studentData.emergencyContact.phone
        ) {
          try {
            await whatsappNotificationService.sendFiveDayFeeReminder(
              { ...reminderData, recipientType: "emergency_contact" },
              studentData.emergencyContact.phone,
            );
          } catch (error) {
            console.error(
              `[Fee Reminder] WhatsApp error (emergency) for invoice ${fee._id}:`,
              error,
            );
          }
        }
      } else if (daysUntilDue === 1) {
        title = "⚠️ FINAL NOTICE: Invoice Due Tomorrow";
        body = `FINAL NOTICE: Your invoice of KES ${fee.balance.toLocaleString()} is due tomorrow, ${dueDate.format("DD-MM-YYYY")}. Unpaid accounts will be locked out.`;
        urgency = "high";

        // Send WhatsApp to student
        if (studentData.phone) {
          try {
            await whatsappNotificationService.sendOneDayFeeReminder(
              { ...reminderData, recipientType: "student" },
              studentData.phone,
            );
          } catch (error) {
            console.error(
              `[Fee Reminder] WhatsApp error (student) for invoice ${fee._id}:`,
              error,
            );
          }
        }

        // Send WhatsApp to emergency contact
        if (
          studentData.emergencyContact &&
          studentData.emergencyContact.phone
        ) {
          try {
            await whatsappNotificationService.sendOneDayFeeReminder(
              { ...reminderData, recipientType: "emergency_contact" },
              studentData.emergencyContact.phone,
            );
          } catch (error) {
            console.error(
              `[Fee Reminder] WhatsApp error (emergency) for invoice ${fee._id}:`,
              error,
            );
          }
        }
      }

      try {
        const payload = {
          title: title,
          body: body,
          icon: "/logo.png",
          tag: `invoice-reminder-${fee._id}`,
          type: "invoice-reminder",
          feeId: fee._id.toString(),
          amount: fee.balance,
          dueDate: dueDate.format("YYYY-MM-DD"),
          urgency: urgency,
          url: "/student/fees",
        };

        // Store as notice
        await storeNotificationAsNotice({
          userIds: [fee.studentId.userId._id],
          title: payload.title,
          content: payload.body,
          type: "fee_reminder",
          priority: urgency === "high" ? "high" : "medium",
          branchId: fee.studentId.branchId,
          targetAudience: "students",
        });

        await pushController.sendNotification(
          [fee.studentId.userId._id],
          payload,
        );

        console.log(
          `[Fee Reminder] Sent ${urgency} reminder to student ${fee.studentId.userId._id} for invoice ${fee._id}`,
        );
      } catch (error) {
        console.error(
          `[Fee Reminder] Error sending reminder for invoice ${fee._id}:`,
          error,
        );
      }
    }

    console.log("[Fee Reminder] Check complete");
  } catch (error) {
    console.error("[Fee Reminder] Error in checkFeeReminders:", error);
  }
}

/**
 * Initialize the fee reminder scheduler
 *
 * NOTE: This function is now deprecated. Fee reminder scheduling is managed
 * centrally in scheduledJobs.js for better monitoring and health tracking.
 * This function is kept for backward compatibility but should not be called.
 *
 * Runs daily at 8:00 AM and 2:00 PM to check for invoice reminders
 */
function initializeFeeReminderScheduler() {
  console.log(
    "[Fee Reminder] WARNING: initializeFeeReminderScheduler is deprecated.",
  );
  console.log("[Fee Reminder] Scheduling is now managed in scheduledJobs.js");
  console.log("[Fee Reminder] This function call has no effect.");

  // Function kept for backward compatibility but does nothing
  // Actual scheduling happens in scheduledJobs.js
}

module.exports = {
  initializeFeeReminderScheduler,
  checkFeeReminders,
};
