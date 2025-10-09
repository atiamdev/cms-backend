const mongoose = require("mongoose");

const CertificateSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ECourse",
      required: true,
    },
    enrollmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Enrollment",
      required: true,
    },
    certificateNumber: {
      type: String,
      unique: true,
    },
    certificateUrl: {
      type: String, // Cloudflare R2 URL
      required: true,
    },
    fileKey: {
      type: String, // Cloudflare R2 key for the file
      required: true,
    },
    issuedAt: {
      type: Date,
      default: Date.now,
    },
    completionDate: {
      type: Date,
      required: true,
    },
    // Certificate metadata
    courseTitle: {
      type: String,
      required: true,
    },
    studentName: {
      type: String,
      required: true,
    },
    instructorName: {
      type: String,
      required: true,
    },
    courseDuration: {
      type: String,
      required: true,
    },
    grade: {
      type: String,
      enum: ["Pass", "Distinction", "Merit"],
      default: "Pass",
    },
    // Verification
    verificationCode: {
      type: String,
      unique: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
CertificateSchema.index({ studentId: 1, courseId: 1 }, { unique: true });
CertificateSchema.index({ certificateNumber: 1 });
CertificateSchema.index({ verificationCode: 1 });

// Static method to find certificate by verification code
CertificateSchema.statics.findByVerificationCode = function (verificationCode) {
  return this.findOne({ verificationCode, isActive: true })
    .populate("studentId", "firstName lastName userId")
    .populate("courseId", "title instructor")
    .populate("enrollmentId", "completedAt");
};

module.exports = mongoose.model("Certificate", CertificateSchema);
