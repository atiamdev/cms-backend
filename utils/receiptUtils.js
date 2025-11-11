const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const path = require("path");
const fs = require("fs");

/**
 * Helper function to convert number to words
 * @param {number} num - Number to convert
 * @returns {string} Number in words
 */
const numberToWords = (num) => {
  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
  ];
  const teens = [
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];

  if (num === 0) return "Zero";

  let words = "";

  if (num >= 1000000) {
    words += numberToWords(Math.floor(num / 1000000)) + " Million ";
    num %= 1000000;
  }

  if (num >= 1000) {
    words += numberToWords(Math.floor(num / 1000)) + " Thousand ";
    num %= 1000;
  }

  if (num >= 100) {
    words += ones[Math.floor(num / 100)] + " Hundred ";
    num %= 100;
  }

  if (num >= 20) {
    words += tens[Math.floor(num / 10)] + " ";
    num %= 10;
  } else if (num >= 10) {
    words += teens[num - 10] + " ";
    num = 0;
  }

  if (num > 0) {
    words += ones[num] + " ";
  }

  return words.trim();
};

/**
 * Fill the Atiam Receipt template with payment data
 * @param {Object} receiptData - Receipt data object
 * @param {string} receiptData.studentName - Full name of the student
 * @param {string} receiptData.receiptNumber - Receipt number
 * @param {Date} receiptData.paymentDate - Payment date
 * @param {string} receiptData.admissionNumber - Student admission number
 * @param {string} receiptData.course - Course/Class name
 * @param {number} receiptData.amount - Payment amount
 * @param {string} receiptData.paymentMethod - Payment method (cash, cheque, mpesa, other)
 * @param {string} receiptData.receivedBy - Name of person who received payment
 * @returns {Promise<Buffer>} PDF bytes
 */
const fillReceiptTemplate = async (receiptData) => {
  try {
    console.log("=== Starting Receipt Generation ===");
    console.log("Receipt Data:", JSON.stringify(receiptData, null, 2));

    // Load the template PDF.
    // Prefer a remote template URL provided via env (RECEIPT_TEMPLATE_URL) for deployments,
    // otherwise fall back to the local file under cms-frontend/public.
    const templateUrl = process.env.RECEIPT_TEMPLATE_URL;
    let templateBytes;

    if (templateUrl && /^https?:\/\//i.test(templateUrl)) {
      console.log("Using remote receipt template URL from env:", templateUrl);

      // Use global fetch if available (Node 18+). Otherwise lazily require node-fetch.
      let fetchFn;
      if (typeof globalThis.fetch === "function") {
        fetchFn = globalThis.fetch.bind(globalThis);
      } else {
        try {
          // node-fetch v3 is ESM; require may work if installed as a cjs shim. Try to require.
          // eslint-disable-next-line global-require
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
      const templatePath = path.join(
        __dirname,
        "../../cms-frontend/public/Atiam Receipt.pdf"
      );

      console.log("Using local template path:", templatePath);
      if (!fs.existsSync(templatePath)) {
        throw new Error(
          `Receipt template not found at: ${templatePath}. Please ensure the Atiam Receipt.pdf file exists in cms-frontend/public/ or set RECEIPT_TEMPLATE_URL env var`
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
    console.log("Available form fields in template:");
    fields.forEach((field) => {
      console.log(`- ${field.getName()}: ${field.constructor.name}`);
    });

    // Check if template has form fields
    if (fields.length === 0) {
      console.log(
        "Template has no form fields. Using text overlay approach..."
      );

      // // Since template has no form fields, we'll overlay text on the PDF
      // const pages = pdfDoc.getPages();
      // const firstPage = pages[0];
      // const { width, height } = firstPage.getSize();

      // // Create a new PDF with text overlay
      // const newPdfDoc = await PDFDocument.create();
      // const [copiedPage] = await newPdfDoc.copyPages(pdfDoc, [0]);
      // newPdfDoc.addPage(copiedPage);

      // const newPage = newPdfDoc.getPages()[0];
      // const font = await newPdfDoc.embedFont(StandardFonts.Helvetica);
      // const boldFont = await newPdfDoc.embedFont(StandardFonts.CourierBold);

      // Define positions for text overlay
      // These coordinates may need to be adjusted based on your template layout
      //   const textPositions = {
      //     studentName: { x: 150, y: height - 150, size: 12 },
      //     receiptNo: { x: 150, y: height - 180, size: 12 },
      //     date: { x: 400, y: height - 180, size: 12 },
      //     admissionNo: { x: 150, y: height - 210, size: 12 },
      //     course: { x: 150, y: height - 240, size: 12 },
      //     amount: { x: 150, y: height - 270, size: 12 },
      //     amountWords: { x: 150, y: height - 300, size: 10 },
      //     receivedBy: { x: 150, y: height - 330, size: 12 },
      //   };

      //   // Draw text on the PDF
      //   newPage.drawText(receiptData.studentName || "N/A", {
      //     x: textPositions.studentName.x,
      //     y: textPositions.studentName.y,
      //     size: textPositions.studentName.size,
      //     font: boldFont,
      //     color: rgb(0, 0, 0),
      //   });

      //   newPage.drawText(receiptData.receiptNumber || "N/A", {
      //     x: textPositions.receiptNo.x,
      //     y: textPositions.receiptNo.y,
      //     size: textPositions.receiptNo.size,
      //     font: font,
      //     color: rgb(0, 0, 0),
      //   });

      //   const formattedDate = receiptData.paymentDate
      //     ? new Date(receiptData.paymentDate).toLocaleDateString()
      //     : "N/A";
      //   newPage.drawText(formattedDate, {
      //     x: textPositions.date.x,
      //     y: textPositions.date.y,
      //     size: textPositions.date.size,
      //     font: font,
      //     color: rgb(0, 0, 0),
      //   });

      //   newPage.drawText(receiptData.admissionNumber || "N/A", {
      //     x: textPositions.admissionNo.x,
      //     y: textPositions.admissionNo.y,
      //     size: textPositions.admissionNo.size,
      //     font: font,
      //     color: rgb(0, 0, 0),
      //   });

      //   newPage.drawText(receiptData.course || "N/A", {
      //     x: textPositions.course.x,
      //     y: textPositions.course.y,
      //     size: textPositions.course.size,
      //     font: font,
      //     color: rgb(0, 0, 0),
      //   });

      //   const amountText = `KES ${
      //     typeof receiptData.amount === "number"
      //       ? receiptData.amount.toLocaleString()
      //       : "0"
      //   }`;
      //   newPage.drawText(amountText, {
      //     x: textPositions.amount.x,
      //     y: textPositions.amount.y,
      //     size: textPositions.amount.size,
      //     font: boldFont,
      //     color: rgb(0, 0, 0),
      //   });

      //   const amount =
      //     typeof receiptData.amount === "number" ? receiptData.amount : 0;
      //   const amountInWords = numberToWords(amount);
      //   newPage.drawText(`${amountInWords} Kenya Shillings Only`, {
      //     x: textPositions.amountWords.x,
      //     y: textPositions.amountWords.y,
      //     size: textPositions.amountWords.size,
      //     font: font,
      //     color: rgb(0.46, 0.79, 0.18),
      //   });

      //   newPage.drawText(receiptData.receivedBy || "System", {
      //     x: textPositions.receivedBy.x,
      //     y: textPositions.receivedBy.y,
      //     size: textPositions.receivedBy.size,
      //     font: font,
      //     color: rgb(0, 0, 0),
      //   });

      //   console.log("Text overlay complete, saving PDF...");
      //   const savedPdf = await newPdfDoc.save();
      //   console.log("PDF saved, size:", savedPdf.length, "bytes");
      //   return savedPdf;
      // }
    }

    // If template has form fields, fill them
    console.log("Template has form fields, attempting to fill them...");
    try {
      // Student name field (actual field name: student_name)
      try {
        const studentNameField = form.getTextField("student_name");
        if (studentNameField) {
          studentNameField.setText(receiptData.studentName || "");
          console.log("✓ Filled student_name:", receiptData.studentName);
        }
      } catch (e) {
        console.log("✗ student_name field error:", e.message);
      }

      // Receipt number field - try common field names
      try {
        // Try different possible field names for receipt number
        const possibleNames = [
          "receipt_number",
          "receipt_no",
          "receiptNumber",
          "receiptNo",
          "receipt",
        ];
        let receiptFieldFound = false;

        for (const fieldName of possibleNames) {
          try {
            const receiptField = form.getTextField(fieldName);
            if (receiptField) {
              receiptField.setText(receiptData.receiptNumber || "");
              console.log(`✓ Filled ${fieldName}:`, receiptData.receiptNumber);
              receiptFieldFound = true;
              break;
            }
          } catch (e) {
            // Field doesn't exist, continue to next name
          }
        }

        if (!receiptFieldFound) {
          console.log("⚠ Receipt number field not found in template");
        }
      } catch (e) {
        console.log("✗ receipt_number field error:", e.message);
      }

      // Date field (actual field name: date)
      try {
        const dateField = form.getTextField("date");
        if (dateField) {
          const formattedDate = receiptData.paymentDate
            ? new Date(receiptData.paymentDate).toLocaleDateString()
            : "";
          dateField.setText(formattedDate);
          console.log("✓ Filled date:", formattedDate);
        }
      } catch (e) {
        console.log("✗ date field error:", e.message);
      }

      // Admission number field (actual field name: admission_number)
      try {
        const admissionNoField = form.getTextField("admission_number");
        if (admissionNoField) {
          admissionNoField.setText(receiptData.admissionNumber || "");
          console.log(
            "✓ Filled admission_number:",
            receiptData.admissionNumber
          );
        }
      } catch (e) {
        console.log("✗ admission_number field error:", e.message);
      }

      // Course field (actual field name: course)
      try {
        const courseField = form.getTextField("course");
        if (courseField) {
          courseField.setText(receiptData.course || "N/A");
          console.log("✓ Filled course:", receiptData.course);
        }
      } catch (e) {
        console.log("✗ course field error:", e.message);
      }

      // Amount in figures field (actual field name: amount_figures)
      try {
        const amountFiguresField = form.getTextField("amount_figures");
        if (amountFiguresField) {
          const amountText = `KES ${
            typeof receiptData.amount === "number"
              ? receiptData.amount.toLocaleString()
              : "0"
          }`;
          amountFiguresField.setText(amountText);
          console.log("✓ Filled amount_figures:", amountText);
        }
      } catch (e) {
        console.log("✗ amount_figures field error:", e.message);
      }

      // Amount in words field (actual field name: amount_words)
      try {
        const amountWordsField = form.getTextField("amount_words");
        if (amountWordsField) {
          const amount =
            typeof receiptData.amount === "number" ? receiptData.amount : 0;
          const amountInWords = numberToWords(amount);
          const wordsText = `${amountInWords} Kenya Shillings Only`;
          amountWordsField.setText(wordsText);
          console.log("✓ Filled amount_words:", wordsText);
        }
      } catch (e) {
        console.log("✗ amount_words field error:", e.message);
      }

      // Received by field (actual field name: receiver)
      try {
        const receivedByField = form.getTextField("receiver");
        if (receivedByField && receiptData.receivedBy) {
          // Only fill if receivedBy is provided (not empty string)
          receivedByField.setText(receiptData.receivedBy);
          console.log("✓ Filled receiver:", receiptData.receivedBy);
        } else if (receivedByField && !receiptData.receivedBy) {
          console.log("○ Skipped receiver field (left blank for manual entry)");
        }
      } catch (e) {
        console.log("✗ receiver field error:", e.message);
      }

      // Payment method checkboxes
      const paymentMethod = (receiptData.paymentMethod || "").toLowerCase();
      console.log("=== Payment Method Checkbox Logic ===");
      console.log("Original payment method:", receiptData.paymentMethod);
      console.log("Normalized payment method:", paymentMethod);

      // Cash checkbox (actual field name: cash)
      try {
        const cashCheckbox = form.getCheckBox("cash");
        if (paymentMethod === "cash") {
          cashCheckbox.check();
          console.log("✓ Checked cash checkbox");
        } else {
          console.log("○ Skipped cash checkbox (not cash payment)");
        }
      } catch (e) {
        console.log("✗ cash checkbox error:", e.message);
      }

      // Cheque checkbox (actual field name: cheque)
      try {
        const chequeCheckbox = form.getCheckBox("cheque");
        if (paymentMethod === "cheque") {
          chequeCheckbox.check();
          console.log("✓ Checked cheque checkbox");
        } else {
          console.log("○ Skipped cheque checkbox (not cheque payment)");
        }
      } catch (e) {
        console.log("✗ cheque checkbox error:", e.message);
      }

      // Mpesa checkbox (actual field name: Mpesa)
      try {
        const mpesaCheckbox = form.getCheckBox("Mpesa");
        const isMpesa =
          paymentMethod === "mpesa" ||
          paymentMethod === "equity" ||
          paymentMethod === "equity-mpesa" ||
          paymentMethod.includes("mpesa");

        if (isMpesa) {
          mpesaCheckbox.check();
          console.log("✓ Checked Mpesa checkbox");
        } else {
          console.log("○ Skipped Mpesa checkbox (not mpesa/equity payment)");
        }
      } catch (e) {
        console.log("✗ Mpesa checkbox error:", e.message);
      }

      // Manual/Other checkbox (actual field name: manual)
      try {
        const manualCheckbox = form.getCheckBox("manual");
        const isOther =
          !["cash", "cheque", "mpesa", "equity", "equity-mpesa"].includes(
            paymentMethod
          ) && !paymentMethod.includes("mpesa");

        if (isOther) {
          manualCheckbox.check();
          console.log("✓ Checked manual checkbox");
        } else {
          console.log("○ Skipped manual checkbox (recognized payment method)");
        }
      } catch (e) {
        console.log("✗ manual checkbox error:", e.message);
      }
      console.log("=== End Payment Method Logic ===");
    } catch (error) {
      console.log(
        "Some form fields may not exist in template, continuing with available fields:",
        error.message
      );
    }

    // Flatten the form to make it non-editable
    console.log("Flattening form fields...");
    form.flatten();

    console.log("Saving filled PDF...");
    const savedPdf = await pdfDoc.save();
    console.log("PDF saved with form fields, size:", savedPdf.length, "bytes");
    return savedPdf;
  } catch (error) {
    console.error("Error filling receipt template:", error);
    throw error;
  }
};

module.exports = {
  fillReceiptTemplate,
  numberToWords,
};
