/**
 * Quick Meta WhatsApp API Test - Using Meta Test Recipients
 *
 * This test uses phone numbers that are pre-approved by Meta for testing
 */

require("dotenv").config();
const WhatsAppService = require("./services/whatsappService");

async function quickTest() {
  console.log("\n🧪 Quick Meta WhatsApp API Test\n");
  console.log("=".repeat(60));

  // Check service status
  const status = WhatsAppService.getStatus();
  console.log("\n📊 Service Status:");
  console.log(`   Provider:    ${status.provider}`);
  console.log(`   Enabled:     ${status.enabled}`);
  console.log(`   Initialized: ${status.initialized}`);

  if (!status.enabled || !status.initialized) {
    console.log("\n❌ Service not initialized. Check .env configuration.");
    return;
  }

  console.log("\n" + "=".repeat(60));
  console.log("\n⚠️  IMPORTANT: Meta Test Number Restrictions");
  console.log("-".repeat(60));
  console.log("Your phone number (993726057160052) is a TEST number.");
  console.log("Test numbers can ONLY send to whitelisted recipients.\n");
  console.log("📋 To fix the 401 error, you must:");
  console.log(
    "   1. Go to: https://business.facebook.com/wa/manage/phone-numbers/",
  );
  console.log("   2. Select your phone number");
  console.log("   3. Add recipient phone numbers to whitelist");
  console.log("   4. Verify each number via WhatsApp code\n");
  console.log(
    "Once whitelisted, that number will receive messages successfully.",
  );
  console.log("\n" + "=".repeat(60));

  // Try sending to the test number (will likely fail with 401 if not whitelisted)
  console.log("\n🧪 Attempting to send test message...");
  console.log("-".repeat(60));

  const testPhone = process.env.TEST_PHONE_NUMBER || "254797945600";
  const testMessage = `✅ Meta WhatsApp API Test\nDate: ${new Date().toLocaleString()}\nStatus: Testing`;

  console.log(`   Target: ${testPhone}`);

  const result = await WhatsAppService.sendMessage(testPhone, testMessage);

  console.log("\n📊 Result:");
  console.log("-".repeat(60));
  console.log(`   Success: ${result.success ? "✅ YES" : "❌ NO"}`);

  if (result.success) {
    console.log(`   Message ID: ${result.messageId}`);
    console.log(`   WhatsApp ID: ${result.waId}`);
    console.log("\n✅ SUCCESS! Your integration is working correctly!");
  } else if (
    result.error?.includes("401") ||
    result.error?.includes("Unauthorized")
  ) {
    console.log(`   Error: ${result.error}`);
    console.log("\n⚠️  This is expected for non-whitelisted numbers.");
    console.log("\n📋 Next Steps:");
    console.log(
      "   1. Add +254797945600 to your phone number's recipient list",
    );
    console.log("   2. Verify it via WhatsApp (you'll receive a code)");
    console.log("   3. Run this test again");
    console.log("\n🔗 Quick Link:");
    console.log("   https://business.facebook.com/wa/manage/phone-numbers/");
  } else {
    console.log(`   Error: ${result.error || result.reason}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("\n💡 Alternative Solutions:\n");
  console.log("Option A: Whitelist test recipients (Quick - 5 minutes)");
  console.log("   - Add specific phone numbers to recipient list");
  console.log("   - Best for development/testing\n");
  console.log(
    "Option B: Verify business & phone number (Production - 1-3 days)",
  );
  console.log("   - Complete business verification");
  console.log("   - Get phone number approved");
  console.log("   - Send to ANY phone number\n");
  console.log("Option C: Use production phone number");
  console.log("   - Add your business phone to Meta account");
  console.log("   - Must be verified and approved");
  console.log("\n" + "=".repeat(60) + "\n");
}

quickTest()
  .catch((error) => {
    console.error("\n❌ Test error:", error.message);
  })
  .then(() => process.exit(0));
