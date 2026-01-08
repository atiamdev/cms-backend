const Student = require("../models/Student");
const cloudflareService = require("../services/cloudflareService");
const {
  fillAdmissionLetterTemplate,
} = require("../utils/admissionLetterUtils");

/**
 * @desc    Generate admission letter PDF for a student
 * @route   GET /api/admission-letters/:studentId
 * @access  Private (Secretary, Admin)
 */
const generateAdmissionLetter = async (req, res) => {
  try {
    const { studentId } = req.params;

    // Get student details with populated data
    const student = await Student.findOne({
      _id: studentId,
      branchId: req.user.branchId,
    })
      .populate({
        path: "userId",
        select: "firstName lastName",
      })
      .populate({
        path: "currentClassId",
        select: "name",
      });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    // Prepare admission letter data
    const fullName = `${student.userId.firstName} ${student.userId.lastName}`;
    const admissionData = {
      studentName: fullName,
      admissionNumber: student.admissionNumber,
      course: student.currentClassId?.name || "N/A",
      admissionDate: student.enrollmentDate || new Date(),
    };

    // Generate PDF using template
    const pdfBytes = await fillAdmissionLetterTemplate(admissionData);

    // Upload to R2 bucket
    let uploadResult;
    const fileName = `course-resources/adm-letters/${
      student.admissionNumber
    }_${Date.now()}.pdf`;

    if (cloudflareService.isConfigured().r2) {
      console.log("Uploading admission letter to R2:", fileName);
      uploadResult = await cloudflareService.uploadFile(pdfBytes, {
        key: fileName,
        contentType: "application/pdf",
      });
      console.log("✓ Admission letter uploaded to R2:", uploadResult.url);
    } else {
      console.warn("R2 not configured, returning PDF directly without storage");
      // If R2 is not configured, just return the PDF for download
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="AdmissionLetter-${student.admissionNumber}.pdf"`
      );
      return res.send(Buffer.from(pdfBytes));
    }

    // Return the URL and PDF
    res.status(200).json({
      success: true,
      data: {
        url: uploadResult.url,
        publicUrl: uploadResult.publicUrl,
        fileName: fileName,
      },
      message: "Admission letter generated successfully",
    });
  } catch (error) {
    console.error("Generate admission letter error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate admission letter",
      error: error.message,
    });
  }
};

/**
 * @desc    Download admission letter PDF for a student
 * @route   GET /api/admission-letters/:studentId/download
 * @access  Private (Secretary, Admin, Student - own letter only)
 */
const downloadAdmissionLetter = async (req, res) => {
  try {
    const { studentId } = req.params;

    // Get student details with populated data
    const student = await Student.findOne({
      _id: studentId,
      branchId: req.user.branchId,
    })
      .populate({
        path: "userId",
        select: "firstName lastName",
      })
      .populate({
        path: "currentClassId",
        select: "name",
      });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    // Check authorization for students - they can only download their own letter
    if (
      req.user.roles.includes("student") &&
      req.user.studentProfile?.toString() !== student._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Prepare admission letter data
    const fullName = `${student.userId.firstName} ${student.userId.lastName}`;
    const admissionData = {
      studentName: fullName,
      admissionNumber: student.admissionNumber,
      course: student.currentClassId?.name || "N/A",
      admissionDate: student.enrollmentDate || new Date(),
    };

    // Generate PDF using template
    const pdfBytes = await fillAdmissionLetterTemplate(admissionData);

    // Set response headers for download
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="AdmissionLetter-${student.admissionNumber}.pdf"`
    );
    res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error("Download admission letter error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to download admission letter",
      error: error.message,
    });
  }
};

module.exports = {
  generateAdmissionLetter,
  downloadAdmissionLetter,
};
