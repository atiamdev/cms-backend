require("dotenv").config();
const MDBReader = require("mdb-reader");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

class ZKTecoSyncWithCopy {
  constructor() {
    this.config = {
      branchId: process.env.BRANCH_ID,
      branchName: process.env.BRANCH_NAME,
      cloudApiUrl: process.env.CLOUD_API_URL || "https://your-api.com",
      apiToken: process.env.API_TOKEN,
      dbPath:
        process.env.ZKTECO_DB_PATH ||
        "C:\\Program Files (x86)\\ZKTime5.0\\att2000.mdb",
      dbCopyPath:
        process.env.ZKTECO_DB_COPY_PATH ||
        "C:\\Program Files (x86)\\ZKTime5.0\\att2000_copy.mdb",
      syncInterval: parseInt(process.env.SYNC_INTERVAL) || 60000, // 1 minute default
      copyInterval: parseInt(process.env.COPY_INTERVAL) || 30000, // 30 seconds
      batchSize: parseInt(process.env.BATCH_SIZE) || 100,
      useCopy: process.env.USE_DB_COPY !== "false", // Default to true
    };

    this.validateConfig();
    this.lastSyncFile = path.join(__dirname, "last-sync.json");
    this.lastSyncTime = this.loadLastSyncTime();
    this.copyInterval = null;

    this.printBanner();
  }

  /**
   * Validate configuration
   */
  validateConfig() {
    const required = ["branchId", "apiToken", "cloudApiUrl"];
    const missing = required.filter((key) => !this.config[key]);

    if (missing.length > 0) {
      throw new Error(`Missing required configuration: ${missing.join(", ")}`);
    }

    // Check if database file exists
    if (!fs.existsSync(this.config.dbPath)) {
      throw new Error(`ZKTeco database not found: ${this.config.dbPath}`);
    }
  }

  /**
   * Print banner
   */
  printBanner() {
    console.log("═══════════════════════════════════════════");
    console.log("   ZKTeco Attendance Sync (Copy Mode)");
    console.log("═══════════════════════════════════════════");
    console.log(`Branch: ${this.config.branchName}`);
    console.log(`Branch ID: ${this.config.branchId}`);
    console.log(`Original DB: ${this.config.dbPath}`);
    console.log(`Copy DB: ${this.config.dbCopyPath}`);
    console.log(
      `Copy Mode: ${this.config.useCopy ? "ENABLED ✅" : "DISABLED"}`
    );
    console.log(`Sync Interval: ${this.config.syncInterval / 1000}s`);
    console.log(`Copy Interval: ${this.config.copyInterval / 1000}s`);
    console.log("═══════════════════════════════════════════\n");
  }

  /**
   * Load last sync timestamp from file
   */
  loadLastSyncTime() {
    try {
      if (fs.existsSync(this.lastSyncFile)) {
        const data = JSON.parse(fs.readFileSync(this.lastSyncFile, "utf8"));
        const lastSync = new Date(data.lastSyncTime);
        console.log(`📅 Last sync: ${lastSync.toLocaleString()}\n`);
        return lastSync;
      }
    } catch (error) {
      console.log("⚠️  No previous sync data, starting fresh\n");
    }

    // Default: sync from 24 hours ago
    const defaultTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
    console.log(`📅 Starting sync from: ${defaultTime.toLocaleString()}`);
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
   * Copy the database file
   */
  async copyDatabase() {
    try {
      console.log("📋 Copying database file...");

      const startTime = Date.now();

      // Use file system copy (fast, doesn't need database to be unlocked)
      fs.copyFileSync(this.config.dbPath, this.config.dbCopyPath);

      const duration = Date.now() - startTime;
      console.log(`✅ Database copied in ${duration}ms\n`);

      return true;
    } catch (error) {
      // Even if copying fails, we can still try to use the old copy
      if (error.code === "EBUSY" || error.code === "EACCES") {
        console.warn("⚠️  Original database is in use, using existing copy\n");

        // Check if copy exists and is recent
        if (fs.existsSync(this.config.dbCopyPath)) {
          const stats = fs.statSync(this.config.dbCopyPath);
          const ageMinutes = (Date.now() - stats.mtimeMs) / 60000;

          if (ageMinutes < 5) {
            console.log(
              `✅ Using existing copy (${Math.round(ageMinutes)} min old)\n`
            );
            return true;
          } else {
            console.warn(`⚠️  Copy is ${Math.round(ageMinutes)} minutes old\n`);
          }
        }
      } else {
        console.error("❌ Database copy failed:", error.message);
      }

      return false;
    }
  }

  /**
   * Read attendance from database (original or copy)
   */
  async getNewAttendance() {
    try {
      const dbToRead = this.config.useCopy
        ? this.config.dbCopyPath
        : this.config.dbPath;

      console.log(`📊 Reading from: ${path.basename(dbToRead)}`);

      if (!fs.existsSync(dbToRead)) {
        throw new Error(`Database file not found: ${dbToRead}`);
      }

      const buffer = fs.readFileSync(dbToRead);
      const reader = new MDBReader(buffer);

      const checkinoutTable = reader.getTable("CHECKINOUT");
      const userinfoTable = reader.getTable("USERINFO");

      if (!checkinoutTable) {
        throw new Error("CHECKINOUT table not found in database");
      }
      if (!userinfoTable) {
        throw new Error("USERINFO table not found in database");
      }

      const checkinoutData = checkinoutTable.getData();
      const userinfoData = userinfoTable.getData();

      // Filter records since last sync
      const newRecords = checkinoutData.filter((record) => {
        const checkTime = new Date(record.CHECKTIME);
        return checkTime > this.lastSyncTime;
      });

      console.log(`   Total records in DB: ${checkinoutData.length}`);
      console.log(`   New records since last sync: ${newRecords.length}\n`);

      // Join with user info
      const enrichedRecords = newRecords.map((record) => {
        const user = userinfoData.find((u) => u.USERID === record.USERID);

        return {
          enrollNumber: record.USERID,
          timestamp: record.CHECKTIME,
          admissionNumber: user?.SSN || null,
          userName: user?.Name || "Unknown",
          checkType: record.CHECKTYPE,
        };
      });

      return enrichedRecords;
    } catch (error) {
      throw new Error(`Database read failed: ${error.message}`);
    }
  }

  /**
   * Send attendance to cloud
   */
  async sendToCloud(logs) {
    if (logs.length === 0) {
      console.log("⏭️  No new records to sync\n");
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

      console.log(`✅ Synced: ${processedCount} records`);
      if (errorCount > 0) {
        console.warn(`⚠️  Errors: ${errorCount} records failed`);
      }
      console.log("");

      return {
        success: true,
        synced: processedCount,
        errors: errorCount,
      };
    } catch (error) {
      if (error.response) {
        console.error(
          `❌ API Error (${error.response.status}):`,
          error.response.data?.message || "Unknown error"
        );
      } else if (error.request) {
        console.error("❌ No response from API - check internet connection");
      } else {
        console.error("❌ Sync failed:", error.message);
      }
      console.log("");

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
    console.log(`🔄 Sync started at ${startTime.toLocaleString()}`);
    console.log("─────────────────────────────────────────\n");

    try {
      // Step 1: Copy database if enabled
      if (this.config.useCopy) {
        await this.copyDatabase();
      }

      // Step 2: Read new attendance records
      const logs = await this.getNewAttendance();

      // Step 3: Send to cloud
      const result = await this.sendToCloud(logs);

      // Step 4: Update last sync time
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
      console.error(`❌ Sync error: ${error.message}\n`);
      console.log("═════════════════════════════════════════\n");

      return { success: false, error: error.message };
    }
  }

  /**
   * Start continuous database copying (runs more frequently)
   */
  startDatabaseCopying() {
    if (!this.config.useCopy) {
      console.log("ℹ️  Database copying disabled\n");
      return;
    }

    console.log(
      `🔄 Starting database copy service (every ${
        this.config.copyInterval / 1000
      }s)\n`
    );

    // Initial copy
    this.copyDatabase();

    // Set up interval for copying
    this.copyInterval = setInterval(() => {
      this.copyDatabase();
    }, this.config.copyInterval);
  }

  /**
   * Start continuous sync
   */
  startContinuousSync() {
    console.log(
      `🚀 Starting continuous sync (every ${
        this.config.syncInterval / 1000
      }s)\n`
    );

    // Start database copying (if enabled)
    this.startDatabaseCopying();

    // Run initial sync after first copy completes
    setTimeout(() => {
      this.runSync();
    }, 2000);

    // Set up interval for syncing
    setInterval(() => {
      this.runSync();
    }, this.config.syncInterval);

    console.log("✅ Sync service running\n");
  }

  /**
   * Test connections
   */
  async testConnection() {
    console.log("🧪 Testing connections...\n");

    // Test 1: Database access
    console.log("1️⃣  Testing database access...");
    try {
      if (!fs.existsSync(this.config.dbPath)) {
        throw new Error("Database file not found");
      }
      console.log("   ✅ Original database found\n");

      // Try to copy
      if (this.config.useCopy) {
        const copied = await this.copyDatabase();
        if (copied) {
          console.log("   ✅ Database copy successful\n");
        }
      }
    } catch (error) {
      console.log(`   ❌ Database error: ${error.message}\n`);
      return false;
    }

    // Test 2: Read database
    console.log("2️⃣  Testing database read...");
    try {
      const logs = await this.getNewAttendance();
      console.log(`   ✅ Successfully read ${logs.length} records\n`);
    } catch (error) {
      console.log(`   ❌ Read error: ${error.message}\n`);
      return false;
    }

    // Test 3: API connection
    console.log("3️⃣  Testing cloud API...");
    try {
      await axios.get(`${this.config.cloudApiUrl}/api/health`, {
        timeout: 5000,
      });
      console.log("   ✅ API is reachable\n");
    } catch (error) {
      console.log(`   ❌ API error: ${error.message}\n`);
      console.log(`   Check: ${this.config.cloudApiUrl}\n`);
      return false;
    }

    console.log("✅ All tests passed!\n");
    return true;
  }

  /**
   * Stop all services
   */
  stop() {
    if (this.copyInterval) {
      clearInterval(this.copyInterval);
    }
    console.log("🛑 Sync service stopped");
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const sync = new ZKTecoSyncWithCopy();

  if (args.includes("--test")) {
    const success = await sync.testConnection();
    process.exit(success ? 0 : 1);
  } else {
    sync.startContinuousSync();

    // Graceful shutdown
    process.on("SIGINT", () => {
      console.log("\n⏹️  Shutting down...");
      sync.stop();
      process.exit(0);
    });

    process.on("SIGTERM", () => {
      console.log("\n⏹️  Shutting down...");
      sync.stop();
      process.exit(0);
    });
  }
}

main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
