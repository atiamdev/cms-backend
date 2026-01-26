/**
 * WhatsApp Integration Live Test
 *
 * Test the WhatsApp integration with real API calls
 * This script allows you to test different notification types
 */

const WhatsAppIntegrationService = require("../services/whatsappIntegrationService");
const WhatsAppNotificationService = require("../services/whatsappNotificationService");

async function runLiveTests() {
  console.log("🚀 WhatsApp Integration Live Testing");
  console.log("=====================================\n");

  const integrationService = new WhatsAppIntegrationService();
  const notificationService = new WhatsAppNotificationService();

  // Test phone number from .env
  const testPhone = process.env.TEST_PHONE_NUMBER || "+254797945600";
  console.log(`📱 Using test phone number: ${testPhone}\n`);

  let testResults = {
    total: 0,
    passed: 0,
    failed: 0,
  };

  // Test 1: Direct Message Test
  console.log("1. Testing Direct WhatsApp Message");
  console.log("-----------------------------------");
  try {
    const message = `🧪 *WhatsApp Integration Live Test*

Hello! This is a test message from ATIAM CMS WhatsApp Integration.

📅 Date: ${new Date().toLocaleString()}
🔧 Service: Live Testing
✅ Status: Integration Active

If you received this message, the WhatsApp integration is working correctly! 🎉`;

    const result = await notificationService.whatsappService.sendMessage(
      testPhone,
      message,
      {
        type: "test",
        testId: "live-test-001",
      },
    );

    console.log(`📤 Message sent result:`, result);

    if (result.success) {
      console.log("✅ Direct message test PASSED");
      testResults.passed++;
    } else {
      console.log("❌ Direct message test FAILED:", result.error);
      testResults.failed++;
    }
    testResults.total++;
  } catch (error) {
    console.log("❌ Direct message test ERROR:", error.message);
    testResults.failed++;
    testResults.total++;
  }

  // Wait a bit between tests
  await delay(2000);

  // Test 2: Invoice Notification Test
  console.log("\n2. Testing Invoice Notification");
  console.log("-------------------------------");
  try {
    const invoiceData = {
      studentName: "Test Student",
      studentId: "TEST001",
      academicYear: "2024-2025",
      academicTerm: "Term 1",
      totalAmount: 25000,
      balance: 25000,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      feeComponents: [
        { name: "Tuition Fee", amount: 20000 },
        { name: "Activity Fee", amount: 5000 },
      ],
      branchName: "ATIAM COLLEGE",
    };

    const result = await notificationService.sendInvoiceNotification(
      invoiceData,
      testPhone,
      {
        testMode: true,
      },
    );

    console.log(`📤 Invoice notification result:`, result);

    if (result.success) {
      console.log("✅ Invoice notification test PASSED");
      testResults.passed++;
    } else {
      console.log("❌ Invoice notification test FAILED:", result.error);
      testResults.failed++;
    }
    testResults.total++;
  } catch (error) {
    console.log("❌ Invoice notification test ERROR:", error.message);
    testResults.failed++;
    testResults.total++;
  }

  // Wait a bit between tests
  await delay(2000);

  // Test 3: Payment Receipt Notification Test
  console.log("\n3. Testing Payment Receipt Notification");
  console.log("---------------------------------------");
  try {
    const receiptData = {
      studentName: "Test Student",
      studentId: "TEST001",
      receiptNumber: "TEST-RCP-001",
      paymentDate: new Date(),
      paymentMethod: "Test Payment",
      amountPaid: 12500,
      transactionRef: "TEST-REF-123456",
      balance: 12500,
      branchName: "ATIAM COLLEGE",
    };

    const result = await notificationService.sendPaymentReceiptNotification(
      receiptData,
      testPhone,
      {
        testMode: true,
      },
    );

    console.log(`📤 Payment receipt notification result:`, result);

    if (result.success) {
      console.log("✅ Payment receipt notification test PASSED");
      testResults.passed++;
    } else {
      console.log("❌ Payment receipt notification test FAILED:", result.error);
      testResults.failed++;
    }
    testResults.total++;
  } catch (error) {
    console.log("❌ Payment receipt notification test ERROR:", error.message);
    testResults.failed++;
    testResults.total++;
  }

  // Wait a bit between tests
  await delay(2000);

  // Test 4: Attendance Report Notification Test
  console.log("\n4. Testing Attendance Report Notification");
  console.log("------------------------------------------");
  try {
    const attendanceData = {
      studentName: "Test Student",
      studentId: "TEST001",
      weekStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
      weekEnd: new Date(),
      totalDays: 5,
      presentDays: 4,
      absentDays: 1,
      attendancePercentage: 80,
      className: "Grade 8A",
      branchName: "ATIAM COLLEGE",
    };

    const result = await notificationService.sendWeeklyAttendanceReport(
      attendanceData,
      testPhone,
      {
        testMode: true,
      },
    );

    console.log(`📤 Attendance report notification result:`, result);

    if (result.success) {
      console.log("✅ Attendance report notification test PASSED");
      testResults.passed++;
    } else {
      console.log(
        "❌ Attendance report notification test FAILED:",
        result.error,
      );
      testResults.failed++;
    }
    testResults.total++;
  } catch (error) {
    console.log("❌ Attendance report notification test ERROR:", error.message);
    testResults.failed++;
    testResults.total++;
  }

  // Wait a bit between tests
  await delay(2000);

  // Test 5: Emergency Notification Test
  console.log("\n5. Testing Emergency Notification");
  console.log("----------------------------------");
  try {
    const emergencyData = {
      studentName: "Test Student",
      studentId: "TEST001",
      emergencyType: "Test Emergency",
      message: "This is a test emergency notification. Please ignore.",
      contactPerson: "System Administrator",
      urgency: "normal",
      branchName: "ATIAM COLLEGE",
    };

    const result = await notificationService.sendEmergencyNotification(
      emergencyData,
      testPhone,
      {
        testMode: true,
      },
    );

    console.log(`📤 Emergency notification result:`, result);

    if (result.success) {
      console.log("✅ Emergency notification test PASSED");
      testResults.passed++;
    } else {
      console.log("❌ Emergency notification test FAILED:", result.error);
      testResults.failed++;
    }
    testResults.total++;
  } catch (error) {
    console.log("❌ Emergency notification test ERROR:", error.message);
    testResults.failed++;
    testResults.total++;
  }

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("📊 LIVE TEST SUMMARY");
  console.log("=".repeat(50));
  console.log(`Total Tests: ${testResults.total}`);
  console.log(`Passed: ${testResults.passed}`);
  console.log(`Failed: ${testResults.failed}`);
  console.log(
    `Success Rate: ${((testResults.passed / testResults.total) * 100).toFixed(1)}%`,
  );

  if (testResults.failed === 0) {
    console.log("\n🎉 ALL LIVE TESTS PASSED!");
    console.log("📱 WhatsApp integration is working perfectly!");
    console.log("\n✅ You should have received 5 test messages on your phone.");
  } else {
    console.log(
      `\n⚠️ ${testResults.failed} test(s) failed. Check the error messages above.`,
    );
    console.log("💡 Make sure your WhatsApp API credentials are correct.");
  }

  console.log("\n🔗 Test Phone Number:", testPhone);
  console.log("📞 If you didn't receive messages, check:");
  console.log("   • WhatsApp API credentials in .env");
  console.log("   • Phone number format (+254XXXXXXXXX)");
  console.log("   • Network connectivity");
  console.log("   • WhatsApp Business API status");

  return testResults;
}

// Helper function for delays
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Run tests if this file is executed directly
if (require.main === module) {
  runLiveTests()
    .then(() => {
      console.log("\n✨ Live testing completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Live testing failed:", error);
      process.exit(1);
    });
}

module.exports = { runLiveTests };
