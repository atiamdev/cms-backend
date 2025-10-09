require("dotenv").config();

console.log("🔍 Environment Check\n");
console.log("=".repeat(60));

// 1. Check Node.js version
console.log("\n1️⃣  Node.js Version:");
console.log(`   ${process.version}`);
if (parseInt(process.version.split(".")[0].substring(1)) < 14) {
  console.log("   ⚠️  Node.js 14+ recommended");
} else {
  console.log("   ✅ OK");
}

// 2. Check environment variables
console.log("\n2️⃣  Environment Variables:");
console.log(`   SQL_SERVER: ${process.env.SQL_SERVER || "(not set)"}`);
console.log(`   SQL_DATABASE: ${process.env.SQL_DATABASE || "(not set)"}`);
console.log(`   CLOUD_API_URL: ${process.env.CLOUD_API_URL || "(not set)"}`);
console.log(`   BRANCH_ID: ${process.env.BRANCH_ID || "(not set)"}`);
console.log(
  `   API_TOKEN: ${
    process.env.API_TOKEN
      ? "***" + process.env.API_TOKEN.slice(-10)
      : "(not set)"
  }`
);

// 3. Check required modules
console.log("\n3️⃣  Required Modules:");
const modules = ["mssql", "dotenv", "axios"];
modules.forEach((mod) => {
  try {
    const pkg = require(`${mod}/package.json`);
    console.log(`   ✅ ${mod} v${pkg.version}`);
  } catch (e) {
    console.log(`   ❌ ${mod} - NOT INSTALLED`);
  }
});

// 4. Check optional modules
console.log("\n4️⃣  Optional Modules:");
try {
  const pkg = require("msnodesqlv8/package.json");
  console.log(`   ✅ msnodesqlv8 v${pkg.version} (Windows native driver)`);
} catch (e) {
  console.log(
    `   ⚠️  msnodesqlv8 - Not installed (may be needed for Windows Auth)`
  );
  console.log("      Install with: npm install msnodesqlv8");
}

// 5. Platform check
console.log("\n5️⃣  Platform:");
console.log(`   OS: ${process.platform}`);
console.log(`   Architecture: ${process.arch}`);
if (process.platform !== "win32") {
  console.log("   ⚠️  SQL Server Express typically runs on Windows");
  console.log(
    "      Make sure you're running this script on the Windows machine"
  );
}

// 6. Check .env file
const fs = require("fs");
const path = require("path");
console.log("\n6️⃣  Configuration File:");
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  console.log(`   ✅ .env file found at: ${envPath}`);
  const content = fs.readFileSync(envPath, "utf8");
  const hasSQL =
    content.includes("SQL_SERVER") && content.includes("SQL_DATABASE");
  if (hasSQL) {
    console.log("   ✅ SQL Server configuration present");
  } else {
    console.log("   ⚠️  SQL Server configuration missing in .env");
  }
} else {
  console.log(`   ❌ .env file not found!`);
  console.log("      Create .env file in the same directory as this script");
}

console.log("\n" + "=".repeat(60));
console.log("\n📋 Next Steps:\n");

if (process.platform !== "win32") {
  console.log(
    "⚠️  You're on " +
      process.platform +
      ", but SQL Server is typically on Windows."
  );
  console.log("   Copy this folder to your Windows machine and run there.\n");
} else {
  console.log("✅ You're on Windows. Now run the connection test:");
  console.log("   npm test\n");
}

console.log("If you need to install packages:");
console.log("   npm install\n");

console.log("For detailed troubleshooting:");
console.log("   See TROUBLESHOOTING.md\n");
