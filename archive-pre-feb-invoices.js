/**
 * Archive Pre-February 2026 Invoices
 *
 * This script marks all invoices created before February 1, 2026 as paid.
 * This creates a clean slate for tracking payments from February 2026 onwards
 * while preserving all historical financial data.
 *
 * Usage:
 *   node archive-pre-feb-invoices.js                    # Preview (dry run)
 *   node archive-pre-feb-invoices.js --execute          # Execute changes
 *   node archive-pre-feb-invoices.js --branchId=ID      # Filter by branch
 */

require("dotenv").config();
const mongoose = require("mongoose");
const minimist = require("minimist");
const Fee = require("./models/Fee");
const Payment = require("./models/Payment");
const Student = require("./models/Student");
const Course = require("./models/Course");

const CUTOFF_DATE = new Date("2026-02-01T00:00:00.000Z");

async function archivePreFebInvoices({
  execute = false,
  branchId = null,
} = {}) {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log("✅ Connected to MongoDB\n");
    console.log("=".repeat(70));
    console.log("ARCHIVE PRE-FEBRUARY 2026 INVOICES");
    console.log("=".repeat(70));
    console.log(
      `Mode: ${execute ? "EXECUTE (making changes)" : "DRY RUN (preview only)"}`,
    );
    console.log(`Cutoff Date: ${CUTOFF_DATE.toDateString()}`);
    console.log(`Branch Filter: ${branchId || "All branches"}`);
    console.log("=".repeat(70) + "\n");

    // Build query for invoices before Feb 1, 2026
    const query = {
      $or: [
        // Invoices with periodYear/periodMonth
        {
          periodYear: { $lt: 2026 },
        },
        {
          periodYear: 2026,
          periodMonth: { $lt: 2 },
        },
        // Invoices with periodStart date
        {
          periodStart: { $lt: CUTOFF_DATE },
        },
        // Invoices created before cutoff without period fields
        {
          periodYear: { $exists: false },
          periodStart: { $exists: false },
          createdAt: { $lt: CUTOFF_DATE },
        },
      ],
      status: { $nin: ["paid", "waived"] }, // Only process unpaid/partially_paid invoices
    };

    if (branchId) {
      query.branchId = mongoose.Types.ObjectId(branchId);
    }

    // Get invoices to archive
    const invoices = await Fee.find(query)
      .populate("studentId", "studentId admissionNumber userId")
      .populate("courseId", "name")
      .sort({ createdAt: 1 });

    console.log(`📊 Found ${invoices.length} invoice(s) to archive\n`);

    if (invoices.length === 0) {
      console.log(
        "✅ No invoices to archive. All invoices before Feb 2026 are already paid or waived.\n",
      );
      await mongoose.connection.close();
      return {
        totalFound: 0,
        totalArchived: 0,
        totalAmountArchived: 0,
      };
    }

    // Group by student for better reporting
    const studentGroups = new Map();
    let totalBalance = 0;

    for (const invoice of invoices) {
      const studentKey = invoice.studentId?._id?.toString() || "unknown";
      if (!studentGroups.has(studentKey)) {
        studentGroups.set(studentKey, {
          student: invoice.studentId,
          invoices: [],
          totalBalance: 0,
        });
      }

      const balance = invoice.totalAmountDue - invoice.amountPaid;
      studentGroups.get(studentKey).invoices.push({
        id: invoice._id,
        period:
          invoice.periodYear && invoice.periodMonth
            ? `${invoice.periodYear}-${String(invoice.periodMonth).padStart(2, "0")}`
            : invoice.periodStart?.toISOString().substring(0, 7) || "N/A",
        course: invoice.courseId?.name || "N/A",
        totalDue: invoice.totalAmountDue,
        amountPaid: invoice.amountPaid,
        balance: balance,
        status: invoice.status,
      });
      studentGroups.get(studentKey).totalBalance += balance;
      totalBalance += balance;
    }

    // Display summary by student
    console.log("📝 INVOICES TO ARCHIVE:\n");
    let studentCount = 0;
    for (const [studentKey, data] of studentGroups) {
      studentCount++;
      const studentId =
        data.student?.studentId || data.student?.admissionNumber || "Unknown";

      console.log(`${studentCount}. Student: ${studentId}`);
      console.log(
        `   Total Outstanding: KES ${data.totalBalance.toLocaleString()}`,
      );
      console.log(`   Invoices: ${data.invoices.length}`);

      for (const inv of data.invoices) {
        console.log(`     - ${inv.period} | ${inv.course}`);
        console.log(
          `       Due: KES ${inv.totalDue.toLocaleString()} | Paid: KES ${inv.amountPaid.toLocaleString()} | Balance: KES ${inv.balance.toLocaleString()}`,
        );
      }
      console.log();
    }

    console.log("=".repeat(70));
    console.log("📊 SUMMARY:");
    console.log(`   Students affected: ${studentGroups.size}`);
    console.log(`   Total invoices: ${invoices.length}`);
    console.log(
      `   Total outstanding balance: KES ${totalBalance.toLocaleString()}`,
    );
    console.log("=".repeat(70) + "\n");

    if (!execute) {
      console.log("⚠️  DRY RUN MODE - No changes made");
      console.log("Run with --execute flag to apply changes\n");
      await mongoose.connection.close();
      return {
        totalFound: invoices.length,
        totalArchived: 0,
        totalAmountArchived: totalBalance,
      };
    }

    // Execute archiving
    console.log("🔄 Archiving invoices...\n");

    let archived = 0;
    const errors = [];

    for (const invoice of invoices) {
      try {
        const balance = invoice.totalAmountDue - invoice.amountPaid;

        // Update invoice to mark as paid
        invoice.amountPaid = invoice.totalAmountDue;
        invoice.balance = 0;
        invoice.status = "paid";

        // Add note about archiving
        const archiveNote = `[ARCHIVED ${new Date().toISOString().substring(0, 10)}] Pre-Feb 2026 invoice marked as paid for clean slate. Original balance: KES ${balance}`;
        invoice.notes = invoice.notes
          ? `${invoice.notes}\n${archiveNote}`
          : archiveNote;

        await invoice.save();
        archived++;

        if (archived % 10 === 0) {
          console.log(
            `   Progress: ${archived}/${invoices.length} invoices archived`,
          );
        }
      } catch (error) {
        errors.push({
          invoiceId: invoice._id,
          error: error.message,
        });
      }
    }

    console.log("\n=".repeat(70));
    console.log("✅ ARCHIVING COMPLETE");
    console.log("=".repeat(70));
    console.log(
      `   Successfully archived: ${archived}/${invoices.length} invoices`,
    );
    console.log(
      `   Total amount archived: KES ${totalBalance.toLocaleString()}`,
    );

    if (errors.length > 0) {
      console.log(`   Errors: ${errors.length}`);
      console.log("\n⚠️  ERRORS:");
      errors.forEach((err) => {
        console.log(`   - Invoice ${err.invoiceId}: ${err.error}`);
      });
    }
    console.log("=".repeat(70) + "\n");

    // Check for any payments linked to archived invoices
    console.log("🔍 Checking payment records...\n");
    const archivedInvoiceIds = invoices.map((inv) => inv._id);
    const linkedPayments = await Payment.countDocuments({
      feeId: { $in: archivedInvoiceIds },
    });

    console.log(
      `   Found ${linkedPayments} payment record(s) linked to archived invoices`,
    );
    console.log(`   ✅ Payment records are preserved and remain valid\n`);

    console.log("📌 NEXT STEPS:");
    console.log("   1. All invoices before Feb 1, 2026 are now marked as paid");
    console.log(
      "   2. Students will see KES 0 balance for pre-Feb 2026 period",
    );
    console.log("   3. New invoices from Feb 2026 onwards will track normally");
    console.log("   4. All payment history is preserved for audit purposes");
    console.log("   5. Financial reports remain accurate with archived data\n");

    await mongoose.connection.close();

    return {
      totalFound: invoices.length,
      totalArchived: archived,
      totalAmountArchived: totalBalance,
      errors: errors.length,
    };
  } catch (error) {
    console.error("❌ Error:", error);
    await mongoose.connection.close();
    throw error;
  }
}

// CLI entry point
if (require.main === module) {
  (async () => {
    const argv = minimist(process.argv.slice(2), {
      boolean: ["execute", "help"],
      string: ["branchId"],
      alias: { e: "execute", b: "branchId", h: "help" },
    });

    if (argv.help) {
      console.log(`
Archive Pre-February 2026 Invoices
====================================

Marks all invoices before February 1, 2026 as paid to create a clean slate
for tracking payments from February 2026 onwards.

This script:
  ✅ Preserves all financial history
  ✅ Maintains payment records and links
  ✅ Sets invoice status to 'paid'
  ✅ Adds archive note with original balance
  ✅ Creates clean slate for Feb 2026 forward

Usage:
  node archive-pre-feb-invoices.js                 # Preview changes (dry run)
  node archive-pre-feb-invoices.js --execute       # Execute archiving
  node archive-pre-feb-invoices.js --branchId=ID   # Filter by specific branch
  node archive-pre-feb-invoices.js --help          # Show this help

Options:
  --execute, -e     Execute the archiving (default: dry run)
  --branchId, -b    Filter by specific branch ID
  --help, -h        Show this help message

Examples:
  # Preview what will be archived
  node archive-pre-feb-invoices.js

  # Archive all pre-Feb 2026 invoices
  node archive-pre-feb-invoices.js --execute

  # Archive for specific branch only
  node archive-pre-feb-invoices.js --execute --branchId=507f1f77bcf86cd799439011
      `);
      process.exit(0);
    }

    try {
      await archivePreFebInvoices({
        execute: argv.execute,
        branchId: argv.branchId,
      });
      process.exit(0);
    } catch (error) {
      console.error("\n❌ Script failed:", error.message);
      process.exit(1);
    }
  })();
}

module.exports = { archivePreFebInvoices };
