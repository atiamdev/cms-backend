const crypto = require("crypto");

// Generate secure random strings for JWT secrets
const generateSecret = (length = 64) => {
  return crypto.randomBytes(length).toString("hex");
};

// Generate ID with prefix
const generateId = (prefix = "ID", length = 8) => {
  const randomPart = crypto
    .randomBytes(length / 2)
    .toString("hex")
    .toUpperCase();
  return `${prefix}${randomPart}`;
};

// Format response for consistent API responses
const formatResponse = (success, message, data = null, meta = null) => {
  const response = {
    success,
    message,
    timestamp: new Date().toISOString(),
  };

  if (data !== null) {
    response.data = data;
  }

  if (meta !== null) {
    response.meta = meta;
  }

  return response;
};

// Validate MongoDB ObjectId
const isValidObjectId = (id) => {
  const mongoose = require("mongoose");
  return mongoose.Types.ObjectId.isValid(id);
};

// Sanitize user input
const sanitizeInput = (input) => {
  if (typeof input !== "string") return input;

  return input
    .trim()
    .replace(/[<>]/g, "") // Remove potential HTML tags
    .substring(0, 1000); // Limit length
};

// Generate file name with timestamp
const generateFileName = (originalName, prefix = "") => {
  const timestamp = Date.now();
  const extension = originalName.split(".").pop();
  const baseName = originalName.split(".").slice(0, -1).join(".");
  const sanitizedBaseName = baseName.replace(/[^a-zA-Z0-9-_]/g, "");

  return `${prefix}${sanitizedBaseName}-${timestamp}.${extension}`;
};

// Calculate pagination metadata
const calculatePagination = (page, limit, total) => {
  const currentPage = parseInt(page) || 1;
  const itemsPerPage = parseInt(limit) || 10;
  const totalPages = Math.ceil(total / itemsPerPage);
  const hasNextPage = currentPage < totalPages;
  const hasPrevPage = currentPage > 1;

  return {
    currentPage,
    itemsPerPage,
    totalItems: total,
    totalPages,
    hasNextPage,
    hasPrevPage,
    nextPage: hasNextPage ? currentPage + 1 : null,
    prevPage: hasPrevPage ? currentPage - 1 : null,
  };
};

// Convert string to slug
const slugify = (text) => {
  return text
    .toString()
    .toLowerCase()
    .replace(/\s+/g, "-") // Replace spaces with -
    .replace(/[^\w\-]+/g, "") // Remove all non-word chars
    .replace(/\-\-+/g, "-") // Replace multiple - with single -
    .replace(/^-+/, "") // Trim - from start of text
    .replace(/-+$/, ""); // Trim - from end of text
};

// Format currency
const formatCurrency = (amount, currency = "NGN") => {
  const formatter = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
  });

  return formatter.format(amount);
};

// Validate email format
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Validate phone number format
const isValidPhone = (phone) => {
  const phoneRegex = /^[\+]?[0-9\-\(\)\s]+$/;
  return phoneRegex.test(phone);
};

// Generate academic year
const getCurrentAcademicYear = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // JavaScript months are 0-indexed

  // Assuming academic year starts in September
  if (month >= 9) {
    return `${year}/${year + 1}`;
  } else {
    return `${year - 1}/${year}`;
  }
};

// Mask sensitive data for logging
const maskSensitiveData = (data) => {
  const sensitiveFields = ["password", "token", "secret", "key"];
  const masked = { ...data };

  for (const field of sensitiveFields) {
    if (masked[field]) {
      masked[field] = "***HIDDEN***";
    }
  }

  return masked;
};

// Calculate grade based on percentage
const calculateGrade = (percentage) => {
  if (percentage >= 90) return "A";
  if (percentage >= 80) return "B";
  if (percentage >= 70) return "C";
  if (percentage >= 60) return "D";
  return "F";
};
// Generate admission number in format ATIAM/BRANCH_ABBR/XXXX/YYYY
const generateAdmissionNumber = async (branch) => {
  const currentYear = new Date().getFullYear();
  const prefix = `ATIAM/${branch.abbreviation}/`;
  const yearSuffix = `/${currentYear}`;

  // Find the highest number for this branch and year
  const Student = require("../models/Student");
  const regex = new RegExp(`^${prefix}(\\d{4})${yearSuffix}$`);
  const students = await Student.find({
    branchId: branch._id,
    admissionNumber: { $regex: regex },
  })
    .sort({ admissionNumber: -1 })
    .limit(1);

  let nextNumber = 1;
  if (students.length > 0) {
    const match = students[0].admissionNumber.match(regex);
    if (match) {
      nextNumber = parseInt(match[1]) + 1;
    }
  }

  if (nextNumber > 9999) {
    throw new Error(
      "Maximum admission numbers reached for this branch and year"
    );
  }

  const numberStr = nextNumber.toString().padStart(4, "0");
  return `${prefix}${numberStr}${yearSuffix}`;
};

module.exports = {
  generateSecret,
  generateId,
  formatResponse,
  isValidObjectId,
  sanitizeInput,
  generateFileName,
  calculatePagination,
  slugify,
  formatCurrency,
  isValidEmail,
  isValidPhone,
  getCurrentAcademicYear,
  maskSensitiveData,
  calculateGrade,
  generateAdmissionNumber,
};
