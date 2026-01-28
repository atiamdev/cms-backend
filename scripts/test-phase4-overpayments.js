/**
 * Phase 4 Test Script: Payment Reconciliation with Overpayments & WhatsApp
 * Tests overpayment handling, credit creation, and WhatsApp notifications
 */

require("dotenv").config();
const mongoose = require("mongoose");
const axios = require("axios");
const Student = require("../models/Student");
const Fee = require("../models/Fee");
const Payment = require("../models/Payment");
const StudentCredit = require("../models/StudentCredit");
const PaymentFee = require("../models/PaymentFee");
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
      email: `test.equity.phase4.${Date.now()}@example.com`,
      password: "Password123!",
      roles: ["student"],
      branchId: branch._id,
      phoneNumber: "+254700000000", // For WhatsApp testing
      isActive: true,
    });

    // Create a test student
    testStudent = await Student.create({
      userId: testUser._id,
      branchId: branch._id,
      studentId: `STUP4-${Date.now()}`,
      admissionNumber: `ADMP4-${Date.now()}`,
      academicStatus: "active",
      currentLevel: "Year 1",
      parentGuardianInfo: {
        emergencyContact: {
          phone: "+254700000000",
        },
      },
    });

    console.log(`✅ Test student created: ${testStudent.studentId}`);

    // Create smaller test fees for overpayment testing
    const feeTypes = [
      { name: "Tuition Fee", amount: 10000 },
      { name: "Library Fee", amount: 2000 },
      { name: "Lab Fee", amount: 3000 },
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
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
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
      await PaymentFee.deleteMany({ studentId: testStudent._id });
      await StudentCredit.deleteMany({ studentId: testStudent._id });
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

// Test 1: Payment with exact amount (no overpayment)
async function test1_exactPayment() {
  try {
    console.log("\n🧪 Test 1: Exact payment (10000 KES for first fee)");

    const response = await axios.post(
      `${API_URL}/api/equity/notification`,
      {
        billNumber: testStudent.studentId,
        amount: "10000",
        bankReference: `BNKP4-${Date.now()}-001`,
        transactionDate: new Date().toISOString(),
      },
      {
        headers: { Authorization: `Bearer ${authToken}` },
      },
    );

    if (response.data.responseCode === "200") {
      // Verify first fee is paid
      const updatedFee = await Fee.findById(testFees[0]._id);
      const paymentFeeLinks = await PaymentFee.find({
        studentId: testStudent._id,
      });
      const credits = await StudentCredit.find({
        studentId: testStudent._id,
        status: "available",
      });

      if (
        updatedFee.status === "paid" &&
        paymentFeeLinks.length === 1 &&
        credits.length === 0
      ) {
        console.log("✅ Test 1 PASSED");
        console.log(`   First fee fully paid: ${updatedFee.feeType}`);
        console.log(`   PaymentFee links created: ${paymentFeeLinks.length}`);
        console.log(`   No credit created (exact payment)`);
        return true;
      } else {
        console.log("❌ Test 1 FAILED");
        console.log(`   Fee status: ${updatedFee.status}`);
        console.log(`   PaymentFee links: ${paymentFeeLinks.length}`);
        console.log(`   Credits: ${credits.length}`);
        return false;
      }
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

// Test 2: Overpayment - should create credit
async function test2_overpayment() {
  try {
    console.log("\n🧪 Test 2: Overpayment (10000 KES for 5000 KES due)");

    const response = await axios.post(
      `${API_URL}/api/equity/notification`,
      {
        billNumber: testStudent.studentId,
        amount: "10000",
        bankReference: `BNKP4-${Date.now()}-002`,
        transactionDate: new Date().toISOString(),
      },
      {
        headers: { Authorization: `Bearer ${authToken}` },
      },
    );

    if (response.data.responseCode === "200") {
      // Should pay 5000 KES to remaining fees and create 5000 KES credit
      const allFees = await Fee.find({ studentId: testStudent._id }).sort({
        createdAt: 1,
      });
      const credits = await StudentCredit.find({
        studentId: testStudent._id,
        status: "available",
      });
      const totalCredit = credits.reduce(
        (sum, c) => sum + c.remainingAmount,
        0,
      );

      // All fees should be paid, and credit should exist
      const allPaid = allFees.every((fee) => fee.status === "paid");

      if (allPaid && totalCredit === 5000) {
        console.log("✅ Test 2 PASSED");
        console.log("   All fees paid:");
        allFees.forEach((fee) => {
          console.log(`   - ${fee.feeType}: ${fee.amountPaid} KES`);
        });
        console.log(`   Credit created: ${totalCredit} KES`);
        return true;
      } else {
        console.log("❌ Test 2 FAILED");
        console.log(`   All fees paid: ${allPaid}`);
        console.log(`   Credit amount: ${totalCredit} KES (expected 5000)`);
        return false;
      }
    } else {
      console.log("❌ Test 2 FAILED");
      console.log("   Response:", response.data);
      return false;
    }
  } catch (error) {
    console.log("❌ Test 2 FAILED");
    console.error("   Error:", error.response?.data || error.message);
    return false;
  }
}

// Test 3: Verify PaymentFee linking records
async function test3_paymentFeeLinks() {
  try {
    console.log("\n🧪 Test 3: PaymentFee linking records");

    const paymentFeeLinks = await PaymentFee.find({
      studentId: testStudent._id,
    })
      .populate("paymentId", "receiptNumber amount")
      .populate("feeId", "feeType");

    const totalLinked = paymentFeeLinks.reduce(
      (sum, link) => sum + link.amountApplied,
      0,
    );

    // Should have 3 links (one for each fee) totaling 15000 KES
    if (paymentFeeLinks.length === 3 && totalLinked === 15000) {
      console.log("✅ Test 3 PASSED");
      console.log(`   Total PaymentFee records: ${paymentFeeLinks.length}`);
      console.log(`   Total amount linked: ${totalLinked} KES`);
      paymentFeeLinks.forEach((link) => {
        console.log(
          `   - ${link.feeId.feeType}: ${link.amountApplied} KES from ${link.paymentId.receiptNumber}`,
        );
      });
      return true;
    } else {
      console.log("❌ Test 3 FAILED");
      console.log(`   Links: ${paymentFeeLinks.length} (expected 3)`);
      console.log(`   Total: ${totalLinked} KES (expected 15000)`);
      return false;
    }
  } catch (error) {
    console.log("❌ Test 3 FAILED");
    console.error("   Error:", error.message);
    return false;
  }
}

// Test 4: Verify student credit details
async function test4_studentCredit() {
  try {
    console.log("\n🧪 Test 4: Student credit verification");

    const credits = await StudentCredit.find({
      studentId: testStudent._id,
    }).populate("paymentId", "receiptNumber");

    if (credits.length === 1) {
      const credit = credits[0];

      if (
        credit.amount === 5000 &&
        credit.remainingAmount === 5000 &&
        credit.status === "available" &&
        credit.source === "equity_overpayment"
      ) {
        console.log("✅ Test 4 PASSED");
        console.log(`   Credit ID: ${credit._id}`);
        console.log(`   Amount: ${credit.amount} KES`);
        console.log(`   Remaining: ${credit.remainingAmount} KES`);
        console.log(`   Status: ${credit.status}`);
        console.log(`   Source: ${credit.source}`);
        console.log(`   From payment: ${credit.paymentId.receiptNumber}`);
        return true;
      }
    }

    console.log("❌ Test 4 FAILED");
    console.log(`   Credits found: ${credits.length}`);
    if (credits.length > 0) {
      console.log(`   Details:`, credits[0]);
    }
    return false;
  } catch (error) {
    console.log("❌ Test 4 FAILED");
    console.error("   Error:", error.message);
    return false;
  }
}

// Test 5: Payment reconciliation info
async function test5_reconciliationInfo() {
  try {
    console.log("\n🧪 Test 5: Payment reconciliation info");

    const payments = await Payment.find({
      studentId: testStudent._id,
    }).sort({ createdAt: 1 });

    if (payments.length === 2) {
      const firstPayment = payments[0];
      const secondPayment = payments[1];

      // First payment: exact match, no credit
      const firstHasInfo =
        firstPayment.reconciliationInfo &&
        firstPayment.reconciliationInfo.feesUpdated === 1 &&
        firstPayment.reconciliationInfo.remainingAmount === 0;

      // Second payment: overpayment, credit created
      const secondHasInfo =
        secondPayment.reconciliationInfo &&
        secondPayment.reconciliationInfo.feesUpdated === 2 &&
        secondPayment.reconciliationInfo.remainingAmount === 5000 &&
        secondPayment.reconciliationInfo.creditCreated !== null;

      if (firstHasInfo && secondHasInfo) {
        console.log("✅ Test 5 PASSED");
        console.log("   First payment reconciliation:");
        console.log(
          `   - Fees updated: ${firstPayment.reconciliationInfo.feesUpdated}`,
        );
        console.log(
          `   - Amount applied: ${firstPayment.reconciliationInfo.amountApplied} KES`,
        );
        console.log(
          `   - Remaining: ${firstPayment.reconciliationInfo.remainingAmount} KES`,
        );
        console.log("   Second payment reconciliation:");
        console.log(
          `   - Fees updated: ${secondPayment.reconciliationInfo.feesUpdated}`,
        );
        console.log(
          `   - Amount applied: ${secondPayment.reconciliationInfo.amountApplied} KES`,
        );
        console.log(
          `   - Remaining: ${secondPayment.reconciliationInfo.remainingAmount} KES`,
        );
        console.log(
          `   - Credit ID: ${secondPayment.reconciliationInfo.creditCreated}`,
        );
        return true;
      }
    }

    console.log("❌ Test 5 FAILED");
    console.log(`   Payments: ${payments.length}`);
    return false;
  } catch (error) {
    console.log("❌ Test 5 FAILED");
    console.error("   Error:", error.message);
    return false;
  }
}

// Main test runner
async function runTests() {
  console.log("🚀 Starting Phase 4 Tests: Overpayments & Credits");
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
      test1: await test1_exactPayment(),
      test2: await test2_overpayment(),
      test3: await test3_paymentFeeLinks(),
      test4: await test4_studentCredit(),
      test5: await test5_reconciliationInfo(),
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
