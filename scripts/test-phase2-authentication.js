/**
 * Phase 2 Authentication Testing Script
 *
 * Tests all authentication-related functionality:
 * 1. JWT token generation
 * 2. Token validation
 * 3. Token refresh
 * 4. Middleware functionality
 *
 * Usage: node scripts/test-phase2-authentication.js
 */

require("dotenv").config();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const User = require("../models/User");

// Test results tracking
let passedTests = 0;
let failedTests = 0;

const testPhase2 = async () => {
  console.log("🔍 Testing Phase 2 - Authentication Implementation\n");
  console.log("=".repeat(60));

  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ Connected to MongoDB\n");

    // Test 1: Environment Variables
    console.log("✓ Test 1: Authentication Environment Variables");
    const requiredVars = [
      "EQUITY_API_USERNAME",
      "EQUITY_API_PASSWORD",
      "EQUITY_JWT_SECRET",
      "EQUITY_JWT_EXPIRE",
      "EQUITY_REFRESH_JWT_EXPIRE",
    ];

    let allVarsPresent = true;
    requiredVars.forEach((varName) => {
      if (!process.env[varName]) {
        console.log(`   ❌ Missing: ${varName}`);
        allVarsPresent = false;
        failedTests++;
      }
    });

    if (allVarsPresent) {
      console.log("   ✅ All authentication environment variables present");
      passedTests++;
    }

    // Test 2: Equity User Exists
    console.log("\n✓ Test 2: Equity Bank User Verification");
    const equityUser = await User.findOne({
      email: `${process.env.EQUITY_API_USERNAME}@system.equity`,
    });

    if (!equityUser) {
      console.log("   ❌ Equity Bank user not found");
      console.log("   Run: node scripts/create-equity-user.js");
      failedTests++;
    } else {
      console.log(`   ✅ User found: ${equityUser.email}`);
      console.log(`   Status: ${equityUser.status}`);
      console.log(`   Roles: ${equityUser.roles.join(", ")}`);
      passedTests++;
    }

    // Test 3: Password Verification
    console.log("\n✓ Test 3: Password Hash Verification");
    if (equityUser) {
      const isPasswordValid = await bcrypt.compare(
        process.env.EQUITY_API_PASSWORD,
        equityUser.password,
      );

      if (isPasswordValid) {
        console.log("   ✅ Password verification successful");
        passedTests++;
      } else {
        console.log("   ❌ Password verification failed");
        console.log("   Password in .env may not match user password");
        failedTests++;
      }
    } else {
      console.log("   ⏭️  Skipped (no user to test)");
      failedTests++;
    }

    // Test 4: JWT Token Generation
    console.log("\n✓ Test 4: JWT Access Token Generation");
    try {
      const testPayload = {
        userId: "test-user-id",
        email: "test@example.com",
        type: "access",
      };

      const accessToken = jwt.sign(testPayload, process.env.EQUITY_JWT_SECRET, {
        expiresIn: process.env.EQUITY_JWT_EXPIRE,
      });

      if (accessToken && accessToken.split(".").length === 3) {
        console.log("   ✅ Access token generated successfully");
        console.log(`   Token preview: ${accessToken.substring(0, 50)}...`);
        passedTests++;
      } else {
        console.log("   ❌ Invalid token format");
        failedTests++;
      }
    } catch (error) {
      console.log(`   ❌ Token generation failed: ${error.message}`);
      failedTests++;
    }

    // Test 5: JWT Token Verification
    console.log("\n✓ Test 5: JWT Token Verification");
    try {
      const testPayload = {
        userId: "test-user-id",
        email: "test@example.com",
        type: "access",
      };

      const token = jwt.sign(testPayload, process.env.EQUITY_JWT_SECRET, {
        expiresIn: "1h",
      });

      const decoded = jwt.verify(token, process.env.EQUITY_JWT_SECRET);

      if (
        decoded.userId === testPayload.userId &&
        decoded.email === testPayload.email
      ) {
        console.log("   ✅ Token verification successful");
        console.log(`   Decoded userId: ${decoded.userId}`);
        passedTests++;
      } else {
        console.log("   ❌ Token payload mismatch");
        failedTests++;
      }
    } catch (error) {
      console.log(`   ❌ Token verification failed: ${error.message}`);
      failedTests++;
    }

    // Test 6: Refresh Token Generation
    console.log("\n✓ Test 6: JWT Refresh Token Generation");
    try {
      const testPayload = {
        userId: "test-user-id",
        email: "test@example.com",
        type: "refresh",
      };

      const refreshToken = jwt.sign(
        testPayload,
        process.env.EQUITY_JWT_SECRET,
        { expiresIn: process.env.EQUITY_REFRESH_JWT_EXPIRE },
      );

      const decoded = jwt.verify(refreshToken, process.env.EQUITY_JWT_SECRET);

      if (decoded.type === "refresh") {
        console.log("   ✅ Refresh token generated and verified");
        console.log(`   Token type: ${decoded.type}`);
        passedTests++;
      } else {
        console.log("   ❌ Invalid refresh token type");
        failedTests++;
      }
    } catch (error) {
      console.log(`   ❌ Refresh token test failed: ${error.message}`);
      failedTests++;
    }

    // Test 7: Expired Token Detection
    console.log("\n✓ Test 7: Expired Token Detection");
    try {
      const expiredToken = jwt.sign(
        { userId: "test", type: "access" },
        process.env.EQUITY_JWT_SECRET,
        { expiresIn: "0s" }, // Expired immediately
      );

      // Wait a moment to ensure token is expired
      await new Promise((resolve) => setTimeout(resolve, 100));

      try {
        jwt.verify(expiredToken, process.env.EQUITY_JWT_SECRET);
        console.log("   ❌ Expired token was accepted (should have failed)");
        failedTests++;
      } catch (error) {
        if (error.name === "TokenExpiredError") {
          console.log("   ✅ Expired token correctly detected");
          passedTests++;
        } else {
          console.log(`   ❌ Unexpected error: ${error.name}`);
          failedTests++;
        }
      }
    } catch (error) {
      console.log(`   ❌ Expired token test failed: ${error.message}`);
      failedTests++;
    }

    // Test 8: Controller Files Exist
    console.log("\n✓ Test 8: Controller & Middleware Files");
    const fs = require("fs");
    const path = require("path");

    const requiredFiles = [
      "../controllers/equityBankController.js",
      "../middlewares/equityAuthMiddleware.js",
      "../middlewares/equityRequestLogger.js",
      "../middlewares/equityIPWhitelist.js",
      "../routes/equityBankRoutes.js",
    ];

    let allFilesExist = true;
    requiredFiles.forEach((file) => {
      const filePath = path.join(__dirname, file);
      if (fs.existsSync(filePath)) {
        console.log(`   ✅ ${file.split("/").pop()}`);
      } else {
        console.log(`   ❌ Missing: ${file}`);
        allFilesExist = false;
      }
    });

    if (allFilesExist) {
      passedTests++;
    } else {
      failedTests++;
    }

    // Test 9: Controller Functions Export
    console.log("\n✓ Test 9: Controller Functions");
    try {
      const controller = require("../controllers/equityBankController");
      const requiredFunctions = [
        "authenticateEquity",
        "refreshAccessToken",
        "validateStudent",
        "processPaymentNotification",
      ];

      let allFunctionsExist = true;
      requiredFunctions.forEach((funcName) => {
        if (typeof controller[funcName] === "function") {
          console.log(`   ✅ ${funcName}() exported`);
        } else {
          console.log(`   ❌ ${funcName}() not found`);
          allFunctionsExist = false;
        }
      });

      if (allFunctionsExist) {
        passedTests++;
      } else {
        failedTests++;
      }
    } catch (error) {
      console.log(`   ❌ Error loading controller: ${error.message}`);
      failedTests++;
    }

    // Test 10: Middleware Functions Export
    console.log("\n✓ Test 10: Middleware Functions");
    try {
      const authMiddleware = require("../middlewares/equityAuthMiddleware");
      const loggerMiddleware = require("../middlewares/equityRequestLogger");
      const ipMiddleware = require("../middlewares/equityIPWhitelist");

      const middlewareFunctions = [
        { name: "verifyEquityToken", module: authMiddleware },
        { name: "logEquityRequest", module: loggerMiddleware },
        { name: "equityIPWhitelist", module: ipMiddleware },
      ];

      let allMiddlewareExist = true;
      middlewareFunctions.forEach(({ name, module }) => {
        if (typeof module[name] === "function") {
          console.log(`   ✅ ${name}() exported`);
        } else {
          console.log(`   ❌ ${name}() not found`);
          allMiddlewareExist = false;
        }
      });

      if (allMiddlewareExist) {
        passedTests++;
      } else {
        failedTests++;
      }
    } catch (error) {
      console.log(`   ❌ Error loading middleware: ${error.message}`);
      failedTests++;
    }

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("\n📊 Test Summary:");
    console.log(`   ✅ Passed: ${passedTests}/10 tests`);
    console.log(`   ❌ Failed: ${failedTests}/10 tests`);

    if (failedTests === 0) {
      console.log("\n🎉 Phase 2 Authentication Implementation is COMPLETE!");
      console.log("\n📝 Next Steps:");
      console.log("   1. Register routes in server.js");
      console.log("   2. Start the server");
      console.log("   3. Test authentication endpoint with Postman/curl");
      console.log("   4. Proceed to Phase 3: Integration Testing");
    } else {
      console.log("\n⚠️  Phase 2 has some issues that need to be fixed");
      console.log("   Review the failed tests above");
    }
  } catch (error) {
    console.error("\n❌ Fatal error:", error);
  } finally {
    await mongoose.connection.close();
    console.log("\n📦 Database connection closed");
  }
};

// Run tests
testPhase2().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
