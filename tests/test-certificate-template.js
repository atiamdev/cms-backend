const { fillCertificateTemplate } = require("../utils/certificateUtils");
const fs = require("fs");
const path = require("path");

async function testCertificateGeneration() {
  console.log("Testing certificate template filling...\n");

  const testData = {
    studentName: "John Doe",
    courseTitle: "Advanced Web Development",
    courseDuration: "40 hours",
    completionDate: "November 10, 2025",
    certificateNumber: "CERT-1699564800000-123",
    verificationCode: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  };

  try {
    console.log("Test certificate data:");
    console.log(JSON.stringify(testData, null, 2));
    console.log("\nGenerating certificate...");

    const pdfBuffer = await fillCertificateTemplate(testData);

    // Save test certificate
    const outputPath = path.join(__dirname, "test-certificate.pdf");
    fs.writeFileSync(outputPath, pdfBuffer);

    console.log("\n✅ Certificate generated successfully!");
    console.log(`📄 Saved to: ${outputPath}`);
    console.log(`📊 Size: ${(pdfBuffer.length / 1024).toFixed(2)} KB`);
  } catch (error) {
    console.error("\n❌ Error generating certificate:");
    console.error(error.message);
    console.error(error.stack);
  }
}

testCertificateGeneration();
