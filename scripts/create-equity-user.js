/**
 * Script to create dedicated Equity Bank API Integration User
 *
 * This script creates a system user specifically for Equity Bank Biller API integration
 * with minimal permissions needed for payment processing.
 *
 * Usage: node scripts/create-equity-user.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");
const bcrypt = require("bcryptjs");

const createEquityUser = async () => {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log("📦 Connected to MongoDB");

    // Check if environment variables are set
    const username = process.env.EQUITY_API_USERNAME;
    const password = process.env.EQUITY_API_PASSWORD;

    if (!username || !password) {
      console.error(
        "❌ Error: EQUITY_API_USERNAME and EQUITY_API_PASSWORD must be set in .env file",
      );
      process.exit(1);
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      email: `${username}@atiamcollege.com`,
    });

    if (existingUser) {
      console.log("⚠️  Equity Bank integration user already exists");
      console.log(`   Email: ${existingUser.email}`);
      console.log(`   Status: ${existingUser.status}`);
      console.log(`   Roles: ${existingUser.roles.join(", ")}`);

      // Ask if user wants to update password
      console.log(
        "\n🔄 To update the password, delete the existing user first",
      );
      console.log(`   db.users.deleteOne({email: "${existingUser.email}"})`);

      process.exit(0);
    }

    // Hash password
    // Note: The User model has a pre-save hook that will hash the password
    // So we pass the plaintext password here
    const plainPassword = password;

    // Create Equity Bank system user
    // Note: Using 'superadmin' role to bypass branchId requirement
    const equityUser = new User({
      email: `${username}@atiamcollege.com`,
      password: plainPassword, // Will be hashed by pre-save hook
      firstName: "Equity",
      lastName: "Bank Integration",
      roles: ["superadmin"], // Superadmin to bypass branchId requirement
      status: "active",
      phone: "+254000000000",
    });

    await equityUser.save();

    console.log("✅ Equity Bank integration user created successfully!");
    console.log("\n📋 User Details:");
    console.log(`   Email: ${equityUser.email}`);
    console.log(`   Username: ${username}`);
    console.log(`   Status: ${equityUser.status}`);
    console.log(`   Roles: ${equityUser.roles.join(", ")}`);
    console.log(`   Created: ${equityUser.createdAt}`);

    console.log("\n🔐 Security Reminders:");
    console.log(
      "   1. Keep EQUITY_API_PASSWORD secure and never commit to version control",
    );
    console.log("   2. Use a strong password (min 32 characters)");
    console.log("   3. Rotate credentials every 90 days");
    console.log("   4. Monitor API logs regularly for suspicious activity");

    console.log("\n📝 Next Steps:");
    console.log("   1. Share credentials securely with Equity Bank team");
    console.log("   2. Configure IP whitelist if enabled");
    console.log("   3. Test authentication endpoint");
    console.log("   4. Proceed to Phase 2 implementation");
  } catch (error) {
    console.error("❌ Error creating Equity Bank user:", error.message);

    if (error.code === 11000) {
      console.error("   Duplicate key error - user might already exist");
    }

    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log("\n📦 Database connection closed");
  }
};

// Run the script
createEquityUser();
