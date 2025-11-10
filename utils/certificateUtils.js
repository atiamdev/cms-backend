const { PDFDocument } = require("pdf-lib");
const path = require("path");
const fs = require("fs");

/**
 * Fill certificate template with student data
 * @param {Object} certificateData - Certificate data to fill
 * @param {string} certificateData.studentName - Student's full name
 * @param {string} certificateData.courseTitle - Course title
 * @param {string} certificateData.courseDuration - Course duration
 * @param {string} certificateData.completionDate - Completion date
 * @param {string} certificateData.certificateNumber - Certificate number
 * @param {string} certificateData.verificationCode - Verification code
 * @returns {Promise<Buffer>} Filled PDF buffer
 */
async function fillCertificateTemplate(certificateData) {
  try {
    // Load the template from frontend public directory
    const templatePath = path.join(
      __dirname,
      "../../cms-frontend/public/atiam-cert.pdf"
    );

    console.log("Loading certificate template from:", templatePath);

    if (!fs.existsSync(templatePath)) {
      throw new Error(
        `Certificate template not found at: ${templatePath}. Please ensure atiam-cert.pdf exists in cms-frontend/public/`
      );
    }

    const templateBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.load(templateBytes);
    const form = pdfDoc.getForm();

    // Log available fields for debugging
    const fields = form.getFields();
    console.log(`Found ${fields.length} form fields in certificate template`);
    fields.forEach((field) => {
      console.log(`- ${field.getName()}`);
    });

    // Fill form fields with certificate data
    const fieldMappings = {
      studentName: certificateData.studentName || "",
      courseTitle: certificateData.courseTitle || "",
      courseDuration: certificateData.courseDuration || "", // Note: field name has leading space
      completionDate: certificateData.completionDate || "",
      certificateNumber: certificateData.certificateNumber || "",
      verificationCode: certificateData.verificationCode || "",
    };

    console.log("Filling certificate with data:", fieldMappings);

    // Set each field value
    Object.entries(fieldMappings).forEach(([fieldName, value]) => {
      try {
        const field = form.getTextField(fieldName);
        if (field) {
          field.setText(String(value));
          console.log(`Set field "${fieldName}" to: ${value}`);
        } else {
          console.warn(`Field "${fieldName}" not found in template`);
        }
      } catch (error) {
        console.error(`Error setting field "${fieldName}":`, error.message);
      }
    });

    // Flatten the form to make it non-editable
    form.flatten();

    // Save the filled PDF
    const pdfBytes = await pdfDoc.save();
    console.log("Certificate filled successfully");

    return Buffer.from(pdfBytes);
  } catch (error) {
    console.error("Error filling certificate template:", error);
    throw error;
  }
}

module.exports = {
  fillCertificateTemplate,
};
