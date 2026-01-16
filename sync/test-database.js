require("dotenv").config();
const MDBReader = require("mdb-reader");
const fs = require("fs");

console.log("═══════════════════════════════════════════════════════");
console.log("       ZKTeco Database Test Utility");
console.log("═══════════════════════════════════════════════════════\n");

const dbPath =
  process.env.ZKTECO_DB_PATH ||
  "C:\\Program Files (x86)\\ZKTime5.0\\att2000.mdb";

console.log(`Database path: ${dbPath}\n`);

try {
  // Check if file exists
  if (!fs.existsSync(dbPath)) {
    console.error("❌ Database file not found!");
    console.error("Please check ZKTECO_DB_PATH in .env file\n");
    process.exit(1);
  }

  console.log("✅ Database file found\n");

  // Read the database
  console.log("📖 Reading database...");
  const buffer = fs.readFileSync(dbPath);
  const reader = new MDBReader(buffer);

  // List all tables
  const tableNames = reader.getTableNames();
  console.log(`\n📊 Found ${tableNames.length} tables:`);
  tableNames.forEach((name) => {
    console.log(`   - ${name}`);
  });

  // Check for required tables
  console.log("\n🔍 Checking required tables...");

  const requiredTables = ["CHECKINOUT", "USERINFO"];
  requiredTables.forEach((tableName) => {
    try {
      const table = reader.getTable(tableName);
      const rowCount = table.getRowCount();
      const columns = table.getColumnNames();

      console.log(`\n✅ ${tableName}:`);
      console.log(`   Rows: ${rowCount}`);
      console.log(`   Columns: ${columns.join(", ")}`);

      // Show sample data
      if (rowCount > 0) {
        const data = table.getData();
        console.log(`\n   Sample record (first row):`);
        console.log(JSON.stringify(data[0], null, 2));
      } else {
        console.log("   ⚠️  No data in this table");
      }
    } catch (error) {
      console.log(`\n❌ ${tableName}: Not found or error - ${error.message}`);
    }
  });

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("✅ Database test completed successfully!");
  console.log("═══════════════════════════════════════════════════════\n");
} catch (error) {
  console.error("\n❌ Error reading database:", error.message);
  console.error("\nPossible causes:");
  console.error("  - Database file is corrupted");
  console.error("  - File is locked by ZKTeco software");
  console.error("  - Insufficient permissions to read file");
  console.error("  - Invalid database format\n");
  process.exit(1);
}
