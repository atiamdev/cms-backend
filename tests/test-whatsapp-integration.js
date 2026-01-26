/**
 * WhatsApp Integration Test Script
 *
 * Tests the core WhatsApp service functionality including:
 * - Service initialization
 * - Phone number formatting
 * - Message sending (if configured)
 */

require("dotenv").config();
const whatsAppService = require("../services/whatsappService");

async function runIntegrationTests() {
  console.log("🧪 Running WhatsApp Integration Tests");
  console.log("=====================================\n");

  // Test 1: Service initialization
  console.log("1. Testing Service Initialization");
  console.log("---------------------------------");
  console.log(`✅ Service enabled: ${whatsAppService.isEnabled}`);
  console.log(`✅ Service initialized: ${whatsAppService.wasender !== null}`);

  const status = whatsAppService.getStatus();
  console.log(`📊 Service status:`, status);
  console.log();

  // Test 2: Phone number formatting
  console.log("2. Testing Phone Number Formatting");
  console.log("-----------------------------------");

  const testNumbers = [
    // Kenyan formats (backward compatibility)
    {
      input: "0712345678",
      expected: "254712345678",
      description: "Kenyan format with leading 0",
    },
    {
      input: "+254712345678",
      expected: "254712345678",
      description: "Kenyan international format with +",
    },
    {
      input: "712345678",
      expected: "254712345678",
      description: "Kenyan 9 digits without country code",
    },
    {
      input: "254712345678",
      expected: "254712345678",
      description: "Kenyan already in international format",
    },

    // International formats from other countries
    {
      input: "+1234567890",
      expected: "1234567890",
      description: "US format with +",
    },
    {
      input: "+447123456789",
      expected: "447123456789",
      description: "UK format with +",
    },
    {
      input: "+911234567890",
      expected: "911234567890",
      description: "India format with +",
    },
    {
      input: "+5511987654321",
      expected: "5511987654321",
      description: "Brazil format with +",
    },
    {
      input: "+8613812345678",
      expected: "8613812345678",
      description: "China format with +",
    },
    {
      input: "+27123456789",
      expected: "27123456789",
      description: "South Africa format with +",
    },
    {
      input: "00447123456789",
      expected: "447123456789",
      description: "UK format with 00 prefix",
    },

    // Invalid formats
    {
      input: "071234567",
      expected: null,
      description: "Invalid length (9 digits with 0)",
    },
    { input: "123", expected: null, description: "Invalid short number" },
    { input: "", expected: null, description: "Empty string" },
    {
      input: "07123456789",
      expected: null,
      description: "Invalid length (11 digits with 0)",
    },
    {
      input: "+123",
      expected: null,
      description: "Invalid international format (too short)",
    },
    {
      input: "+999123456789",
      expected: null,
      description: "Invalid country code",
    },
  ];

  testNumbers.forEach(({ input, expected, description }) => {
    const result = whatsAppService.formatPhoneNumber(input);
    const success = result === expected;
    console.log(
      `${success ? "✅" : "❌"} ${description}: "${input}" → "${result}" ${success ? "(PASS)" : `(FAIL - expected "${expected}")`}`,
    );
  });
  console.log();

  // Test 3: Send test message (if TEST_PHONE_NUMBER is set and service is enabled)
  if (process.env.TEST_PHONE_NUMBER && whatsAppService.isEnabled) {
    console.log("3. Testing Message Sending");
    console.log("--------------------------");

    const testPhone = process.env.TEST_PHONE_NUMBER;
    const testMessage = `🧪 *WhatsApp Integration Test*

📅 Date: ${new Date().toLocaleString()}
🔧 Service: ATIAM CMS WhatsApp Integration
📊 Status: Phase 1 - Core Setup Complete

This is an automated test message to verify WhatsApp integration is working correctly.`;

    console.log(`📤 Sending test message to: ${testPhone}`);
    console.log(`📝 Message preview: ${testMessage.substring(0, 100)}...`);

    try {
      const result = await whatsAppService.sendMessage(testPhone, testMessage);
      console.log("📤 Test result:", result);

      if (result.success) {
        console.log("✅ Message sent successfully!");
        console.log(`📨 Message ID: ${result.messageId}`);
        if (result.rateLimit) {
          console.log(
            `⏱️  Rate limit info: ${result.rateLimit.remaining}/${result.rateLimit.limit} remaining`,
          );
        }
      } else {
        console.log(
          "❌ Failed to send message:",
          result.error || result.reason,
        );
      }
    } catch (error) {
      console.error("❌ Unexpected error during test:", error.message);
    }
  } else {
    console.log("3. Message Sending Test Skipped");
    console.log("-------------------------------");
    if (!process.env.TEST_PHONE_NUMBER) {
      console.log("⚠️  TEST_PHONE_NUMBER not set in environment variables");
    }
    if (!whatsAppService.isEnabled) {
      console.log("⚠️  WhatsApp service is disabled");
    }
    console.log(
      "💡 To test message sending, set TEST_PHONE_NUMBER and ensure WHATSAPP_ENABLED=true",
    );
  }

  console.log("\n=====================================");
  console.log("🧪 Integration Tests Complete");
  console.log("=====================================");

  // Summary
  const summary = {
    serviceEnabled: whatsAppService.isEnabled,
    serviceInitialized: whatsAppService.wasender !== null,
    phoneFormattingTests: testNumbers.length,
    messageTestPerformed: !!(
      process.env.TEST_PHONE_NUMBER && whatsAppService.isEnabled
    ),
  };

  console.log("\n📋 Test Summary:");
  console.log(`   • Service Enabled: ${summary.serviceEnabled ? "✅" : "❌"}`);
  console.log(
    `   • Service Initialized: ${summary.serviceInitialized ? "✅" : "❌"}`,
  );
  console.log(
    `   • Phone Formatting Tests: ${summary.phoneFormattingTests} cases tested`,
  );
  console.log(
    `   • Message Test Performed: ${summary.messageTestPerformed ? "✅" : "⚠️ Skipped"}`,
  );

  if (summary.serviceEnabled && summary.serviceInitialized) {
    console.log("\n🎉 Phase 1 (Core Setup & Configuration) is COMPLETE!");
    console.log("🚀 Ready to proceed to Phase 2 (Invoice Notifications)");
  } else {
    console.log("\n⚠️  Phase 1 issues detected. Please check configuration:");
    if (!summary.serviceEnabled) {
      console.log("   - Set WHATSAPP_ENABLED=true in .env");
    }
    if (!summary.serviceInitialized) {
      console.log(
        "   - Check WASENDER_API_KEY and WASENDER_PERSONAL_ACCESS_TOKEN in .env",
      );
      console.log("   - Verify WasenderAPI credentials are correct");
    }
  }
}

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

// Run the tests
runIntegrationTests().catch((error) => {
  console.error("❌ Test suite failed:", error);
  process.exit(1);
});
