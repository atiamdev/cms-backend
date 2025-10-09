const mongoose = require("mongoose");
const FeeStructure = require("./models/FeeStructure");
const Branch = require("./models/Branch");
const Class = require("./models/Class");
const User = require("./models/User");

// Fee Management System Setup Script
const setupFeeManagement = async () => {
  try {
    console.log("🚀 Setting up Fee Management System...");

    // Check if required models exist
    const collections = await mongoose.connection.db
      .listCollections()
      .toArray();
    const collectionNames = collections.map((c) => c.name);

    const requiredCollections = ["branches", "classes", "users", "students"];
    const missingCollections = requiredCollections.filter(
      (name) => !collectionNames.includes(name)
    );

    if (missingCollections.length > 0) {
      console.warn("⚠️ Missing required collections:", missingCollections);
      console.log("Please ensure the core CMS models are set up first.");
      return;
    }

    // Create indexes for optimal performance
    console.log("📊 Creating database indexes...");

    // Fee indexes
    await mongoose.connection.db
      .collection("fees")
      .createIndex(
        { branchId: 1, studentId: 1, academicYear: 1, academicTerm: 1 },
        { name: "fee_student_academic_idx" }
      );

    await mongoose.connection.db
      .collection("fees")
      .createIndex(
        { branchId: 1, status: 1 },
        { name: "fee_branch_status_idx" }
      );

    await mongoose.connection.db
      .collection("fees")
      .createIndex(
        { branchId: 1, dueDate: 1 },
        { name: "fee_branch_duedate_idx" }
      );

    // Payment indexes
    await mongoose.connection.db
      .collection("payments")
      .createIndex(
        { branchId: 1, paymentDate: -1 },
        { name: "payment_branch_date_idx" }
      );

    await mongoose.connection.db
      .collection("payments")
      .createIndex(
        { "mpesaDetails.transactionId": 1 },
        { name: "payment_mpesa_transaction_idx", sparse: true }
      );

    await mongoose.connection.db
      .collection("payments")
      .createIndex(
        { receiptNumber: 1 },
        { name: "payment_receipt_idx", unique: true }
      );

    // Fee structure indexes
    await mongoose.connection.db
      .collection("feestructures")
      .createIndex(
        { branchId: 1, classId: 1, academicYear: 1, academicTerm: 1 },
        { name: "feestructure_unique_idx", unique: true }
      );

    console.log("✅ Database indexes created successfully");

    // Create sample fee structure if none exists
    const existingStructures = await FeeStructure.countDocuments();
    if (existingStructures === 0) {
      console.log("📋 Creating sample fee structure...");

      // Get first branch and class for sample data
      const sampleBranch = await Branch.findOne();
      const sampleClass = await Class.findOne({ branchId: sampleBranch._id });
      const adminUser = await User.findOne({ roles: { $in: ["admin"] } });

      if (sampleBranch && sampleClass && adminUser) {
        const sampleFeeStructure = new FeeStructure({
          branchId: sampleBranch._id,
          classId: sampleClass._id,
          academicYear: "2024/2025",
          academicTerm: "Term 1",
          feeComponents: [
            {
              name: "Tuition Fee",
              amount: 50000,
              isOptional: false,
              description: "Main tuition fee for the term",
            },
            {
              name: "Laboratory Fee",
              amount: 5000,
              isOptional: false,
              description: "Laboratory equipment and materials",
            },
            {
              name: "Library Fee",
              amount: 2000,
              isOptional: false,
              description: "Library access and maintenance",
            },
            {
              name: "Sports Fee",
              amount: 3000,
              isOptional: true,
              description: "Sports activities and equipment",
            },
          ],
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
          allowInstallments: true,
          installmentSchedule: [
            {
              installmentNumber: 1,
              amount: 35000,
              dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days
            },
            {
              installmentNumber: 2,
              amount: 25000,
              dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
            },
          ],
          lateFeeAmount: 2000,
          lateFeeGracePeriod: 7,
          createdBy: adminUser._id,
        });

        await sampleFeeStructure.save();
        console.log("✅ Sample fee structure created");
      } else {
        console.log(
          "⚠️ Could not create sample fee structure - missing required data"
        );
      }
    }

    // Verify environment variables
    console.log("🔧 Checking environment configuration...");

    const requiredEnvVars = [
      "MPESA_CONSUMER_KEY",
      "MPESA_CONSUMER_SECRET",
      "MPESA_BUSINESS_SHORTCODE",
      "MPESA_PASSKEY",
      "MPESA_CALLBACK_URL",
      "EMAIL_USER",
      "EMAIL_PASSWORD",
    ];

    const missingEnvVars = requiredEnvVars.filter(
      (varName) => !process.env[varName]
    );

    if (missingEnvVars.length > 0) {
      console.warn("⚠️ Missing environment variables:", missingEnvVars);
      console.log("Please check your .env file and configure these variables.");
    } else {
      console.log("✅ Environment configuration looks good");
    }

    // Test M-Pesa connection (sandbox)
    if (process.env.MPESA_ENVIRONMENT === "sandbox") {
      try {
        console.log("🧪 Testing M-Pesa sandbox connection...");
        const axios = require("axios");

        const auth = Buffer.from(
          `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
        ).toString("base64");

        const response = await axios.get(
          "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
          {
            headers: { Authorization: `Basic ${auth}` },
            timeout: 10000,
          }
        );

        if (response.data.access_token) {
          console.log("✅ M-Pesa sandbox connection successful");
        }
      } catch (error) {
        console.warn("⚠️ M-Pesa sandbox connection failed:", error.message);
        console.log("Please verify your M-Pesa credentials");
      }
    }

    console.log("\n🎉 Fee Management System setup completed!");
    console.log("\n📚 Next steps:");
    console.log("1. Create fee structures for your classes");
    console.log("2. Assign fees to students");
    console.log(
      "3. Configure M-Pesa callback URL (must be HTTPS in production)"
    );
    console.log("4. Test payment flows in sandbox environment");
    console.log(
      "5. Review the FEE_MANAGEMENT_README.md for detailed documentation"
    );
  } catch (error) {
    console.error("❌ Setup failed:", error);
    process.exit(1);
  }
};

// Run setup if this script is executed directly
if (require.main === module) {
  require("dotenv").config();

  mongoose
    .connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    })
    .then(() => {
      console.log("📡 Connected to MongoDB");
      return setupFeeManagement();
    })
    .then(() => {
      mongoose.connection.close();
      console.log("🔌 Database connection closed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Database connection failed:", error);
      process.exit(1);
    });
}

module.exports = { setupFeeManagement };
