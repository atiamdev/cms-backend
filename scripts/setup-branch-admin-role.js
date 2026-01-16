// scripts/setup-branch-admin-role.js
require("dotenv").config();
const mongoose = require("mongoose");
const { setupBranchAdminRole } = require("../utils/setupBranchAdminRole");

async function main() {
  try {
    console.log("🚀 Connecting to database...");

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log("✅ Connected to MongoDB");

    // Setup branch admin role and permissions
    const result = await setupBranchAdminRole();

    if (result.success) {
      console.log("\n🎉 Branch Admin setup completed successfully!");
      console.log(`📝 Role ID: ${result.role._id}`);
      console.log(`🔐 Permissions: ${result.role.permissions.length}`);
    } else {
      console.error("\n❌ Branch Admin setup failed:");
      console.error(result.error);
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Setup error:", error.message);
    process.exit(1);
  } finally {
    // Close database connection
    await mongoose.connection.close();
    console.log("\n🔒 Database connection closed");
  }
}

main();
