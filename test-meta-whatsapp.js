/**
 * Meta WhatsApp API Integration Test
 *
 * This script tests the new Meta WhatsApp Business Cloud API integration
 * to ensure all functionality works correctly before deploying to production.
 */

require("dotenv").config();
const WhatsAppService = require("./services/whatsappService");

async function testMetaWhatsAppIntegration() {
  console.log("\n🧪 Testing Meta WhatsApp API Integration\n");
  console.log("=".repeat(60));

  // Test 1: Service initialization
  console.log("\n1️⃣ Test: Service Initialization");
  console.log("-".repeat(60));
  const status = WhatsAppService.getStatus();
  console.log("   Enabled:        ", status.enabled ? "✅ Yes" : "❌ No");
  console.log("   Provider:       ", status.provider);
  console.log("   Initialized:    ", status.initialized ? "✅ Yes" : "❌ No");
  console.log("   API Version:    ", status.apiVersion);
  console.log("   Rate Limit:     ", status.rateLimitDelay, "ms");
  console.log("   Max Retries:    ", status.maxRetries);

  if (!status.enabled || !status.initialized) {
    console.log(
      "\n❌ Service not initialized properly. Check .env configuration:",
    );
    console.log("   - META_WHATSAPP_PHONE_NUMBER_ID");
    console.log("   - META_WHATSAPP_ACCESS_TOKEN");
    console.log("   - WHATSAPP_ENABLED=true");
    return;
  }

  // Test 2: Phone number formatting
  console.log("\n2️⃣ Test: Phone Number Formatting");
  console.log("-".repeat(60));
  const testNumbers = [
    { input: "0712345678", desc: "Kenyan local format" },
    { input: "+254712345678", desc: "Kenyan international" },
    { input: "254712345678", desc: "Kenyan without +" },
    { input: "254797945600", desc: "Test number" },
    { input: "712345678", desc: "Kenyan 9-digit" },
    { input: "invalid", desc: "Invalid number" },
  ];

  testNumbers.forEach(({ input, desc }) => {
    const formatted = WhatsAppService.formatPhoneNumber(input);
    const status = formatted ? "✅" : "❌";
    console.log(
      `   ${status} ${input.padEnd(20)} → ${formatted || "INVALID"} (${desc})`,
    );
  });

  // Test 3: Send test message
  console.log("\n3️⃣ Test: Send Test Message");
  console.log("-".repeat(60));
  const testPhone = process.env.TEST_PHONE_NUMBER || "254797945600";
  const testMessage = `🧪 Test Message - Meta WhatsApp API

✅ Sent from: ATIAM College CMS
📅 Date: ${new Date().toLocaleString()}
🔧 Provider: Meta WhatsApp Business Cloud API
🆔 Phone Number ID: ${process.env.META_WHATSAPP_PHONE_NUMBER_ID}

This is a test message to verify the integration is working correctly.`;

  console.log(`   Sending to:     ${testPhone}`);
  console.log(`   Message length: ${testMessage.length} characters`);

  try {
    const result = await WhatsAppService.sendMessage(testPhone, testMessage);

    console.log("\n   📊 Result:");
    console.log("   " + "-".repeat(56));
    console.log(`   Success:        ${result.success ? "✅ Yes" : "❌ No"}`);

    if (result.success) {
      console.log(`   Message ID:     ${result.messageId}`);
      console.log(`   WhatsApp ID:    ${result.waId}`);
      console.log(`   Provider:       ${result.provider}`);
      console.log("\n   ✅ Message sent successfully!");
    } else {
      console.log(`   Error:          ${result.error || result.reason}`);
      console.log(`   Attempts:       ${result.attempts || 1}`);
      console.log("\n   ❌ Failed to send message");
    }
  } catch (error) {
    console.log(`\n   ❌ Exception occurred: ${error.message}`);
  }

  // Test 4: Multiple message test (rate limiting)
  console.log("\n4️⃣ Test: Rate Limiting (3 messages)");
  console.log("-".repeat(60));

  const startTime = Date.now();
  let successCount = 0;
  let failCount = 0;

  for (let i = 1; i <= 3; i++) {
    const msg = `Test message ${i}/3 - Rate limit test at ${new Date().toLocaleTimeString()}`;
    const result = await WhatsAppService.sendMessage(testPhone, msg);

    if (result.success) {
      successCount++;
      console.log(`   ✅ Message ${i}/3 sent (ID: ${result.messageId})`);
    } else {
      failCount++;
      console.log(
        `   ❌ Message ${i}/3 failed (${result.error || result.reason})`,
      );
    }
  }

  const duration = Date.now() - startTime;
  const avgTime = (duration / 3).toFixed(0);

  console.log("\n   📊 Rate Limiting Results:");
  console.log("   " + "-".repeat(56));
  console.log(`   Successful:     ${successCount}/3`);
  console.log(`   Failed:         ${failCount}/3`);
  console.log(`   Total time:     ${duration}ms`);
  console.log(`   Avg time/msg:   ${avgTime}ms`);
  console.log(`   Expected delay: ${status.rateLimitDelay}ms between messages`);

  // Test 5: Error handling
  console.log("\n5️⃣ Test: Error Handling");
  console.log("-".repeat(60));

  // Test invalid phone
  const invalidResult = await WhatsAppService.sendMessage("invalid", "Test");
  console.log(
    `   Invalid phone:  ${invalidResult.success ? "❌ Should fail" : "✅ Correctly rejected"} (${invalidResult.reason})`,
  );

  // Test empty message (this will send to API and likely fail)
  const emptyResult = await WhatsAppService.sendMessage(testPhone, "");
  console.log(
    `   Empty message:  ${emptyResult.success ? "⚠️ Sent" : "✅ Rejected"} (${emptyResult.error || emptyResult.reason || "N/A"})`,
  );

  // Final summary
  console.log("\n" + "=".repeat(60));
  console.log("🏁 Test Complete\n");
  console.log("📝 Summary:");
  console.log(
    `   Service:        ${status.enabled ? "✅ Enabled" : "❌ Disabled"}`,
  );
  console.log(`   Provider:       ${status.provider.toUpperCase()}`);
  console.log(`   API Version:    ${status.apiVersion}`);
  console.log(`   Test messages:  ${successCount}/3 successful`);
  console.log("\n📋 Next Steps:");
  console.log("   1. Review test results above");
  console.log("   2. If all tests pass, ready for staging deployment");
  console.log("   3. Configure webhook in Meta Business Suite:");
  console.log(`      - URL: https://your-domain.com/api/whatsapp/webhook`);
  console.log(
    `      - Verify Token: ${process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN || "SET IN .ENV"}`,
  );
  console.log("   4. Test invoice, attendance, and notice notifications");
  console.log("\n" + "=".repeat(60) + "\n");
}

// Run tests
testMetaWhatsAppIntegration()
  .catch((error) => {
    console.error("\n❌ Test failed with exception:", error.message);
    console.error(error.stack);
    process.exit(1);
  })
  .then(() => {
    process.exit(0);
  });
