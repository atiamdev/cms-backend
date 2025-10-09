const certificateService = require("../../services/certificateService");
const { Enrollment } = require("../../models/elearning");
const Student = require("../../models/Student");
const Certificate = require("../../models/elearning/Certificate");
const { validationResult } = require("express-validator");

/**
 * @desc    Generate certificate for course completion
 * @route   POST /api/elearning/certificates/generate
 * @access  Private (Students only)
 */
const generateCertificate = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    const { courseId } = req.body;
    const userId = req.user._id;

    // Find student
    const student = await Student.findOne({ userId });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    // Check if student is enrolled and has completed the course
    const enrollment = await Enrollment.findOne({
      studentId: student._id,
      courseId,
      status: "completed",
    });

    if (!enrollment) {
      return res.status(403).json({
        success: false,
        message: "You must complete the course to generate a certificate",
      });
    }

    // Generate certificate
    const certificate = await certificateService.generateCertificate(
      student._id,
      courseId,
      enrollment._id
    );

    res.status(201).json({
      success: true,
      data: certificate,
      message: "Certificate generated successfully",
    });
  } catch (error) {
    console.error("Error generating certificate:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate certificate",
      error: error.message,
    });
  }
};

/**
 * @desc    Get student's certificates
 * @route   GET /api/elearning/certificates
 * @access  Private (Students only)
 */
const getStudentCertificates = async (req, res) => {
  try {
    const userId = req.user._id;

    // Find student
    const student = await Student.findOne({ userId });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    // Get certificates
    const certificates = await Certificate.find({
      studentId: student._id,
      isActive: true,
    })
      .populate("courseId", "title category level")
      .sort({ issuedAt: -1 });

    res.json({
      success: true,
      data: certificates,
    });
  } catch (error) {
    console.error("Error fetching certificates:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch certificates",
      error: error.message,
    });
  }
};

/**
 * @desc    Download certificate
 * @route   GET /api/elearning/certificates/:certificateId/download
 * @access  Private (Students only)
 */
const downloadCertificate = async (req, res) => {
  try {
    const { certificateId } = req.params;
    const userId = req.user._id;

    // Find student
    const student = await Student.findOne({ userId });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    // Get download URL
    const downloadUrl = await certificateService.getCertificateDownloadUrl(
      certificateId,
      student._id
    );

    res.json({
      success: true,
      data: {
        downloadUrl,
      },
    });
  } catch (error) {
    console.error("Error getting certificate download URL:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get certificate download URL",
      error: error.message,
    });
  }
};

/**
 * @desc    Verify certificate by verification code
 * @route   GET /api/elearning/certificates/verify/:verificationCode
 * @access  Public
 */
const verifyCertificate = async (req, res) => {
  try {
    const { verificationCode } = req.params;

    const certificateData = await certificateService.verifyCertificate(
      verificationCode
    );

    res.json({
      success: true,
      data: certificateData,
    });
  } catch (error) {
    console.error("Error verifying certificate:", error);
    res.status(404).json({
      success: false,
      message: "Certificate not found or invalid verification code",
    });
  }
};

/**
 * @desc    Get certificate details
 * @route   GET /api/elearning/certificates/:certificateId
 * @access  Private (Students only)
 */
const getCertificate = async (req, res) => {
  try {
    const { certificateId } = req.params;
    const userId = req.user._id;

    // Find student
    const student = await Student.findOne({ userId });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    // Get certificate
    const certificate = await Certificate.findOne({
      _id: certificateId,
      studentId: student._id,
      isActive: true,
    }).populate("courseId", "title category level instructor");

    if (!certificate) {
      return res.status(404).json({
        success: false,
        message: "Certificate not found",
      });
    }

    res.json({
      success: true,
      data: certificate,
    });
  } catch (error) {
    console.error("Error fetching certificate:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch certificate",
      error: error.message,
    });
  }
};

module.exports = {
  generateCertificate,
  getStudentCertificates,
  downloadCertificate,
  verifyCertificate,
  getCertificate,
};
