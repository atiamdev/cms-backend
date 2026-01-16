/**
 * Database Migration Script
 * Run this script to update existing Fee records for new schema changes
 * 
 * Changes:
 * 1. Make academicTermId optional (already handled by schema)
 * 2. Remove lateFeeApplied from balance calculations (requires recalculation)
 * 3. Add consolidation fields (will be null for existing records - OK)
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Fee = require("../models/Fee");

async function migrateDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to database");

    // Recalculate balances for all fees (removes late fee from calculation)
    console.log("\n📊 Recalculating fee balances...");
    
    const fees = await Fee.find({});
    console.log(`Found ${fees.length} fee records`);

    let updated = 0;
    for (const fee of fees) {
      // Trigger pre-save hook to recalculate balance without late fees
      fee.markModified('totalAmountDue'); // Force recalculation
      await fee.save();
      updated++;
      
      if (updated % 100 === 0) {
        console.log(`   Processed ${updated}/${fees.length}...`);
      }
    }

    console.log(`✅ Updated ${updated} fee records`);

    // Optional: Clean up any old lateFeeApplied values (they'll be ignored now)
    console.log("\n🧹 Cleaning up old late fee fields...");
    
    const result = await Fee.updateMany(
      { lateFeeApplied: { $exists: true } },
      { $unset: { lateFeeApplied: "" } }
    );
    
    console.log(`   Removed lateFeeApplied from ${result.modifiedCount} records`);

    console.log("\n✅ Migration completed successfully!");
    
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  } finally {
    await mongoose.connection.close();
    console.log("📴 Database connection closed");
  }
}

// Run migration if executed directly
if (require.main === module) {
  migrateDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { migrateDatabase };
