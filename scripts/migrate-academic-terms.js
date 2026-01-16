const mongoose = require("mongoose");
require("dotenv").config();
const Branch = require("../models/Branch");
const AcademicTerm = require("../models/AcademicTerm");

/**
 * Migration Script: Migrate branch-specific academic terms to centralized AcademicTerm collection
 *
 * This script:
 * 1. Fetches all branches with academicTerms
 * 2. Creates centralized AcademicTerm documents for each branch term
 * 3. Provides a mapping report for reference
 * 4. Can be run multiple times safely (checks for duplicates)
 */

async function migrateAcademicTerms() {
  try {
    console.log("Starting migration of academic terms...\n");

    // Connect to database
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✓ Connected to MongoDB\n");

    // Fetch all branches
    const branches = await Branch.find({
      academicTerms: { $exists: true, $ne: [] },
    }).lean();
    console.log(`Found ${branches.length} branches with academic terms\n`);

    if (branches.length === 0) {
      console.log("No branches with academic terms found. Migration complete.");
      await mongoose.disconnect();
      return;
    }

    let totalMigrated = 0;
    let totalSkipped = 0;
    const migrationReport = [];

    for (const branch of branches) {
      console.log(`\nProcessing branch: ${branch.name} (${branch._id})`);

      // Check if academicTerms array exists and has items
      if (
        !branch.academicTerms ||
        !Array.isArray(branch.academicTerms) ||
        branch.academicTerms.length === 0
      ) {
        console.log(`  No academic terms found, skipping...`);
        continue;
      }

      console.log(`  Academic terms found: ${branch.academicTerms.length}`);

      for (const term of branch.academicTerms) {
        // Generate a unique code if not present
        const termCode = generateTermCode(
          term.name,
          branch.academicYear || new Date().getFullYear().toString()
        );
        const academicYear =
          branch.configuration?.academicYear ||
          new Date().getFullYear().toString();

        // Check if term already exists (by code and academic year)
        const existingTerm = await AcademicTerm.findOne({
          code: termCode,
          academicYear: academicYear,
        });

        if (existingTerm) {
          console.log(
            `  ⊘ Skipped: "${term.name}" (already exists as ${existingTerm._id})`
          );
          totalSkipped++;

          migrationReport.push({
            branchId: branch._id,
            branchName: branch.name,
            oldTermId: term._id,
            newTermId: existingTerm._id,
            termName: term.name,
            status: "skipped (already exists)",
          });
          continue;
        }

        // Create new centralized academic term
        const newTerm = new AcademicTerm({
          name: term.name,
          code: termCode,
          academicYear: academicYear,
          startDate: term.startDate,
          endDate: term.endDate,
          isActive: term.isActive || false,
          isCurrent: false, // Will need to be set manually after migration
          description: `Migrated from branch: ${branch.name}`,
          createdAt: term.createdAt || Date.now(),
        });

        await newTerm.save();
        console.log(
          `  ✓ Migrated: "${term.name}" → ${newTerm._id} (${newTerm.code})`
        );
        totalMigrated++;

        migrationReport.push({
          branchId: branch._id,
          branchName: branch.name,
          oldTermId: term._id,
          newTermId: newTerm._id,
          termName: term.name,
          code: newTerm.code,
          status: "migrated",
        });
      }
    }

    // Print summary
    console.log("\n" + "=".repeat(60));
    console.log("MIGRATION SUMMARY");
    console.log("=".repeat(60));
    console.log(`Total terms migrated: ${totalMigrated}`);
    console.log(`Total terms skipped: ${totalSkipped}`);
    console.log(`Total branches processed: ${branches.length}\n`);

    // Print detailed report
    console.log("DETAILED REPORT:");
    console.log("=".repeat(60));
    migrationReport.forEach((entry, index) => {
      console.log(`\n${index + 1}. ${entry.branchName}`);
      console.log(`   Term: ${entry.termName}`);
      console.log(`   Old ID: ${entry.oldTermId}`);
      console.log(`   New ID: ${entry.newTermId}`);
      console.log(`   Code: ${entry.code || "N/A"}`);
      console.log(`   Status: ${entry.status}`);
    });

    console.log("\n" + "=".repeat(60));
    console.log("NEXT STEPS:");
    console.log("=".repeat(60));
    console.log("1. Review the migration report above");
    console.log(
      "2. Set the 'isCurrent' flag on the appropriate term(s) manually"
    );
    console.log(
      "3. Update any Fee or Class records that reference old term IDs"
    );
    console.log("4. Remove the academicTerms field from Branch schema");
    console.log("5. Test the application thoroughly before deploying");
    console.log("=".repeat(60) + "\n");

    await mongoose.disconnect();
    console.log("✓ Disconnected from MongoDB");
    console.log("Migration completed successfully!\n");
  } catch (error) {
    console.error("\n✗ Migration failed:", error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

/**
 * Generate a term code from term name and academic year
 * Examples: "Semester 1 2024" → "SEM1", "Term 2 2024" → "TERM2"
 */
function generateTermCode(termName, academicYear) {
  // Clean and uppercase the name
  const cleaned = termName.toUpperCase().trim();

  // Common patterns
  if (cleaned.includes("SEMESTER 1") || cleaned.includes("SEM 1")) {
    return "SEM1";
  } else if (cleaned.includes("SEMESTER 2") || cleaned.includes("SEM 2")) {
    return "SEM2";
  } else if (cleaned.includes("SEMESTER 3") || cleaned.includes("SEM 3")) {
    return "SEM3";
  } else if (cleaned.includes("TERM 1") || cleaned.includes("FIRST TERM")) {
    return "TERM1";
  } else if (cleaned.includes("TERM 2") || cleaned.includes("SECOND TERM")) {
    return "TERM2";
  } else if (cleaned.includes("TERM 3") || cleaned.includes("THIRD TERM")) {
    return "TERM3";
  } else if (cleaned.includes("QUARTER 1") || cleaned.includes("Q1")) {
    return "Q1";
  } else if (cleaned.includes("QUARTER 2") || cleaned.includes("Q2")) {
    return "Q2";
  } else if (cleaned.includes("QUARTER 3") || cleaned.includes("Q3")) {
    return "Q3";
  } else if (cleaned.includes("QUARTER 4") || cleaned.includes("Q4")) {
    return "Q4";
  } else if (cleaned.includes("SUMMER")) {
    return "SUMMER";
  } else if (cleaned.includes("WINTER")) {
    return "WINTER";
  } else if (cleaned.includes("SPRING")) {
    return "SPRING";
  } else if (cleaned.includes("FALL") || cleaned.includes("AUTUMN")) {
    return "FALL";
  }

  // Fallback: use first 6 chars or initials
  const words = cleaned.split(/\s+/);
  if (words.length > 1) {
    return words
      .map((w) => w[0])
      .join("")
      .substring(0, 6);
  }

  return cleaned.substring(0, 6);
}

// Run migration
if (require.main === module) {
  migrateAcademicTerms();
}

module.exports = migrateAcademicTerms;
