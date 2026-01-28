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
 * Check for fee payments that are due/overdue and send reminders
 */
async function checkFeeReminders() {
  try {
    console.log("[Fee Reminder] Checking for fee payment reminders...");

    const now = moment().tz("Africa/Nairobi");
    const fiveDaysFromNow = moment(now).add(5, "days");
    const oneDayFromNow = moment(now).add(1, "days");

    // Find fees that need reminders
    const fees = await Fee.find({
      status: { $in: ["unpaid", "partially_paid", "overdue"] },
      isInstallmentPlan: false,
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

    console.log(`[Fee Reminder] Found ${fees.length} fees requiring reminders`);

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
        console.log(`[Fee Reminder] Student data not found for fee ${fee._id}`);
        continue;
      }

      const reminderData = {
        studentName: `${studentData.firstName} ${studentData.lastName}`,
        regNumber: studentData.regNumber || studentData.studentId,
        dueDate: fee.dueDate,
      };

      let title, body, urgency;

      if (daysUntilDue === 5) {
        title = "📢 Fee Payment Reminder";
        body = `Your payment is due in 5 days. Please pay before ${dueDate.format("DD-MM-YYYY")}`;
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
              `[Fee Reminder] WhatsApp error (student) for fee ${fee._id}:`,
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
              `[Fee Reminder] WhatsApp error (emergency) for fee ${fee._id}:`,
              error,
            );
          }
        }
      } else if (daysUntilDue === 1) {
        title = "⚠️ FINAL NOTICE: Fee Due Tomorrow";
        body = `FINAL NOTICE: Your payment is due tomorrow, ${dueDate.format("DD-MM-YYYY")}. Unpaid accounts will be locked out.`;
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
              `[Fee Reminder] WhatsApp error (student) for fee ${fee._id}:`,
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
              `[Fee Reminder] WhatsApp error (emergency) for fee ${fee._id}:`,
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
          tag: `fee-reminder-${fee._id}`,
          type: "fee-reminder",
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
          `[Fee Reminder] Sent ${urgency} reminder to student ${fee.studentId.userId._id} for fee ${fee._id}`,
        );
      } catch (error) {
        console.error(
          `[Fee Reminder] Error sending reminder for fee ${fee._id}:`,
          error,
        );
      }
    }

    // Check installment-based fees
    await checkInstallmentReminders(now, fiveDaysFromNow);

    console.log("[Fee Reminder] Check complete");
  } catch (error) {
    console.error("[Fee Reminder] Error in checkFeeReminders:", error);
  }
}

/**
 * Check installment-based fees for reminders
 */
async function checkInstallmentReminders(now, fiveDaysFromNow) {
  try {
    console.log("[Fee Reminder] Checking installment-based fees...");

    const oneDayFromNow = moment(now).add(1, "days");

    const installmentFees = await Fee.find({
      isInstallmentPlan: true,
      "installmentSchedule.status": { $in: ["pending", "overdue"] },
    }).populate({
      path: "studentId",
      populate: { path: "userId" },
    });

    console.log(
      `[Fee Reminder] Found ${installmentFees.length} installment-based fees`,
    );

    for (const fee of installmentFees) {
      if (!fee.studentId || !fee.studentId.userId) {
        continue;
      }

      const studentData = await Student.findById(fee.studentId._id);
      if (!studentData) {
        console.log(`[Fee Reminder] Student data not found for fee ${fee._id}`);
        continue;
      }

      // Check each installment
      for (const installment of fee.installmentSchedule) {
        if (installment.status === "paid") {
          continue;
        }

        const dueDate = moment(installment.dueDate);
        const daysUntilDue = dueDate.diff(now, "days");
        const isDueIn5Days = daysUntilDue === 5;
        const isDueIn1Day = daysUntilDue === 1;

        // Only send reminders for 5-day and 1-day milestones
        if (!isDueIn5Days && !isDueIn1Day) {
          continue;
        }

        const remainingAmount = installment.amount - installment.paidAmount;
        const reminderData = {
          studentName: `${studentData.firstName} ${studentData.lastName}`,
          regNumber: studentData.regNumber || studentData.studentId,
          dueDate: installment.dueDate,
        };

        let title, body, urgency;

        if (isDueIn5Days) {
          title = "📢 Installment Payment Reminder";
          body = `Installment #${
            installment.installmentNumber
          } of KES ${remainingAmount.toLocaleString()} is due in 5 days`;
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
                `[Fee Reminder] WhatsApp error (student) for installment ${installment.installmentNumber}:`,
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
                `[Fee Reminder] WhatsApp error (emergency) for installment ${installment.installmentNumber}:`,
                error,
              );
            }
          }
        } else if (isDueIn1Day) {
          title = "⚠️ FINAL NOTICE: Installment Due Tomorrow";
          body = `FINAL NOTICE: Installment #${
            installment.installmentNumber
          } of KES ${remainingAmount.toLocaleString()} is due tomorrow`;
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
                `[Fee Reminder] WhatsApp error (student) for installment ${installment.installmentNumber}:`,
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
                `[Fee Reminder] WhatsApp error (emergency) for installment ${installment.installmentNumber}:`,
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
            tag: `installment-reminder-${fee._id}-${installment.installmentNumber}`,
            type: "installment-reminder",
            feeId: fee._id.toString(),
            installmentNumber: installment.installmentNumber,
            amount: remainingAmount,
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
            `[Fee Reminder] Sent ${urgency} installment reminder to student ${fee.studentId.userId._id} for installment #${installment.installmentNumber}`,
          );
        } catch (error) {
          console.error(
            `[Fee Reminder] Error sending installment reminder for fee ${fee._id}:`,
            error,
          );
        }
      }
    }
  } catch (error) {
    console.error("[Fee Reminder] Error in checkInstallmentReminders:", error);
  }
}

/**
 * Initialize the fee reminder scheduler
 * Runs daily at 8:00 AM to check for fee reminders
 */
function initializeFeeReminderScheduler() {
  console.log("[Fee Reminder] Initializing fee reminder scheduler...");

  // Run daily at 8:00 AM
  cron.schedule("0 8 * * *", () => {
    console.log("[Fee Reminder] Running daily fee reminder check at 8:00 AM");
    checkFeeReminders();
  });

  // Also run at 2:00 PM for overdue reminders
  cron.schedule("0 14 * * *", () => {
    console.log(
      "[Fee Reminder] Running afternoon fee reminder check at 2:00 PM",
    );
    checkFeeReminders();
  });

  console.log(
    "[Fee Reminder] Scheduler initialized - checking at 8:00 AM and 2:00 PM daily",
  );

  // Run once on startup (after 1 minute)
  setTimeout(() => {
    console.log("[Fee Reminder] Running initial fee reminder check...");
    checkFeeReminders();
  }, 60000);
}

module.exports = {
  initializeFeeReminderScheduler,
  checkFeeReminders,
};
