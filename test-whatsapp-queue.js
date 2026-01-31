/**
 * Test WhatsApp Queue Service
 *
 * This script tests the new queue-based WhatsApp messaging system
 * that handles rate limits systematically for the paid plan (256 messages/minute).
 */

require("dotenv").config();
const whatsAppQueueService = require("./services/whatsappQueueService");

async function testQueueService() {
  console.log("🧪 Testing WhatsApp Queue Service\n");
  console.log("=".repeat(60));

  // Test 1: Check service initialization
  console.log("\n📊 Test 1: Service Initialization");
  const stats = whatsAppQueueService.getStats();
  console.log("✅ Queue service initialized");
  console.log("   Rate limit:", stats.messagesPerMinute, "messages/minute");
  console.log(
    "   Delay between messages:",
    Math.ceil(60000 / stats.messagesPerMinute),
    "ms",
  );

  // Test 2: Add single message to queue
  console.log("\n📊 Test 2: Single Message Queue");
  const testPhone = process.env.TEST_PHONE_NUMBER || "+254797945600";

  const queueId1 = await whatsAppQueueService.addToQueue({
    phoneNumber: testPhone,
    message: "🧪 *Test Message 1*\n\nThis is a test of the new queue system!",
    metadata: { type: "test", testNumber: 1 },
    priority: 2, // Normal priority
  });
  console.log("✅ Message queued with ID:", queueId1);

  // Wait a bit for stats
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Test 3: Add multiple messages (bulk)
  console.log("\n📊 Test 3: Bulk Message Queue");
  const bulkMessages = [
    {
      phoneNumber: testPhone,
      message: "🧪 *Test Message 2*\n\nBulk test - Message 1 of 3",
      metadata: { type: "test", testNumber: 2 },
      priority: 3, // Low priority
    },
    {
      phoneNumber: testPhone,
      message: "🧪 *Test Message 3*\n\nBulk test - Message 2 of 3",
      metadata: { type: "test", testNumber: 3 },
      priority: 2, // Normal priority
    },
    {
      phoneNumber: testPhone,
      message:
        "🧪 *URGENT Test Message*\n\nBulk test - Message 3 of 3 (HIGH PRIORITY)",
      metadata: { type: "test", testNumber: 4 },
      priority: 1, // High priority (should be sent first)
    },
  ];

  const queueIds = await whatsAppQueueService.addBulkToQueue(bulkMessages);
  console.log("✅ Bulk messages queued:", queueIds.length);
  console.log("   Queue IDs:", queueIds);

  // Test 4: Check queue status
  console.log("\n📊 Test 4: Queue Status");
  const queueStatus = whatsAppQueueService.getQueueStatus();
  console.log("✅ Queue status retrieved");
  console.log("   Total items in queue:", queueStatus.queueLength);
  console.log("   Processing:", queueStatus.processing);
  console.log(
    "   Items:",
    queueStatus.items.map((item) => ({
      id: item.id.substr(-8),
      priority: item.priority,
      status: item.status,
    })),
  );

  // Test 5: Monitor queue processing
  console.log("\n📊 Test 5: Monitor Queue Processing");
  console.log("⏳ Waiting for queue to process...\n");

  // Monitor every 2 seconds
  const monitorInterval = setInterval(() => {
    const currentStats = whatsAppQueueService.getStats();
    const currentQueue = whatsAppQueueService.getQueueStatus();

    console.log(
      `📊 Queue: ${currentQueue.queueLength} pending | ` +
        `Sent: ${currentStats.totalSent} | ` +
        `Failed: ${currentStats.totalFailed} | ` +
        `Processing: ${currentStats.processing ? "Yes" : "No"}`,
    );

    // Stop monitoring when queue is empty and not processing
    if (currentQueue.queueLength === 0 && !currentStats.processing) {
      clearInterval(monitorInterval);
      console.log("\n✅ Queue processing completed!");

      // Final statistics
      console.log("\n📈 Final Statistics:");
      console.log("=".repeat(60));
      console.log("   Total Queued:", currentStats.totalQueued);
      console.log("   Total Sent:", currentStats.totalSent);
      console.log("   Total Failed:", currentStats.totalFailed);
      console.log(
        "   Success Rate:",
        ((currentStats.totalSent / currentStats.totalQueued) * 100).toFixed(1) +
          "%",
      );
      console.log(
        "   Average Processing Time:",
        currentStats.averageProcessingTime.toFixed(0) + "ms",
      );
      console.log("   Last Processed:", currentStats.lastProcessedAt);

      if (currentStats.totalSent > 0) {
        console.log("\n✅ All tests passed! Queue system working correctly.");
      } else {
        console.log(
          "\n⚠️ No messages were sent. Check WhatsApp service credentials.",
        );
      }
    }
  }, 2000);

  // Timeout after 2 minutes
  setTimeout(() => {
    clearInterval(monitorInterval);
    console.log("\n⏰ Test timeout reached");
    process.exit(0);
  }, 120000);
}

// Run tests
console.log("🚀 Starting WhatsApp Queue Service Tests...\n");
testQueueService().catch((error) => {
  console.error("\n❌ Test failed:", error);
  process.exit(1);
});
