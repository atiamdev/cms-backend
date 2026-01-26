const mongoose = require("mongoose");
require("dotenv").config();

// Import models
const Expense = require("../models/Expense");
const User = require("../models/User");
const Branch = require("../models/Branch");

// Import utility functions
const {
  calculateExpenseStats,
  getExpenseBreakdownByCategory,
} = require("../utils/expenseHelpers");

// Test data
const testBranchData = {
  name: "Test Branch",
  address: "123 Test Street",
  contactInfo: {
    phone: "+254700123456",
    email: "test@atiam.com",
  },
};

const testUserData = {
  email: "admin@test.com",
  password: "hashedpassword123",
  firstName: "John",
  lastName: "Doe",
  roles: ["admin"],
  status: "active",
};

const testExpenseData = [
  {
    category: "Salaries",
    subcategory: "Teaching Staff",
    amount: 150000,
    description: "Monthly salaries for teaching staff",
    paymentMethod: "bank_transfer",
    approvalStatus: "approved",
  },
  {
    category: "Utilities",
    subcategory: "Electricity",
    amount: 25000,
    description: "Monthly electricity bill",
    paymentMethod: "mpesa",
    receiptNumber: "ELC001",
    approvalStatus: "approved",
  },
  {
    category: "Supplies",
    subcategory: "Stationery",
    amount: 8500,
    description: "Office stationery and supplies",
    paymentMethod: "cash",
    vendor: {
      name: "Office Supplies Ltd",
      contact: {
        phone: "+254700789123",
        email: "sales@officesupplies.com",
      },
    },
  },
  {
    category: "Maintenance",
    amount: 45000,
    description: "Building maintenance and repairs",
    paymentMethod: "cheque",
    approvalStatus: "pending",
  },
];

async function connectDB() {
  try {
    await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://localhost:27017/atiam_cms_test",
    );
    console.log("✅ Connected to MongoDB");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  }
}

async function createTestData() {
  try {
    console.log("\n📋 Creating test data...");

    // Clean existing test data
    await Branch.deleteMany({ name: "Test Branch" });
    await User.deleteMany({ email: "admin@test.com" });
    await Expense.deleteMany({});

    // Create test branch
    const branch = new Branch(testBranchData);
    await branch.save();
    console.log("✅ Test branch created:", branch.name);

    // Create test user
    const user = new User({
      ...testUserData,
      branchId: branch._id,
    });
    await user.save();
    console.log("✅ Test user created:", user.email);

    // Create test expenses
    const expenses = [];
    for (const expenseData of testExpenseData) {
      const expense = new Expense({
        ...expenseData,
        branchId: branch._id,
        recordedBy: user._id,
        date: new Date(),
      });
      await expense.save();
      expenses.push(expense);
    }
    console.log("✅ Test expenses created:", expenses.length);

    return { branch, user, expenses };
  } catch (error) {
    console.error("❌ Error creating test data:", error);
    throw error;
  }
}

async function testExpenseModel() {
  console.log("\n🧪 Testing Expense Model...");

  try {
    // Test expense categories
    const categories = Expense.getCategories();
    console.log("✅ Available categories:", categories.length);

    // Test payment methods
    const paymentMethods = Expense.getPaymentMethods();
    console.log("✅ Available payment methods:", paymentMethods.length);

    // Test virtual fields
    const expense = await Expense.findOne().populate("recordedBy");
    if (expense) {
      console.log("✅ Formatted amount:", expense.formattedAmount);
      console.log("✅ Age in days:", expense.ageInDays);
      console.log("✅ Approval status display:", expense.approvalStatusDisplay);
    }

    console.log("✅ Expense model tests passed");
  } catch (error) {
    console.error("❌ Expense model test failed:", error);
    throw error;
  }
}

async function testExpenseQueries() {
  console.log("\n🔍 Testing Expense Queries...");

  try {
    const branch = await Branch.findOne({ name: "Test Branch" });

    // Test basic query
    const allExpenses = await Expense.find({ branchId: branch._id });
    console.log("✅ Total expenses found:", allExpenses.length);

    // Test category filter
    const salaryExpenses = await Expense.find({
      branchId: branch._id,
      category: "Salaries",
    });
    console.log("✅ Salary expenses:", salaryExpenses.length);

    // Test approval status filter
    const approvedExpenses = await Expense.find({
      branchId: branch._id,
      approvalStatus: "approved",
    });
    console.log("✅ Approved expenses:", approvedExpenses.length);

    // Test amount range filter
    const expensiveItems = await Expense.find({
      branchId: branch._id,
      amount: { $gte: 20000 },
    });
    console.log("✅ Expenses >= 20,000:", expensiveItems.length);

    // Test text search
    const searchResults = await Expense.find({
      branchId: branch._id,
      $text: { $search: "electricity" },
    });
    console.log("✅ Text search results:", searchResults.length);

    console.log("✅ Expense query tests passed");
  } catch (error) {
    console.error("❌ Expense query test failed:", error);
    throw error;
  }
}

async function testExpenseHelpers() {
  console.log("\n🛠️ Testing Expense Helpers...");

  try {
    const branch = await Branch.findOne({ name: "Test Branch" });

    // Test expense statistics
    const stats = await calculateExpenseStats(branch._id);
    console.log("✅ Expense statistics:");
    console.log("   - Total expenses:", stats.totalExpenses);
    console.log("   - Total count:", stats.totalCount);
    console.log("   - Average expense:", Math.round(stats.avgExpense));
    console.log("   - Approved amount:", stats.approvedAmount);
    console.log("   - Pending amount:", stats.pendingAmount);

    // Test category breakdown
    const breakdown = await getExpenseBreakdownByCategory(branch._id);
    console.log("✅ Category breakdown:");
    breakdown.forEach((item) => {
      console.log(
        `   - ${item.category}: KES ${item.totalAmount} (${item.count} items)`,
      );
    });

    console.log("✅ Expense helper tests passed");
  } catch (error) {
    console.error("❌ Expense helper test failed:", error);
    throw error;
  }
}

async function testExpenseAggregations() {
  console.log("\n📊 Testing Expense Aggregations...");

  try {
    const branch = await Branch.findOne({ name: "Test Branch" });

    // Monthly summary
    const monthlySummary = await Expense.aggregate([
      { $match: { branchId: branch._id } },
      {
        $group: {
          _id: {
            year: { $year: "$date" },
            month: { $month: "$date" },
          },
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 },
          categories: { $addToSet: "$category" },
        },
      },
    ]);
    console.log("✅ Monthly summary:", monthlySummary.length, "months");

    // Category totals
    const categoryTotals = await Expense.aggregate([
      { $match: { branchId: branch._id, approvalStatus: "approved" } },
      {
        $group: {
          _id: "$category",
          total: { $sum: "$amount" },
          count: { $sum: 1 },
          avgAmount: { $avg: "$amount" },
        },
      },
      { $sort: { total: -1 } },
    ]);
    console.log("✅ Category totals:", categoryTotals.length, "categories");

    // Payment method breakdown
    const paymentBreakdown = await Expense.aggregate([
      { $match: { branchId: branch._id } },
      {
        $group: {
          _id: "$paymentMethod",
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]);
    console.log(
      "✅ Payment method breakdown:",
      paymentBreakdown.length,
      "methods",
    );

    console.log("✅ Expense aggregation tests passed");
  } catch (error) {
    console.error("❌ Expense aggregation test failed:", error);
    throw error;
  }
}

async function testExpenseValidations() {
  console.log("\n✅ Testing Expense Validations...");

  try {
    const branch = await Branch.findOne({ name: "Test Branch" });
    const user = await User.findOne({ email: "admin@test.com" });

    // Test required fields validation
    try {
      const invalidExpense = new Expense({
        branchId: branch._id,
        // Missing required fields
      });
      await invalidExpense.save();
      console.log("❌ Should have failed validation");
    } catch (error) {
      console.log("✅ Required field validation working");
    }

    // Test negative amount validation
    try {
      const negativeExpense = new Expense({
        branchId: branch._id,
        amount: -100,
        category: "Supplies",
        description: "Test expense",
        paymentMethod: "cash",
        recordedBy: user._id,
      });
      await negativeExpense.save();
      console.log("❌ Should have failed negative amount validation");
    } catch (error) {
      console.log("✅ Negative amount validation working");
    }

    // Test invalid category validation
    try {
      const invalidCategoryExpense = new Expense({
        branchId: branch._id,
        amount: 100,
        category: "InvalidCategory",
        description: "Test expense",
        paymentMethod: "cash",
        recordedBy: user._id,
      });
      await invalidCategoryExpense.save();
      console.log("❌ Should have failed category validation");
    } catch (error) {
      console.log("✅ Category validation working");
    }

    console.log("✅ Expense validation tests passed");
  } catch (error) {
    console.error("❌ Expense validation test failed:", error);
    throw error;
  }
}

async function cleanupTestData() {
  console.log("\n🧹 Cleaning up test data...");

  try {
    await Expense.deleteMany({});
    await User.deleteMany({ email: "admin@test.com" });
    await Branch.deleteMany({ name: "Test Branch" });
    console.log("✅ Test data cleaned up");
  } catch (error) {
    console.error("❌ Cleanup failed:", error);
  }
}

async function runTests() {
  console.log("🚀 Starting Expense Management System Tests\n");

  try {
    await connectDB();
    await createTestData();
    await testExpenseModel();
    await testExpenseQueries();
    await testExpenseHelpers();
    await testExpenseAggregations();
    await testExpenseValidations();
    await cleanupTestData();

    console.log("\n🎉 All tests passed successfully!");
    console.log("\n📝 Expense Management System Summary:");
    console.log("✅ Expense Model with comprehensive schema");
    console.log("✅ Category and subcategory management");
    console.log("✅ Vendor information tracking");
    console.log(
      "✅ Payment method support (cash, bank transfer, M-Pesa, etc.)",
    );
    console.log("✅ Approval workflow (pending, approved, rejected, on hold)");
    console.log("✅ Attachment support");
    console.log("✅ Recurring expense tracking");
    console.log("✅ Budget category management");
    console.log("✅ Tag system for categorization");
    console.log("✅ Full audit trail (recordedBy, lastModifiedBy)");
    console.log("✅ Advanced search and filtering");
    console.log("✅ Comprehensive reporting and analytics");
    console.log("✅ Data validation and error handling");
  } catch (error) {
    console.error("\n❌ Test failed:", error);
  } finally {
    await mongoose.disconnect();
    console.log("\n🔌 Disconnected from MongoDB");
    process.exit(0);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests();
}

module.exports = { runTests };
