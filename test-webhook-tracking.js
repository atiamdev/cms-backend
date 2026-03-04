/**
 * Test WhatsApp Webhook Implementation
 *
 * This script tests:
 * 1. Message sending with tracking
 * 2. Database storage of message status
 * 3. Status updates via webhook
 */

require("dotenv").config();
const mongoose = require("mongoose");
const whatsappService = require("./services/whatsappService");
const WhatsAppMessageStatus = require("./models/WhatsAppMessageStatus");

const DB_URI = process.env.MONGO_URI || "mongodb://localhost:27017/atiamCMS";

async function testWebhookTracking() {
  try {
    console.log("\n🧪 WHATSAPP WEBHOOK TRACKING TEST\n");
    console.log("=".repeat(70));

    // Connect to database
    console.log("🔌 Connecting to database...");
    await mongoose.connect(DB_URI);
    console.log("✅ Connected to database\n");

    if (!whatsappService.isEnabled) {
      console.error("❌ WhatsApp service is not enabled");
      console.log("   Please check your .env configuration");
      process.exit(1);
    }

    // Test phone number (use your own number)
    const testPhone = process.env.TEST_PHONE_NUMBER || "+254797945600";

    console.log("📱 Test Configuration:");
    console.log(`   Phone Number: ${testPhone}`);
    console.log(
      `   Webhook Token Set: ${!!process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN}`,
    );
    console.log(`   App Secret Set: ${!!process.env.META_APP_SECRET}`);
    console.log();

    // Step 1: Send test message
    console.log("📤 Step 1: Sending test message...");
    const testMessage = `🧪 **WhatsApp Webhook Test**

This is a test message to verify webhook tracking.

Timestamp: ${new Date().toISOString()}

If you receive this message, the webhook is working correctly! ✅`;

    const result = await whatsappService.sendMessage(testPhone, testMessage, {
      messageType: "general",
      metadata: {
        test: true,
        purpose: "webhook_tracking_test",
        timestamp: new Date().toISOString(),
      },
    });

    if (!result.success) {
      console.error("❌ Failed to send message:", result.error);
      process.exit(1);
    }

    console.log("✅ Message sent successfully!");
    console.log(`   Message ID: ${result.messageId}`);
    console.log(`   WhatsApp ID: ${result.waId}`);
    console.log();

    // Step 2: Check database record
    console.log("📊 Step 2: Checking database record...");
    await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds

    const messageRecord = await WhatsAppMessageStatus.findOne({
      messageId: result.messageId,
    });

    if (!messageRecord) {
      console.error("❌ Message not found in database");
      console.log("   This indicates a problem with message tracking");
      process.exit(1);
    }

    console.log("✅ Message record found in database:");
    console.log(`   Status: ${messageRecord.status}`);
    console.log(`   Recipient: ${messageRecord.recipient}`);
    console.log(`   Message Type: ${messageRecord.messageType}`);
    console.log(
      `   Sent At: ${messageRecord.timestamps.sent?.toISOString() || "N/A"}`,
    );
    console.log();

    // Step 3: Wait for webhook updates
    console.log("⏳ Step 3: Waiting for webhook status updates...");
    console.log("   (Waiting 30 seconds for Meta to send delivery updates...)");
    console.log();

    let delivered = false;
    let read = false;
    const maxWait = 30000; // 30 seconds
    const checkInterval = 2000; // 2 seconds
    let waited = 0;

    while (waited < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
      waited += checkInterval;

      const updated = await WhatsAppMessageStatus.findOne({
        messageId: result.messageId,
      });

      if (updated.status === "delivered" && !delivered) {
        delivered = true;
        console.log(`✅ [${waited / 1000}s] Message delivered!`);
        console.log(
          `   Delivery time: ${updated.timestamps.delivered?.toISOString()}`,
        );
      }

      if (updated.status === "read" && !read) {
        read = true;
        console.log(`✅ [${waited / 1000}s] Message read!`);
        console.log(`   Read time: ${updated.timestamps.read?.toISOString()}`);
        break; // Exit loop if message is read
      }

      if (updated.status === "failed") {
        console.error(`❌ [${waited / 1000}s] Message delivery failed!`);
        console.error(`   Error: ${updated.error?.message || "Unknown error"}`);
        break;
      }

      // Show progress
      process.stdout.write(
        `   Waiting... ${waited / 1000}s / ${maxWait / 1000}s\r`,
      );
    }

    console.log(); // New line after waiting

    // Step 4: Get final status
    console.log("📋 Step 4: Final message status:");
    const finalStatus = await WhatsAppMessageStatus.findOne({
      messageId: result.messageId,
    });

    console.log("   Current Status:", finalStatus.status);
    console.log(
      "   Webhook Events Received:",
      finalStatus.webhookEvents.length,
    );

    if (finalStatus.webhookEvents.length > 0) {
      console.log("\n   Webhook Event History:");
      finalStatus.webhookEvents.forEach((event, index) => {
        console.log(
          `   ${index + 1}. ${event.status} at ${event.timestamp.toISOString()}`,
        );
      });
    }

    // Step 5: Get delivery statistics
    console.log("\n📊 Step 5: Overall delivery statistics:");
    const stats = await WhatsAppMessageStatus.getDeliveryStats({
      messageType: "general",
    });

    console.log("\n   Status Breakdown:");
    stats.forEach((stat) => {
      console.log(`   - ${stat.status}: ${stat.count}`);
    });

    // Step 6: Test timeline API
    console.log("\n🕐 Step 6: Message timeline:");
    const timeline = await WhatsAppMessageStatus.getMessageTimeline(
      result.messageId,
    );

    if (timeline) {
      timeline.timeline.forEach((event) => {
        const duration = event.timestamp
          ? ` (${new Date(event.timestamp).toLocaleTimeString()})`
          : "";
        console.log(`   ${event.status}${duration}`);
      });
    }

    // Summary
    console.log("\n" + "=".repeat(70));
    console.log("✅ TEST SUMMARY");
    console.log("=".repeat(70));
    console.log(`✅ Message sent: ${result.success}`);
    console.log(`✅ Database tracking: ${!!messageRecord}`);
    console.log(
      `✅ Webhook events received: ${finalStatus.webhookEvents.length}`,
    );
    console.log(`✅ Final status: ${finalStatus.status}`);

    if (delivered) {
      console.log("✅ Message was delivered to recipient");
    }
    if (read) {
      console.log("✅ Message was read by recipient");
    }

    if (!delivered && !read && finalStatus.status === "sent") {
      console.log("\n⚠️  NOTE: Message sent but no delivery confirmation yet");
      console.log("   This is normal - webhooks may take a few minutes");
      console.log("   Check your Meta webhook configuration:");
      console.log("   - Webhook URL is publicly accessible");
      console.log("   - Webhook is subscribed to 'messages' field");
      console.log("   - Verify token matches your .env");
    }

    console.log("=".repeat(70));
    console.log("\n🎉 Test completed successfully!\n");
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    console.log("🔌 Database connection closed\n");
    process.exit(0);
  }
}

// Run test
testWebhookTracking();
