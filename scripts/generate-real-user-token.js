/**
 * Generate Sync Token Using Real User
 *
 * This script generates a token for an existing admin/secretary user
 * Run this from your backend directory
 */

require("dotenv").config();
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

async function generateTokenForRealUser() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("       Generate Sync Token for Real User");
  console.log("═══════════════════════════════════════════════════════\n");

  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB\n");

    // Find the secretary user
    const secretaryEmail = "secretary@main.atiam.com";
    const user = await User.findOne({ email: secretaryEmail });

    if (!user) {
      console.error(`❌ User not found: ${secretaryEmail}`);
      console.error("\nPlease provide a valid admin or secretary email.\n");
      process.exit(1);
    }

    console.log("✅ Found user:");
    console.log(`   Name: ${user.firstName} ${user.lastName}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Roles: ${user.roles.join(", ")}`);
    console.log(`   Branch ID: ${user.branchId}`);
    console.log(`   Status: ${user.status}\n`);

    // Check if user is admin or secretary
    if (!user.roles.includes("admin") && !user.roles.includes("secretary")) {
      console.error("❌ User must have admin or secretary role");
      process.exit(1);
    }

    // Generate token using the actual user's ID
    const token = jwt.sign(
      { id: user._id.toString() }, // This matches what auth middleware expects
      process.env.JWT_SECRET,
      { expiresIn: "365d" }
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
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("✅ Token verification test: SUCCESS");
    console.log(`   User ID: ${decoded.id}\n`);

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

generateTokenForRealUser();
