/**
 * Test Payment Reconciliation System
 *
 * This script tests various payment reconciliation scenarios:
 * 1. Exact payment (no credit)
 * 2. Partial payment (multiple invoices)
 * 3. Overpayment (creates credit)
 * 4. Auto-apply credit to new invoice
 * 5. Credit exceeds new invoice amount
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Student = require("../models/Student");
const Fee = require("../models/Fee");
const Payment = require("../models/Payment");
const Course = require("../models/Course");
const User = require("../models/User");
const {
  reconcilePayment,
  getStudentCreditBalance,
  applyCreditToNewInvoice,
  getStudentPaymentSummary,
} = require("../services/paymentReconciliationService");

// Colors for console output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(title) {
  console.log("\n" + "=".repeat(60));
  log(title, "cyan");
  console.log("=".repeat(60));
}

async function cleanup(studentId) {
  log("Cleaning up test data...", "yellow");
  await Payment.deleteMany({ studentId });
  await Fee.deleteMany({ studentId });
  log("Cleanup complete", "green");
}

async function createTestInvoice(
  studentId,
  branchId,
  amount,
  periodYear,
  periodMonth,
  dueDate,
) {
  const invoice = await Fee.create({
    branchId,
    studentId,
    periodYear,
    periodMonth,
    periodStart: new Date(periodYear, periodMonth - 1, 1),
    totalAmountDue: amount,
    amountPaid: 0,
    dueDate: dueDate || new Date(periodYear, periodMonth - 1, 10),
    invoiceType: "monthly",
    status: "unpaid",
    academicYear: periodYear.toString(),
    feeComponents: [
      {
        name: "Test Fee",
        amount: amount,
      },
    ],
  });

  log(
    `Created invoice: ${invoice._id} - KES ${amount} (${periodYear}-${periodMonth})`,
    "blue",
  );
  return invoice;
}

async function testScenario1(student, branchId) {
  section("Test 1: Exact Payment (No Credit)");

  // Create invoice for KES 5,000
  const invoice = await createTestInvoice(
    student._id,
    branchId,
    5000,
    2025,
    10,
  );

  // Make exact payment
  log("\nMaking payment of KES 5,000...", "yellow");
  const result = await reconcilePayment({
    studentId: student._id,
    amount: 5000,
    paymentMethod: "cash",
    paymentDate: new Date(),
    receiptNumber: `TEST-001-${Date.now()}`,
    branchId,
    recordedBy: student.userId,
  });

  console.log("\nReconciliation Result:");
  console.log(JSON.stringify(result, null, 2));

  // Verify
  const updatedInvoice = await Fee.findById(invoice._id);
  log(
    `\nInvoice Status: ${updatedInvoice.status}`,
    updatedInvoice.status === "paid" ? "green" : "red",
  );
  log(`Amount Paid: KES ${updatedInvoice.amountPaid}`, "blue");

  const creditBalance = await getStudentCreditBalance(student._id);
  log(
    `Credit Balance: KES ${creditBalance}`,
    creditBalance === 0 ? "green" : "yellow",
  );

  const passed =
    updatedInvoice.status === "paid" &&
    updatedInvoice.amountPaid === 5000 &&
    creditBalance === 0;

  log(
    `\nTest 1: ${passed ? "PASSED ✓" : "FAILED ✗"}`,
    passed ? "green" : "red",
  );

  await cleanup(student._id);
  return passed;
}

async function testScenario2(student, branchId) {
  section("Test 2: Partial Payment (Multiple Invoices)");

  // Create 2 invoices
  const invoice1 = await createTestInvoice(
    student._id,
    branchId,
    5000,
    2025,
    10,
  );
  const invoice2 = await createTestInvoice(
    student._id,
    branchId,
    5000,
    2025,
    11,
  );

  // Make payment of KES 6,000 (pays invoice1 fully, invoice2 partially)
  log("\nMaking payment of KES 6,000...", "yellow");
  const result = await reconcilePayment({
    studentId: student._id,
    amount: 6000,
    paymentMethod: "cash",
    paymentDate: new Date(),
    receiptNumber: `TEST-002-${Date.now()}`,
    branchId,
    recordedBy: student.userId,
  });

  console.log("\nReconciliation Result:");
  console.log(JSON.stringify(result, null, 2));

  // Verify
  const updatedInvoice1 = await Fee.findById(invoice1._id);
  const updatedInvoice2 = await Fee.findById(invoice2._id);

  log(
    `\nInvoice 1 Status: ${updatedInvoice1.status}`,
    updatedInvoice1.status === "paid" ? "green" : "red",
  );
  log(`Invoice 1 Amount Paid: KES ${updatedInvoice1.amountPaid}`, "blue");

  log(
    `\nInvoice 2 Status: ${updatedInvoice2.status}`,
    updatedInvoice2.status === "partially_paid" ? "green" : "red",
  );
  log(`Invoice 2 Amount Paid: KES ${updatedInvoice2.amountPaid}`, "blue");
  log(`Invoice 2 Balance: KES ${updatedInvoice2.balance}`, "blue");

  const creditBalance = await getStudentCreditBalance(student._id);
  log(
    `\nCredit Balance: KES ${creditBalance}`,
    creditBalance === 0 ? "green" : "yellow",
  );

  const passed =
    updatedInvoice1.status === "paid" &&
    updatedInvoice1.amountPaid === 5000 &&
    updatedInvoice2.status === "partially_paid" &&
    updatedInvoice2.amountPaid === 1000 &&
    updatedInvoice2.balance === 4000 &&
    creditBalance === 0;

  log(
    `\nTest 2: ${passed ? "PASSED ✓" : "FAILED ✗"}`,
    passed ? "green" : "red",
  );

  await cleanup(student._id);
  return passed;
}

async function testScenario3(student, branchId) {
  section("Test 3: Overpayment (Creates Credit)");

  // Create invoice for KES 5,000
  const invoice = await createTestInvoice(
    student._id,
    branchId,
    5000,
    2025,
    10,
  );

  // Make payment of KES 7,000 (overpayment of KES 2,000)
  log("\nMaking payment of KES 7,000...", "yellow");
  const result = await reconcilePayment({
    studentId: student._id,
    amount: 7000,
    paymentMethod: "cash",
    paymentDate: new Date(),
    receiptNumber: `TEST-003-${Date.now()}`,
    branchId,
    recordedBy: student.userId,
  });

  console.log("\nReconciliation Result:");
  console.log(JSON.stringify(result, null, 2));

  // Verify
  const updatedInvoice = await Fee.findById(invoice._id);
  log(
    `\nInvoice Status: ${updatedInvoice.status}`,
    updatedInvoice.status === "paid" ? "green" : "red",
  );
  log(`Amount Paid: KES ${updatedInvoice.amountPaid}`, "blue");

  const creditBalance = await getStudentCreditBalance(student._id);
  log(
    `\nCredit Balance: KES ${creditBalance}`,
    creditBalance === 2000 ? "green" : "red",
  );

  // Verify credit payment record exists
  const creditPayments = await Payment.find({
    studentId: student._id,
    feeId: null,
    status: "completed",
  });

  log(
    `Credit Payment Records: ${creditPayments.length}`,
    creditPayments.length > 0 ? "green" : "red",
  );
  if (creditPayments.length > 0) {
    log(`Credit Amount: KES ${creditPayments[0].amount}`, "blue");
  }

  const passed =
    updatedInvoice.status === "paid" &&
    updatedInvoice.amountPaid === 5000 &&
    creditBalance === 2000 &&
    creditPayments.length > 0 &&
    creditPayments[0].amount === 2000;

  log(
    `\nTest 3: ${passed ? "PASSED ✓" : "FAILED ✗"}`,
    passed ? "green" : "red",
  );

  // Keep credit for next test
  return { passed, creditBalance };
}

async function testScenario4(student, branchId, existingCredit) {
  section("Test 4: Auto-Apply Credit to New Invoice");

  log(`Starting credit balance: KES ${existingCredit}`, "yellow");

  // Create new invoice for KES 5,000
  const invoice = await createTestInvoice(
    student._id,
    branchId,
    5000,
    2025,
    12,
  );
  log(`Invoice Balance before credit: KES ${invoice.balance}`, "blue");

  // Apply credit
  log("\nApplying existing credit to new invoice...", "yellow");
  await applyCreditToNewInvoice(student._id, invoice._id);

  // Verify
  const updatedInvoice = await Fee.findById(invoice._id);
  log(`\nInvoice Status: ${updatedInvoice.status}`, "blue");
  log(`Amount Paid from Credit: KES ${updatedInvoice.amountPaid}`, "blue");
  log(`Remaining Balance: KES ${updatedInvoice.balance}`, "blue");

  const creditBalance = await getStudentCreditBalance(student._id);
  log(
    `\nRemaining Credit: KES ${creditBalance}`,
    creditBalance === 0 ? "green" : "yellow",
  );

  const passed =
    updatedInvoice.amountPaid === existingCredit &&
    updatedInvoice.balance === 5000 - existingCredit &&
    updatedInvoice.status === "partially_paid" &&
    creditBalance === 0;

  log(
    `\nTest 4: ${passed ? "PASSED ✓" : "FAILED ✗"}`,
    passed ? "green" : "red",
  );

  await cleanup(student._id);
  return passed;
}

async function testScenario5(student, branchId) {
  section("Test 5: Credit Exceeds New Invoice Amount");

  // Create credit of KES 7,000
  log("Creating credit of KES 7,000...", "yellow");
  await Payment.create({
    feeId: null,
    studentId: student._id,
    amount: 7000,
    paymentMethod: "cash",
    paymentDate: new Date(),
    status: "completed",
    receiptNumber: `CREDIT-TEST-${Date.now()}`,
    branchId,
  });

  const initialCredit = await getStudentCreditBalance(student._id);
  log(`Initial Credit Balance: KES ${initialCredit}`, "green");

  // Create new invoice for KES 5,000
  const invoice = await createTestInvoice(
    student._id,
    branchId,
    5000,
    2025,
    11,
  );

  // Apply credit
  log("\nApplying credit to new invoice...", "yellow");
  await applyCreditToNewInvoice(student._id, invoice._id);

  // Verify
  const updatedInvoice = await Fee.findById(invoice._id);
  log(
    `\nInvoice Status: ${updatedInvoice.status}`,
    updatedInvoice.status === "paid" ? "green" : "red",
  );
  log(`Amount Paid from Credit: KES ${updatedInvoice.amountPaid}`, "blue");
  log(`Invoice Balance: KES ${updatedInvoice.balance}`, "blue");

  const remainingCredit = await getStudentCreditBalance(student._id);
  log(
    `\nRemaining Credit: KES ${remainingCredit}`,
    remainingCredit === 2000 ? "green" : "red",
  );

  const passed =
    updatedInvoice.status === "paid" &&
    updatedInvoice.amountPaid === 5000 &&
    updatedInvoice.balance === 0 &&
    remainingCredit === 2000;

  log(
    `\nTest 5: ${passed ? "PASSED ✓" : "FAILED ✗"}`,
    passed ? "green" : "red",
  );

  await cleanup(student._id);
  return passed;
}

async function testPaymentSummary(student, branchId) {
  section("Test 6: Payment Summary");

  // Create multiple invoices with different statuses
  const invoice1 = await createTestInvoice(
    student._id,
    branchId,
    5000,
    2025,
    10,
  );
  const invoice2 = await createTestInvoice(
    student._id,
    branchId,
    5000,
    2025,
    11,
  );
  const invoice3 = await createTestInvoice(
    student._id,
    branchId,
    5000,
    2025,
    12,
  );

  // Make partial payment
  await reconcilePayment({
    studentId: student._id,
    amount: 6000,
    paymentMethod: "cash",
    paymentDate: new Date(),
    receiptNumber: `TEST-SUMMARY-${Date.now()}`,
    branchId,
    recordedBy: student.userId,
  });

  // Get summary
  log("\nGetting payment summary...", "yellow");
  const summary = await getStudentPaymentSummary(student._id);

  console.log("\nPayment Summary:");
  console.log(JSON.stringify(summary, null, 2));

  log(`\nTotal Outstanding: KES ${summary.totalOutstanding}`, "blue");
  log(`Total Paid: KES ${summary.totalPaid}`, "green");
  log(`Credit Balance: KES ${summary.creditBalance}`, "cyan");

  log(`\nInvoices Summary:`, "yellow");
  log(`  Total: ${summary.invoicesSummary.total}`, "blue");
  log(`  Paid: ${summary.invoicesSummary.paid}`, "green");
  log(`  Partially Paid: ${summary.invoicesSummary.partiallyPaid}`, "yellow");
  log(`  Unpaid: ${summary.invoicesSummary.unpaid}`, "red");

  const passed =
    summary.totalOutstanding === 9000 &&
    summary.totalPaid === 6000 &&
    summary.invoicesSummary.total === 3 &&
    summary.invoicesSummary.paid === 1 &&
    summary.invoicesSummary.partiallyPaid === 1 &&
    summary.invoicesSummary.unpaid === 1;

  log(
    `\nTest 6: ${passed ? "PASSED ✓" : "FAILED ✗"}`,
    passed ? "green" : "red",
  );

  await cleanup(student._id);
  return passed;
}

async function runTests() {
  try {
    // Connect to database
    log("Connecting to database...", "yellow");
    await mongoose.connect(process.env.MONGO_URI);
    log("Connected to database", "green");

    // Find or create test student
    log("\nFinding test student...", "yellow");

    let testUser = await User.findOne({
      email: "test-reconciliation@example.com",
    });
    if (!testUser) {
      log("Creating test user...", "yellow");
      testUser = await User.create({
        firstName: "Test",
        lastName: "Reconciliation",
        email: "test-reconciliation@example.com",
        phoneNumber: "254700000000",
        password: "test123456",
        roles: ["student"],
      });
    }

    let student = await Student.findOne({ userId: testUser._id });
    if (!student) {
      log("Creating test student...", "yellow");
      // Get first branch for testing
      const firstBranch = await mongoose.connection.db
        .collection("branches")
        .findOne();
      if (!firstBranch) {
        throw new Error("No branches found. Please create a branch first.");
      }

      student = await Student.create({
        userId: testUser._id,
        branchId: firstBranch._id,
        studentId: `TEST-${Date.now()}`,
        academicStatus: "active",
        enrollmentDate: new Date(),
      });
    }

    log(`Using test student: ${student.studentId} (${student._id})`, "green");
    const branchId = student.branchId;

    // Clean up any existing test data
    await cleanup(student._id);

    // Run tests
    const results = [];

    results.push(await testScenario1(student, branchId));
    results.push(await testScenario2(student, branchId));

    const test3Result = await testScenario3(student, branchId);
    results.push(test3Result.passed);

    results.push(
      await testScenario4(student, branchId, test3Result.creditBalance),
    );
    results.push(await testScenario5(student, branchId));
    results.push(await testPaymentSummary(student, branchId));

    // Summary
    section("Test Summary");
    const passed = results.filter((r) => r).length;
    const total = results.length;

    log(
      `\nTests Passed: ${passed}/${total}`,
      passed === total ? "green" : "yellow",
    );

    results.forEach((result, index) => {
      log(
        `Test ${index + 1}: ${result ? "PASSED ✓" : "FAILED ✗"}`,
        result ? "green" : "red",
      );
    });

    if (passed === total) {
      log(
        "\n🎉 All tests passed! Payment reconciliation system is working correctly.",
        "green",
      );
    } else {
      log(
        `\n⚠️  ${total - passed} test(s) failed. Please review the results above.`,
        "yellow",
      );
    }
  } catch (error) {
    log(`\nError running tests: ${error.message}`, "red");
    console.error(error);
  } finally {
    await mongoose.disconnect();
    log("\nDisconnected from database", "yellow");
  }
}

// Run tests
runTests();
