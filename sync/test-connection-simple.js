require("dotenv").config();
const sql = require("mssql");

console.log("🔍 SQL Server Connection Test\n");
console.log("=".repeat(60));

// Read from .env
const server = process.env.SQL_SERVER || "localhost\\SQLEXPRESS";
const database = process.env.SQL_DATABASE || "zkteco";

console.log(`Server: ${server}`);
console.log(`Database: ${database}`);
console.log(`Auth: Windows Authentication (Trusted Connection)\n`);

// Test configurations based on your connection string
const configs = [
  {
    name: "Config 1: Windows Auth with authentication object",
    config: {
      server: server,
      database: database,
      authentication: {
        type: "default",
      },
      options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        instanceName: "SQLEXPRESS",
      },
    },
  },
  {
    name: "Config 2: Windows Auth with driver",
    config: {
      server: server,
      database: database,
      driver: "msnodesqlv8",
      options: {
        trustedConnection: true,
        encrypt: false,
        trustServerCertificate: true,
      },
    },
  },
  {
    name: "Config 3: Windows Auth (mssql v11 style)",
    config: {
      server: server,
      database: database,
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
    name: "Config 5: SQL Auth (if credentials provided)",
    config: {
      server: server,
      database: database,
      user: process.env.SQL_USER || "sa",
      password: process.env.SQL_PASSWORD || "your_password",
      options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
      },
    },
  },
];

async function testConfig(name, configOrString) {
  console.log(`\n📋 ${name}`);
  console.log("-".repeat(60));

  try {
    let pool;
    if (configOrString.connectionString) {
      console.log(
        `Using connection string: ${configOrString.connectionString}`
      );
      pool = await sql.connect(configOrString.connectionString);
    } else {
      console.log(`Config: ${JSON.stringify(configOrString, null, 2)}`);
      pool = await sql.connect(configOrString);
    }

    console.log("✅ Connected successfully!");

    // Test query
    const result = await pool
      .request()
      .query("SELECT DB_NAME() as CurrentDB, @@VERSION as Version");
    console.log(`✅ Current Database: ${result.recordset[0].CurrentDB}`);
    console.log(
      `✅ SQL Server Version: ${result.recordset[0].Version.split("\n")[0]}`
    );

    // List tables
    const tables = await pool.request().query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `);

    console.log(`✅ Tables found: ${tables.recordset.length}`);
    tables.recordset.forEach((t) => console.log(`   - ${t.TABLE_NAME}`));

    // Check for ZKTeco tables
    const zkTables = tables.recordset.filter(
      (t) => t.TABLE_NAME === "CHECKINOUT" || t.TABLE_NAME === "USERINFO"
    );

    if (zkTables.length === 2) {
      console.log("✅ ZKTeco tables (CHECKINOUT, USERINFO) found!");

      // Count records
      const checkInCount = await pool
        .request()
        .query("SELECT COUNT(*) as count FROM CHECKINOUT");
      const userCount = await pool
        .request()
        .query("SELECT COUNT(*) as count FROM USERINFO");

      console.log(
        `   - CHECKINOUT records: ${checkInCount.recordset[0].count}`
      );
      console.log(`   - USERINFO records: ${userCount.recordset[0].count}`);
    } else {
      console.log("⚠️  ZKTeco tables not found!");
    }

    await pool.close();
    return true;
  } catch (error) {
    console.log("❌ Connection failed!");
    console.log(`Error: ${error.message}`);
    if (error.code) console.log(`Error Code: ${error.code}`);
    if (error.originalError) {
      console.log(`Original Error: ${error.originalError.message}`);
    }
    return false;
  }
}

async function main() {
  console.log("\n⚠️  PREREQUISITES:");
  console.log("  1. SQL Server Express service is running");
  console.log("  2. TCP/IP protocol is enabled");
  console.log("  3. SQL Browser service is running");
  console.log("  4. Database 'zkteco' exists");
  console.log("  5. Running on Windows with Windows Authentication\n");

  let successCount = 0;
  let workingConfig = null;

  for (const config of configs) {
    const success = await testConfig(
      config.name,
      config.connectionString
        ? { connectionString: config.connectionString }
        : config.config
    );
    if (success) {
      successCount++;
      if (!workingConfig) workingConfig = config;
    }
    // Wait between tests
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log("\n" + "=".repeat(60));
  console.log(
    `\n📊 Results: ${successCount}/${configs.length} configurations succeeded\n`
  );

  if (successCount === 0) {
    console.log("❌ ALL TESTS FAILED\n");
    console.log("Troubleshooting steps:\n");

    console.log("1. Check SQL Server is running:");
    console.log("   PowerShell: Get-Service MSSQL*");
    console.log("   Expected: Status = Running\n");

    console.log("2. Check SQL Browser service:");
    console.log("   PowerShell: Get-Service SQLBrowser");
    console.log("   If stopped: Start-Service SQLBrowser\n");

    console.log("3. Enable TCP/IP protocol:");
    console.log("   - Open SQL Server Configuration Manager");
    console.log(
      "   - SQL Server Network Configuration → Protocols for SQLEXPRESS"
    );
    console.log("   - Right-click TCP/IP → Enable");
    console.log("   - Restart SQL Server service\n");

    console.log("4. Verify database exists:");
    console.log("   - Open SQL Server Management Studio");
    console.log("   - Connect to localhost\\SQLEXPRESS");
    console.log("   - Check if 'zkteco' database exists\n");

    console.log("5. Check Windows Authentication:");
    console.log("   - Server Properties → Security");
    console.log("   - Should allow Windows Authentication\n");

    console.log("6. Try connection string in SSMS:");
    console.log(`   Server name: localhost\\SQLEXPRESS`);
    console.log("   Authentication: Windows Authentication\n");
  } else {
    console.log("✅ SUCCESS! Connection is working!\n");
    console.log(`Working configuration: ${workingConfig.name}\n`);
    console.log("You can now run the sync script:");
    console.log("  node zkteco-mssql-sync.js\n");
  }
}

main().catch((error) => {
  console.error("\n❌ Fatal error:", error);
  process.exit(1);
});
