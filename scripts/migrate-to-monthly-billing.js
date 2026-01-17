const mongoose = require("mongoose");
require("dotenv").config();

/**
 * Migrate students from old one-time fee system to new monthly billing system
 *
 * This script:
 * 1. Preserves payment history (already paid amounts stay recorded)
 * 2. Clears old totalFeeStructure/totalBalance (no longer relevant for monthly billing)
 * 3. Marks students as migrated to monthly billing
 * 4. Future invoices will be generated monthly from Course.feeStructure
 */

async function migrateToMonthlyBilling({
  branchId,
  dryRun = false,
  forceAll = false,
} = {}) {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to database\n");

    const Student = require("../models/Student");
    const Course = require("../models/Course");

    // Build query
    const query = { academicStatus: { $in: ["active", "inactive"] } };
    if (branchId) query.branchId = branchId;

    // Find students with old fee structure (totalFeeStructure > 0)
    if (!forceAll) {
      query["fees.totalFeeStructure"] = { $gt: 0 };
    }

    const students = await Student.find(query);
    console.log(`Found ${students.length} students to migrate\n`);

    const summary = {
      processed: 0,
      migrated: 0,
      skipped: 0,
      errors: 0,
      details: [],
    };

    for (const student of students) {
      try {
        summary.processed++;

        // Check if student has courses
        if (!student.courses || student.courses.length === 0) {
          summary.skipped++;
          console.log(
            `⚠️  ${student.studentId}: No courses enrolled, skipping`
          );
          continue;
        }

        // Check if courses have monthly billing
        const courses = await Course.find({
          _id: { $in: student.courses },
          "feeStructure.billingFrequency": { $exists: true },
        });

        const monthlyBillingCourses = courses.filter((c) =>
          ["monthly", "weekly", "quarterly", "annual"].includes(
            c.feeStructure?.billingFrequency
          )
        );

        if (monthlyBillingCourses.length === 0) {
          summary.skipped++;
          console.log(
            `⚠️  ${student.studentId}: No courses with periodic billing, skipping`
          );
          continue;
        }

        // Prepare migration
        const oldFee = student.fees?.totalFeeStructure || 0;
        const paidAmount = student.fees?.totalPaid || 0;
        const oldBalance = student.fees?.totalBalance || 0;

        console.log(
          `\n📝 ${student.studentId} - ${student.firstName} ${student.lastName}`
        );
        console.log(`   Old Fee Structure: ${oldFee} KES`);
        console.log(`   Already Paid: ${paidAmount} KES`);
        console.log(`   Old Balance: ${oldBalance} KES`);
        console.log(
          `   Courses with periodic billing: ${monthlyBillingCourses.length}`
        );

        for (const course of monthlyBillingCourses) {
          console.log(
            `     - ${course.courseName}: ${course.feeStructure?.billingFrequency} (${course.feeStructure?.perPeriodAmount} KES/${course.feeStructure?.billingFrequency})`
          );
        }

        if (!dryRun) {
          // Update student: Clear old fee structure but preserve payment history
          await Student.findByIdAndUpdate(student._id, {
            $set: {
              // Clear old fee structure
              "fees.totalFeeStructure": 0,
              "fees.totalBalance": 0,
              "fees.feeStatus": "paid", // Mark as paid since we're moving to monthly billing

              // Keep payment history - it's valuable for records
              // "fees.paymentHistory" stays as is

              // Clear old installment plan (monthly invoices replace this)
              "fees.installmentPlan.enabled": false,
              "fees.installmentPlan.schedule": [],

              // Add migration marker
              "fees.migratedToMonthlyBilling": true,
              "fees.migrationDate": new Date(),
              "fees.preMigrationBalance": oldBalance, // Store for reference
              "fees.preMigrationTotalPaid": paidAmount,
            },
          });

          summary.migrated++;
          console.log(`   ✅ Migrated to monthly billing system`);

          summary.details.push({
            studentId: student.studentId,
            studentName: `${student.firstName} ${student.lastName}`,
            oldFee,
            paidAmount,
            oldBalance,
            coursesWithBilling: monthlyBillingCourses.length,
            status: "migrated",
          });
        } else {
          console.log(`   🔍 [DRY RUN] Would migrate to monthly billing`);
          summary.details.push({
            studentId: student.studentId,
            studentName: `${student.firstName} ${student.lastName}`,
            oldFee,
            paidAmount,
            oldBalance,
            coursesWithBilling: monthlyBillingCourses.length,
            status: "dry-run",
          });
        }
      } catch (err) {
        summary.errors++;
        console.error(`❌ Error processing ${student.studentId}:`, err.message);
        summary.details.push({
          studentId: student.studentId,
          error: err.message,
          status: "error",
        });
      }
    }

    console.log("\n" + "=".repeat(70));
    console.log("MIGRATION SUMMARY");
    console.log("=".repeat(70));
    console.log(`Total Processed: ${summary.processed}`);
    console.log(`Successfully Migrated: ${summary.migrated}`);
    console.log(`Skipped: ${summary.skipped}`);
    console.log(`Errors: ${summary.errors}`);

    if (dryRun) {
      console.log("\n⚠️  DRY RUN MODE - No changes were made");
      console.log("Run with --execute flag to apply changes");
    } else {
      console.log("\n✅ Migration complete!");
      console.log("\nNext Steps:");
      console.log(
        "1. Monthly invoices will be generated automatically by cron jobs"
      );
      console.log(
        "2. Run backfill script if you need invoices for current/past months:"
      );
      console.log(
        "   node scripts/backfill-monthly-invoices.js --from=2026-01 --to=2026-01 --force"
      );
      console.log(
        "3. Old payment history is preserved in student.fees.paymentHistory"
      );
    }

    await mongoose.connection.close();
    return summary;
  } catch (err) {
    console.error("Migration failed:", err);
    throw err;
  }
}

// CLI
if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    const options = {
      dryRun: !args.includes("--execute"),
      forceAll: args.includes("--all"),
      branchId: args.find((a) => a.startsWith("--branchId="))?.split("=")[1],
    };

    if (args.includes("--help")) {
      console.log(`
Migration Script: Old Fee System → Monthly Billing System

Usage:
  node migrate-to-monthly-billing.js [options]

Options:
  --execute          Actually perform migration (without this, runs in dry-run mode)
  --all              Migrate all students (even those without old fee structure)
  --branchId=ID      Only migrate students from specific branch
  --help             Show this help

Examples:
  # Preview migration (dry run)
  node migrate-to-monthly-billing.js

  # Execute migration for all students with old fees
  node migrate-to-monthly-billing.js --execute

  # Execute for specific branch
  node migrate-to-monthly-billing.js --execute --branchId=688a1618d2efc2d48aad4cc7

What This Does:
  ✅ Preserves all payment history (student.fees.paymentHistory)
  ✅ Clears old totalFeeStructure and totalBalance (no longer used)
  ✅ Disables old installment plans (replaced by monthly invoices)
  ✅ Marks students as migrated (fees.migratedToMonthlyBilling = true)
  ✅ Future invoices generated from Course.feeStructure monthly/weekly/etc

What This Does NOT Do:
  ❌ Does not delete payment records
  ❌ Does not modify courses
  ❌ Does not create new invoices (use backfill script for that)
      `);
      process.exit(0);
    }

    console.log("=".repeat(70));
    console.log("MIGRATE TO MONTHLY BILLING SYSTEM");
    console.log("=".repeat(70));
    console.log(
      `Mode: ${
        options.dryRun
          ? "DRY RUN (preview only)"
          : "EXECUTE (will make changes)"
      }`
    );
    console.log(`Branch Filter: ${options.branchId || "All branches"}`);
    console.log(
      `Force All: ${
        options.forceAll ? "Yes" : "No (only students with old fees)"
      }`
    );
    console.log("=".repeat(70) + "\n");

    await migrateToMonthlyBilling(options);
    process.exit(0);
  })();
}

module.exports = { migrateToMonthlyBilling };
