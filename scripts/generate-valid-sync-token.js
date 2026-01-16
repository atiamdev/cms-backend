/**
 * Generate Valid Sync Token
 *
 * This script generates a token using your backend's JWT_SECRET
 * Run this from your backend directory where .env file is located
 */

require("dotenv").config();
const jwt = require("jsonwebtoken");

console.log("═══════════════════════════════════════════════════════");
console.log("       Generate Valid Sync Token");
console.log("═══════════════════════════════════════════════════════\n");

// Check if JWT_SECRET exists
if (!process.env.JWT_SECRET) {
  console.error("❌ JWT_SECRET not found in .env file!");
  console.error(
    "Please make sure you are running this from cms-backend directory"
  );
  console.error("and that .env file contains JWT_SECRET\n");
  process.exit(1);
}

// Your branch information (update these)
const branchId = "688a1618d2efc2d48aad4cc7";
const branchName = "Town Campus Nairobi";
const adminEmail = "secretary@main.atiam.com";

console.log("Branch Information:");
console.log(`  Branch ID: ${branchId}`);
console.log(`  Branch Name: ${branchName}`);
console.log(`  Admin Email: ${adminEmail}\n`);

// Create token payload
const payload = {
  user: {
    id: `sync-service-${branchId}`,
    email: adminEmail,
    roles: ["admin"],
    branchId: branchId,
    purpose: "attendance-sync",
  },
};

// Generate token with your backend's JWT_SECRET
const token = jwt.sign(
  payload,
  process.env.JWT_SECRET, // This is the key - using your actual secret
  { expiresIn: "365d" } // 1 year
);

console.log("═══════════════════════════════════════════════════════");
console.log("✅ Token Generated Successfully!");
console.log("═══════════════════════════════════════════════════════\n");
console.log("Copy this token to your sync .env file:\n");
console.log("─".repeat(60));
console.log(token);
console.log("─".repeat(60));
console.log("\nAdd to sync/.env file:");
console.log("─".repeat(60));
console.log(`API_TOKEN=${token}`);
console.log("─".repeat(60));
console.log("\n✅ This token is valid for 365 days\n");

// Verify the token works
try {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  console.log("✅ Token verification test: SUCCESS");
  console.log("Token contains:", JSON.stringify(decoded, null, 2));
} catch (error) {
  console.error("❌ Token verification failed:", error.message);
}
