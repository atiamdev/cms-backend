require("dotenv").config();
const BioTimeService = require("./bioTimeService");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

class BioTimeSync {
  constructor() {
    this.config = {
      cmsApiUrl: process.env.CMS_API_URL || "http://localhost:5000",
      cmsApiToken: process.env.CMS_API_TOKEN, // JWT token for API access
      branchId: process.env.BRANCH_ID,
      branchName: process.env.BRANCH_NAME,
      syncInterval: parseInt(process.env.BIOTIME_SYNC_INTERVAL) || 3600000, // 1 hour default
      batchSize: parseInt(process.env.BIOTIME_BATCH_SIZE) || 100,
      lastSyncFile: path.join(__dirname, "biotime-last-sync.json"),
    };

    this.bioTimeService = new BioTimeService();
    this.cmsClient = axios.create({
      baseURL: this.config.cmsApiUrl,
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
        Authorization: this.config.cmsApiToken
          ? `Bearer ${this.config.cmsApiToken}`
          : "",
      },
    });

    this.lastSyncTime = this.loadLastSyncTime();
    this.isRunning = false;

    this.validateConfig();
    this.printBanner();
  }

  /**
   * Validate configuration
   */
  validateConfig() {
    const required = ["cmsApiUrl", "branchId", "branchName"];
    const missing = required.filter((key) => !this.config[key]);

    if (missing.length > 0) {
      throw new Error(`Missing required configuration: ${missing.join(", ")}`);
    }

    // Check BioTime credentials
    if (!process.env.BIOTIME_USERNAME || !process.env.BIOTIME_PASSWORD) {
      throw new Error(
        "BioTime credentials not configured. Set BIOTIME_USERNAME and BIOTIME_PASSWORD",
      );
    }

    // Check CMS API token
    if (!this.config.cmsApiToken) {
      console.warn("Warning: CMS_API_TOKEN not set. Some operations may fail.");
    }
  }

  /**
   * Print startup banner
   */
  printBanner() {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    BioTime Sync Service                      ║
║                    Version 1.0.0                            ║
╠══════════════════════════════════════════════════════════════╣
║ Branch: ${this.config.branchName.padEnd(52)} ║
║ CMS API: ${this.config.cmsApiUrl.padEnd(51)} ║
║ BioTime: http://localhost:8007${" ".repeat(30)} ║
║ Sync Interval: ${(this.config.syncInterval / 3600000).toFixed(1)}h${" ".repeat(45)} ║
║ Batch Size: ${this.config.batchSize.toString().padEnd(50)} ║
║ Branch ID: ${this.config.branchId?.toString().padEnd(50)} ║
╚══════════════════════════════════════════════════════════════╝
    `);
  }

  /**
   * Load last sync time from file
   */
  loadLastSyncTime() {
    try {
      if (fs.existsSync(this.config.lastSyncFile)) {
        const data = JSON.parse(
          fs.readFileSync(this.config.lastSyncFile, "utf8"),
        );
        return new Date(data.lastSyncTime);
      }
    } catch (error) {
      console.warn("Could not load last sync time:", error.message);
    }
    // Default to 24 hours ago if no last sync time
    return new Date(Date.now() - 24 * 60 * 60 * 1000);
  }

  /**
   * Save last sync time to file
   */
  saveLastSyncTime(syncTime) {
    try {
      const data = { lastSyncTime: syncTime.toISOString() };
      fs.writeFileSync(this.config.lastSyncFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error("Could not save last sync time:", error.message);
    }
  }

  /**
   * Get students from CMS API
   */
  async getStudentsFromCMS() {
    try {
      const params = {
        branchId: this.config.branchId,
        limit: this.config.batchSize,
        // Removed academicStatus filter to get all students
      };

      console.log("Fetching students with params:", params);

      const response = await this.cmsClient.get("/api/students", { params });

      console.log(
        "CMS /api/students response:",
        JSON.stringify(response.data, null, 2),
      );

      if (response.data && response.data.students) {
        console.log(
          `Fetched ${response.data.students.length} students from CMS`,
        );
        return response.data.students;
      }
      console.log("No students data received from CMS - response structure:", {
        hasData: !!response.data,
        dataKeys: response.data ? Object.keys(response.data) : [],
        dataType: typeof response.data,
      });
      return [];
    } catch (error) {
      console.error("Error fetching students from CMS:", error.message);
      throw error;
    }
  }

  /**
   * Sync students to BioTime
   */
  async syncStudents() {
    try {
      const students = await this.getStudentsFromCMS();

      console.log(
        `Processing ${students.length} students for area assignment...`,
      );

      for (const student of students) {
        try {
          const feeStatus = student.fees?.feeStatus || "pending";
          const areaIds = feeStatus === "paid" ? [3] : [1]; // Atiam area if paid, Not Authorized if not paid

          console.log(
            `Student ${student.studentId}: feeStatus=${feeStatus}, assigning areas=${areaIds.join(",")}`,
          );

          const studentData = {
            emp_code: student.studentId,
            first_name: student.firstName,
            last_name: student.lastName,
            mobile: student.mobile,
            email: student.email,
            department_id: student.departmentId?._id,
            area_ids: areaIds, // Set area based on fee status
            hire_date: new Date().toISOString().split("T")[0], // Today's date
            fee_status: feeStatus,
          };

          await this.bioTimeService.syncStudent(studentData);
          console.log(
            `✓ Successfully synced student: ${student.studentId} with areas ${areaIds.join(",")}`,
          );
        } catch (error) {
          console.error(
            `✗ Failed to sync student ${student.studentId}:`,
            error.message,
          );
        }
      }
    } catch (error) {
      console.error("Error syncing students:", error.message);
      throw error;
    }
  }

  /**
   * Sync attendance records from BioTime to CMS
   */
  async syncAttendance() {
    try {
      const since = this.lastSyncTime.toISOString();
      console.log(`Syncing attendance since: ${since}`);

      // Get all transactions since last sync
      const transactions = await this.bioTimeService.getTransactions({
        start_time: since,
        page_size: this.config.batchSize,
      });

      if (transactions.data && transactions.data.length > 0) {
        console.log(
          `Found ${transactions.data.length} attendance transactions`,
        );

        for (const transaction of transactions.data) {
          try {
            // Send attendance record to CMS
            const attendanceData = {
              studentId: transaction.emp_code,
              punchTime: new Date(transaction.punch_time),
              punchState: transaction.punch_state,
              punchStateDisplay: transaction.punch_state_display,
              verifyType: transaction.verify_type,
              verifyTypeDisplay: transaction.verify_type_display,
              terminalSN: transaction.terminal_sn,
              terminalAlias: transaction.terminal_alias,
              temperature: transaction.temperature,
              source: "biotime",
              branchId: this.config.branchId,
            };

            await this.cmsClient.post("/api/attendance", attendanceData);
            console.log(
              `✓ Created attendance for ${transaction.emp_code} at ${transaction.punch_time}`,
            );
          } catch (error) {
            console.error(
              `✗ Failed to sync transaction ${transaction.id}:`,
              error.message,
            );
          }
        }

        // Update last sync time to the latest transaction time
        if (transactions.data.length > 0) {
          const latestTransaction = transactions.data.reduce(
            (latest, current) =>
              new Date(current.punch_time) > new Date(latest.punch_time)
                ? current
                : latest,
          );
          this.lastSyncTime = new Date(latestTransaction.punch_time);
          this.saveLastSyncTime(this.lastSyncTime);
        }
      } else {
        console.log("No new attendance transactions found");
      }
    } catch (error) {
      console.error("Error syncing attendance:", error.message);
      throw error;
    }
  }

  /**
   * Update student access based on fee status changes from CMS
   */
  async updateAccessControls() {
    try {
      console.log(
        `Checking for fee status changes since ${this.lastSyncTime.toISOString()}...`,
      );

      const params = {
        branchId: this.config.branchId,
        since: this.lastSyncTime.toISOString(),
      };

      console.log("Fetching fee changes with params:", params);

      // Get students with recent fee status changes from CMS
      const response = await this.cmsClient.get(
        "/api/students/fee-status-changes",
        { params },
      );

      console.log(
        "CMS /api/students/fee-status-changes response:",
        JSON.stringify(response.data, null, 2),
      );

      const feeChanges = response.data?.data || [];
      console.log(`Found ${feeChanges.length} fee status changes`);

      for (const change of feeChanges) {
        try {
          const areaIds = change.feeStatus === "paid" ? [3] : [1];
          console.log(
            `Updating student ${change.studentId}: feeStatus changed to ${change.feeStatus}, assigning areas=${areaIds.join(",")}`,
          );

          await this.bioTimeService.updateStudentAccess(
            change.studentId,
            change.feeStatus,
            areaIds, // Pass area ids
          );
          console.log(
            `✓ Successfully updated access for ${change.studentId} to ${change.feeStatus} (areas: ${areaIds.join(", ")})`,
          );
        } catch (error) {
          console.error(
            `✗ Failed to update access for ${change.studentId}:`,
            error.message,
          );
        }
      }

      if (feeChanges.length === 0) {
        console.log("No fee status changes found");
      }
    } catch (error) {
      console.error("Error updating access controls:", error.message);
    }
  }

  /**
   * Main sync process
   */
  async sync() {
    if (this.isRunning) {
      console.log("Sync already running, skipping...");
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      console.log(`\n[${new Date().toISOString()}] Starting BioTime sync...`);

      // Step 1: Sync students from CMS to BioTime
      console.log("Step 1: Syncing students...");
      await this.syncStudents();
      console.log("Step 1 completed");

      // Step 2: Update access controls based on fee status
      console.log("Step 2: Updating access controls...");
      await this.updateAccessControls();
      console.log("Step 2 completed");

      // Step 3: Sync attendance records from BioTime to CMS
      console.log("Step 3: Syncing attendance...");
      await this.syncAttendance();
      console.log("Step 3 completed");

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(
        `[${new Date().toISOString()}] BioTime sync completed in ${duration}s`,
      );
    } catch (error) {
      console.error("Sync failed:", error.message);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Start continuous sync
   */
  async start() {
    console.log("Starting BioTime sync service...");

    // Initial sync
    await this.sync();

    // Set up interval for continuous sync
    setInterval(async () => {
      await this.sync();
    }, this.config.syncInterval);
  }

  /**
   * Stop sync service
   */
  stop() {
    console.log("Stopping BioTime sync service...");
    this.isRunning = false;
  }
}

// Export for use in other modules
module.exports = BioTimeSync;

// If run directly, start the sync service
if (require.main === module) {
  const syncService = new BioTimeSync();

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nReceived SIGINT, shutting down gracefully...");
    syncService.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\nReceived SIGTERM, shutting down gracefully...");
    syncService.stop();
    process.exit(0);
  });

  syncService.start().catch((error) => {
    console.error("Failed to start sync service:", error);
    process.exit(1);
  });
}
