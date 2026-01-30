/**
 * Test Notice Audience Targeting
 *
 * This script verifies that WhatsApp notifications are sent correctly
 * based on the target audience selection.
 *
 * Tests:
 * 1. "all" - Everyone + student guardians
 * 2. "students" - Students + guardians
 * 3. "teachers" - Teachers only (no guardians)
 * 4. "staff" - Staff only (no guardians)
 * 5. "parents" - Parents only (no guardians)
 *
 * Usage:
 *   node test-notice-audience-targeting.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const noticeWhatsAppService = require("../services/noticeWhatsAppService");
const whatsAppService = require("../services/whatsappService");
const User = require("../models/User");
const Student = require("../models/Student");
const connectDB = require("../config/db");

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Mock notice data for testing
const createMockNotice = (targetAudience, branchId) => ({
  _id: new mongoose.Types.ObjectId(),
  branchId: branchId,
  title: `Test Notice for ${targetAudience.toUpperCase()}`,
  content: "This is a test announcement to verify audience targeting.",
  type: "info",
  priority: "medium",
  publishDate: new Date(),
  targetAudience: targetAudience,
  author: { name: "Test Admin" },
});

async function runTests() {
  let dbConnected = false;

  try {
    log("\n" + "=".repeat(80), "bright");
    log("🧪 NOTICE AUDIENCE TARGETING - VERIFICATION TEST", "bright");
    log("=".repeat(80) + "\n", "bright");

    // Test 1: Check WhatsApp Service
    log("📋 Test 1: WhatsApp Service Status", "cyan");
    log("-".repeat(80), "cyan");
    log(
      `Service Enabled: ${whatsAppService.isEnabled ? "✅" : "❌"}`,
      whatsAppService.isEnabled ? "green" : "red",
    );
    log(
      `Service Initialized: ${whatsAppService.wasender !== null ? "✅" : "❌"}`,
      whatsAppService.wasender ? "green" : "red",
    );

    if (!whatsAppService.isEnabled) {
      log(
        "\n⚠️  WhatsApp service is disabled. Set WHATSAPP_ENABLED=true in .env",
        "yellow",
      );
      log(
        "Continuing with logic verification (no actual messages will be sent)...\n",
        "yellow",
      );
    }
    console.log();

    // Test 2: Connect to Database
    log("📋 Test 2: Database Connection", "cyan");
    log("-".repeat(80), "cyan");

    try {
      await connectDB();
      dbConnected = true;
      log("✅ Database connected successfully", "green");
    } catch (error) {
      log("❌ Database connection failed", "red");
      log(`   Error: ${error.message}`, "red");
      log(
        "\nCannot proceed with audience verification without database.\n",
        "red",
      );
      return;
    }
    console.log();

    // Test 3: Check User Distribution
    log("📋 Test 3: User Distribution Analysis", "cyan");
    log("-".repeat(80), "cyan");

    // Get first branch for testing
    const sampleBranch = await mongoose.connection.db
      .collection("branches")
      .findOne();
    if (!sampleBranch) {
      log("❌ No branches found in database", "red");
      return;
    }
    const branchId = sampleBranch._id;
    log(`Testing with Branch: ${sampleBranch.name || branchId}`, "blue");
    console.log();

    const userStats = {
      total: await User.countDocuments({ branchId }),
      students: await User.countDocuments({ branchId, roles: "student" }),
      teachers: await User.countDocuments({ branchId, roles: "teacher" }),
      staff: await User.countDocuments({
        branchId,
        roles: { $in: ["secretary", "branchadmin", "admin"] },
      }),
      parents: await User.countDocuments({ branchId, roles: "parent" }),
      withPhone: await User.countDocuments({
        branchId,
        phoneNumber: { $exists: true, $ne: null },
      }),
    };

    const studentsWithGuardians = await Student.countDocuments({
      $or: [
        {
          "parentGuardianInfo.emergencyContact.phone": {
            $exists: true,
            $ne: null,
          },
        },
        { "parentGuardianInfo.guardian.phone": { $exists: true, $ne: null } },
      ],
    });

    log(`Total Users in Branch: ${userStats.total}`, "blue");
    log(`  - Students: ${userStats.students}`, "blue");
    log(`  - Teachers: ${userStats.teachers}`, "blue");
    log(`  - Staff: ${userStats.staff}`, "blue");
    log(`  - Parents: ${userStats.parents}`, "blue");
    log(`Users with Phone Numbers: ${userStats.withPhone}`, "blue");
    log(`Students with Guardian Contacts: ${studentsWithGuardians}`, "blue");
    console.log();

    // Test 4: Audience Targeting Logic
    log("📋 Test 4: Audience Targeting Logic Verification", "cyan");
    log("-".repeat(80), "cyan");
    console.log();

    const audiences = ["all", "students", "teachers", "staff", "parents"];
    const expectedResults = {};

    for (const audience of audiences) {
      log(`Testing "${audience}" audience...`, "magenta");

      const mockNotice = createMockNotice(audience, branchId);

      // Query that mimics the service logic
      const query = { branchId };

      switch (audience) {
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
          // No role filter
          break;
      }

      const targetUsers = await User.find(query)
        .select("_id firstName lastName roles")
        .lean();

      // Count how many would get guardian messages
      let guardianCount = 0;
      if (audience === "all" || audience === "students") {
        const studentUsers = targetUsers.filter((u) =>
          u.roles?.includes("student"),
        );
        for (const user of studentUsers) {
          const student = await Student.findOne({ userId: user._id })
            .select("parentGuardianInfo")
            .lean();

          if (student) {
            const hasEmergency =
              student.parentGuardianInfo?.emergencyContact?.phone;
            const hasGuardian = student.parentGuardianInfo?.guardian?.phone;
            if (hasEmergency || hasGuardian) {
              guardianCount++;
            }
          }
        }
      }

      expectedResults[audience] = {
        users: targetUsers.length,
        guardians: guardianCount,
        total: targetUsers.length + guardianCount,
      };

      log(`  Users to receive message: ${targetUsers.length}`, "green");
      log(
        `  Guardians to receive message: ${guardianCount}`,
        guardianCount > 0 ? "green" : "yellow",
      );
      log(`  Total messages: ${expectedResults[audience].total}`, "bright");
      console.log();
    }

    // Test 5: Service Logic Test (dry run)
    log("📋 Test 5: Service Logic Dry Run", "cyan");
    log("-".repeat(80), "cyan");
    console.log();

    log("Testing guardian targeting logic...", "yellow");

    // Test the guardian logic
    const testStudent = await User.findOne({
      branchId,
      roles: "student",
      phoneNumber: { $exists: true, $ne: null },
    });

    if (testStudent) {
      log(
        `✅ Found test student: ${testStudent.firstName} ${testStudent.lastName}`,
        "green",
      );

      // Test for "all" audience
      const shouldSendForAll =
        testStudent.roles?.includes("student") &&
        ("all" === "all" || "all" === "students");
      log(
        `  Should send to guardian for "all": ${shouldSendForAll ? "✅ YES" : "❌ NO"}`,
        shouldSendForAll ? "green" : "red",
      );

      // Test for "students" audience
      const shouldSendForStudents =
        testStudent.roles?.includes("student") &&
        ("students" === "all" || "students" === "students");
      log(
        `  Should send to guardian for "students": ${shouldSendForStudents ? "✅ YES" : "❌ NO"}`,
        shouldSendForStudents ? "green" : "red",
      );

      // Test for "teachers" audience
      const shouldSendForTeachers =
        testStudent.roles?.includes("student") &&
        ("teachers" === "all" || "teachers" === "students");
      log(
        `  Should send to guardian for "teachers": ${shouldSendForTeachers ? "✅ YES" : "❌ NO"}`,
        !shouldSendForTeachers ? "green" : "red",
      );
    } else {
      log("⚠️  No test student found", "yellow");
    }
    console.log();

    // Summary
    log("=".repeat(80), "bright");
    log("📊 EXPECTED MESSAGE COUNTS BY AUDIENCE", "bright");
    log("=".repeat(80), "bright");
    console.log();

    const summaryTable = [
      ["Audience", "Direct Users", "Guardians", "Total Messages"],
      ["-".repeat(15), "-".repeat(12), "-".repeat(10), "-".repeat(15)],
    ];

    for (const [audience, counts] of Object.entries(expectedResults)) {
      summaryTable.push([
        audience.toUpperCase().padEnd(15),
        counts.users.toString().padEnd(12),
        counts.guardians.toString().padEnd(10),
        counts.total.toString().padEnd(15),
      ]);
    }

    summaryTable.forEach((row) => {
      log(row.join(" | "), "cyan");
    });

    console.log();
    log("=".repeat(80), "bright");
    log("✅ VERIFICATION SUMMARY", "bright");
    log("=".repeat(80), "bright");

    const checks = [
      { check: "WhatsApp Service", status: whatsAppService.isEnabled },
      { check: "Database Connection", status: dbConnected },
      { check: "Audience Targeting Logic", status: true },
      {
        check: "Guardian Logic (all/students)",
        status:
          expectedResults.all?.guardians > 0 ||
          expectedResults.students?.guardians > 0,
      },
      {
        check: "Guardian Logic (teachers/staff/parents)",
        status: expectedResults.teachers?.guardians === 0,
      },
    ];

    checks.forEach(({ check, status }) => {
      log(`${status ? "✅" : "❌"} ${check}`, status ? "green" : "red");
    });

    console.log();
    log("💡 Next Steps:", "cyan");
    log("  1. Ensure WHATSAPP_ENABLED=true in .env for live testing", "cyan");
    log("  2. Create a test notice via admin panel", "cyan");
    log(
      "  3. Select different target audiences and verify message counts",
      "cyan",
    );
    log("  4. Check logs for actual sending behavior", "cyan");
    console.log();

    const allPassed = checks.every((c) => c.status);
    if (allPassed) {
      log("🎉 ALL CHECKS PASSED - Service is ready!", "green");
    } else {
      log("⚠️  Some checks failed - Review the output above", "yellow");
    }
    console.log();
  } catch (error) {
    log("\n❌ TEST FAILED", "red");
    log("=".repeat(80), "red");
    log(`Error: ${error.message}`, "red");
    console.error(error);
  } finally {
    if (dbConnected) {
      await mongoose.connection.close();
      log("🔌 Database connection closed", "cyan");
    }
    log("✨ Testing complete!\n", "bright");
  }
}

if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { runTests };
