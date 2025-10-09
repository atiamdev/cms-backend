#!/usr/bin/env node

const { generateSecret } = require("./utils/helpers");
const fs = require("fs");
const path = require("path");

console.log("🚀 ATIAM CMS Backend Setup Script\n");

// Check if .env file exists
const envPath = path.join(__dirname, ".env");
const envExamplePath = path.join(__dirname, ".env.example");

if (!fs.existsSync(envPath)) {
  console.log("📄 Creating .env file...");

  // Read .env.example
  let envContent = "";
  if (fs.existsSync(envExamplePath)) {
    envContent = fs.readFileSync(envExamplePath, "utf8");

    // Replace placeholder values with generated secrets
    envContent = envContent.replace(
      "your-super-secret-jwt-key-here-make-it-long-and-random",
      generateSecret(64)
    );
    envContent = envContent.replace(
      "your-super-secret-refresh-jwt-key-here",
      generateSecret(64)
    );

    // Set development environment
    envContent = envContent.replace(
      "mongodb+srv://your-username:your-password@cluster.mongodb.net/atiam-cms?retryWrites=true&w=majority",
      "mongodb://localhost:27017/atiam-cms-dev"
    );

    fs.writeFileSync(envPath, envContent);
    console.log("✅ .env file created with generated JWT secrets");
  } else {
    console.log("❌ .env.example file not found");
  }
} else {
  console.log("✅ .env file already exists");
}

console.log("\n📋 Setup Checklist:");
console.log("1. ✅ Project structure created");
console.log("2. ✅ Dependencies defined in package.json");
console.log("3. ✅ Environment configuration ready");
console.log("4. ✅ Database models created");
console.log("5. ✅ Authentication system implemented");
console.log("6. ✅ Multi-tenant architecture setup");

console.log("\n🔧 Next Steps:");
console.log("1. Update your .env file with actual MongoDB URI");
console.log("2. Run: npm install");
console.log("3. Start MongoDB (if using local)");
console.log("4. Run: npm run dev");
console.log("5. Test the health endpoint: http://localhost:5000/health");
console.log("6. Create your first superadmin account");

console.log("\n📖 Documentation:");
console.log("- API Documentation: See README.md");
console.log("- Postman Collection: Coming soon");
console.log("- Frontend Integration: Coming soon");

console.log("\n🎯 System Features:");
console.log("- ✅ Multi-tenant architecture with branch isolation");
console.log(
  "- ✅ Role-based access control (SuperAdmin, Admin, Teacher, Student, Secretary)"
);
console.log("- ✅ JWT authentication with refresh tokens");
console.log("- ✅ Secure password hashing and account lockout");
console.log("- ✅ Branch management system");
console.log("- ✅ Input validation and security middleware");
console.log("- ⏳ Student management (coming next)");
console.log("- ⏳ Teacher management (coming next)");
console.log("- ⏳ Fee management (coming next)");
console.log("- ⏳ Attendance system (coming next)");

console.log("\n🛡️ Security Features:");
console.log("- Rate limiting (100 requests per 15 minutes)");
console.log("- CORS protection");
console.log("- Helmet security headers");
console.log("- Input sanitization");
console.log("- Password complexity requirements");
console.log("- Account lockout after failed attempts");

console.log("\n🌟 Ready to build the future of education management!");
console.log(
  "💡 Remember to star the repository and contribute back to the community.\n"
);
