const { PDFDocument } = require("pdf-lib");
const path = require("path");
const fs = require("fs");

/**
 * Fill the Atiam Admission Letter template with student data
 * @param {Object} admissionData - Admission letter data object
 * @param {string} admissionData.studentName - Full name of the student
 * @param {string} admissionData.admissionNumber - Student admission number
 * @param {string} admissionData.course - Course/Class name
 * @param {Date} admissionData.admissionDate - Admission date
 * @returns {Promise<Buffer>} PDF bytes
 */
const fillAdmissionLetterTemplate = async (admissionData) => {
  try {
    console.log("=== Starting Admission Letter Generation ===");
    console.log("Admission Data:", JSON.stringify(admissionData, null, 2));

    // Load the template PDF from remote URL or local file
    const templateUrl =
      process.env.ADMISSION_LETTER_TEMPLATE_URL ||
      "https://e-resource.atiamcollege.com/templates/Atiam%20Admissions%20letter%202026.pdf";
    let templateBytes;

    if (templateUrl && /^https?:\/\//i.test(templateUrl)) {
      console.log("Using remote admission letter template URL:", templateUrl);

      // Use global fetch if available (Node 18+), otherwise require node-fetch
      let fetchFn;
      if (typeof globalThis.fetch === "function") {
        fetchFn = globalThis.fetch.bind(globalThis);
      } else {
        try {
          const nodeFetch = require("node-fetch");
          fetchFn = nodeFetch;
        } catch (err) {
          throw new Error(
            "fetch is not available in this Node version and 'node-fetch' is not installed. Install node-fetch or run on Node 18+."
          );
        }
      }

      const resp = await fetchFn(templateUrl);
      if (!resp.ok) {
        throw new Error(
          `Failed to download remote template: ${resp.status} ${resp.statusText}`
        );
      }

      const arrayBuffer = await resp.arrayBuffer();
      templateBytes = Buffer.from(arrayBuffer);
      console.log(
        "Remote template downloaded, size:",
        templateBytes.length,
        "bytes"
      );
    } else {
      // Fallback to local file if remote URL fails
      const templatePath = path.join(
        __dirname,
        "../../cms-frontend/public/Atiam Admissions letter 2026.pdf"
      );

      console.log("Using local template path:", templatePath);
      if (!fs.existsSync(templatePath)) {
        throw new Error(
          `Admission letter template not found at: ${templatePath}. Please ensure the file exists or set ADMISSION_LETTER_TEMPLATE_URL env var`
        );
      }

      templateBytes = fs.readFileSync(templatePath);
      console.log(
        "Local template loaded, size:",
        templateBytes.length,
        "bytes"
      );
    }

    const pdfDoc = await PDFDocument.load(templateBytes);
    const form = pdfDoc.getForm();

    // Get all available form fields for debugging
    const fields = form.getFields();
    console.log("Number of form fields found:", fields.length);
    console.log("Available form fields in admission letter template:");
    fields.forEach((field) => {
      console.log(`- ${field.getName()}: ${field.constructor.name}`);
    });

    // Check if template has form fields
    if (fields.length === 0) {
      console.warn(
        "⚠️  Template has no form fields. It may not be a fillable PDF."
      );
      throw new Error(
        "Admission letter template is not a fillable PDF. Please ensure the template has form fields."
      );
    }

    // Format the admission date
    const formattedDate = admissionData.admissionDate
      ? new Date(admissionData.admissionDate).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : new Date().toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });

    // Map of field names to values
    // These field names should match the form field names in the PDF template
    const fieldMapping = {
      studentName: admissionData.studentName || "",
      admissionNumber: admissionData.admissionNumber || "",
      course: admissionData.course || "",
      admissionDate: formattedDate,
    };

    console.log("Field mapping:", fieldMapping);

    // Try to fill each field
    let filledFieldsCount = 0;
    for (const [fieldKey, fieldValue] of Object.entries(fieldMapping)) {
      try {
        const field = form.getTextField(fieldKey);
        if (field) {
          field.setText(String(fieldValue));
          console.log(`✓ Filled field: ${fieldKey} = ${fieldValue}`);
          filledFieldsCount++;
        } else {
          console.log(`⚠️  Field not found: ${fieldKey}`);
        }
      } catch (error) {
        console.log(`⚠️  Could not fill field ${fieldKey}:`, error.message);
      }
    }

    console.log(
      `Filled ${filledFieldsCount} out of ${
        Object.keys(fieldMapping).length
      } fields`
    );

    if (filledFieldsCount === 0) {
      console.warn(
        "⚠️  No fields were filled. Check field names in the template."
      );
      console.log(
        "Available field names:",
        fields.map((f) => f.getName())
      );
    }

    // Flatten the form to make fields non-editable
    form.flatten();

    // Save the PDF
    const pdfBytes = await pdfDoc.save();
    console.log("✓ Admission letter generated successfully");
    console.log("PDF size:", pdfBytes.length, "bytes");

    return Buffer.from(pdfBytes);
  } catch (error) {
    console.error("=== Admission Letter Generation Error ===");
    console.error("Error:", error.message);
    console.error("Stack:", error.stack);
    throw error;
  }
};

module.exports = {
  fillAdmissionLetterTemplate,
};
