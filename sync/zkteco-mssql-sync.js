require("dotenv").config();
const sql = require("mssql");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

class ZKTecoMSSQLSync {
  constructor() {
    this.config = {
      branchId: process.env.BRANCH_ID,
      branchName: process.env.BRANCH_NAME,
      cloudApiUrl: process.env.CLOUD_API_URL || "https://your-api.com",
      apiToken: process.env.API_TOKEN,
      syncInterval: parseInt(process.env.SYNC_INTERVAL) || 60000, // 1 minute default
      batchSize: parseInt(process.env.BATCH_SIZE) || 100,

      // SQL Server configuration
      sqlServer: {
        server: process.env.SQL_SERVER || ".",
        database: process.env.SQL_DATABASE || "zkteco",
        // Use SQL Auth if credentials provided, otherwise Windows Auth
        ...(process.env.SQL_USER && process.env.SQL_PASSWORD
          ? {
              user: process.env.SQL_USER,
              password: process.env.SQL_PASSWORD,
            }
          : {
              // driver: "msnodesqlv8", // Use native Windows driver for better compatibility
              options: {
                trustedConnection: true, // Windows Authentication
              },
            }),
        options: {
          // Remove instanceName since server string already includes it
          encrypt: false,
          trustServerCertificate: true,
        },
        pool: {
          max: 10,
          min: 0,
          idleTimeoutMillis: 30000,
        },
      },
    };

    this.validateConfig();
    this.lastSyncFile = path.join(__dirname, "last-sync-mssql.json");
    this.lastSyncTime = this.loadLastSyncTime();
    this.pool = null;

    this.printBanner();
  }

  /**
   * Validate configuration
   */
  validateConfig() {
    const required = ["branchId", "apiToken", "cloudApiUrl"];

    const missing = [];

    if (!this.config.branchId) missing.push("branchId");
    if (!this.config.apiToken) missing.push("apiToken");
    if (!this.config.cloudApiUrl) missing.push("cloudApiUrl");

    if (missing.length > 0) {
      throw new Error(`Missing required configuration: ${missing.join(", ")}`);
    }

    console.log(
      process.env.SQL_USER
        ? "ℹ️  Using SQL Server Authentication\n"
        : "ℹ️  Using Windows Authentication (no username/password needed)\n"
    );
  }

  /**
   * Print banner
   */
  printBanner() {
    console.log("ZKTeco Attendance Sync Service Started");
  }

  /**
   * Load last sync timestamp from file
   */
  loadLastSyncTime() {
    try {
      if (fs.existsSync(this.lastSyncFile)) {
        const data = JSON.parse(fs.readFileSync(this.lastSyncFile, "utf8"));
        const lastSync = new Date(data.lastSyncTime);
        return lastSync;
      }
    } catch (error) {
      // No previous sync data, starting fresh
    }

    // Default: sync from 24 hours ago
    const defaultTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return defaultTime;
  }

  /**
   * Save last sync timestamp to file
   */
  saveLastSyncTime(timestamp) {
    try {
      fs.writeFileSync(
        this.lastSyncFile,
        JSON.stringify(
          {
            lastSyncTime: timestamp.toISOString(),
            branchId: this.config.branchId,
            branchName: this.config.branchName,
          },
          null,
          2
        )
      );
    } catch (error) {
      console.error("Failed to save sync time:", error.message);
    }
  }

  /**
   * Connect to SQL Server
   */
  async connect() {
    try {
      if (!this.pool) {
        this.pool = await sql.connect(this.config.sqlServer);
      }
      return this.pool;
    } catch (error) {
      console.error("SQL Server connection failed:", error.message);
      throw error;
    }
  }

  /**
   * Disconnect from SQL Server
   */
  async disconnect() {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
    }
  }

  /**
   * Read attendance from SQL Server database
   */
  async getNewAttendance() {
    try {
      await this.connect();

      // Query to get new records since last sync with user info
      const query = `
        SELECT 
          c.USERID as enrollNumber,
          c.CHECKTIME as timestamp,
          c.CHECKTYPE as checkType,
          c.VERIFYCODE as verifyMode,
          c.SENSORID as sensorId,
          c.WorkCode as workCode,
          u.SSN as admissionNumber,
          u.Name as userName,
          u.BADGENUMBER as badgeNumber
        FROM CHECKINOUT c
        LEFT JOIN USERINFO u ON c.USERID = u.USERID
        WHERE c.CHECKTIME > @lastSyncTime
        ORDER BY c.CHECKTIME ASC
      `;

      const result = await this.pool
        .request()
        .input("lastSyncTime", sql.DateTime, this.lastSyncTime)
        .query(query);

      const records = result.recordset;

      // Map to expected format
      const enrichedRecords = records.map((record) => ({
        enrollNumber: record.enrollNumber,
        timestamp: record.timestamp, // Send as-is from SQL Server (local time)
        admissionNumber: record.admissionNumber || null,
        userName: record.userName || "Unknown",
        checkType: record.checkType || 0,
        verifyMode: record.verifyMode || 0,
        sensorId: record.sensorId || null,
        workCode: record.workCode || null,
        badgeNumber: record.badgeNumber || null,
      }));

      return enrichedRecords;
    } catch (error) {
      throw new Error(`Database query failed: ${error.message}`);
    }
  }

  /**
   * Send attendance to cloud
   */
  async sendToCloud(logs) {
    if (logs.length === 0) {
      return { success: true, synced: 0 };
    }

    try {
      const response = await axios.post(
        `${this.config.cloudApiUrl}/api/attendance/sync-from-branch`,
        {
          branchId: this.config.branchId,
          branchName: this.config.branchName,
          logs: logs,
          syncTime: new Date().toISOString(),
        },
        {
          headers: {
            Authorization: `Bearer ${this.config.apiToken}`,
            "Content-Type": "application/json",
          },
          timeout: 30000,
        }
      );

      const { processedCount, errorCount } = response.data.data;

      if (errorCount > 0) {
        console.error(`Sync errors: ${errorCount} records failed`);
      }

      return {
        success: true,
        synced: processedCount,
        errors: errorCount,
      };
    } catch (error) {
      if (error.response) {
        console.error(
          `API Error (${error.response.status}):`,
          error.response.data?.message || "Unknown error"
        );
      } else if (error.request) {
        console.error("No response from API - check internet connection");
      } else {
        console.error("Sync failed:", error.message);
      }

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Run sync once
   */
  async runSync() {
    const startTime = new Date();

    try {
      // Step 1: Read new attendance records from SQL Server
      const logs = await this.getNewAttendance();

      // Step 2: Send to cloud
      const result = await this.sendToCloud(logs);

      // Step 3: Update last sync time
      if (result.success && logs.length > 0) {
        const latestRecord = logs[logs.length - 1];
        this.lastSyncTime = new Date(latestRecord.timestamp);
        this.saveLastSyncTime(this.lastSyncTime);
      }

      const duration = ((Date.now() - startTime.getTime()) / 1000).toFixed(1);
      console.log(`⏱️  Sync completed in ${duration}s`);
      console.log("═════════════════════════════════════════\n");

      return result;
    } catch (error) {
      console.error(`Sync error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Start continuous sync
   */
  startContinuousSync() {
    // Run initial sync
    setTimeout(() => {
      this.runSync();
    }, 2000);

    // Set up interval for syncing
    setInterval(() => {
      this.runSync();
    }, this.config.syncInterval);
  }

  /**
   * Test connections
   */
  async testConnection() {
    // Test 1: SQL Server connection
    try {
      await this.connect();
    } catch (error) {
      console.error(`SQL Server error: ${error.message}`);
      return false;
    }

    // Test 2: Test tables exist
    try {
      const checkTables = await this.pool.request().query(`
        SELECT TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME IN ('CHECKINOUT', 'USERINFO')
      `);

      const tables = checkTables.recordset.map((t) => t.TABLE_NAME);

      if (!tables.includes("CHECKINOUT")) {
        throw new Error("CHECKINOUT table not found");
      }

      if (!tables.includes("USERINFO")) {
        throw new Error("USERINFO table not found");
      }
    } catch (error) {
      console.error(`Table error: ${error.message}`);
      return false;
    }

    // Test 3: Read sample data
    try {
      const logs = await this.getNewAttendance();
    } catch (error) {
      console.error(`Read error: ${error.message}`);
      return false;
    }

    // Test 4: API connection
    try {
      await axios.get(`${this.config.cloudApiUrl}/api/health`, {
        timeout: 5000,
      });
    } catch (error) {
      console.error(`API error: ${error.message}`);
      return false;
    }

    return true;
  }

  /**
   * Stop all services
   */
  async stop() {
    await this.disconnect();
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const sync = new ZKTecoMSSQLSync();

  if (args.includes("--test")) {
    const success = await sync.testConnection();
    await sync.stop();
    process.exit(success ? 0 : 1);
  } else {
    sync.startContinuousSync();

    // Graceful shutdown
    process.on("SIGINT", async () => {
      await sync.stop();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      await sync.stop();
      process.exit(0);
    });
  }
}

main().catch(async (error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
