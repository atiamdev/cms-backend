#!/usr/bin/env node
/**
 * Migration script: migrate invoice-level registration discounts (discountAmount)
 * to scholarshipAmount where appropriate.
 *
 * Usage:
 *   node migrate-discounts-to-scholarships.js        # dry-run (no changes)
 *   node migrate-discounts-to-scholarships.js --apply  # apply changes
 */

const fs = require("fs");
const path = require("path");
const connectDB = require("../config/db");
const mongoose = require("mongoose");

(async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`Migration started (${apply ? "APPLY" : "DRY-RUN"})`);

  await connectDB();

  const Fee = require("../models/Fee");
  const Student = require("../models/Student");
  const Scholarship = require("../models/Scholarship");

  try {
    // Find invoices that look like registration-level discounts
    const invoices = await Fee.find({
      discountAmount: { $gt: 0 },
      amountPaid: 0,
    }).lean();

    console.log(
      `Found ${invoices.length} invoices with discountAmount > 0 and amountPaid == 0`
    );

    const report = [];
    let migrateCount = 0;
    let totalMigrated = 0;

    for (const inv of invoices) {
      const discountPct =
        inv.totalAmountDue > 0
          ? Math.round((inv.discountAmount / inv.totalAmountDue) * 100)
          : null;
      const student = inv.studentId
        ? await Student.findById(inv.studentId).select("scholarshipPercentage")
        : null;
      const studentPct = student ? student.scholarshipPercentage : null;

      // Check if student already has matching scholarship percentage OR invoice metadata flags it
      const likelyRegistrationDiscount =
        (discountPct !== null &&
          studentPct !== null &&
          discountPct === Math.round(studentPct)) ||
        (inv.metadata && inv.metadata.isRegistrationDiscount);

      const item = {
        invoiceId: inv._id.toString(),
        studentId: inv.studentId ? inv.studentId.toString() : null,
        totalAmountDue: inv.totalAmountDue,
        discountAmount: inv.discountAmount,
        computedDiscountPct: discountPct,
        studentScholarshipPct: studentPct,
        metadataFlagged:
          inv.metadata && inv.metadata.isRegistrationDiscount ? true : false,
        action: likelyRegistrationDiscount ? "WILL_MIGRATE" : "SKIP_REVIEW",
      };

      if (likelyRegistrationDiscount && apply) {
        // Migrate: move discountAmount into scholarshipAmount and clear discountAmount
        const feeDoc = await Fee.findById(inv._id);
        feeDoc.scholarshipAmount =
          (feeDoc.scholarshipAmount || 0) + feeDoc.discountAmount;
        totalMigrated += feeDoc.discountAmount;
        feeDoc.discountAmount = 0;
        await feeDoc.save();
        migrateCount++;
        item.action = "MIGRATED";
      }

      report.push(item);
    }

    const out = {
      date: new Date().toISOString(),
      apply,
      invoiceCount: invoices.length,
      migrateCount,
      totalMigrated,
      items: report,
    };

    const outPath = path.join(__dirname, "migrate-discounts-report.json");
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

    console.log(`Report written to ${outPath}`);
    console.log(
      `To apply changes re-run with --apply. This run would have migrated ${migrateCount} invoices (total KSh ${totalMigrated})`
    );

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("Migration error:", error);
    await mongoose.connection.close();
    process.exit(1);
  }
})();
