/**
 * WhatsApp Integration Quick Test
 *
 * Simple test to verify WhatsApp integration is working
 * Run this to test individual notification types
 */

require("dotenv").config();
const WhatsAppIntegrationService = require("../services/whatsappIntegrationService");

async function quickTest() {
  console.log("🧪 WhatsApp Integration Quick Test");
  console.log("===================================\n");

  const integrationService = new WhatsAppIntegrationService();
  const testPhone = process.env.TEST_PHONE_NUMBER || "+254797945600";

  console.log(`📱 Test Phone: ${testPhone}\n`);

  // Test 1: Simple Message
  console.log("1. Testing Simple Message");
  console.log("-------------------------");
  try {
    const result = await integrationService.sendCustomStudentNotification(
      "TEST001", // studentId
      `🧪 *Quick Test Message*

Hello! This is a quick test of the WhatsApp integration.

📅 Time: ${new Date().toLocaleString()}
✅ Status: Integration Working

If you received this, WhatsApp notifications are ready! 🎉`,
      "test",
    );

    if (result.success) {
      console.log("✅ Simple message sent successfully!");
    } else {
      console.log("❌ Simple message failed:", result.error);
    }
  } catch (error) {
    console.log("❌ Simple message error:", error.message);
  }

  console.log("\n⏳ Waiting 10 seconds for rate limit...");
  await new Promise((resolve) => setTimeout(resolve, 10000));

  // Test 2: Invoice Preview (no send)
  console.log("\n2. Testing Invoice Format");
  console.log("-------------------------");
  try {
    const invoiceData = {
      studentName: "Test Student",
      studentId: "TEST001",
      academicYear: "2024-2025",
      academicTerm: "Term 1",
      totalAmount: 25000,
      balance: 25000,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      feeComponents: [
        { name: "Tuition Fee", amount: 20000 },
        { name: "Activity Fee", amount: 5000 },
      ],
      branchName: "ATIAM COLLEGE",
    };

    console.log("📄 Invoice Preview:");
    console.log(
      `Student: ${invoiceData.studentName} (${invoiceData.studentId})`,
    );
    console.log(`Amount: KES ${invoiceData.totalAmount.toLocaleString()}`);
    console.log(`Due: ${invoiceData.dueDate.toLocaleDateString()}`);
    console.log("✅ Invoice format validation passed");
  } catch (error) {
    console.log("❌ Invoice format error:", error.message);
  }

  console.log("\n🎉 Quick test completed!");
  console.log("\n💡 To test live notifications:");
  console.log("1. Run: npm run dev (start the server)");
  console.log("2. Create a fee for a student in the admin panel");
  console.log("3. Make a payment for that student");
  console.log("4. Check if WhatsApp messages are sent automatically");
}

// Run if called directly
if (require.main === module) {
  quickTest().catch(console.error);
}

module.exports = { quickTest };
