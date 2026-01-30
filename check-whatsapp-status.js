/**
 * Quick Check: WhatsApp Preferences Status
 *
 * This script quickly shows the current WhatsApp preferences
 * status across all users in the database.
 *
 * Usage:
 *   node check-whatsapp-status.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./models/User");
const connectDB = require("./config/db");

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function checkStatus() {
  try {
    log("\n" + "=".repeat(70), "bright");
    log("📊 WhatsApp Preferences Status Report", "bright");
    log("=".repeat(70) + "\n", "bright");

    await connectDB();

    const totalUsers = await User.countDocuments();

    // Count users with disabled preferences
    const stats = {
      total: totalUsers,
      missingPrefs: await User.countDocuments({
        "profileDetails.whatsappNotifications": { $exists: false },
      }),
      disabledMaster: await User.countDocuments({
        "profileDetails.whatsappNotifications.enabled": false,
      }),
      disabledInvoices: await User.countDocuments({
        "profileDetails.whatsappNotifications.invoiceNotifications": false,
      }),
      disabledAttendance: await User.countDocuments({
        "profileDetails.whatsappNotifications.attendanceReports": false,
      }),
      disabledNotices: await User.countDocuments({
        "profileDetails.whatsappNotifications.noticeAlerts": false,
      }),
    };

    // Calculate enabled
    stats.fullyEnabled =
      totalUsers -
      (stats.missingPrefs +
        stats.disabledMaster +
        stats.disabledInvoices +
        stats.disabledAttendance +
        stats.disabledNotices);

    log("📈 Overall Statistics:", "cyan");
    log("-".repeat(70), "cyan");
    log(`Total users: ${stats.total}`, "blue");
    log(
      `Users with missing preferences: ${stats.missingPrefs}`,
      stats.missingPrefs > 0 ? "red" : "green",
    );
    log(
      `Users with master switch OFF: ${stats.disabledMaster}`,
      stats.disabledMaster > 0 ? "red" : "green",
    );
    log(
      `Users with invoices OFF: ${stats.disabledInvoices}`,
      stats.disabledInvoices > 0 ? "red" : "green",
    );
    log(
      `Users with attendance OFF: ${stats.disabledAttendance}`,
      stats.disabledAttendance > 0 ? "red" : "green",
    );
    log(
      `Users with notices OFF: ${stats.disabledNotices}`,
      stats.disabledNotices > 0 ? "red" : "green",
    );

    const allEnabled =
      stats.missingPrefs === 0 &&
      stats.disabledMaster === 0 &&
      stats.disabledInvoices === 0 &&
      stats.disabledAttendance === 0 &&
      stats.disabledNotices === 0;

    log("\n" + "=".repeat(70), "bright");
    if (allEnabled) {
      log("✅ STATUS: ALL USERS HAVE WHATSAPP ENABLED", "green");
    } else {
      log("⚠️  STATUS: SOME USERS HAVE WHATSAPP DISABLED", "yellow");
      log("\nTo enable for all users, run:", "cyan");
      log("  node migrations/enable-whatsapp-for-all-users.js", "cyan");
    }
    log("=".repeat(70) + "\n", "bright");

    // Show sample users with disabled preferences
    if (!allEnabled) {
      log("📋 Sample users with disabled preferences:", "cyan");
      log("-".repeat(70), "cyan");

      const disabledUsers = await User.find({
        $or: [
          { "profileDetails.whatsappNotifications": { $exists: false } },
          { "profileDetails.whatsappNotifications.enabled": false },
          {
            "profileDetails.whatsappNotifications.invoiceNotifications": false,
          },
          { "profileDetails.whatsappNotifications.attendanceReports": false },
          { "profileDetails.whatsappNotifications.noticeAlerts": false },
        ],
      })
        .select("firstName lastName profileDetails.whatsappNotifications")
        .limit(10);

      disabledUsers.forEach((user, index) => {
        const prefs = user.profileDetails?.whatsappNotifications;
        log(`\n${index + 1}. ${user.firstName} ${user.lastName}`, "yellow");
        log(
          `   Master: ${prefs?.enabled !== false ? "✅" : "❌"}`,
          prefs?.enabled !== false ? "green" : "red",
        );
        log(
          `   Invoices: ${prefs?.invoiceNotifications !== false ? "✅" : "❌"}`,
          prefs?.invoiceNotifications !== false ? "green" : "red",
        );
        log(
          `   Attendance: ${prefs?.attendanceReports !== false ? "✅" : "❌"}`,
          prefs?.attendanceReports !== false ? "green" : "red",
        );
        log(
          `   Notices: ${prefs?.noticeAlerts !== false ? "✅" : "❌"}`,
          prefs?.noticeAlerts !== false ? "green" : "red",
        );
      });
      console.log();
    }

    await mongoose.connection.close();
  } catch (error) {
    log("\n❌ Error checking status:", "red");
    log(error.message, "red");
    console.error(error);
    process.exit(1);
  }
}

if (require.main === module) {
  checkStatus().catch(console.error);
}

module.exports = { checkStatus };
