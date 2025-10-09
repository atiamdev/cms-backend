const Payment = require("../models/Payment");
const Fee = require("../models/Fee");
const Student = require("../models/Student");
const Branch = require("../models/Branch");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const nodemailer = require("nodemailer");

// Configure email transporter
const getEmailTransporter = () => {
  return nodemailer.createTransporter({
    service: process.env.EMAIL_SERVICE || "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });
};

// @desc    Generate payment receipt PDF
// @route   GET /api/receipts/:paymentId
// @access  Private
const generateReceipt = async (req, res) => {
  try {
    const { paymentId } = req.params;

    // Get payment details with related data
    const payment = await Payment.findOne({
      _id: paymentId,
      branchId: req.user.branchId,
      status: "completed",
    })
      .populate({
        path: "feeId",
        select:
          "academicYear academicTerm feeComponents totalAmountDue balance",
      })
      .populate({
        path: "studentId",
        select: "studentId userId currentClassId",
        populate: [
          {
            path: "userId",
            select: "firstName lastName email phone",
          },
          {
            path: "currentClassId",
            select: "name",
          },
        ],
      });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found or not completed",
      });
    }

    // Check authorization for students
    if (
      req.user.roles.includes("student") &&
      req.user.studentProfile?.toString() !== payment.studentId._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Get branch details
    const branch = await Branch.findById(req.user.branchId).select(
      "name address contactInfo logoUrl"
    );

    // Generate PDF
    const pdfBytes = await createReceiptPDF(payment, branch);

    // Update payment record to mark receipt as generated
    if (!payment.receiptGenerated) {
      payment.receiptGenerated = true;
      await payment.save();
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Receipt-${payment.receiptNumber}.pdf"`
    );
    res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error("Generate receipt error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate receipt",
      error: error.message,
    });
  }
};

// Helper function to create receipt PDF
const createReceiptPDF = async (payment, branch) => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4 size
  const { width, height } = page.getSize();

  // Load fonts
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Colors
  const primaryColor = rgb(0.2, 0.4, 0.8); // Blue
  const textColor = rgb(0.2, 0.2, 0.2); // Dark gray
  const lightGray = rgb(0.9, 0.9, 0.9);

  let yPosition = height - 50;

  // Header
  page.drawRectangle({
    x: 0,
    y: yPosition - 60,
    width: width,
    height: 60,
    color: primaryColor,
  });

  // Branch name
  page.drawText(`ATIAM COLLEGE ${branch.name}` || "ATIAM College", {
    x: 50,
    y: yPosition - 30,
    size: 24,
    font: boldFont,
    color: rgb(1, 1, 1),
  });

  // Receipt title
  page.drawText("STUDENTPAYMENT ONLINE RECEIPT", {
    x: width - 200,
    y: yPosition - 30,
    size: 18,
    font: boldFont,
    color: rgb(1, 1, 1),
  });

  yPosition -= 100;

  // Branch address and contact info
  if (branch.address) {
    page.drawText(`Address: ${branch.address}`, {
      x: 50,
      y: yPosition,
      size: 10,
      font: regularFont,
      color: textColor,
    });
    yPosition -= 15;
  }

  if (branch.contactInfo?.phone) {
    page.drawText(`Phone: ${branch.contactInfo.phone}`, {
      x: 50,
      y: yPosition,
      size: 10,
      font: regularFont,
      color: textColor,
    });
    yPosition -= 15;
  }

  if (branch.contactInfo?.email) {
    page.drawText(`Email: ${branch.contactInfo.email}`, {
      x: 50,
      y: yPosition,
      size: 10,
      font: regularFont,
      color: textColor,
    });
    yPosition -= 30;
  }

  // Receipt details box
  page.drawRectangle({
    x: 40,
    y: yPosition - 120,
    width: width - 80,
    height: 120,
    borderColor: primaryColor,
    borderWidth: 1,
  });

  // Receipt number and date
  page.drawText("Receipt Details", {
    x: 50,
    y: yPosition - 20,
    size: 14,
    font: boldFont,
    color: primaryColor,
  });

  page.drawText(`Receipt No: ${payment.receiptNumber}`, {
    x: 50,
    y: yPosition - 40,
    size: 12,
    font: regularFont,
    color: textColor,
  });

  page.drawText(`Date: ${new Date(payment.paymentDate).toLocaleDateString()}`, {
    x: 300,
    y: yPosition - 40,
    size: 12,
    font: regularFont,
    color: textColor,
  });

  page.drawText(`Payment Method: ${payment.paymentMethod.toUpperCase()}`, {
    x: 50,
    y: yPosition - 60,
    size: 12,
    font: regularFont,
    color: textColor,
  });

  if (payment.mpesaDetails?.transactionId) {
    page.drawText(`M-Pesa Ref: ${payment.mpesaDetails.transactionId}`, {
      x: 300,
      y: yPosition - 60,
      size: 12,
      font: regularFont,
      color: textColor,
    });
  }

  page.drawText(`Status: ${payment.status.toUpperCase()}`, {
    x: 50,
    y: yPosition - 80,
    size: 12,
    font: regularFont,
    color: textColor,
  });

  page.drawText(`Verification: ${payment.verificationStatus.toUpperCase()}`, {
    x: 300,
    y: yPosition - 80,
    size: 12,
    font: regularFont,
    color: textColor,
  });

  yPosition -= 160;

  // Student details box
  page.drawRectangle({
    x: 40,
    y: yPosition - 100,
    width: width - 80,
    height: 100,
    borderColor: primaryColor,
    borderWidth: 1,
  });

  page.drawText("Student Details", {
    x: 50,
    y: yPosition - 20,
    size: 14,
    font: boldFont,
    color: primaryColor,
  });

  const student = payment.studentId;
  const fullName = `${student.userId.firstName} ${student.userId.lastName}`;

  page.drawText(`Name: ${fullName}`, {
    x: 50,
    y: yPosition - 40,
    size: 12,
    font: regularFont,
    color: textColor,
  });

  page.drawText(`Student ID: ${student.studentId}`, {
    x: 300,
    y: yPosition - 40,
    size: 12,
    font: regularFont,
    color: textColor,
  });

  page.drawText(`Class: ${student.currentClassId?.name || "N/A"}`, {
    x: 50,
    y: yPosition - 60,
    size: 12,
    font: regularFont,
    color: textColor,
  });

  page.drawText(`Academic Year: ${payment.feeId.academicYear}`, {
    x: 300,
    y: yPosition - 60,
    size: 12,
    font: regularFont,
    color: textColor,
  });

  page.drawText(`Academic Term: ${payment.feeId.academicTerm}`, {
    x: 50,
    y: yPosition - 80,
    size: 12,
    font: regularFont,
    color: textColor,
  });

  yPosition -= 140;

  // Payment details
  page.drawText("Payment Information", {
    x: 50,
    y: yPosition,
    size: 14,
    font: boldFont,
    color: primaryColor,
  });

  yPosition -= 30;

  // Payment amount box
  page.drawRectangle({
    x: 40,
    y: yPosition - 60,
    width: width - 80,
    height: 60,
    color: lightGray,
  });

  page.drawText("Amount Paid:", {
    x: 50,
    y: yPosition - 25,
    size: 12,
    font: regularFont,
    color: textColor,
  });

  const formattedAmount = new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
  }).format(payment.amount);

  page.drawText(formattedAmount, {
    x: width - 150,
    y: yPosition - 25,
    size: 16,
    font: boldFont,
    color: primaryColor,
  });

  page.drawText(
    `Remaining Balance: ${new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
    }).format(payment.feeId.balance)}`,
    {
      x: 50,
      y: yPosition - 45,
      size: 10,
      font: regularFont,
      color: textColor,
    }
  );

  yPosition -= 100;

  // Footer
  page.drawText("Thank you for your payment!", {
    x: 50,
    y: yPosition,
    size: 12,
    font: boldFont,
    color: primaryColor,
  });

  page.drawText(
    "This is a computer-generated receipt and does not require a signature.",
    {
      x: 50,
      y: yPosition - 20,
      size: 8,
      font: regularFont,
      color: textColor,
    }
  );

  page.drawText(`Generated on: ${new Date().toLocaleString()}`, {
    x: 50,
    y: yPosition - 40,
    size: 8,
    font: regularFont,
    color: textColor,
  });

  return await pdfDoc.save();
};

// @desc    Email receipt to student
// @route   POST /api/receipts/:paymentId/email
// @access  Private
const emailReceipt = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { additionalEmails } = req.body;

    // Get payment details
    const payment = await Payment.findOne({
      _id: paymentId,
      branchId: req.user.branchId,
      status: "completed",
    })
      .populate({
        path: "feeId",
        select: "academicYear academicTerm",
      })
      .populate({
        path: "studentId",
        select: "studentId userId",
        populate: {
          path: "userId",
          select: "firstName lastName email",
        },
      });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found or not completed",
      });
    }

    // Check authorization for students
    if (
      req.user.roles.includes("student") &&
      req.user.studentProfile?.toString() !== payment.studentId._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Get branch details
    const branch = await Branch.findById(req.user.branchId).select(
      "name contactInfo"
    );

    // Generate PDF receipt
    const pdfBytes = await createReceiptPDF(payment, branch);

    // Prepare email
    const transporter = getEmailTransporter();
    const studentEmail = payment.studentId.userId.email;
    const studentName = `${payment.studentId.userId.firstName} ${payment.studentId.userId.lastName}`;

    // Email recipients
    const recipients = [studentEmail];
    if (additionalEmails && Array.isArray(additionalEmails)) {
      recipients.push(...additionalEmails);
    }

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: recipients.join(", "),
      subject: `Payment Receipt - ${payment.receiptNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2d5aa0;">Payment Receipt</h2>
          
          <p>Dear ${studentName},</p>
          
          <p>Thank you for your payment. Please find your payment receipt attached to this email.</p>
          
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3 style="color: #2d5aa0; margin-top: 0;">Payment Details</h3>
            <p><strong>Receipt Number:</strong> ${payment.receiptNumber}</p>
            <p><strong>Amount Paid:</strong> ${new Intl.NumberFormat("en-KE", {
              style: "currency",
              currency: "KES",
            }).format(payment.amount)}</p>
            <p><strong>Payment Date:</strong> ${new Date(
              payment.paymentDate
            ).toLocaleDateString()}</p>
            <p><strong>Payment Method:</strong> ${payment.paymentMethod.toUpperCase()}</p>
            <p><strong>Academic Year:</strong> ${payment.feeId.academicYear}</p>
            <p><strong>Academic Term:</strong> ${payment.feeId.academicTerm}</p>
          </div>
          
          <p>If you have any questions about this payment, please contact our accounts department.</p>
          
          <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
          
          <p style="color: #666; font-size: 12px;">
            This is an automated email from ${
              branch.name || "ATIAM College"
            }.<br>
            ${
              branch.contactInfo?.email
                ? `Email: ${branch.contactInfo.email}`
                : ""
            }<br>
            ${
              branch.contactInfo?.phone
                ? `Phone: ${branch.contactInfo.phone}`
                : ""
            }
          </p>
        </div>
      `,
      attachments: [
        {
          filename: `Receipt-${payment.receiptNumber}.pdf`,
          content: Buffer.from(pdfBytes),
          contentType: "application/pdf",
        },
      ],
    };

    await transporter.sendMail(mailOptions);

    // Update payment record
    payment.receiptEmailSent = true;
    payment.receiptEmailSentAt = new Date();
    await payment.save();

    res.json({
      success: true,
      message: "Receipt emailed successfully",
      data: {
        recipients,
        receiptNumber: payment.receiptNumber,
      },
    });
  } catch (error) {
    console.error("Email receipt error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to email receipt",
      error: error.message,
    });
  }
};

// @desc    Get receipt download URL
// @route   GET /api/receipts/:paymentId/download
// @access  Private
const getReceiptDownloadUrl = async (req, res) => {
  try {
    const { paymentId } = req.params;

    const payment = await Payment.findOne({
      _id: paymentId,
      branchId: req.user.branchId,
      status: "completed",
    }).select("receiptNumber receiptGenerated");

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found or not completed",
      });
    }

    // Check authorization for students
    if (
      req.user.roles.includes("student") &&
      req.user.studentProfile?.toString() !== payment.studentId._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const downloadUrl = `/api/receipts/${paymentId}`;

    res.json({
      success: true,
      data: {
        downloadUrl,
        receiptNumber: payment.receiptNumber,
        receiptGenerated: payment.receiptGenerated,
      },
    });
  } catch (error) {
    console.error("Get receipt download URL error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

module.exports = {
  generateReceipt,
  emailReceipt,
  getReceiptDownloadUrl,
};
