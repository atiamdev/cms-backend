const mongoose = require("mongoose");
const minimist = require("minimist");
const { generateMonthlyInvoices } = require("../services/monthlyInvoiceService");

/**
 * Helper to iterate months between two dates (inclusive)
 * from and to are strings "YYYY-MM" or Date objects
 */
function monthsBetween(from, to) {
  const start = typeof from === "string" ? new Date(from + "-01") : new Date(from);
  const end = typeof to === "string" ? new Date(to + "-01") : new Date(to);

  const months = [];
  let curYear = start.getFullYear();
  let curMonth = start.getMonth() + 1; // 1-12
  const endYear = end.getFullYear();
  const endMonth = end.getMonth() + 1;

  while (curYear < endYear || (curYear === endYear && curMonth <= endMonth)) {
    months.push({ periodYear: curYear, periodMonth: curMonth });

    curMonth++;
    if (curMonth > 12) {
      curMonth = 1;
      curYear++;
    }
  }

  return months;
}

async function runBackfill({ from, to, branchId, initiatedBy, dryRun, consolidate = true } = {}) {
  if (!from || !to) {
    throw new Error("Both 'from' and 'to' (format YYYY-MM) must be provided");
  }

  const months = monthsBetween(from, to);

  const summary = [];

  for (const m of months) {
    console.log(`\nProcessing invoices for ${m.periodYear}-${String(m.periodMonth).padStart(2, '0')}`);
    if (dryRun) {
      console.log("Dry run enabled - skipping creation");
      summary.push({ ...m, created: 0, skipped: 0, dryRun: true });
      continue;
    }

    const res = await generateMonthlyInvoices({ 
      periodYear: m.periodYear, 
      periodMonth: m.periodMonth, 
      branchId, 
      initiatedBy,
      consolidate 
    });
    summary.push({ ...m, ...res });
    console.log(`Created: ${res.created}, Skipped: ${res.skipped}, Notifications: ${res.notificationsPending || 0}`);
  }

  return summary;
}

// CLI entry point
if (require.main === module) {
  (async () => {
    require("dotenv").config();

    const argv = minimist(process.argv.slice(2), {
      string: ["from", "to", "branchId"],
      boolean: ["dryRun", "force", "consolidate"],
      alias: { f: "from", t: "to", b: "branchId" },
      default: { consolidate: true },
    });

    const { from, to, branchId, dryRun, force, consolidate } = argv;

    if (!force && !process.env.FORCE_MONTHLY_BACKFILL) {
      console.error("Safety: backfill requires --force flag or environment variable FORCE_MONTHLY_BACKFILL=true");
      process.exit(1);
    }

    if (!from || !to) {
      console.error("Usage: node backfill-monthly-invoices.js --from=YYYY-MM --to=YYYY-MM [--branchId=ID] [--dryRun] [--consolidate=false] --force");
      process.exit(1);
    }

    try {
      await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
      console.log("Connected to DB, starting backfill...");
      console.log(`Consolidation: ${consolidate ? 'ENABLED' : 'DISABLED'}`);
      const result = await runBackfill({ from, to, branchId, initiatedBy: null, dryRun, consolidate });
      console.log("Backfill result:", JSON.stringify(result, null, 2));
      await mongoose.connection.close();
      console.log("Done.");
      process.exit(0);
    } catch (err) {
      console.error("Backfill failed:", err);
      process.exit(1);
    }
  })();
}

module.exports = { runBackfill, monthsBetween };
