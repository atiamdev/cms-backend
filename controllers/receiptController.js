const Payment = require("../models/Payment");
const Fee = require("../models/Fee");
const Student = require("../models/Student");
const Branch = require("../models/Branch");
const nodemailer = require("nodemailer");
const { fillReceiptTemplate } = require("../utils/receiptUtils");

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

    // Prepare receipt data
    const student = payment.studentId;
    const fullName = `${student.userId.firstName} ${student.userId.lastName}`;

    const receiptData = {
      studentName: fullName,
      receiptNumber: payment.receiptNumber,
      paymentDate: payment.paymentDate,
      admissionNumber: student.studentId,
      course: student.currentClassId?.name || "N/A",
      amount: payment.amount,
      paymentMethod: payment.paymentMethod,
      receivedBy: "", // Leave empty for secretary-generated receipts to be filled manually
    };

    // Generate PDF using template
    const pdfBytes = await fillReceiptTemplate(receiptData);

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

    // Prepare receipt data
    const student = payment.studentId;
    const fullName = `${student.userId.firstName} ${student.userId.lastName}`;

    const receiptData = {
      studentName: fullName,
      receiptNumber: payment.receiptNumber,
      paymentDate: payment.paymentDate,
      admissionNumber: student.studentId,
      course: student.currentClassId?.name || "N/A",
      amount: payment.amount,
      paymentMethod: payment.paymentMethod,
      receivedBy: "", // Leave empty for secretary-generated receipts to be filled manually
    };

    // Generate PDF receipt using template
    const pdfBytes = await fillReceiptTemplate(receiptData);

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
