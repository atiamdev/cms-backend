/**
 * Integration Test: Notice WhatsApp Notification
 * Tests the complete flow from notice publishing to WhatsApp delivery
 */

require("dotenv").config();
const mongoose = require("mongoose");
const noticeWhatsAppService = require("./services/noticeWhatsAppService");

async function testNoticeNotification() {
  console.log("\n📢 Testing Notice Notification Integration\n");
  console.log("=".repeat(70));

  try {
    // Connect to database
    console.log("\n1️⃣ Connecting to database...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("   ✅ Connected to MongoDB");

    // Mock notice data
    const mockNotice = {
      _id: "507f1f77bcf86cd799439011",
      title: "Important: Mid-Term Exam Schedule",
      message: `
Dear Students,

The mid-term examinations schedule has been released.

📅 Exam Period: March 1-15, 2026
📍 Venue: Main Examination Hall
⏰ Time: 8:00 AM - 12:00 PM

Please check the student portal for your specific exam timetable.

Important Reminders:
✅ Arrive 15 minutes before exam starts
✅ Bring your student ID
✅ No electronic devices allowed
✅ Silent mode for phones

Good luck with your preparations!

ATIAM COLLEGE Administration
      `.trim(),
      priority: "high",
      targetAudience: "all", // all, students, staff, specific_class
      createdAt: new Date(),
      publishedBy: {
        name: "Admin User",
        role: "administrator",
      },
    };

    console.log("\n2️⃣ Mock Notice Details:");
    console.log("   " + "-".repeat(66));
    console.log(`   Title:           ${mockNotice.title}`);
    console.log(`   Priority:        ${mockNotice.priority.toUpperCase()}`);
    console.log(`   Target Audience: ${mockNotice.targetAudience}`);
    console.log(
      `   Published By:    ${mockNotice.publishedBy.name} (${mockNotice.publishedBy.role})`,
    );
    console.log(`   Created:         ${mockNotice.createdAt.toLocaleString()}`);

    // Test with a single recipient (test number)
    console.log("\n3️⃣ Sending Notice via WhatsApp...");
    console.log("   " + "-".repeat(66));
    console.log(
      "   📝 Note: Testing with single recipient (TEST_PHONE_NUMBER)",
    );
    console.log(
      "   📝 In production, this would send to all matching students",
    );

    const testRecipients = [
      {
        name: "Test Student",
        phoneNumber: process.env.TEST_PHONE_NUMBER || "+254797945600",
        studentId: "TEST-001",
      },
    ];

    let successCount = 0;
    let failCount = 0;

    for (const recipient of testRecipients) {
      const result = await noticeWhatsAppService.sendNoticeToRecipient(
        recipient,
        mockNotice,
      );

      if (result.success) {
        successCount++;
        console.log(
          `   ✅ Sent to ${recipient.name} (${recipient.phoneNumber})`,
        );
      } else {
        failCount++;
        console.log(
          `   ❌ Failed for ${recipient.name}: ${result.reason || result.error}`,
        );
      }
    }

    console.log("\n4️⃣ Notification Results:");
    console.log("   " + "-".repeat(66));
    console.log(`   Successful:      ${successCount}/${testRecipients.length}`);
    console.log(`   Failed:          ${failCount}/${testRecipients.length}`);
    console.log(
      `   Delivery Rate:   ${((successCount / testRecipients.length) * 100).toFixed(1)}%`,
    );

    // Message preview
    console.log("\n5️⃣ Message Preview:");
    console.log("   " + "-".repeat(66));
    const sampleMessage = `
📢 *IMPORTANT NOTICE - ATIAM COLLEGE*

${mockNotice.title}

${mockNotice.message}

---
Published: ${mockNotice.createdAt.toLocaleDateString()}
Priority: ${mockNotice.priority.charAt(0).toUpperCase() + mockNotice.priority.slice(1)}

For more information, visit the student portal or contact administration.
    `.trim();

    console.log(sampleMessage);

    console.log("\n" + "=".repeat(70));

    if (successCount === testRecipients.length) {
      console.log("✅ All Notice Notifications Sent Successfully\n");
    } else {
      console.log(`⚠️  ${failCount} notification(s) failed\n`);
    }

    console.log("📋 In Production:");
    console.log(
      "   - Notices are sent to all students matching target audience",
    );
    console.log("   - Messages are queued for rate-limited delivery");
    console.log("   - Delivery status is tracked in the database");
    console.log("   - Failed messages are retried automatically\n");

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
testNoticeNotification()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
