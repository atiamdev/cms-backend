const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const { User, ECourse } = require("../models/elearning");
const Student = require("../models/Student");
const Certificate = require("../models/elearning/Certificate");
const cloudflareService = require("./cloudflareService");

class CertificateService {
  constructor() {
    this.certificatesDir = path.join(__dirname, "../certificates");
    // Ensure certificates directory exists
    if (!fs.existsSync(this.certificatesDir)) {
      fs.mkdirSync(this.certificatesDir, { recursive: true });
    }
  }

  /**
   * Generate a completion certificate PDF
   * @param {Object} certificateData - Certificate data
   * @returns {Promise<Buffer>} PDF buffer
   */
  async generateCertificatePDF(certificateData) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: "A4",
          layout: "landscape",
          margin: 50,
        });

        const buffers = [];

        doc.on("data", buffers.push.bind(buffers));
        doc.on("end", () => {
          const pdfBuffer = Buffer.concat(buffers);
          resolve(pdfBuffer);
        });

        doc.on("error", reject);

        // Certificate design
        this.drawCertificateTemplate(doc, certificateData);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Draw the certificate template
   * @param {PDFDocument} doc - PDF document
   * @param {Object} data - Certificate data
   */
  drawCertificateTemplate(doc, data) {
    const {
      studentName,
      courseTitle,
      instructorName,
      completionDate,
      certificateNumber,
      verificationCode,
    } = data;

    // Background color
    doc.rect(0, 0, doc.page.width, doc.page.height).fill("#f8f9fa");

    // Border
    doc
      .rect(20, 20, doc.page.width - 40, doc.page.height - 40)
      .lineWidth(3)
      .stroke("#81D338");

    // Header
    doc
      .fillColor("#2c3e50")
      .fontSize(36)
      .font("Helvetica-Bold")
      .text("CERTIFICATE OF COMPLETION", 0, 80, {
        align: "center",
        width: doc.page.width,
      });

    // Institution name
    doc
      .fillColor("#34495e")
      .fontSize(24)
      .font("Helvetica-Bold")
      .text("ATIAM COLLEGE", 0, 130, {
        align: "center",
        width: doc.page.width,
      });

    // Certificate text
    doc
      .fillColor("#2c3e50")
      .fontSize(16)
      .font("Helvetica")
      .text("This is to certify that", 0, 200, {
        align: "center",
        width: doc.page.width,
      });

    // Student name
    doc
      .fillColor("#e74c3c")
      .fontSize(28)
      .font("Helvetica-Bold")
      .text(studentName, 0, 230, {
        align: "center",
        width: doc.page.width,
      });

    // Completion text
    doc
      .fillColor("#2c3e50")
      .fontSize(16)
      .font("Helvetica")
      .text("has successfully completed the course", 0, 280, {
        align: "center",
        width: doc.page.width,
      });

    // Course title
    doc
      .fillColor("#27ae60")
      .fontSize(22)
      .font("Helvetica-Bold")
      .text(`${courseTitle}`, 0, 310, {
        align: "center",
        width: doc.page.width,
      });

    // Instructor and date
    doc
      .fillColor("#2c3e50")
      .fontSize(14)
      .font("Helvetica")
      .text(`Instructor: ${instructorName}`, 0, 360, {
        align: "center",
        width: doc.page.width,
      });

    doc.text(`Completion Date: ${completionDate}`, 0, 385, {
      align: "center",
      width: doc.page.width,
    });

    // Certificate number
    doc
      .fillColor("#7f8c8d")
      .fontSize(12)
      .font("Helvetica")
      .text(`Certificate Number: ${certificateNumber}`, 0, 420, {
        align: "center",
        width: doc.page.width,
      });

    // Verification code
    doc.text(`Verification Code: ${verificationCode}`, 0, 435, {
      align: "center",
      width: doc.page.width,
    });

    // Footer
    doc
      .fillColor("#95a5a6")
      .fontSize(10)
      .font("Helvetica")
      .text(
        "This certificate is digitally generated and verified by ATIAM CMS",
        0,
        doc.page.height - 80,
        {
          align: "center",
          width: doc.page.width,
        }
      );

    // Signature line
    doc
      .moveTo(100, doc.page.height - 120)
      .lineTo(250, doc.page.height - 120)
      .stroke("#2c3e50");

    doc
      .fillColor("#2c3e50")
      .fontSize(12)
      .text("Director", 150, doc.page.height - 110, {
        align: "center",
        width: 100,
      });
  }

  /**
   * Generate and store certificate for course completion
   * @param {string} studentId - Student ID
   * @param {string} courseId - Course ID
   * @param {string} enrollmentId - Enrollment ID
   * @returns {Promise<Object>} Certificate data
   */
  async generateCertificate(studentId, courseId, enrollmentId) {
    try {
      // Get student, course, and enrollment data
      const student = await Student.findById(studentId).populate(
        "userId",
        "firstName lastName"
      );
      const course = await ECourse.findById(courseId).populate(
        "instructor",
        "firstName lastName"
      );
      const enrollment =
        await require("../models/elearning/Enrollment").findById(enrollmentId);

      if (!student || !course || !enrollment) {
        throw new Error("Invalid student, course, or enrollment data");
      }

      // Check if certificate already exists
      const existingCertificate = await Certificate.findOne({
        studentId,
        courseId,
        isActive: true,
      });

      if (existingCertificate) {
        return existingCertificate;
      }

      // Prepare certificate data
      const certificateData = {
        studentName: `${student.userId.firstName} ${student.userId.lastName}`,
        courseTitle: course.title,
        instructorName: `${course.instructor.firstName} ${course.instructor.lastName}`,
        completionDate: enrollment.completedAt
          ? new Date(enrollment.completedAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })
          : new Date().toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            }),
        certificateNumber: "", // Will be generated before PDF creation
        verificationCode: "", // Will be generated before PDF creation
      };

      // Generate certificate number and verification code BEFORE PDF creation
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 1000)
        .toString()
        .padStart(3, "0");
      certificateData.certificateNumber = `CERT-${timestamp}-${random}`;
      certificateData.verificationCode = require("crypto")
        .randomBytes(16)
        .toString("hex");

      // Generate PDF
      const pdfBuffer = await this.generateCertificatePDF(certificateData);

      // Upload to Cloudflare R2 or save locally for development
      let uploadResult;
      if (cloudflareService.isConfigured().r2) {
        const fileName = `certificates/${studentId}/${Date.now()}.pdf`;
        uploadResult = await cloudflareService.uploadFile(pdfBuffer, {
          key: fileName,
          contentType: "application/pdf",
        });
      } else {
        // Save locally for development
        const fileName = `certificate_${studentId}_${courseId}_${Date.now()}.pdf`;
        const filePath = path.join(this.certificatesDir, fileName);
        fs.writeFileSync(filePath, pdfBuffer);
        uploadResult = {
          url: `${
            process.env.BACKEND_URL || "http://localhost:5000"
          }/certificates/${fileName}`,
          key: filePath,
        };
        console.log(`Certificate saved locally: ${filePath}`);
      }

      // Create certificate record
      const certificate = await Certificate.create({
        studentId,
        courseId,
        enrollmentId,
        certificateUrl: uploadResult.url,
        fileKey: uploadResult.key,
        completionDate: enrollment.completedAt || new Date(),
        courseTitle: course.title,
        studentName: certificateData.studentName,
        instructorName: certificateData.instructorName,
        courseDuration: `${course.duration.estimatedHours} hours`,
        certificateNumber: certificateData.certificateNumber,
        verificationCode: certificateData.verificationCode,
      });

      return certificate;
    } catch (error) {
      console.error("Error generating certificate:", error);
      throw error;
    }
  }

  /**
   * Get certificate download URL
   * @param {string} certificateId - Certificate ID
   * @param {string} studentId - Student ID (for authorization)
   * @returns {Promise<string>} Download URL
   */
  async getCertificateDownloadUrl(certificateId, studentId) {
    try {
      const certificate = await Certificate.findOne({
        _id: certificateId,
        studentId,
        isActive: true,
      });

      if (!certificate) {
        throw new Error("Certificate not found or access denied");
      }

      // Generate signed URL for download or return local URL
      let downloadUrl;
      if (cloudflareService.isConfigured().r2) {
        downloadUrl = await cloudflareService.getSignedUrl(certificate.fileKey);
      } else {
        // For local files, return the stored URL
        downloadUrl = certificate.certificateUrl;
      }

      return downloadUrl;
    } catch (error) {
      console.error("Error getting certificate download URL:", error);
      throw error;
    }
  }

  /**
   * Verify certificate by verification code
   * @param {string} verificationCode - Verification code
   * @returns {Promise<Object>} Certificate data
   */
  async verifyCertificate(verificationCode) {
    try {
      const certificate = await Certificate.findByVerificationCode(
        verificationCode
      );

      if (!certificate) {
        throw new Error("Certificate not found or invalid verification code");
      }

      return {
        certificateNumber: certificate.certificateNumber,
        studentName: certificate.studentName,
        courseTitle: certificate.courseTitle,
        instructorName: certificate.instructorName,
        completionDate: certificate.completionDate,
        issuedAt: certificate.issuedAt,
        isValid: true,
      };
    } catch (error) {
      console.error("Error verifying certificate:", error);
      throw error;
    }
  }
}

module.exports = new CertificateService();
