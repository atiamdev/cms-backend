/**
 * Test script to verify Phase 1 Database Setup is complete
 *
 * This script checks:
 * 1. EquityAPILog model is accessible
 * 2. Payment model has new equityBillerDetails field
 * 3. Environment variables are set
 * 4. Database connection works
 *
 * Usage: node scripts/test-phase1-setup.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Payment = require("../models/Payment");
const EquityAPILog = require("../models/EquityAPILog");

const testPhase1Setup = async () => {
  console.log("🔍 Testing Phase 1 - Database Setup\n");
  console.log("=".repeat(60));

  let passedTests = 0;
  let failedTests = 0;

  // Test 1: Environment Variables
  console.log("\n✓ Test 1: Environment Variables");
  const requiredEnvVars = [
    "EQUITY_API_USERNAME",
    "EQUITY_API_PASSWORD",
    "EQUITY_JWT_SECRET",
    "EQUITY_JWT_EXPIRE",
    "EQUITY_REFRESH_JWT_EXPIRE",
  ];

  let envVarsPresent = true;
  requiredEnvVars.forEach((envVar) => {
    if (!process.env[envVar]) {
      console.log(`   ❌ Missing: ${envVar}`);
      envVarsPresent = false;
      failedTests++;
    } else {
      console.log(
        `   ✅ ${envVar}: ${envVar === "EQUITY_API_PASSWORD" ? "***" : "set"}`,
      );
    }
  });

  if (envVarsPresent) {
    passedTests++;
    console.log("   ✅ All required environment variables are set");
  } else {
    console.log("   ❌ Some environment variables are missing");
  }

  // Test 2: Database Connection
  console.log("\n✓ Test 2: Database Connection");
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("   ✅ Successfully connected to MongoDB");
    passedTests++;
  } catch (error) {
    console.log(`   ❌ Database connection failed: ${error.message}`);
    failedTests++;
    process.exit(1);
  }

  // Test 3: EquityAPILog Model
  console.log("\n✓ Test 3: EquityAPILog Model");
  try {
    // Check if model is loaded
    const modelExists = mongoose.models.EquityAPILog !== undefined;

    if (modelExists) {
      console.log("   ✅ EquityAPILog model is loaded");

      // Test creating a log entry
      const testLog = new EquityAPILog({
        endpoint: "/api/equity/test",
        method: "POST",
        requestBody: { test: true },
        responseBody: { success: true },
        responseCode: 200,
        ipAddress: "127.0.0.1",
        processingTime: 150,
      });

      await testLog.save();
      console.log("   ✅ Test log entry created successfully");
      console.log(`      Log ID: ${testLog._id}`);

      // Test static methods
      const stats = await EquityAPILog.getDailyStats(new Date());
      console.log("   ✅ getDailyStats method works");

      const errors = await EquityAPILog.getErrors(1);
      console.log("   ✅ getErrors method works");

      // Clean up test data
      await EquityAPILog.deleteOne({ _id: testLog._id });
      console.log("   ✅ Test log entry cleaned up");

      passedTests++;
    } else {
      console.log("   ❌ EquityAPILog model not found");
      failedTests++;
    }
  } catch (error) {
    console.log(`   ❌ EquityAPILog model test failed: ${error.message}`);
    failedTests++;
  }

  // Test 4: Payment Model Updates
  console.log("\n✓ Test 4: Payment Model - equityBillerDetails field");
  try {
    const paymentSchema = Payment.schema;

    // Check for the main field in schema tree
    const schemaTree = paymentSchema.tree;
    const hasEquityBillerDetails = schemaTree.equityBillerDetails !== undefined;

    if (hasEquityBillerDetails) {
      console.log("   ✅ equityBillerDetails field exists");

      // Check sub-fields in the schema tree
      const equityBillerFields = schemaTree.equityBillerDetails;
      const expectedFields = [
        "bankReference",
        "billNumber",
        "transactionDate",
        "confirmedAmount",
        "notificationReceived",
        "validationResponse",
        "notificationData",
      ];

      expectedFields.forEach((field) => {
        if (equityBillerFields[field]) {
          console.log(`   ✅ ${field} field exists`);
        } else {
          console.log(`   ⚠️  ${field} field not found`);
        }
      });

      passedTests++;
    } else {
      console.log("   ❌ equityBillerDetails field not found in Payment model");
      console.log("   Available fields:", Object.keys(schemaTree).join(", "));
      failedTests++;
    }
  } catch (error) {
    console.log(`   ❌ Payment model test failed: ${error.message}`);
    failedTests++;
  }

  // Test 5: Check if "equity" payment method is supported
  console.log("\n✓ Test 5: Payment Method - 'equity' support");
  try {
    const paymentSchema = Payment.schema;
    const paymentMethodEnum = paymentSchema.path("paymentMethod").enumValues;

    if (paymentMethodEnum && paymentMethodEnum.includes("equity")) {
      console.log("   ✅ 'equity' payment method is supported");
      console.log(`   Available methods: ${paymentMethodEnum.join(", ")}`);
      passedTests++;
    } else {
      console.log("   ❌ 'equity' payment method not found");
      console.log(
        `   Available methods: ${paymentMethodEnum?.join(", ") || "none"}`,
      );
      failedTests++;
    }
  } catch (error) {
    console.log(`   ❌ Payment method test failed: ${error.message}`);
    failedTests++;
  }

  // Test 6: Check if create-equity-user.js script exists
  console.log("\n✓ Test 6: Setup Script Verification");
  try {
    const fs = require("fs");
    const path = require("path");

    const scriptPath = path.join(__dirname, "create-equity-user.js");

    if (fs.existsSync(scriptPath)) {
      console.log("   ✅ create-equity-user.js script exists");
      console.log(`   Location: ${scriptPath}`);
      passedTests++;
    } else {
      console.log("   ❌ create-equity-user.js script not found");
      failedTests++;
    }
  } catch (error) {
    console.log(`   ❌ Script verification failed: ${error.message}`);
    failedTests++;
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("\n📊 Test Summary:");
  console.log(`   ✅ Passed: ${passedTests}/6 tests`);
  console.log(`   ❌ Failed: ${failedTests}/6 tests`);

  if (failedTests === 0) {
    console.log("\n🎉 Phase 1 Database Setup is COMPLETE!");
    console.log("\n📝 Next Steps:");
    console.log("   1. Run: node scripts/create-equity-user.js");
    console.log("   2. Verify user created successfully");
    console.log("   3. Proceed to Phase 2: Authentication Implementation");
  } else {
    console.log("\n⚠️  Phase 1 has some issues that need to be fixed");
    console.log("   Review the failed tests above and fix the issues");
  }

  // Close database connection
  await mongoose.connection.close();
  console.log("\n📦 Database connection closed");
};

// Run the test
testPhase1Setup().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
