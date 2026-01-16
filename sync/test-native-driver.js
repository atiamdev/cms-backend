require("dotenv").config();

console.log("🔍 Testing msnodesqlv8 Native Driver\n");
console.log("=".repeat(60));

async function testNativeDriver() {
  try {
    const sql = require("mssql");

    // Configuration using msnodesqlv8 (Windows native driver)
    const config = {
      server: ".",
      database: process.env.SQL_DATABASE || "zkteco",
      driver: "msnodesqlv8",
      options: {
        trustedConnection: true,
        instanceName: process.env.SQL_INSTANCE || "SQLEXPRESS",
      },
    };

    console.log("Configuration:");
    console.log(JSON.stringify(config, null, 2));
    console.log("\nConnecting...\n");

    const pool = await sql.connect(config);
    console.log("✅ Connected successfully using msnodesqlv8!\n");

    // Test query
    const result = await pool.request().query(`
      SELECT 
        @@SERVERNAME as ServerName,
        DB_NAME() as CurrentDB,
        @@VERSION as Version
    `);

    console.log("Server Info:");
    console.log(`  Server: ${result.recordset[0].ServerName}`);
    console.log(`  Database: ${result.recordset[0].CurrentDB}`);
    console.log(`  Version: ${result.recordset[0].Version.split("\n")[0]}\n`);

    // List tables
    const tables = await pool.request().query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `);

    console.log(`Tables found: ${tables.recordset.length}`);

    // Check for ZKTeco tables
    const zkTables = tables.recordset.filter(
      (t) => t.TABLE_NAME === "CHECKINOUT" || t.TABLE_NAME === "USERINFO"
    );

    if (zkTables.length === 2) {
      console.log("✅ ZKTeco tables found!\n");

      // Count records
      const checkInCount = await pool
        .request()
        .query("SELECT COUNT(*) as count FROM CHECKINOUT");
      const userCount = await pool
        .request()
        .query("SELECT COUNT(*) as count FROM USERINFO");

      console.log("Record counts:");
      console.log(`  CHECKINOUT: ${checkInCount.recordset[0].count}`);
      console.log(`  USERINFO: ${userCount.recordset[0].count}\n`);
    } else {
      console.log("⚠️  ZKTeco tables not found!\n");
    }

    await pool.close();

    console.log("=".repeat(60));
    console.log("\n✅ SUCCESS! This configuration works!\n");
    console.log("Update your zkteco-mssql-sync.js to use:");
    console.log(`
    sqlServer: {
      server: ".",
      database: "${process.env.SQL_DATABASE || "zkteco"}",
      driver: "msnodesqlv8",
      options: {
        trustedConnection: true,
        instanceName: "${process.env.SQL_INSTANCE || "SQLEXPRESS"}"
      }
    }
    `);

    return true;
  } catch (error) {
    console.log("❌ Connection failed!\n");
    console.log(`Error: ${error.message}`);
    if (error.code) console.log(`Error Code: ${error.code}`);

    console.log("\n" + "=".repeat(60));
    console.log("\nTroubleshooting:\n");

    if (error.message.includes("msnodesqlv8")) {
      console.log("The msnodesqlv8 driver may not be properly installed.");
      console.log("\nTry reinstalling:");
      console.log("  npm uninstall msnodesqlv8");
      console.log("  npm install msnodesqlv8");
      console.log("\nOr install with Windows build tools:");
      console.log("  npm install --global windows-build-tools");
      console.log("  npm install msnodesqlv8\n");
    } else {
      console.log("Check that:");
      console.log("  1. SQL Server Express is running");
      console.log("  2. Database 'zkteco' exists");
      console.log("  3. Windows Authentication is enabled");
      console.log("  4. You're running PowerShell as Administrator\n");
    }

    return false;
  }
}

// Alternative test with connection string
async function testConnectionString() {
  try {
    const sql = require("mssql");

    const connectionString = `Driver={SQL Server Native Client 11.0};Server=.\\SQLEXPRESS;Database=${
      process.env.SQL_DATABASE || "zkteco"
    };Trusted_Connection=yes;`;

    console.log("\n" + "=".repeat(60));
    console.log("\n🔍 Testing with Connection String\n");
    console.log(`Connection String: ${connectionString}\n`);
    console.log("Connecting...\n");

    const pool = await sql.connect({
      connectionString: connectionString,
      driver: "msnodesqlv8",
    });

    console.log("✅ Connection string method works too!\n");

    await pool.close();
    return true;
  } catch (error) {
    console.log("❌ Connection string method failed\n");
    console.log(`Error: ${error.message}\n`);
    return false;
  }
}

async function main() {
  console.log("Environment:");
  console.log(`  SQL_SERVER: ${process.env.SQL_SERVER || "(not set)"}`);
  console.log(`  SQL_DATABASE: ${process.env.SQL_DATABASE || "zkteco"}`);
  console.log(`  SQL_INSTANCE: ${process.env.SQL_INSTANCE || "SQLEXPRESS"}\n`);
  console.log("=".repeat(60));
  console.log();

  const success1 = await testNativeDriver();

  if (success1) {
    await testConnectionString();
  }

  console.log("\nDone!");
  process.exit(success1 ? 0 : 1);
}

main().catch((error) => {
  console.error("\n❌ Fatal error:", error);
  process.exit(1);
});
