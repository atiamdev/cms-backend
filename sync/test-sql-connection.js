require("dotenv").config();
const sql = require("mssql");

console.log("🔍 SQL Server Connection Diagnostics\n");
console.log("=".repeat(50));

// Test different connection configurations
const configs = [
  {
    name: "Config 1: localhost\\SQLEXPRESS with Windows Auth",
    config: {
      server: "localhost\\SQLEXPRESS",
      database: "zkteco",
      options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        trustedConnection: true,
        instanceName: "SQLEXPRESS",
      },
    },
  },
  {
    name: "Config 2: localhost with instance name",
    config: {
      server: "localhost",
      database: "zkteco",
      options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        trustedConnection: true,
        instanceName: "SQLEXPRESS",
      },
    },
  },
  {
    name: "Config 3: With port 1433",
    config: {
      server: "localhost",
      port: 1433,
      database: "zkteco",
      options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        trustedConnection: true,
      },
    },
  },
  {
    name: "Config 4: Direct instance connection",
    config: {
      server: "(local)\\SQLEXPRESS",
      database: "zkteco",
      options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        trustedConnection: true,
      },
    },
  },
];

async function testConnection(name, config) {
  console.log(`\n📋 Testing: ${name}`);
  console.log("-".repeat(50));
  console.log("Config:", JSON.stringify(config, null, 2));

  try {
    const pool = await sql.connect(config);
    console.log("✅ Connection successful!");

    // Try to query databases
    const result = await pool.request().query("SELECT DB_NAME() as CurrentDB");
    console.log("✅ Current Database:", result.recordset[0].CurrentDB);

    // Try to list tables
    const tables = await pool.request().query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `);
    console.log("✅ Tables found:", tables.recordset.length);
    tables.recordset.forEach((t) => console.log(`   - ${t.TABLE_NAME}`));

    await pool.close();
    return true;
  } catch (error) {
    console.log("❌ Connection failed!");
    console.log("Error:", error.message);
    if (error.code) console.log("Error Code:", error.code);
    return false;
  }
}

async function runTests() {
  console.log("\nℹ️  Make sure:");
  console.log("  1. SQL Server Express is running");
  console.log("  2. TCP/IP is enabled for SQLEXPRESS instance");
  console.log("  3. Database 'zkteco' exists");
  console.log("  4. Windows Authentication is enabled\n");

  let successCount = 0;

  for (const { name, config } of configs) {
    const success = await testConnection(name, config);
    if (success) successCount++;

    // Add delay between tests
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log("\n" + "=".repeat(50));
  console.log(
    `\n📊 Results: ${successCount}/${configs.length} configurations succeeded\n`
  );

  if (successCount === 0) {
    console.log("❌ All connections failed. Check:");
    console.log("  1. Is SQL Server running?");
    console.log("     Run: Get-Service MSSQL* | Select Status,Name");
    console.log("\n  2. Is TCP/IP enabled?");
    console.log("     Open: SQL Server Configuration Manager");
    console.log("     Check: SQL Server Network Configuration");
    console.log("\n  3. Does database 'zkteco' exist?");
    console.log("     Open: SQL Server Management Studio");
    console.log("     Check: Databases list");
  } else {
    console.log("✅ At least one configuration worked!");
    console.log("   Update zkteco-mssql-sync.js with the working config");
  }
}

runTests().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
