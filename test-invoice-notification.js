/**
 * Integration Test: Invoice Notification via WhatsApp
 * Tests the complete flow from invoice generation to WhatsApp delivery
 */

require("dotenv").config();
const mongoose = require("mongoose");
const WhatsAppNotificationService = require("./services/whatsappNotificationService");
const whatsAppNotificationService = new WhatsAppNotificationService();

async function testInvoiceNotification() {
  console.log("\n📋 Testing Invoice Notification Integration\n");
  console.log("=".repeat(70));

  try {
    // Connect to database
    console.log("\n1️⃣ Connecting to database...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("   ✅ Connected to MongoDB");

    // Mock invoice data (simulating a real invoice)
    const mockInvoice = {
      studentName: "John Test Student",
      studentId: "STU-2026-001",
      academicYear: "2025/2026",
      academicTerm: "Term 1",
      totalAmount: 15000,
      balance: 15000,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      feeComponents: [
        { name: "Tuition Fee - Web Development", amount: 12000 },
        { name: "Library Fee", amount: 2000 },
        { name: "Exam Fee", amount: 1000 },
      ],
      branchName: "ATIAM COLLEGE",
    };

    const studentPhone = process.env.TEST_PHONE_NUMBER || "+254797945600";

    console.log("\n2️⃣ Mock Invoice Details:");
    console.log("   " + "-".repeat(66));
    console.log(`   Student Name:    ${mockInvoice.studentName}`);
    console.log(`   Student ID:      ${mockInvoice.studentId}`);
    console.log(`   Phone Number:    ${studentPhone}`);
    console.log(`   Academic Year:   ${mockInvoice.academicYear}`);
    console.log(`   Term:            ${mockInvoice.academicTerm}`);
    console.log(
      `   Amount:          KES ${mockInvoice.totalAmount.toLocaleString()}`,
    );
    console.log(
      `   Balance:         KES ${mockInvoice.balance.toLocaleString()}`,
    );
    console.log(
      `   Due Date:        ${mockInvoice.dueDate.toLocaleDateString()}`,
    );

    // Test invoice notification
    console.log("\n3️⃣ Sending Invoice Notification via WhatsApp...");
    console.log("   " + "-".repeat(66));

    const result = await whatsAppNotificationService.sendInvoiceNotification(
      mockInvoice,
      studentPhone,
    );

    console.log("\n4️⃣ Notification Result:");
    console.log("   " + "-".repeat(66));
    if (result.success) {
      console.log("   Status:          ✅ SUCCESS");
      console.log(`   Message ID:      ${result.messageId || "N/A"}`);
      console.log(`   Phone Number:    ${studentPhone}`);
      console.log("\n   📨 Invoice notification sent successfully");
    } else {
      console.log("   Status:          ❌ FAILED");
      console.log(
        `   Reason:          ${result.reason || result.error || "Unknown"}`,
      );
    }

    // Sample message preview
    console.log("\n5️⃣ Message Preview:");
    console.log("   " + "-".repeat(66));
    const sampleMessage = `
🧾 *${mockInvoice.branchName} - Fee Invoice*

👤 *Student:* ${mockInvoice.studentName}
🆔 *Student ID:* ${mockInvoice.studentId}
📅 *Academic Year:* ${mockInvoice.academicYear}
📆 *Term:* ${mockInvoice.academicTerm}

💰 *Fee Breakdown:*
${mockInvoice.feeComponents.map((c) => `• ${c.name}: KES ${c.amount.toLocaleString()}`).join("\n")}

💵 *Total Amount:* KES ${mockInvoice.totalAmount.toLocaleString()}
⏰ *Due Date:* ${mockInvoice.dueDate.toLocaleDateString()}
💸 *Outstanding Balance:* KES ${mockInvoice.balance.toLocaleString()}

Please make payment before the due date.

Pay via:
- M-Pesa: Paybill 123456
- Equity Bank Portal
- Visit our offices

Thank you!
ATIAM COLLEGE
    `.trim();

    console.log(sampleMessage);

    console.log("\n" + "=".repeat(70));
    console.log("✅ Invoice Notification Test Complete\n");

    // Cleanup
    await mongoose.disconnect();
    console.log("✅ Disconnected from MongoDB\n");
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    console.error(error.stack);
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
  }
}

// Run test
testInvoiceNotification()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
