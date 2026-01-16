/**
 * Generate API Token for Branch Sync Service
 *
 * This script helps you create authentication tokens for each branch's sync service.
 * Run this on your backend server to generate secure tokens.
 *
 * Usage:
 *   node generate-sync-token.js
 */

require("dotenv").config();
const jwt = require("jsonwebtoken");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function generateToken() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("       Generate API Token for Branch Sync");
  console.log("═══════════════════════════════════════════════════════\n");

  try {
    // Get branch information
    const branchId = await question("Enter Branch ID (MongoDB ObjectId): ");
    const branchName = await question("Enter Branch Name: ");
    const adminEmail = await question(
      "Enter admin/secretary email for this branch: "
    );

    if (!branchId || !branchName || !adminEmail) {
      console.error("\n❌ All fields are required!");
      process.exit(1);
    }

    // Check if JWT_SECRET exists
    if (!process.env.JWT_SECRET) {
      console.error("\n❌ JWT_SECRET not found in .env file!");
      console.error("Please set JWT_SECRET in your backend .env file");
      process.exit(1);
    }

    // Create token payload
    const payload = {
      user: {
        id: "sync-service-" + branchId,
        email: adminEmail,
        roles: ["admin"],
        branchId: branchId,
        purpose: "attendance-sync",
      },
    };

    // Generate token (long expiry for sync service)
    const token = jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: "365d" } // 1 year
    );

    console.log("\n" + "═".repeat(60));
    console.log("✅ Token Generated Successfully!");
    console.log("═".repeat(60));
    console.log("\nBranch Information:");
    console.log(`  ID: ${branchId}`);
    console.log(`  Name: ${branchName}`);
    console.log(`  Admin Email: ${adminEmail}`);
    console.log("\n" + "─".repeat(60));
    console.log("API Token (copy this to .env file on Windows PC):");
    console.log("─".repeat(60));
    console.log(`\n${token}\n`);
    console.log("─".repeat(60));
    console.log("\nAdd to .env file on branch Windows PC:");
    console.log("─".repeat(60));
    console.log(`BRANCH_ID=${branchId}`);
    console.log(`BRANCH_NAME=${branchName}`);
    console.log(`API_TOKEN=${token}`);
    console.log("─".repeat(60));
    console.log("\n⚠️  Important:");
    console.log("  - Keep this token secure");
    console.log("  - Do not share publicly");
    console.log("  - Token expires in 1 year");
    console.log("  - Generate new token if compromised\n");
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Run the generator
generateToken();
