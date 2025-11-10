const { PDFDocument } = require("pdf-lib");
const fs = require("fs");
const path = require("path");

async function testTemplate() {
  try {
    const templatePath = path.join(
      __dirname,
      "../cms-frontend/public/Atiam Receipt.pdf"
    );

    console.log("Template path:", templatePath);
    console.log("Template exists:", fs.existsSync(templatePath));

    if (!fs.existsSync(templatePath)) {
      console.error("Template not found!");
      return;
    }

    const templateBytes = fs.readFileSync(templatePath);
    console.log("Template size:", templateBytes.length, "bytes");

    const pdfDoc = await PDFDocument.load(templateBytes);
    const form = pdfDoc.getForm();

    const fields = form.getFields();
    console.log("\n=== PDF FORM ANALYSIS ===");
    console.log("Number of form fields:", fields.length);

    if (fields.length > 0) {
      console.log("\nForm fields found:");
      fields.forEach((field, index) => {
        console.log(
          `${index + 1}. Name: "${field.getName()}" | Type: ${
            field.constructor.name
          }`
        );
      });
    } else {
      console.log("\nNo form fields found in this PDF.");
      console.log(
        "This PDF requires text overlay approach with specific coordinates."
      );

      const pages = pdfDoc.getPages();
      console.log("\nPDF has", pages.length, "page(s)");
      if (pages.length > 0) {
        const firstPage = pages[0];
        const { width, height } = firstPage.getSize();
        console.log("First page dimensions:", { width, height });
      }
    }
  } catch (error) {
    console.error("Error testing template:", error);
  }
}

testTemplate();
