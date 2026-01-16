const mongoose = require("mongoose");
require("dotenv").config();

/**
 * Cleanup Script: Remove academicTerms field from all Branch documents
 *
 * This script removes the deprecated academicTerms array from all branches
 * now that we're using the centralized AcademicTerm collection.
 */

async function cleanupBranchAcademicTerms() {
  try {
    console.log("Starting cleanup of academicTerms field from branches...\n");

    // Connect to database
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error("MongoDB URI not found in environment variables");
    }

    await mongoose.connect(mongoUri);
    console.log("✓ Connected to MongoDB\n");

    // Get the branches collection directly
    const db = mongoose.connection.db;
    const branchesCollection = db.collection("branches");

    // Count branches with academicTerms field
    const branchesWithTerms = await branchesCollection.countDocuments({
      academicTerms: { $exists: true },
    });

    console.log(
      `Found ${branchesWithTerms} branches with academicTerms field\n`
    );

    if (branchesWithTerms === 0) {
      console.log(
        "No branches found with academicTerms field. Cleanup complete."
      );
      await mongoose.disconnect();
      return;
    }

    // Show branches that will be updated
    const branches = await branchesCollection
      .find({ academicTerms: { $exists: true } })
      .project({ name: 1, "academicTerms.name": 1 })
      .toArray();

    console.log("Branches to be updated:");
    console.log("=".repeat(60));
    branches.forEach((branch, index) => {
      console.log(`${index + 1}. ${branch.name} (${branch._id})`);
      if (branch.academicTerms && branch.academicTerms.length > 0) {
        console.log(
          `   Terms: ${branch.academicTerms.map((t) => t.name).join(", ")}`
        );
      }
    });
    console.log("=".repeat(60) + "\n");

    // Remove the academicTerms field from all branches
    console.log("Removing academicTerms field from all branches...");
    const result = await branchesCollection.updateMany(
      { academicTerms: { $exists: true } },
      { $unset: { academicTerms: "" } }
    );

    console.log("\n" + "=".repeat(60));
    console.log("CLEANUP SUMMARY");
    console.log("=".repeat(60));
    console.log(`Branches matched: ${result.matchedCount}`);
    console.log(`Branches modified: ${result.modifiedCount}`);
    console.log("=".repeat(60) + "\n");

    if (result.modifiedCount > 0) {
      console.log(
        "✓ Successfully removed academicTerms field from all branches"
      );
      console.log("\nNext steps:");
      console.log(
        "1. Academic terms are now managed centrally via /api/academic-terms"
      );
      console.log("2. Use the Term Management UI in super admin dashboard");
      console.log(
        "3. Ensure all Fee and Class records reference the centralized terms\n"
      );
    } else {
      console.log(
        "⚠ No branches were modified. They may have already been cleaned up.\n"
      );
    }

    await mongoose.disconnect();
    console.log("✓ Disconnected from MongoDB");
    console.log("Cleanup completed successfully!\n");
  } catch (error) {
    console.error("\n✗ Cleanup failed:", error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run cleanup
if (require.main === module) {
  cleanupBranchAcademicTerms();
}

module.exports = cleanupBranchAcademicTerms;
