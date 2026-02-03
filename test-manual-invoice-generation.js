/**
 * Test Manual Invoice Generation API
 *
 * This script demonstrates how to call the manual invoice generation endpoint.
 * Use this to test the API before integrating with the frontend.
 *
 * Usage:
 *   1. Get a valid JWT token for a super admin user
 *   2. Update the TOKEN constant below
 *   3. Run: node test-manual-invoice-generation.js
 */

const axios = require("axios");

// Configuration
const API_BASE_URL = "http://localhost:5000/api";
const TOKEN = "YOUR_SUPER_ADMIN_JWT_TOKEN_HERE"; // Replace with actual token

// Test invoice generation
async function testInvoiceGeneration() {
  try {
    console.log("Testing Manual Invoice Generation API...\n");

    // Example 1: Generate invoices for current month
    console.log("=".repeat(70));
    console.log("Example 1: Generate invoices for current month");
    console.log("=".repeat(70));

    const response1 = await axios.post(
      `${API_BASE_URL}/fees/admin/generate-invoices`,
      {
        // If year and month are omitted, it uses current month
        frequency: "monthly",
        consolidate: true,
      },
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
      },
    );

    console.log("Response:", JSON.stringify(response1.data, null, 2));

    // Example 2: Generate invoices for a specific month
    console.log("\n" + "=".repeat(70));
    console.log("Example 2: Generate invoices for January 2026");
    console.log("=".repeat(70));

    const response2 = await axios.post(
      `${API_BASE_URL}/fees/admin/generate-invoices`,
      {
        year: 2026,
        month: 1,
        frequency: "monthly",
        consolidate: true,
      },
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
      },
    );

    console.log("Response:", JSON.stringify(response2.data, null, 2));

    // Example 3: Generate for specific branch
    console.log("\n" + "=".repeat(70));
    console.log("Example 3: Generate invoices for specific branch");
    console.log("=".repeat(70));

    const response3 = await axios.post(
      `${API_BASE_URL}/fees/admin/generate-invoices`,
      {
        year: 2026,
        month: 2,
        frequency: "monthly",
        branchId: "YOUR_BRANCH_ID_HERE", // Replace with actual branch ID
        consolidate: true,
      },
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
      },
    );

    console.log("Response:", JSON.stringify(response3.data, null, 2));
  } catch (error) {
    console.error("Error testing API:");
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Data:", error.response.data);
    } else {
      console.error(error.message);
    }
  }
}

// Run the test
if (require.main === module) {
  if (TOKEN === "YOUR_SUPER_ADMIN_JWT_TOKEN_HERE") {
    console.log(
      "❌ Error: Please update the TOKEN constant with a valid super admin JWT token",
    );
    console.log("\nTo get a token:");
    console.log("1. Login as super admin via the API or frontend");
    console.log(
      "2. Copy the JWT token from the response or browser localStorage",
    );
    console.log("3. Update the TOKEN constant in this script");
    console.log("4. Run the script again\n");
    process.exit(1);
  }

  testInvoiceGeneration();
}

module.exports = { testInvoiceGeneration };
