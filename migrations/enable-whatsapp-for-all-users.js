/**
 * Migration Script: Enable WhatsApp Notifications for All Users
 *
 * This script ensures that ALL users have WhatsApp notifications enabled
 * by default for all notification types (invoices, attendance, notices).
 *
 * It updates:
 * - Users with missing whatsappNotifications object
 * - Users with any disabled notification preferences
 * - Sets all preferences to true (enabled)
 *
 * Usage:
 *   node migrations/enable-whatsapp-for-all-users.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");
const connectDB = require("../config/db");

// Color codes for console output
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

async function runMigration() {
  try {
    log("\n" + "=".repeat(70), "bright");
    log("🔄 MIGRATION: Enable WhatsApp Notifications for All Users", "bright");
    log("=".repeat(70) + "\n", "bright");

    // Connect to database
    log("📡 Connecting to database...", "cyan");
    await connectDB();
    log("✅ Database connected successfully\n", "green");

    // Step 1: Check current state
    log("📊 Step 1: Analyzing current user preferences...", "cyan");
    log("-".repeat(70), "cyan");

    const totalUsers = await User.countDocuments();
    log(`Total users in database: ${totalUsers}`, "blue");

    // Users with missing whatsappNotifications object
    const usersWithoutPrefs = await User.countDocuments({
      "profileDetails.whatsappNotifications": { $exists: false },
    });
    log(`Users without WhatsApp preferences: ${usersWithoutPrefs}`, "yellow");

    // Users with disabled master switch
    const usersWithDisabledMaster = await User.countDocuments({
      "profileDetails.whatsappNotifications.enabled": false,
    });
    log(
      `Users with WhatsApp disabled (master): ${usersWithDisabledMaster}`,
      "yellow",
    );

    // Users with disabled invoice notifications
    const usersWithDisabledInvoices = await User.countDocuments({
      "profileDetails.whatsappNotifications.invoiceNotifications": false,
    });
    log(
      `Users with invoice notifications disabled: ${usersWithDisabledInvoices}`,
      "yellow",
    );

    // Users with disabled attendance reports
    const usersWithDisabledAttendance = await User.countDocuments({
      "profileDetails.whatsappNotifications.attendanceReports": false,
    });
    log(
      `Users with attendance reports disabled: ${usersWithDisabledAttendance}`,
      "yellow",
    );

    // Users with disabled notice alerts
    const usersWithDisabledNotices = await User.countDocuments({
      "profileDetails.whatsappNotifications.noticeAlerts": false,
    });
    log(
      `Users with notice alerts disabled: ${usersWithDisabledNotices}`,
      "yellow",
    );

    const totalToUpdate =
      usersWithoutPrefs +
      usersWithDisabledMaster +
      usersWithDisabledInvoices +
      usersWithDisabledAttendance +
      usersWithDisabledNotices;

    log(`\n📈 Total users needing updates: ${totalToUpdate}`, "bright");

    if (totalToUpdate === 0) {
      log(
        "\n✅ All users already have WhatsApp notifications enabled!",
        "green",
      );
      log("No migration needed.\n", "green");
      await mongoose.connection.close();
      return;
    }

    // Step 2: Confirm migration
    log("\n⚠️  Step 2: Migration Confirmation", "yellow");
    log("-".repeat(70), "yellow");
    log("This will enable WhatsApp notifications for ALL users.", "yellow");
    log("Continuing in 3 seconds... (Ctrl+C to cancel)", "yellow");

    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Step 3: Perform migration
    log("\n🔧 Step 3: Updating user preferences...", "cyan");
    log("-".repeat(70), "cyan");

    // Update all users: set all WhatsApp preferences to true
    const result = await User.updateMany(
      {}, // All users
      {
        $set: {
          "profileDetails.whatsappNotifications.enabled": true,
          "profileDetails.whatsappNotifications.invoiceNotifications": true,
          "profileDetails.whatsappNotifications.attendanceReports": true,
          "profileDetails.whatsappNotifications.noticeAlerts": true,
        },
      },
    );

    log(`✅ Migration completed successfully!`, "green");
    log(`   - Documents matched: ${result.matchedCount}`, "green");
    log(`   - Documents modified: ${result.modifiedCount}`, "green");

    // Step 4: Verify results
    log("\n🔍 Step 4: Verifying migration results...", "cyan");
    log("-".repeat(70), "cyan");

    const verifyDisabledMaster = await User.countDocuments({
      "profileDetails.whatsappNotifications.enabled": false,
    });
    const verifyDisabledInvoices = await User.countDocuments({
      "profileDetails.whatsappNotifications.invoiceNotifications": false,
    });
    const verifyDisabledAttendance = await User.countDocuments({
      "profileDetails.whatsappNotifications.attendanceReports": false,
    });
    const verifyDisabledNotices = await User.countDocuments({
      "profileDetails.whatsappNotifications.noticeAlerts": false,
    });

    const allEnabled =
      verifyDisabledMaster === 0 &&
      verifyDisabledInvoices === 0 &&
      verifyDisabledAttendance === 0 &&
      verifyDisabledNotices === 0;

    if (allEnabled) {
      log(
        "✅ Verification successful! All users have WhatsApp enabled.",
        "green",
      );
      log(`   - Master switch disabled: ${verifyDisabledMaster}`, "green");
      log(
        `   - Invoice notifications disabled: ${verifyDisabledInvoices}`,
        "green",
      );
      log(
        `   - Attendance reports disabled: ${verifyDisabledAttendance}`,
        "green",
      );
      log(`   - Notice alerts disabled: ${verifyDisabledNotices}`, "green");
    } else {
      log("⚠️  Warning: Some users still have disabled preferences:", "yellow");
      log(`   - Master switch disabled: ${verifyDisabledMaster}`, "yellow");
      log(
        `   - Invoice notifications disabled: ${verifyDisabledInvoices}`,
        "yellow",
      );
      log(
        `   - Attendance reports disabled: ${verifyDisabledAttendance}`,
        "yellow",
      );
      log(`   - Notice alerts disabled: ${verifyDisabledNotices}`, "yellow");
    }

    // Step 5: Sample verification
    log("\n📋 Step 5: Sample user verification...", "cyan");
    log("-".repeat(70), "cyan");

    const sampleUsers = await User.find({})
      .select("firstName lastName profileDetails.whatsappNotifications")
      .limit(5);

    sampleUsers.forEach((user, index) => {
      const prefs = user.profileDetails?.whatsappNotifications;
      log(`\n${index + 1}. ${user.firstName} ${user.lastName}:`, "blue");
      log(`   - Enabled: ${prefs?.enabled}`, prefs?.enabled ? "green" : "red");
      log(
        `   - Invoices: ${prefs?.invoiceNotifications}`,
        prefs?.invoiceNotifications ? "green" : "red",
      );
      log(
        `   - Attendance: ${prefs?.attendanceReports}`,
        prefs?.attendanceReports ? "green" : "red",
      );
      log(
        `   - Notices: ${prefs?.noticeAlerts}`,
        prefs?.noticeAlerts ? "green" : "red",
      );
    });

    // Summary
    log("\n" + "=".repeat(70), "bright");
    log("✅ MIGRATION SUMMARY", "bright");
    log("=".repeat(70), "bright");
    log(`Total users in database: ${totalUsers}`, "green");
    log(`Users updated: ${result.modifiedCount}`, "green");
    log(`All users now have WhatsApp notifications ENABLED`, "green");
    log(
      "\n💡 Note: Users can still opt-out through their profile settings if needed.\n",
      "cyan",
    );
  } catch (error) {
    log("\n❌ MIGRATION FAILED", "red");
    log("=".repeat(70), "red");
    log(`Error: ${error.message}`, "red");
    console.error(error);
    process.exit(1);
  } finally {
    // Close database connection
    await mongoose.connection.close();
    log("🔌 Database connection closed", "cyan");
    log("✨ Migration script completed!\n", "bright");
  }
}

// Run migration
if (require.main === module) {
  runMigration().catch(console.error);
}

module.exports = { runMigration };
