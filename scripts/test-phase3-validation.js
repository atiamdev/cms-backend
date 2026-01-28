/**
 * Phase 3 Test Script: Student Validation & Payment Notification
 * Tests the validation and notification endpoints with actual fee reconciliation
 */

require("dotenv").config();
const mongoose = require("mongoose");
const axios = require("axios");
const Student = require("../models/Student");
const Fee = require("../models/Fee");
const Payment = require("../models/Payment");
const User = require("../models/User");
const Branch = require("../models/Branch");

const API_URL = process.env.API_URL || "http://localhost:5000";
const EQUITY_USERNAME = process.env.EQUITY_API_USERNAME;
const EQUITY_PASSWORD = process.env.EQUITY_API_PASSWORD;

let authToken = null;
let testStudent = null;
let testFees = [];

// Helper function to authenticate
async function authenticate() {
  try {
    const response = await axios.post(`${API_URL}/api/equity/auth`, {
      username: EQUITY_USERNAME,
      password: EQUITY_PASSWORD,
    });

    if (response.data.access) {
      authToken = response.data.access;
      return true;
    }
    return false;
  } catch (error) {
    console.error("Authentication error:", error.message);
    return false;
  }
}

// Helper function to create test data
async function createTestData() {
  try {
    console.log("\n📦 Creating test data...");

    // Find or create a test branch
    let branch = await Branch.findOne({ name: "Test Branch" });
    if (!branch) {
      branch = await Branch.create({
        name: "Test Branch",
        code: "TEST",
        address: "Test Address",
        contactNumber: "0700000000",
      });
    }

    // Create a test user
    const testUser = await User.create({
      firstName: "Test",
      lastName: "Student",
      email: `test.equity.${Date.now()}@example.com`,
      password: "Password123!",
      roles: ["student"],
      branchId: branch._id,
      isActive: true,
    });

    // Create a test student
    testStudent = await Student.create({
      userId: testUser._id,
      branchId: branch._id,
      studentId: `STU${Date.now()}`,
      admissionNumber: `ADM${Date.now()}`,
      academicStatus: "active",
      currentLevel: "Year 1",
      parentGuardianInfo: {
        emergencyContact: {
          phone: "0700000000",
        },
      },
    });

    console.log(`✅ Test student created: ${testStudent.studentId}`);

    // Create test fees for the student
    const feeTypes = [
      { name: "Tuition Fee", amount: 50000 },
      { name: "Library Fee", amount: 5000 },
      { name: "Lab Fee", amount: 10000 },
    ];

    for (const feeType of feeTypes) {
      const fee = await Fee.create({
        studentId: testStudent._id,
        branchId: branch._id,
        feeType: feeType.name,
        academicYear: "2026",
        totalAmountDue: feeType.amount,
        amountPaid: 0,
        balance: feeType.amount,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        status: "unpaid",
      });
      testFees.push(fee);
    }

    console.log(`✅ Created ${testFees.length} test fees`);
    testFees.forEach((fee) => {
      console.log(`   - ${fee.feeType}: ${fee.totalAmountDue} KES`);
    });

    const totalDue = testFees.reduce((sum, fee) => sum + fee.totalAmountDue, 0);
    console.log(`   Total due: ${totalDue} KES`);

    return true;
  } catch (error) {
    console.error("❌ Error creating test data:", error.message);
    return false;
  }
}

// Helper function to cleanup test data
async function cleanupTestData() {
  try {
    if (testStudent) {
      await Payment.deleteMany({ studentId: testStudent._id });
      await Fee.deleteMany({ studentId: testStudent._id });
      await Student.deleteOne({ _id: testStudent._id });
      await User.deleteOne({ _id: testStudent.userId });
    }
    console.log("✅ Test data cleaned up");
  } catch (error) {
    console.error("⚠️  Cleanup warning:", error.message);
  }
}

// Test 1: Validate student endpoint - success case
async function test1_validateStudentSuccess() {
  try {
    console.log("\n🧪 Test 1: Validate student - success");

    const response = await axios.post(
      `${API_URL}/api/equity/validation`,
      {
        billNumber: testStudent.studentId,
        amount: "30000",
      },
      {
        headers: { Authorization: `Bearer ${authToken}` },
      },
    );

    if (
      response.data.responseCode === "200" &&
      response.data.customerName &&
      response.data.billNumber === testStudent.studentId
    ) {
      console.log("✅ Test 1 PASSED");
      console.log(`   Customer Name: ${response.data.customerName}`);
      console.log(`   Bill Number: ${response.data.billNumber}`);
      return true;
    } else {
      console.log("❌ Test 1 FAILED");
      console.log("   Response:", response.data);
      return false;
    }
  } catch (error) {
    console.log("❌ Test 1 FAILED");
    console.error("   Error:", error.response?.data || error.message);
    return false;
  }
}

// Test 2: Validate student endpoint - student not found
async function test2_validateStudentNotFound() {
  try {
    console.log("\n🧪 Test 2: Validate student - not found");

    const response = await axios.post(
      `${API_URL}/api/equity/validation`,
      {
        billNumber: "INVALID123",
        amount: "1000",
      },
      {
        headers: { Authorization: `Bearer ${authToken}` },
      },
    );

    if (response.data.responseCode === "404") {
      console.log("✅ Test 2 PASSED");
      return true;
    } else {
      console.log("❌ Test 2 FAILED");
      console.log("   Expected 404, got:", response.data.responseCode);
      return false;
    }
  } catch (error) {
    console.log("❌ Test 2 FAILED");
    console.error("   Error:", error.response?.data || error.message);
    return false;
  }
}

// Test 3: Validate student endpoint - inactive student
async function test3_validateInactiveStudent() {
  try {
    console.log("\n🧪 Test 3: Validate student - inactive");

    // Temporarily deactivate student
    await Student.updateOne(
      { _id: testStudent._id },
      { academicStatus: "inactive" },
    );

    const response = await axios.post(
      `${API_URL}/api/equity/validation`,
      {
        billNumber: testStudent.studentId,
        amount: "1000",
      },
      {
        headers: { Authorization: `Bearer ${authToken}` },
      },
    );

    // Reactivate student
    await Student.updateOne(
      { _id: testStudent._id },
      { academicStatus: "active" },
    );

    if (response.data.responseCode === "403") {
      console.log("✅ Test 3 PASSED");
      return true;
    } else {
      console.log("❌ Test 3 FAILED");
      console.log("   Expected 403, got:", response.data.responseCode);
      return false;
    }
  } catch (error) {
    // Reactivate student in case of error
    await Student.updateOne(
      { _id: testStudent._id },
      { academicStatus: "active" },
    );
    console.log("❌ Test 3 FAILED");
    console.error("   Error:", error.response?.data || error.message);
    return false;
  }
}

// Test 4: Process payment notification - partial payment
async function test4_partialPaymentNotification() {
  try {
    console.log(
      "\n🧪 Test 4: Payment notification - partial payment (30000 KES)",
    );

    const response = await axios.post(
      `${API_URL}/api/equity/notification`,
      {
        billNumber: testStudent.studentId,
        amount: "30000",
        bankReference: `BNK${Date.now()}001`,
        transactionDate: new Date().toISOString(),
      },
      {
        headers: { Authorization: `Bearer ${authToken}` },
      },
    );

    if (response.data.responseCode === "200") {
      // Verify payment was created
      const payment = await Payment.findOne({
        studentId: testStudent._id,
        amount: 30000,
      });

      if (!payment) {
        console.log("❌ Test 4 FAILED - Payment not created");
        return false;
      }

      // Verify fees were updated
      const updatedFees = await Fee.find({ studentId: testStudent._id }).sort({
        createdAt: 1,
      });

      // First fee (50000) should be fully paid
      // Second fee (5000) should be fully paid
      // Third fee (10000) should have no payment yet (30000 total paid covers first two = 55000, but we only paid 30000)
      // So first fee gets 30000, second and third remain unpaid

      if (
        updatedFees[0].amountPaid === 30000 &&
        updatedFees[1].amountPaid === 0 &&
        updatedFees[2].amountPaid === 0
      ) {
        console.log("✅ Test 4 PASSED");
        console.log(`   Payment created: ${payment.receiptNumber}`);
        console.log("   Fee reconciliation:");
        updatedFees.forEach((fee) => {
          console.log(
            `   - ${fee.feeType}: ${fee.amountPaid}/${fee.totalAmountDue} paid`,
          );
        });
        return true;
      } else {
        console.log("❌ Test 4 FAILED - Incorrect fee reconciliation");
        console.log("   Fee amounts paid:");
        updatedFees.forEach((fee) => {
          console.log(
            `   - ${fee.feeType}: ${fee.amountPaid}/${fee.totalAmountDue}`,
          );
        });
        return false;
      }
    } else {
      console.log("❌ Test 4 FAILED");
      console.log("   Response:", response.data);
      return false;
    }
  } catch (error) {
    console.log("❌ Test 4 FAILED");
    console.error("   Error:", error.response?.data || error.message);
    return false;
  }
}

// Test 5: Process payment notification - complete remaining balance
async function test5_completePaymentNotification() {
  try {
    console.log(
      "\n🧪 Test 5: Payment notification - complete payment (35000 KES)",
    );

    const response = await axios.post(
      `${API_URL}/api/equity/notification`,
      {
        billNumber: testStudent.studentId,
        amount: "35000",
        bankReference: `BNK${Date.now()}002`,
        transactionDate: new Date().toISOString(),
      },
      {
        headers: { Authorization: `Bearer ${authToken}` },
      },
    );

    if (response.data.responseCode === "200") {
      // Verify all fees are now paid
      const updatedFees = await Fee.find({ studentId: testStudent._id }).sort({
        createdAt: 1,
      });

      const allPaid = updatedFees.every(
        (fee) => fee.amountPaid === fee.totalAmountDue && fee.status === "paid",
      );

      if (allPaid) {
        console.log("✅ Test 5 PASSED");
        console.log("   All fees are now fully paid:");
        updatedFees.forEach((fee) => {
          console.log(`   - ${fee.feeType}: ${fee.amountPaid} KES (paid)`);
        });
        return true;
      } else {
        console.log("❌ Test 5 FAILED - Not all fees are paid");
        updatedFees.forEach((fee) => {
          console.log(
            `   - ${fee.feeType}: ${fee.amountPaid}/${fee.totalAmountDue} (${fee.status})`,
          );
        });
        return false;
      }
    } else {
      console.log("❌ Test 5 FAILED");
      console.log("   Response:", response.data);
      return false;
    }
  } catch (error) {
    console.log("❌ Test 5 FAILED");
    console.error("   Error:", error.response?.data || error.message);
    return false;
  }
}

// Test 6: Duplicate transaction detection
async function test6_duplicateTransaction() {
  try {
    console.log("\n🧪 Test 6: Duplicate transaction detection");

    const bankRef = `BNK${Date.now()}003`;

    // First transaction
    await axios.post(
      `${API_URL}/api/equity/notification`,
      {
        billNumber: testStudent.studentId,
        amount: "1000",
        bankReference: bankRef,
        transactionDate: new Date().toISOString(),
      },
      {
        headers: { Authorization: `Bearer ${authToken}` },
      },
    );

    // Duplicate transaction
    const response = await axios.post(
      `${API_URL}/api/equity/notification`,
      {
        billNumber: testStudent.studentId,
        amount: "1000",
        bankReference: bankRef,
        transactionDate: new Date().toISOString(),
      },
      {
        headers: { Authorization: `Bearer ${authToken}` },
      },
    );

    if (
      response.data.responseCode === "400" &&
      response.data.responseMessage.includes("Duplicate")
    ) {
      console.log("✅ Test 6 PASSED");
      return true;
    } else {
      console.log("❌ Test 6 FAILED");
      console.log("   Expected duplicate error, got:", response.data);
      return false;
    }
  } catch (error) {
    console.log("❌ Test 6 FAILED");
    console.error("   Error:", error.response?.data || error.message);
    return false;
  }
}

// Test 7: Missing required fields
async function test7_missingFields() {
  try {
    console.log("\n🧪 Test 7: Missing required fields");

    const response = await axios.post(
      `${API_URL}/api/equity/notification`,
      {
        billNumber: testStudent.studentId,
        // Missing amount, bankReference, transactionDate
      },
      {
        headers: { Authorization: `Bearer ${authToken}` },
      },
    );

    if (response.data.responseCode === "400") {
      console.log("✅ Test 7 PASSED");
      return true;
    } else {
      console.log("❌ Test 7 FAILED");
      console.log("   Expected 400, got:", response.data.responseCode);
      return false;
    }
  } catch (error) {
    console.log("❌ Test 7 FAILED");
    console.error("   Error:", error.response?.data || error.message);
    return false;
  }
}

// Main test runner
async function runTests() {
  console.log("🚀 Starting Phase 3 Tests: Validation & Notification");
  console.log("=".repeat(60));

  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    // Authenticate
    const authenticated = await authenticate();
    if (!authenticated) {
      console.error("❌ Authentication failed. Exiting.");
      process.exit(1);
    }
    console.log("✅ Authenticated with Equity Bank API");

    // Create test data
    const dataCreated = await createTestData();
    if (!dataCreated) {
      console.error("❌ Failed to create test data. Exiting.");
      process.exit(1);
    }

    // Run tests
    const results = {
      test1: await test1_validateStudentSuccess(),
      test2: await test2_validateStudentNotFound(),
      test3: await test3_validateInactiveStudent(),
      test4: await test4_partialPaymentNotification(),
      test5: await test5_completePaymentNotification(),
      test6: await test6_duplicateTransaction(),
      test7: await test7_missingFields(),
    };

    // Print summary
    console.log("\n" + "=".repeat(60));
    console.log("📊 Test Summary");
    console.log("=".repeat(60));

    const totalTests = Object.keys(results).length;
    const passedTests = Object.values(results).filter((r) => r === true).length;
    const failedTests = totalTests - passedTests;

    Object.entries(results).forEach(([test, passed]) => {
      console.log(
        `${passed ? "✅" : "❌"} ${test}: ${passed ? "PASSED" : "FAILED"}`,
      );
    });

    console.log("\n" + "=".repeat(60));
    console.log(
      `Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`,
    );
    console.log("=".repeat(60));

    // Cleanup
    await cleanupTestData();

    // Exit
    process.exit(failedTests === 0 ? 0 : 1);
  } catch (error) {
    console.error("\n❌ Fatal error:", error);
    await cleanupTestData();
    process.exit(1);
  }
}

// Run tests
runTests();
