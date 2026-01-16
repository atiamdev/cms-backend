const cron = require("node-cron");
const Fee = require("../models/Fee");
const Student = require("../models/Student");
const pushController = require("../controllers/pushController");
const { storeNotificationAsNotice } = require("../utils/notificationStorage");
const moment = require("moment-timezone");

/**
 * Check for fee payments that are due/overdue and send reminders
 */
async function checkFeeReminders() {
  try {
    console.log("[Fee Reminder] Checking for fee payment reminders...");

    const now = moment().tz("Africa/Nairobi");
    const threeDaysFromNow = moment(now).add(3, "days");

    // Find fees that need reminders
    const fees = await Fee.find({
      status: { $in: ["unpaid", "partially_paid", "overdue"] },
      isInstallmentPlan: false,
      $or: [
        // Due in 3 days (early warning)
        {
          dueDate: {
            $gte: threeDaysFromNow.clone().startOf("day").toDate(),
            $lte: threeDaysFromNow.clone().endOf("day").toDate(),
          },
        },
        // Due today
        {
          dueDate: {
            $gte: now.clone().startOf("day").toDate(),
            $lte: now.clone().endOf("day").toDate(),
          },
        },
        // Overdue (within last 30 days)
        {
          dueDate: {
            $lt: now.clone().startOf("day").toDate(),
            $gte: now.clone().subtract(30, "days").startOf("day").toDate(),
          },
          status: "overdue",
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
      const isOverdue = daysUntilDue < 0;
      const isDueToday = daysUntilDue === 0;

      let title, body, urgency;

      if (isOverdue) {
        const daysOverdue = Math.abs(daysUntilDue);
        title = "⚠️ Fee Payment Overdue";
        body = `Your payment of KES ${fee.balance.toLocaleString()} is ${daysOverdue} day${
          daysOverdue > 1 ? "s" : ""
        } overdue`;
        urgency = "high";
      } else if (isDueToday) {
        title = "📅 Fee Payment Due Today";
        body = `Payment of KES ${fee.balance.toLocaleString()} is due today`;
        urgency = "medium";
      } else {
        title = "📢 Fee Payment Reminder";
        body = `Payment of KES ${fee.balance.toLocaleString()} is due in ${daysUntilDue} days`;
        urgency = "low";
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
          isOverdue: isOverdue,
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
          payload
        );

        console.log(
          `[Fee Reminder] Sent ${urgency} reminder to student ${fee.studentId.userId._id} for fee ${fee._id}`
        );
      } catch (error) {
        console.error(
          `[Fee Reminder] Error sending reminder for fee ${fee._id}:`,
          error
        );
      }
    }

    // Check installment-based fees
    await checkInstallmentReminders(now, threeDaysFromNow);

    console.log("[Fee Reminder] Check complete");
  } catch (error) {
    console.error("[Fee Reminder] Error in checkFeeReminders:", error);
  }
}

/**
 * Check installment-based fees for reminders
 */
async function checkInstallmentReminders(now, threeDaysFromNow) {
  try {
    console.log("[Fee Reminder] Checking installment-based fees...");

    const installmentFees = await Fee.find({
      isInstallmentPlan: true,
      "installmentSchedule.status": { $in: ["pending", "overdue"] },
    }).populate({
      path: "studentId",
      populate: { path: "userId" },
    });

    console.log(
      `[Fee Reminder] Found ${installmentFees.length} installment-based fees`
    );

    for (const fee of installmentFees) {
      if (!fee.studentId || !fee.studentId.userId) {
        continue;
      }

      // Check each installment
      for (const installment of fee.installmentSchedule) {
        if (installment.status === "paid") {
          continue;
        }

        const dueDate = moment(installment.dueDate);
        const daysUntilDue = dueDate.diff(now, "days");
        const isOverdue = daysUntilDue < 0;
        const isDueToday = daysUntilDue === 0;
        const isDueIn3Days = daysUntilDue === 3;

        // Only send reminders for specific milestones
        if (!isOverdue && !isDueToday && !isDueIn3Days) {
          continue;
        }

        const remainingAmount = installment.amount - installment.paidAmount;

        let title, body, urgency;

        if (isOverdue) {
          const daysOverdue = Math.abs(daysUntilDue);
          title = "⚠️ Installment Payment Overdue";
          body = `Installment #${
            installment.installmentNumber
          } of KES ${remainingAmount.toLocaleString()} is ${daysOverdue} day${
            daysOverdue > 1 ? "s" : ""
          } overdue`;
          urgency = "high";
        } else if (isDueToday) {
          title = "📅 Installment Due Today";
          body = `Installment #${
            installment.installmentNumber
          } of KES ${remainingAmount.toLocaleString()} is due today`;
          urgency = "medium";
        } else {
          title = "📢 Installment Payment Reminder";
          body = `Installment #${
            installment.installmentNumber
          } of KES ${remainingAmount.toLocaleString()} is due in 3 days`;
          urgency = "low";
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
            isOverdue: isOverdue,
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
            payload
          );

          console.log(
            `[Fee Reminder] Sent ${urgency} installment reminder to student ${fee.studentId.userId._id} for installment #${installment.installmentNumber}`
          );
        } catch (error) {
          console.error(
            `[Fee Reminder] Error sending installment reminder for fee ${fee._id}:`,
            error
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
      "[Fee Reminder] Running afternoon fee reminder check at 2:00 PM"
    );
    checkFeeReminders();
  });

  console.log(
    "[Fee Reminder] Scheduler initialized - checking at 8:00 AM and 2:00 PM daily"
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
