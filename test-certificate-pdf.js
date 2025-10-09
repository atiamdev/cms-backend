const certificateService = require("./services/certificateService");
const fs = require("fs");
const path = require("path");

async function testCertificateGeneration() {
  try {
    console.log("Testing certificate generation...");

    // Mock certificate data
    const testData = {
      studentName: "John Doe",
      courseTitle: "Test Course",
      instructorName: "Jane Smith",
      completionDate: "December 15, 2024",
      certificateNumber: "CERT-123456789-001",
      verificationCode: "abcd1234efgh5678",
    };

    // Generate PDF
    const pdfBuffer = await certificateService.generateCertificatePDF(testData);

    // Save to file for inspection
    const testFilePath = path.join(__dirname, "test-certificate.pdf");
    fs.writeFileSync(testFilePath, pdfBuffer);

    console.log("✅ Certificate PDF generated successfully");
    console.log(`📄 Test certificate saved to: ${testFilePath}`);
    console.log("📋 Certificate data used:");
    console.log(`   - Student: ${testData.studentName}`);
    console.log(`   - Course: ${testData.courseTitle}`);
    console.log(`   - Certificate Number: ${testData.certificateNumber}`);
    console.log(`   - Verification Code: ${testData.verificationCode}`);

    // Check if PDF contains the certificate number and verification code
    const pdfText = pdfBuffer.toString("latin1"); // Rough text extraction
    const hasCertNumber = pdfText.includes(testData.certificateNumber);
    const hasVerificationCode = pdfText.includes(testData.verificationCode);

    console.log("\n🔍 PDF Content Verification:");
    console.log(
      `   - Certificate Number in PDF: ${hasCertNumber ? "✅" : "❌"}`
    );
    console.log(
      `   - Verification Code in PDF: ${hasVerificationCode ? "✅" : "❌"}`
    );

    if (hasCertNumber && hasVerificationCode) {
      console.log(
        "\n🎉 Test PASSED: Certificate PDF contains all required information!"
      );
    } else {
      console.log(
        "\n❌ Test FAILED: Certificate PDF is missing required information!"
      );
    }
  } catch (error) {
    console.error("❌ Test failed with error:", error.message);
  }
}

testCertificateGeneration();
