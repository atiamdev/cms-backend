const express = require("express");
const { body, param, validationResult } = require("express-validator");
const { protect, authorize } = require("../middlewares/auth");
const { branchAuth } = require("../middlewares/branchAuth");
const {
  autoAssociateBranch,
  filterByBranch,
  logBranchAdminAction,
} = require("../middlewares/branchAutoAssociation");
const {
  CourseContent,
  ECourse,
  Enrollment,
  Quiz,
  QuizAttempt,
  LearningModule,
} = require("../models/elearning");
const eCourseController = require("../controllers/elearning/eCourseController");
const courseContentController = require("../controllers/elearning/courseContentController");
const progressController = require("../controllers/elearning/progressController");
const Payment = require("../models/Payment");
const axios = require("axios");
const crypto = require("crypto");
const analyticsController = require("../controllers/elearning/analyticsController");
const liveSessionController = require("../controllers/elearning/liveSessionController");
const discussionController = require("../controllers/elearning/discussionController");
const cloudflareService = require("../services/cloudflareService");
const Student = require("../models/Student");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const router = express.Router();

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit for videos
  },
  fileFilter: (req, file, cb) => {
    // Allow videos, images, documents, and audio
    const allowedTypes = [
      // Videos
      "video/mp4",
      "video/webm",
      "video/quicktime",
      "video/x-msvideo", // .avi
      // Images
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/svg+xml",
      // Documents
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "text/plain",
      // Audio
      "audio/mpeg", // .mp3
      "audio/wav",
      "audio/ogg",
      "audio/aac",
      "audio/mp4", // .m4a
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`), false);
    }
  },
});

// Jenga (Equity Bank) configuration - Updated to use FinServe API
const getJengaConfig = () => ({
  merchantCode: process.env.JENGA_MERCHANT_CODE,
  consumerSecret: process.env.JENGA_CONSUMER_SECRET,
  apiKey: process.env.JENGA_API_KEY,
  callbackUrl: process.env.JENGA_CALLBACK_URL,
  accountNumber:
    process.env.JENGA_ACCOUNT_NUMBER || process.env.JENGA_MERCHANT_CODE,
  merchantName: process.env.JENGA_MERCHANT_NAME || "CMS School Management",
  privateKeyPath: process.env.JENGA_PRIVATE_KEY_PATH || "./keys/privatekey.pem",
  baseUrl:
    process.env.JENGA_ENVIRONMENT === "production"
      ? "https://api.finserve.africa"
      : "https://uat.finserve.africa",
});

// Get Jenga access token - Updated to use new authentication endpoint
const getJengaAccessToken = async () => {
  try {
    const config = getJengaConfig();

    const response = await axios.post(
      `${config.baseUrl}/authentication/api/v3/authenticate/merchant`,
      {
        merchantCode: config.merchantCode,
        consumerSecret: config.consumerSecret,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Api-Key": config.apiKey,
        },
        timeout: 30000, // 30 second timeout
      }
    );

    return response.data.accessToken;
  } catch (error) {
    console.error("=== JENGA ACCESS TOKEN ERROR ===");
    console.error("Error type:", error.code);
    console.error("Error message:", error.message);
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response data:", error.response.data);
    }
    console.error("Full error:", error);
    throw new Error(`Failed to get Jenga access token: ${error.message}`);
  }
};

// Validate and format phone number for Kenyan M-Pesa
const validateAndFormatPhone = (phoneNumber) => {
  if (!phoneNumber) {
    throw new Error("Phone number is required");
  }
  const formattedPhone = phoneNumber.replace(/^\+?254|^0/, "254");
  if (!/^254[17]\d{8}$/.test(formattedPhone)) {
    throw new Error("Invalid phone number format");
  }
  return formattedPhone;
};

// Generate RSA signature for Jenga API requests
const generateJengaSignature = (dataToSign) => {
  try {
    const config = getJengaConfig();
    const privateKeyPath = path.resolve(
      process.env.JENGA_PRIVATE_KEY_PATH || "./keys/privatekey.pem"
    );

    if (!fs.existsSync(privateKeyPath)) {
      throw new Error(`RSA private key not found at: ${privateKeyPath}`);
    }

    const privateKey = fs.readFileSync(privateKeyPath, "utf8");
    const sign = crypto.createSign("SHA256"); // Use SHA256 as per Jenga docs
    sign.update(dataToSign);
    const signature = sign.sign(privateKey, "base64"); // Use base64 as per Jenga docs

    return signature;
  } catch (error) {
    console.error("Error generating RSA signature:", error);
    throw new Error(`Failed to generate signature: ${error.message}`);
  }
};

// ===========================
// E-COURSE MANAGEMENT ROUTES
// ===========================

/**
 * @swagger
 * /api/elearning/courses:
 *   get:
 *     summary: Get teacher's e-courses
 *     tags: [E-Learning - Courses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Items per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, published, archived]
 *         description: Filter by course status
 */
router.get(
  "/courses",
  protect,
  authorize("teacher", "admin", "superadmin"),
  eCourseController.getTeacherCourses
);

/**
 * @swagger
 * /api/elearning/courses:
 *   post:
 *     summary: Create a new e-course
 *     tags: [E-Learning - Courses]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  "/courses",
  protect,
  authorize("teacher", "admin", "superadmin"),
  [
    body("title").notEmpty().withMessage("Course title is required"),
    body("description")
      .notEmpty()
      .withMessage("Course description is required"),
  ],
  eCourseController.createCourse
);

/**
 * @swagger
 * /api/elearning/courses/{courseId}:
 *   get:
 *     summary: Get course details
 *     tags: [E-Learning - Courses]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  "/courses/:courseId",
  protect,
  authorize("teacher", "admin", "branchadmin", "superadmin", "student"),
  eCourseController.getCourse
);

/**
 * @swagger
 * /api/elearning/courses/{courseId}:
 *   put:
 *     summary: Update course
 *     tags: [E-Learning - Courses]
 *     security:
 *       - bearerAuth: []
 */
router.put(
  "/courses/:courseId",
  protect,
  authorize("teacher", "admin", "branchadmin", "superadmin"),
  eCourseController.updateCourse
);

/**
 * @swagger
 * /api/elearning/courses/{courseId}/thumbnail:
 *   post:
 *     summary: Upload course thumbnail
 *     tags: [E-Learning - Courses]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  "/courses/:courseId/thumbnail",
  protect,
  authorize("teacher", "admin", "branchadmin", "superadmin"),
  upload.single("thumbnail"),
  async (req, res) => {
    try {
      const { courseId } = req.params;

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No thumbnail file provided",
        });
      }

      const course = await ECourse.findById(courseId);

      if (!course) {
        return res.status(404).json({
          success: false,
          message: "Course not found",
        });
      }

      // Check if user can modify this course
      if (!course.canModify(req.user)) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      // Upload file to Cloudflare R2
      const uploadResult = await cloudflareService.uploadFile(req.file.buffer, {
        filename: `course-thumbnail-${courseId}-${Date.now()}.jpg`,
        contentType: req.file.mimetype,
        key: `thumbnails/thumbnail-${Date.now()}.jpg`,
      });

      // Update course thumbnail
      course.thumbnail = uploadResult.publicUrl;
      await course.save();

      res.json({
        success: true,
        message: "Thumbnail uploaded successfully",
        data: {
          thumbnail: uploadResult.publicUrl,
        },
      });
    } catch (error) {
      console.error("Error uploading thumbnail:", error);
      res.status(500).json({
        success: false,
        message: "Failed to upload thumbnail",
        error: error.message,
      });
    }
  }
);

/**
 * @swagger
 * /api/elearning/courses/{courseId}:
 *   delete:
 *     summary: Delete course
 *     tags: [E-Learning - Courses]
 *     security:
 *       - bearerAuth: []
 */
router.delete(
  "/courses/:courseId",
  protect,
  authorize("admin", "superadmin"),
  eCourseController.deleteCourse
);

/**
 * @swagger
 * /api/elearning/courses/{courseId}/reassign:
 *   put:
 *     summary: Reassign course to another teacher
 *     tags: [E-Learning - Courses]
 *     security:
 *       - bearerAuth: []
 */
router.put(
  "/courses/:courseId/reassign",
  protect,
  authorize("admin", "superadmin"),
  eCourseController.reassignCourse
);

/**
 * @swagger
 * /api/elearning/courses/{courseId}/publish:
 *   post:
 *     summary: Publish course
 *     tags: [E-Learning - Courses]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  "/courses/:courseId/publish",
  protect,
  authorize("teacher", "admin", "branchadmin", "superadmin"),
  eCourseController.publishCourse
);

/**
 * @swagger
 * /api/elearning/courses/{courseId}/unpublish:
 *   post:
 *     summary: Unpublish course
 *     tags: [E-Learning - Courses]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  "/courses/:courseId/unpublish",
  protect,
  authorize("teacher", "admin", "branchadmin", "superadmin"),
  eCourseController.unpublishCourse
);

/**
 * @swagger
 * /api/elearning/public-courses:
 *   get:
 *     summary: Get public courses for enrollment
 *     tags: [E-Learning - Courses]
 *     security:
 *       - bearerAuth: []
 */
router.get("/public-courses", protect, eCourseController.getPublicCourses);

/**
 * @swagger
 * /api/elearning/public-courses/{courseId}:
 *   get:
 *     summary: Get public course details for enrollment
 *     tags: [E-Learning - Courses]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  "/public-courses/:courseId",
  protect,
  authorize("student", "teacher", "admin", "branchadmin", "superadmin"),
  eCourseController.getPublicCourseDetails
);

/**
 * @swagger
 * /api/elearning/admin/courses:
 *   get:
 *     summary: Get all courses for admin management
 *     tags: [E-Learning - Admin]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  "/admin/courses",
  protect,
  authorize("admin", "branchadmin", "superadmin"),
  eCourseController.getAllCourses
);

/**
 * @swagger
 * /api/elearning/admin/courses/pending-approval:
 *   get:
 *     summary: Get courses pending admin approval
 *     tags: [E-Learning - Admin]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  "/admin/courses/pending-approval",
  protect,
  authorize("admin", "branchadmin", "superadmin"),
  eCourseController.getPendingApprovalCourses
);

/**
 * @swagger
 * /api/elearning/admin/courses/{courseId}/approve:
 *   post:
 *     summary: Approve a course
 *     tags: [E-Learning - Admin]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  "/admin/courses/:courseId/approve",
  protect,
  authorize("admin", "branchadmin", "superadmin"),
  eCourseController.approveCourse
);

/**
 * @swagger
 * /api/elearning/admin/courses/{courseId}/reject:
 *   post:
 *     summary: Reject a course
 *     tags: [E-Learning - Admin]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  "/admin/courses/:courseId/reject",
  protect,
  authorize("admin", "branchadmin", "superadmin"),
  eCourseController.rejectCourse
);

/**
 * @swagger
 * /api/elearning/courses/{courseId}/approval-history:
 *   get:
 *     summary: Get course approval history
 *     tags: [E-Learning - Courses]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  "/courses/:courseId/approval-history",
  protect,
  authorize("teacher", "admin", "superadmin"),
  eCourseController.getCourseApprovalHistory
);

// ===========================
// LEARNING MODULE ROUTES
// ===========================

const learningModuleController = require("../controllers/elearning/learningModuleController");

/**
 * @swagger
 * /api/elearning/courses/{courseId}/modules:
 *   post:
 *     summary: Create new learning module
 *     tags: [E-Learning - Modules]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  "/courses/:courseId/modules",
  protect,
  authorize("teacher", "admin", "superadmin"),
  [
    body("title").notEmpty().withMessage("Title is required"),
    body("estimatedDuration")
      .isInt({ min: 1 })
      .withMessage("Duration must be a positive integer"),
  ],
  learningModuleController.createModule
);

/**
 * @swagger
 * /api/elearning/modules/{moduleId}:
 *   get:
 *     summary: Get module details
 *     tags: [E-Learning - Modules]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  "/modules/:moduleId",
  protect,
  authorize("teacher", "admin", "superadmin", "student"),
  learningModuleController.getModule
);

/**
 * @swagger
 * /api/elearning/modules/course/{courseId}:
 *   get:
 *     summary: Get modules by course
 *     tags: [E-Learning - Modules]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  "/modules/course/:courseId",
  protect,
  authorize("teacher", "admin", "superadmin", "student"),
  learningModuleController.getModulesByCourse
);

/**
 * @swagger
 * /api/elearning/courses/{courseId}/modules/{moduleId}:
 *   put:
 *     summary: Update learning module
 *     tags: [E-Learning - Modules]
 *     security:
 *       - bearerAuth: []
 */
router.put(
  "/courses/:courseId/modules/:moduleId",
  protect,
  authorize("teacher", "admin", "superadmin"),
  learningModuleController.updateModule
);

/**
 * @swagger
 * /api/elearning/courses/{courseId}/modules/{moduleId}:
 *   delete:
 *     summary: Delete learning module
 *     tags: [E-Learning - Modules]
 *     security:
 *       - bearerAuth: []
 */
router.delete(
  "/courses/:courseId/modules/:moduleId",
  protect,
  authorize("teacher", "admin", "superadmin"),
  learningModuleController.deleteModule
);

// ===========================
// MEDIA UPLOAD ROUTES
// ===========================

/**
 * @swagger
 * /api/elearning/upload/video:
 *   post:
 *     summary: Upload video to Cloudflare Stream
 *     tags: [E-Learning - Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               video:
 *                 type: string
 *                 format: binary
 *               title:
 *                 type: string
 */
router.post(
  "/upload/video",
  protect,
  authorize("teacher", "admin", "superadmin"),
  upload.single("video"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No video file provided",
        });
      }

      const { title } = req.body;

      // Upload to Cloudflare Stream
      const uploadResult = await cloudflareService.uploadToStream(
        req.file.buffer,
        {
          filename: req.file.originalname,
          title: title || req.file.originalname,
        }
      );

      res.json({
        success: true,
        message: "Video uploaded successfully",
        data: {
          streamId: uploadResult.streamId,
          playbackUrl: uploadResult.playbackUrl,
          thumbnailUrl: uploadResult.thumbnailUrl,
          embedUrl: uploadResult.embedUrl,
          status: uploadResult.status,
          originalName: req.file.originalname,
          size: req.file.size,
        },
      });
    } catch (error) {
      console.error("Video upload error:", error);
      res.status(500).json({
        success: false,
        message: "Video upload failed",
        error: error.message,
      });
    }
  }
);

/**
 * @swagger
 * /api/elearning/upload/file:
 *   post:
 *     summary: Upload file to Cloudflare R2
 *     tags: [E-Learning - Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               folder:
 *                 type: string
 */
router.post(
  "/upload/file",
  protect,
  authorize("teacher", "admin", "superadmin"),
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No file provided",
        });
      }

      const { folder } = req.body;

      // Generate filename
      const filename = `${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 8)}.${req.file.originalname.split(".").pop()}`;

      // Determine folder based on file type
      let uploadFolder = folder || "documents";
      if (req.file.mimetype.startsWith("image/")) {
        uploadFolder = folder || "images";
      } else if (req.file.mimetype.startsWith("video/")) {
        uploadFolder = folder || "videos";
      }

      const key = `${uploadFolder}/${filename}`;

      // Upload to Cloudflare R2
      const uploadResult = await cloudflareService.uploadFile(req.file.buffer, {
        key: key,
        filename: filename,
        contentType: req.file.mimetype,
        metadata: {
          originalName: req.file.originalname,
          uploadedBy: req.user._id,
          uploadDate: new Date().toISOString(),
        },
      });

      res.json({
        success: true,
        message: "File uploaded successfully",
        data: {
          url: uploadResult.url, // https://e-resource.atiamcollege.com/...
          r2Url: uploadResult.r2Url, // Direct R2 URL for management
          key: uploadResult.key,
          filename: filename,
          size: req.file.size,
          type: req.file.mimetype,
          originalName: req.file.originalname,
        },
      });
    } catch (error) {
      console.error("File upload error:", error);
      res.status(500).json({
        success: false,
        message: "File upload failed",
        error: error.message,
      });
    }
  }
);

// ===========================
// COURSE CONTENT MANAGEMENT
// ===========================

/**
 * @swagger
 * components:
 *   schemas:
 *     Enrollment:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           description: Unique identifier for the enrollment
 *         student:
 *           type: string
 *           description: Student ID
 *         course:
 *           type: string
 *           description: Course ID
 *         enrolledAt:
 *           type: string
 *           format: date-time
 *           description: Enrollment date
 *         progress:
 *           type: number
 *           minimum: 0
 *           maximum: 100
 *           description: Course completion percentage
 *         completedModules:
 *           type: array
 *           items:
 *             type: string
 *           description: List of completed module IDs
 *         lastAccessedAt:
 *           type: string
 *           format: date-time
 *           description: Last time student accessed the course
 */

/**
 * @swagger
 * /api/elearning/my-courses:
 *   get:
 *     summary: Get enrolled courses for the current student
 *     tags: [E-Learning]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved enrolled courses
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       course:
 *                         $ref: '#/components/schemas/Course'
 *                       enrollment:
 *                         $ref: '#/components/schemas/Enrollment'
 */
router.get("/my-courses", protect, authorize("student"), async (req, res) => {
  try {
    // Find student by user ID
    const student = await Student.findOne({ userId: req.user.id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    const studentId = student._id;

    // Fetch real enrollments from database
    const enrollments = await Enrollment.getStudentEnrollments(studentId, {
      status: ["active", "approved", "completed"], // Only active enrollments
    });

    // Transform data to match frontend expectations
    const transformedEnrollments = enrollments
      .filter((enrollment) => enrollment.courseId) // Filter out enrollments with null courseId
      .map((enrollment) => ({
        _id: enrollment._id,
        studentId: enrollment.studentId.toString(),
        courseId: enrollment.courseId._id.toString(),
        progress: enrollment.progress || 0,
        status: enrollment.status,
        enrolledAt: enrollment.createdAt,
        lastAccessedAt: enrollment.lastAccessedAt,
        completedAt: enrollment.completedAt,
        course: {
          _id: enrollment.courseId._id.toString(),
          title: enrollment.courseId.title,
          description: enrollment.courseId.description,
          shortDescription: enrollment.courseId.shortDescription || "",
          instructor: enrollment.courseId.instructor
            ? {
                _id: enrollment.courseId.instructor._id.toString(),
                firstName: enrollment.courseId.instructor.firstName,
                lastName: enrollment.courseId.instructor.lastName,
                email: enrollment.courseId.instructor.email || "",
              }
            : {
                _id: "",
                firstName: "Unknown",
                lastName: "Instructor",
                email: "",
              },
          category: enrollment.courseId.category || "",
          level: enrollment.courseId.level || "Beginner",
          duration: {
            estimatedHours: enrollment.courseId.duration?.estimatedHours || 0,
            estimatedMinutes:
              enrollment.courseId.duration?.estimatedMinutes || 0,
          },
          pricing: {
            type: enrollment.courseId.pricing?.type || "free",
            amount: enrollment.courseId.pricing?.amount || 0,
            currency: enrollment.courseId.pricing?.currency || "KES",
          },
          thumbnail: enrollment.courseId.thumbnail || "",
          language: enrollment.courseId.language || "English",
          rating: enrollment.courseId.stats?.averageRating || 0,
          reviewCount: enrollment.courseId.stats?.totalRatings || 0,
        },
      }));

    res.json({
      success: true,
      data: transformedEnrollments,
    });
  } catch (error) {
    console.error("Error fetching enrolled courses:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching enrolled courses",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/elearning/courses/{courseId}/enrollment-status:
 *   get:
 *     summary: Check enrollment status for a course
 *     tags: [E-Learning - Enrollment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: courseId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Course ID
 */
router.get(
  "/courses/:courseId/enrollment-status",
  protect,
  authorize("student"),
  async (req, res) => {
    try {
      const { courseId } = req.params;

      // Find student by user ID
      const student = await Student.findOne({ userId: req.user.id });
      if (!student) {
        return res.status(404).json({
          success: false,
          message: "Student profile not found",
        });
      }

      const studentId = student._id;

      // Check if student is enrolled in this course
      const enrollment = await Enrollment.findOne({
        studentId,
        courseId,
        status: { $in: ["active", "approved", "completed"] },
      }).populate({
        path: "courseId",
        select: "title description thumbnail",
      });

      if (enrollment) {
        res.status(200).json({
          success: true,
          message: "Enrollment status retrieved successfully",
          data: {
            _id: enrollment._id,
            progress: enrollment.progress || 0,
            status: enrollment.status,
            enrolledAt: enrollment.createdAt,
            lastAccessedAt: enrollment.lastAccessedAt,
            course: {
              _id: enrollment.courseId._id,
              title: enrollment.courseId.title,
              description: enrollment.courseId.description,
              thumbnail: enrollment.courseId.thumbnail,
            },
          },
        });
      } else {
        res.status(200).json({
          success: true,
          message: "Not enrolled in this course",
          data: null,
        });
      }
    } catch (error) {
      console.error("Error checking enrollment status:", error);
      res.status(500).json({
        success: false,
        message: "Failed to check enrollment status",
        error: error.message,
      });
    }
  }
);

/**
 * @swagger
 * /api/elearning/courses/{courseId}/progress:
 *   get:
 *     summary: Get learning progress for a course
 *     tags: [E-Learning - Progress]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: courseId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Course ID
 *     responses:
 *       200:
 *         description: Successfully retrieved course progress
 */
router.get(
  "/courses/:courseId/progress",
  protect,
  authorize("student"),
  progressController.getCourseProgress
);

/**
 * @swagger
 * /api/elearning/courses/{courseId}/modules/{moduleId}/unlock-next:
 *   post:
 *     summary: Manually unlock the next module after completing current module
 *     tags: [E-Learning Progress]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *         description: Course ID
 *       - in: path
 *         name: moduleId
 *         required: true
 *         schema:
 *           type: string
 *         description: Current module ID
 *     responses:
 *       200:
 *         description: Next module unlocked successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Next module unlocked successfully
 *                 nextModule:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     title:
 *                       type: string
 */
router.post(
  "/courses/:courseId/modules/:moduleId/unlock-next",
  protect,
  authorize("student"),
  [param("courseId").isMongoId(), param("moduleId").isMongoId()],
  progressController.unlockNextModule
);

/**
 * @swagger
 * /api/elearning/courses/{courseId}/modules/{moduleId}/content/{contentId}/progress:
 *   put:
 *     summary: Update content progress for a student
 *     tags: [E-Learning - Progress]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: courseId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Course ID
 *       - name: moduleId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Module ID
 *       - name: contentId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Content ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [not_started, in_progress, completed]
 *               progress:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 100
 *               timeSpent:
 *                 type: number
 *                 description: Time spent in minutes
 *               videoProgress:
 *                 type: object
 *                 properties:
 *                   duration:
 *                     type: number
 *                   watchedDuration:
 *                     type: number
 *                   watchPercentage:
 *                     type: number
 *     responses:
 *       200:
 *         description: Content progress updated successfully
 */
router.put(
  "/courses/:courseId/modules/:moduleId/content/:contentId/progress",
  protect,
  authorize("student"),
  progressController.updateContentProgress
);

/**
 * @swagger
 * /api/elearning/courses/{courseId}/enroll:
 *   post:
 *     summary: Enroll in a course
 *     tags: [E-Learning - Enrollment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *         description: Course ID to enroll in
 *     responses:
 *       200:
 *         description: Successfully enrolled in course
 *       400:
 *         description: Already enrolled or enrollment not allowed
 *       404:
 *         description: Course not found
 */
router.post(
  "/courses/:courseId/enroll",
  protect,
  authorize("student"),
  async (req, res) => {
    try {
      const { courseId } = req.params;
      const {
        phoneNumber,
        customerFirstName,
        customerLastName,
        customerEmail,
      } = req.body; // For Equity payment

      // Find the student record for the current user
      const Student = require("../models/Student");
      const student = await Student.findOne({ userId: req.user._id });
      if (!student) {
        return res.status(404).json({
          success: false,
          message: "Student profile not found",
        });
      }

      const studentId = student._id;
      const branchId = req.user.branchId;

      // Check if course exists and is available for enrollment
      const course = await ECourse.findById(courseId);
      if (!course) {
        return res.status(404).json({
          success: false,
          message: "Course not found",
        });
      }

      if (course.status !== "published") {
        return res.status(400).json({
          success: false,
          message: "Course is not available for enrollment",
        });
      }

      // Check if already enrolled
      const existingEnrollment = await Enrollment.isEnrolled(
        studentId,
        courseId
      );
      if (existingEnrollment) {
        return res.status(400).json({
          success: false,
          message: "Already enrolled in this course",
          data: { enrollment: existingEnrollment },
        });
      }

      // Check enrollment requirements
      if (course.registration.type === "invite-only") {
        return res.status(400).json({
          success: false,
          message: "This course requires an invitation to enroll",
        });
      }

      // Check if course is full
      if (course.registration.maxStudents) {
        const enrollmentCount = await Enrollment.countDocuments({
          courseId,
          status: { $in: ["active", "approved", "completed"] },
        });

        if (enrollmentCount >= course.registration.maxStudents) {
          return res.status(400).json({
            success: false,
            message: "Course is full",
          });
        }
      }

      // Check enrollment deadline
      if (
        course.registration.enrollmentDeadline &&
        new Date() > course.registration.enrollmentDeadline
      ) {
        return res.status(400).json({
          success: false,
          message: "Enrollment deadline has passed",
        });
      }

      // Check chain prerequisites if course is part of a chain
      if (
        course.chain &&
        course.chain.chainId &&
        course.chain.sequenceNumber > 1
      ) {
        // Find the previous course in the chain
        const previousCourse = await ECourse.findOne({
          "chain.chainId": course.chain.chainId,
          "chain.sequenceNumber": course.chain.sequenceNumber - 1,
        });

        if (previousCourse) {
          // Check if student has completed the previous course
          const previousEnrollment = await Enrollment.findOne({
            studentId,
            courseId: previousCourse._id,
            status: "completed",
          });

          if (!previousEnrollment) {
            return res.status(400).json({
              success: false,
              message: `You must complete "${previousCourse.title}" before enrolling in this course`,
              data: {
                previousCourseId: previousCourse._id,
                previousCourseTitle: previousCourse.title,
              },
            });
          }
        }
      }

      // Check if course is paid
      if (course.pricing.type === "paid") {
        // Validate payment amount
        if (course.pricing.amount <= 0) {
          return res.status(400).json({
            success: false,
            message: "Invalid course price",
          });
        }

        // Validate required fields for Equity payment
        if (
          !phoneNumber ||
          !customerFirstName ||
          !customerLastName ||
          !customerEmail
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Phone number, customer name, and email are required for paid course enrollment",
          });
        }

        const formattedPhone = phoneNumber.replace(/^\+?254|^0/, "254");
        if (!/^254[17]\d{8}$/.test(formattedPhone)) {
          return res.status(400).json({
            success: false,
            message: "Invalid phone number format",
          });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(customerEmail)) {
          return res.status(400).json({
            success: false,
            message: "Invalid email format",
          });
        }

        try {
          const config = getJengaConfig();
          const accessToken = await getJengaAccessToken();

          // Generate unique order reference (alphanumeric only, no special characters)
          const orderReference = `EC${
            student.studentId || studentId.toString()
          }${Date.now()}`;

          // Create payment record for course enrollment
          const receiptNumber = `RCP${Date.now()}${Math.random()
            .toString(36)
            .substr(2, 4)
            .toUpperCase()}`;

          const payment = new Payment({
            branchId,
            courseId,
            studentId,
            amount: course.pricing.amount,
            paymentMethod: "equity",
            status: "pending",
            description: `Course enrollment: ${course.title}`,
            receiptNumber,
            equityDetails: {
              orderReference,
            },
            recordedBy: req.user._id,
          });

          await payment.save();

          // Prepare Jenga M-Pesa STK Push request
          const stkPushData = {
            order: {
              orderReference: orderReference,
              orderAmount: course.pricing.amount,
              orderCurrency: "KES",
              source: "APICHECKOUT",
              countryCode: "KE",
              description: `Course enrollment for ${course.title.replace(
                /[^a-zA-Z0-9 ]/g,
                ""
              )}`, // Remove special characters
            },
            customer: {
              name: `${customerFirstName} ${customerLastName}`,
              email: customerEmail,
              phoneNumber: formattedPhone,
              identityNumber: student.studentId || studentId.toString(),
              firstAddress: "",
              secondAddress: "",
            },
            payment: {
              paymentReference: `MKQR${orderReference}`,
              paymentCurrency: "KES",
              channel: "MOBILE",
              service: "MPESA",
              provider: "JENGA",
              callbackUrl: config.callbackUrl,
              details: {
                msisdn: formattedPhone,
                paymentAmount: course.pricing.amount,
              },
            },
          };

          // Generate RSA signature for STK Push
          // Formula: order.orderReference + payment.paymentCurrency + payment.details.msisdn + payment.details.paymentAmount
          const signatureString = `${stkPushData.order.orderReference}${stkPushData.payment.paymentCurrency}${stkPushData.payment.details.msisdn}${stkPushData.payment.details.paymentAmount}`;

          const signature = generateJengaSignature(signatureString);

          // Make Jenga STK Push request
          const stkPushUrl = `${config.baseUrl}/api-checkout/mpesa-stk-push/v3.0/init`;

          let stkResponse;
          try {
            stkResponse = await axios.post(stkPushUrl, stkPushData, {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
                Signature: signature,
              },
              timeout: 30000, // 30 second timeout
            });
          } catch (stkError) {
            console.error(
              "STK Push failed:",
              stkError.response?.status,
              stkError.response?.data || stkError.message
            );

            payment.status = "failed";
            payment.equityDetails.error = {
              message: stkError.response?.data?.message || stkError.message,
              status: stkError.response?.status,
            };
            await payment.save();

            return res.status(502).json({
              success: false,
              message: "Failed to initiate M-Pesa payment",
              error: stkError.response?.data?.message || stkError.message,
            });
          }

          // Successful request - update payment record
          payment.equityDetails.stkPushResponse = stkResponse.data;
          if (stkResponse.data.data?.paymentReference) {
            payment.equityDetails.transactionRef =
              stkResponse.data.data.paymentReference;
          }
          await payment.save();

          res.json({
            success: true,
            message:
              stkResponse.data.message ||
              "M-Pesa STK Push initiated successfully. Check your phone to complete payment.",
            data: {
              paymentId: payment._id,
              orderReference,
              paymentReference: stkResponse.data.data?.paymentReference,
              invoiceNumber: stkResponse.data.data?.invoiceNumber,
              amount: stkResponse.data.data?.amount,
              charge: stkResponse.data.data?.charge,
              amountDebited: stkResponse.data.data?.amountDebited,
              phoneNumber: formattedPhone,
              courseTitle: course.title,
            },
          });
        } catch (equityError) {
          console.error(
            "Equity payment error:",
            equityError.response?.data || equityError.message
          );

          res.status(500).json({
            success: false,
            message: "Failed to initiate payment",
            error:
              equityError.response?.data?.errorMessage ||
              equityError.response?.data?.message ||
              "M-Pesa service unavailable",
          });
        }
      } else {
        // Free course - create enrollment directly
        const enrollmentData = {
          studentId,
          courseId,
          branchId,
          enrollmentType: course.registration.type,
          status: course.registration.requiresApproval ? "pending" : "active",
        };

        const enrollment = new Enrollment(enrollmentData);
        await enrollment.save();

        // Populate course data for response
        await enrollment.populate({
          path: "courseId",
          select: "title description thumbnail",
        });

        res.json({
          success: true,
          message: course.registration.requiresApproval
            ? "Enrollment request submitted for approval"
            : "Successfully enrolled in course",
          data: { enrollment },
        });
      }
    } catch (error) {
      console.error("Error enrolling in course:", error);
      res.status(500).json({
        success: false,
        message: "Error enrolling in course",
        error: error.message,
      });
    }
  }
);

/**
 * @swagger
 * /api/elearning/courses/{courseId}/request-enrollment:
 *   post:
 *     summary: Request enrollment in a course that requires approval
 *     tags: [E-Learning - Enrollment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *         description: Course ID to request enrollment for
 *     responses:
 *       200:
 *         description: Enrollment request submitted
 *       400:
 *         description: Already enrolled or request already pending
 *       404:
 *         description: Course not found
 */
router.post(
  "/courses/:courseId/request-enrollment",
  protect,
  authorize("student"),
  async (req, res) => {
    try {
      const { courseId } = req.params;

      // Find student by user ID
      const student = await Student.findOne({ userId: req.user.id });
      if (!student) {
        return res.status(404).json({
          success: false,
          message: "Student profile not found",
        });
      }

      const studentId = student._id;
      const branchId = student.branchId || req.user.branchId;

      // Check if course exists
      const course = await ECourse.findById(courseId);
      if (!course) {
        return res.status(404).json({
          success: false,
          message: "Course not found",
        });
      }

      // Check if already enrolled or has pending request
      const existingEnrollment = await Enrollment.findOne({
        studentId,
        courseId,
        status: { $in: ["active", "approved", "completed", "pending"] },
      });

      if (existingEnrollment) {
        const message =
          existingEnrollment.status === "pending"
            ? "Enrollment request already pending"
            : "Already enrolled in this course";

        return res.status(400).json({
          success: false,
          message,
          data: { enrollment: existingEnrollment },
        });
      }

      // Create enrollment request
      const enrollment = new Enrollment({
        studentId,
        courseId,
        branchId,
        enrollmentType: "manual",
        status: "pending",
      });

      await enrollment.save();

      res.json({
        success: true,
        message: "Enrollment request submitted for approval",
        data: { enrollment },
      });
    } catch (error) {
      console.error("Error requesting enrollment:", error);
      res.status(500).json({
        success: false,
        message: "Error requesting enrollment",
        error: error.message,
      });
    }
  }
);

/**
 * @swagger
 * /api/elearning/catalog:
 *   get:
 *     summary: Get all available courses for enrollment
 *     tags: [E-Learning]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved course catalog
 */
router.get("/catalog", protect, async (req, res) => {
  try {
    // This would typically fetch from Course model with enrollment status
    const courses = [
      {
        _id: "course1",
        name: "Introduction to Programming",
        description: "Learn the basics of programming with hands-on exercises",
        instructor: "Dr. Smith",
        thumbnail: "/images/programming-intro.jpg",
        duration: "8 weeks",
        level: "Beginner",
        enrolled: true,
        enrollmentCount: 150,
      },
      {
        _id: "course2",
        name: "Advanced Mathematics",
        description: "Dive deep into calculus and linear algebra",
        instructor: "Prof. Johnson",
        thumbnail: "/images/math-advanced.jpg",
        duration: "12 weeks",
        level: "Advanced",
        enrolled: true,
        enrollmentCount: 89,
      },
      {
        _id: "course3",
        name: "Web Development Fundamentals",
        description: "Build modern web applications from scratch",
        instructor: "Ms. Davis",
        thumbnail: "/images/web-dev.jpg",
        duration: "10 weeks",
        level: "Intermediate",
        enrolled: false,
        enrollmentCount: 203,
      },
    ];

    res.json({
      success: true,
      data: courses,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching course catalog",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/elearning/course/{id}:
 *   get:
 *     summary: Get detailed course information
 *     tags: [E-Learning]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Course ID
 */
router.get("/course/:id", protect, async (req, res) => {
  try {
    const { id } = req.params;
    const { ECourse } = require("../models/elearning");

    // Find the course by ID and populate instructor details
    const course = await ECourse.findById(id)
      .populate("instructor", "firstName lastName email profile")
      .populate("branchId", "name")
      .exec();

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Transform the course data for frontend consumption
    const courseDetails = {
      _id: course._id,
      title: course.title,
      name: course.title, // For backward compatibility
      description: course.description,
      shortDescription: course.shortDescription,
      thumbnail: course.thumbnail,
      category: course.category,
      level: course.level,
      language: course.language,
      duration: course.duration,
      instructor: {
        name: `${course.instructor.firstName} ${course.instructor.lastName}`,
        email: course.instructor.email,
        bio: course.instructor.profile?.bio || "Experienced educator",
        avatar:
          course.instructor.profile?.profilePicture ||
          "/images/default-avatar.jpg",
      },
      registration: course.registration,
      status: course.status,
      visibility: course.visibility,
      pricing: course.pricing,
      stats: course.stats,
      settings: course.settings,
      branch: course.branchId,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
      // Additional fields that might be needed by frontend
      enrolled: false, // This will be determined by enrollment status
      progress: 0, // This will be calculated from user progress
    };

    res.json({
      success: true,
      data: courseDetails,
    });
  } catch (error) {
    console.error("Error fetching course details:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching course details",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/elearning/enroll/{courseId}:
 *   post:
 *     summary: Enroll in a course
 *     tags: [E-Learning]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *         description: Course ID to enroll in
 */
router.post(
  "/enroll/:courseId",
  protect,
  authorize("student"),
  async (req, res) => {
    try {
      const { courseId } = req.params;
      const studentId = req.user._id;

      // Mock enrollment logic - would typically create enrollment record
      const enrollment = {
        _id: "new_enrollment_id",
        student: studentId,
        course: courseId,
        enrolledAt: new Date(),
        progress: 0,
        completedModules: [],
      };

      res.json({
        success: true,
        message: "Successfully enrolled in course",
        data: enrollment,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error enrolling in course",
        error: error.message,
      });
    }
  }
);

/**
 * @swagger
 * /api/elearning/assignments:
 *   get:
 *     summary: Get assignments for enrolled courses
 *     tags: [E-Learning]
 *     security:
 *       - bearerAuth: []
 */
router.get("/assignments", protect, authorize("student"), async (req, res) => {
  try {
    // Find student by user ID
    const student = await Student.findOne({ userId: req.user.id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    const studentId = student._id;

    // Fetch assignments (all published quizzes) for enrolled courses
    const enrollments = await Enrollment.getStudentEnrollments(studentId, {
      status: ["active", "approved", "completed"],
    });

    if (!enrollments || enrollments.length === 0) {
      return res.json({
        success: true,
        data: [],
      });
    }

    const courseIds = enrollments.map((e) => e.courseId);

    // Fetch assignments from Quiz model (all published quizzes are assignments)
    const assignments = await Quiz.find({
      courseId: { $in: courseIds },
      isPublished: true,
    })
      .populate({
        path: "courseId",
        model: "ECourse",
        select: "title",
      })
      .sort({ createdAt: -1 });

    // Get student's attempts for these assignments
    const assignmentIds = assignments.map((a) => a._id);
    const attempts = await QuizAttempt.find({
      quizId: { $in: assignmentIds },
      studentId: studentId,
    }).sort({ createdAt: -1 });

    // Group attempts by quiz
    const attemptsByQuiz = attempts.reduce((acc, attempt) => {
      if (!acc[attempt.quizId.toString()]) {
        acc[attempt.quizId.toString()] = [];
      }
      acc[attempt.quizId.toString()].push(attempt);
      return acc;
    }, {});

    // Transform to match frontend expectations
    const transformedAssignments = assignments.map((assignment) => {
      const quizAttempts = attemptsByQuiz[assignment._id.toString()] || [];
      const latestAttempt = quizAttempts[0]; // Most recent attempt

      let status = "pending";
      let submission = null;

      if (latestAttempt) {
        if (latestAttempt.submittedAt) {
          status = "submitted";
          submission = {
            submittedAt: latestAttempt.submittedAt.toISOString(),
            grade: latestAttempt.totalScore,
            maxPoints: latestAttempt.totalPossible,
            percentage: latestAttempt.percentageScore,
            attempt: latestAttempt.attempt,
          };
        } else {
          status = "in_progress";
        }
      }

      return {
        _id: assignment._id,
        title: assignment.title,
        description: assignment.description,
        course: {
          _id: assignment.courseId._id,
          title: assignment.courseId.title,
        },
        dueDate: assignment.schedule?.dueDate?.toISOString() || null,
        maxPoints:
          assignment.questions?.reduce((sum, q) => sum + (q.points || 0), 0) ||
          0,
        submissionType: "quiz", // Since assignments are quiz-based
        status: status,
        submission: submission,
        attempts: quizAttempts.length,
        createdAt: assignment.createdAt.toISOString(),
      };
    });

    res.json({
      success: true,
      data: transformedAssignments,
    });
  } catch (error) {
    console.error("Error fetching assignments:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching assignments",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/elearning/student-quizzes:
 *   get:
 *     summary: Get quizzes for enrolled courses
 *     tags: [E-Learning]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  "/student-quizzes",
  protect,
  authorize("student"),
  async (req, res) => {
    try {
      // Find student by user ID
      const student = await Student.findOne({ userId: req.user.id });
      if (!student) {
        return res.status(404).json({
          success: false,
          message: "Student profile not found",
        });
      }

      const studentId = student._id;

      // Fetch enrollments for e-courses
      const enrollments = await Enrollment.getStudentEnrollments(studentId, {
        status: ["active", "approved", "completed"],
      });

      // Get regular courses from student profile
      const regularCourseIds = student.courses || [];

      // Combine all course IDs (filter out null courseIds)
      const ecourseIds = enrollments
        .filter((e) => e.courseId) // Only include enrollments with valid courseId
        .map((e) => e.courseId);
      const allCourseIds = [...ecourseIds, ...regularCourseIds];

      if (allCourseIds.length === 0) {
        return res.json({
          success: true,
          data: [],
        });
      }

      // Fetch quizzes from all enrolled courses (both e-courses and regular courses)
      const quizzes = await Quiz.find({
        $or: [
          { courseId: { $in: ecourseIds }, courseType: "ecourse" },
          { courseId: { $in: regularCourseIds }, courseType: "course" },
        ],
        isPublished: true,
      }).sort({ createdAt: -1 });

      // Populate courseId based on courseType for each quiz
      for (let quiz of quizzes) {
        if (quiz.courseType === "ecourse") {
          await quiz.populate({
            path: "courseId",
            model: "ECourse",
            select: "title name",
          });
        } else {
          await quiz.populate({
            path: "courseId",
            model: "Course",
            select: "name title",
          });
        }
      }

      // Get student's attempts for these quizzes
      const quizIds = quizzes.map((q) => q._id);
      const attempts = await QuizAttempt.find({
        quizId: { $in: quizIds },
        studentId: studentId,
      }).sort({ createdAt: -1 });

      // Group attempts by quiz
      const attemptsByQuiz = attempts.reduce((acc, attempt) => {
        const quizId = attempt.quizId.toString();
        if (!acc[quizId]) {
          acc[quizId] = [];
        }
        acc[quizId].push(attempt);
        return acc;
      }, {});

      // Transform quizzes with attempt data
      const transformedQuizzes = quizzes.map((quiz) => {
        const quizAttempts = attemptsByQuiz[quiz._id.toString()] || [];
        const latestAttempt = quizAttempts[0];

        const submittedAttempts = quizAttempts.filter((a) => a.submittedAt);
        const maxAttempts = quiz.attempts === 0 ? 999 : quiz.attempts || 1;
        const hasReachedMaxAttempts = submittedAttempts.length >= maxAttempts;

        // Check availability
        const now = new Date();
        let isAvailable = true;
        let availabilityReason = "";

        if (quiz.schedule?.availableFrom && now < quiz.schedule.availableFrom) {
          isAvailable = false;
          availabilityReason = "Not yet available";
        }
        if (
          quiz.schedule?.availableUntil &&
          now > quiz.schedule.availableUntil
        ) {
          isAvailable = false;
          availabilityReason = "Expired";
        }

        let status = "available";
        if (!isAvailable) {
          status = "unavailable";
        } else if (latestAttempt && !latestAttempt.submittedAt) {
          status = "in_progress";
        } else if (
          hasReachedMaxAttempts &&
          latestAttempt &&
          latestAttempt.submittedAt
        ) {
          status = "completed";
        }

        // Only consider submitted attempts for best score
        const bestAttempt = submittedAttempts.reduce((best, attempt) => {
          if (
            !best ||
            (attempt.percentageScore || 0) > (best.percentageScore || 0)
          ) {
            return attempt;
          }
          return best;
        }, null);

        return {
          ...quiz.toObject(),
          status,
          isAvailable,
          availabilityReason,
          attempts: submittedAttempts.length,
          maxAttempts,
          lastAttempt: latestAttempt
            ? {
                id: latestAttempt._id,
                score: latestAttempt.totalScore,
                percentage: latestAttempt.percentageScore,
                attemptNumber: latestAttempt.attempt,
                completedAt: latestAttempt.submittedAt,
              }
            : null,
          bestScore: bestAttempt
            ? {
                id: bestAttempt._id,
                score: bestAttempt.totalScore,
                percentage: bestAttempt.percentageScore,
                attemptNumber: bestAttempt.attempt,
                completedAt: bestAttempt.submittedAt,
              }
            : null,
        };
      });

      console.log(
        "Transformed quizzes sample:",
        transformedQuizzes.slice(0, 2).map((q) => ({
          id: q._id,
          title: q.title,
          attempts: q.attempts,
          bestScore: q.bestScore,
          lastAttempt: q.lastAttempt,
        }))
      );

      res.json({
        success: true,
        data: transformedQuizzes,
      });
    } catch (error) {
      console.error("Error fetching student quizzes:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching quizzes",
        error: error.message,
      });
    }
  }
);

/**
 * @swagger
 * /api/elearning/discussions:
 *   get:
 *     summary: Get discussion forums for enrolled courses
 *     tags: [E-Learning]
 *     security:
 *       - bearerAuth: []
 */
router.get("/discussions", protect, async (req, res) => {
  try {
    const discussions = [
      {
        _id: "discussion1",
        title: "Getting Started with Programming",
        course: "Introduction to Programming",
        courseId: "course1",
        author: "Dr. Smith",
        createdAt: "2024-01-15",
        replies: 12,
        lastActivity: "2024-02-08",
      },
      {
        _id: "discussion2",
        title: "Common Programming Mistakes",
        course: "Introduction to Programming",
        courseId: "course1",
        author: "Student123",
        createdAt: "2024-01-20",
        replies: 8,
        lastActivity: "2024-02-07",
      },
      {
        _id: "discussion3",
        title: "Calculus Applications in Real World",
        course: "Advanced Mathematics",
        courseId: "course2",
        author: "Prof. Johnson",
        createdAt: "2024-01-18",
        replies: 15,
        lastActivity: "2024-02-09",
      },
    ];

    res.json({
      success: true,
      data: discussions,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching discussions",
      error: error.message,
    });
  }
});

// Teacher Routes

/**
 * @swagger
 * /api/elearning/teach/courses:
 *   get:
 *     summary: Get courses taught by the current teacher
 *     tags: [E-Learning - Teacher]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  "/teach/courses",
  protect,
  authorize("teacher", "branch-admin", "super-admin"),
  async (req, res) => {
    try {
      const teacherCourses = [
        {
          _id: "course1",
          name: "Introduction to Programming",
          enrolledStudents: 25,
          completionRate: 68,
          averageGrade: 82,
          nextDeadline: "2024-02-15",
          pendingAssignments: 5,
        },
        {
          _id: "course4",
          name: "Database Design",
          enrolledStudents: 18,
          completionRate: 45,
          averageGrade: 78,
          nextDeadline: "2024-02-20",
          pendingAssignments: 3,
        },
      ];

      res.json({
        success: true,
        data: teacherCourses,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching teacher courses",
        error: error.message,
      });
    }
  }
);

/**
 * @swagger
 * /api/elearning/grading/pending:
 *   get:
 *     summary: Get pending assignments and quizzes for grading
 *     tags: [E-Learning - Teacher]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  "/grading/pending",
  protect,
  authorize("teacher", "branch-admin", "super-admin"),
  async (req, res) => {
    try {
      const pendingGrading = [
        {
          _id: "submission1",
          type: "quiz",
          title: "Calculator Project",
          student: "John Doe",
          course: "Introduction to Programming",
          submittedAt: "2024-02-08",
          dueDate: "2024-02-20",
        },
        {
          _id: "submission2",
          type: "quiz",
          title: "Database Schema Design",
          student: "Jane Smith",
          course: "Database Design",
          submittedAt: "2024-02-09",
          dueDate: "2024-02-15",
        },
        {
          _id: "submission3",
          type: "quiz",
          title: "Programming Basics Quiz",
          student: "Bob Johnson",
          course: "Introduction to Programming",
          submittedAt: "2024-02-07",
          dueDate: "2024-02-10",
        },
      ];

      res.json({
        success: true,
        data: pendingGrading,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching pending grading",
        error: error.message,
      });
    }
  }
);

/**
 * @swagger
 * /api/elearning/analytics/course/{courseId}:
 *   get:
 *     summary: Get analytics for a specific course
 *     tags: [E-Learning - Teacher]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 */
router.get(
  "/analytics/course/:courseId",
  protect,
  authorize("teacher", "branch-admin", "super-admin"),
  async (req, res) => {
    try {
      const { courseId } = req.params;

      const analytics = {
        courseId,
        enrollmentStats: {
          total: 25,
          active: 23,
          completed: 17,
          dropped: 2,
        },
        performanceStats: {
          averageGrade: 82,
          passRate: 88,
          topPerformer: "Alice Cooper",
          strugglingStudents: 3,
        },
        engagementStats: {
          avgTimeSpent: "4.5 hours/week",
          discussionParticipation: 76,
          assignmentSubmissionRate: 92,
        },
        moduleCompletionRates: [
          { module: "Introduction", completion: 100 },
          { module: "Variables", completion: 96 },
          { module: "Control Structures", completion: 68 },
          { module: "Functions", completion: 32 },
        ],
      };

      res.json({
        success: true,
        data: analytics,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching course analytics",
        error: error.message,
      });
    }
  }
);

// Lightweight analytics endpoints (fallbacks) so frontend dashboard calls don't 404.
// These return safe default payloads when a full analytics pipeline isn't implemented yet.

router.get(
  "/analytics/overview",
  protect,
  authorize("teacher", "branch-admin", "super-admin"),
  analyticsController.getOverviewAnalytics
);

router.get(
  "/analytics/engagement",
  protect,
  authorize("teacher", "branch-admin", "super-admin"),
  analyticsController.getEngagementAnalytics
);

router.get(
  "/analytics/progress",
  protect,
  authorize("teacher", "branch-admin", "super-admin"),
  analyticsController.getProgressAnalytics
);

router.get(
  "/analytics/assessments",
  protect,
  authorize("teacher", "branch-admin", "super-admin"),
  analyticsController.getAssessmentAnalytics
);

router.get(
  "/analytics/content",
  protect,
  authorize("teacher", "branch-admin", "super-admin"),
  analyticsController.getContentAnalytics
);

router.get(
  "/analytics/courses",
  protect,
  authorize("admin", "superadmin"),
  analyticsController.getCoursesAnalytics
);

router.get(
  "/analytics/export",
  protect,
  authorize("teacher", "branch-admin", "super-admin"),
  async (req, res) => {
    try {
      // Simple CSV/PDF export placeholder: return 204 No Content meaning nothing to export
      res.status(204).send();
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to export analytics report",
        error: error.message,
      });
    }
  }
);

// Admin Routes

/**
 * @swagger
 * /api/elearning/admin/overview:
 *   get:
 *     summary: Get e-learning platform overview for admins
 *     tags: [E-Learning - Admin]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  "/admin/overview",
  protect,
  authorize("admin", "branchadmin", "superadmin"),
  async (req, res) => {
    try {
      const overview = {
        totalCourses: 15,
        totalStudents: 450,
        totalTeachers: 12,
        activeEnrollments: 680,
        completionRate: 73,
        platformUsage: {
          dailyActiveUsers: 234,
          weeklyActiveUsers: 412,
          monthlyActiveUsers: 450,
        },
        recentActivity: [
          {
            type: "enrollment",
            message: "25 new enrollments this week",
            timestamp: "2024-02-09",
          },
          {
            type: "completion",
            message: "12 course completions this week",
            timestamp: "2024-02-08",
          },
        ],
      };

      res.json({
        success: true,
        data: overview,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching admin overview",
        error: error.message,
      });
    }
  }
);

/**
 * @swagger
 * /api/elearning/admin/content:
 *   get:
 *     summary: Get content management data for admins
 *     tags: [E-Learning - Admin]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  "/admin/content",
  protect,
  authorize("admin", "branchadmin", "superadmin"),
  async (req, res) => {
    try {
      const contentData = {
        courses: [
          {
            _id: "course1",
            name: "Introduction to Programming",
            instructor: "Dr. Smith",
            status: "active",
            enrollments: 25,
            lastUpdated: "2024-02-01",
          },
          {
            _id: "course2",
            name: "Advanced Mathematics",
            instructor: "Prof. Johnson",
            status: "active",
            enrollments: 18,
            lastUpdated: "2024-01-28",
          },
        ],
        pendingApprovals: [
          {
            _id: "approval1",
            type: "course",
            title: "New Physics Course",
            submittedBy: "Dr. Brown",
            submittedAt: "2024-02-08",
          },
        ],
        systemHealth: {
          serverStatus: "healthy",
          databaseStatus: "healthy",
          lastBackup: "2024-02-09",
          storageUsed: "45%",
        },
      };

      res.json({
        success: true,
        data: contentData,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching content management data",
        error: error.message,
      });
    }
  }
);

// Content Management Routes for Teachers

/**
 * @swagger
 * /api/elearning/courses/{courseId}/content:
 *   get:
 *     summary: Get content for a specific course
 *     tags: [E-Learning - Content]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *         description: The course ID
 *       - in: query
 *         name: moduleId
 *         schema:
 *           type: string
 *         description: Filter by module ID
 *       - in: query
 *         name: contentType
 *         schema:
 *           type: string
 *         description: Filter by content type
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by status
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Items per page
 */
router.get(
  "/courses/:courseId/content",
  protect,
  authorize("teacher", "admin", "branchadmin", "superadmin", "student"),
  async (req, res, next) => {
    // For students, check if they're enrolled in the course
    if (req.user.role === "student") {
      try {
        // Find the student record first
        const student = await Student.findOne({ userId: req.user._id });
        if (!student) {
          return res.status(404).json({
            success: false,
            message: "Student profile not found",
          });
        }

        const enrollment = await Enrollment.findOne({
          studentId: student._id,
          courseId: req.params.courseId,
          status: { $in: ["active", "approved", "completed"] },
        });
        if (!enrollment) {
          return res.status(403).json({
            success: false,
            message: "You are not enrolled in this course",
          });
        }
      } catch (error) {
        return res.status(500).json({
          success: false,
          message: "Error checking enrollment status",
        });
      }
    }
    next();
  },
  courseContentController.getContentByCourse
);

/**
 * @swagger
 * /api/elearning/courses/{courseId}/content:
 *   post:
 *     summary: Create new content for a specific course
 *     tags: [E-Learning - Content]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *         description: The course ID
 */
router.post(
  "/courses/:courseId/content",
  protect,
  authorize("teacher", "admin", "branchadmin", "superadmin"),
  upload.array("files", 10), // Allow up to 10 files
  [
    body("title").notEmpty().withMessage("Title is required"),
    body("description").notEmpty().withMessage("Description is required"),
    body("type")
      .isIn(["video", "document", "image", "link", "text", "mixed"])
      .withMessage("Invalid content type"),
    body("estimatedDuration")
      .isInt({ min: 1 })
      .withMessage("Duration must be a positive integer"),
  ],
  async (req, res) => {
    try {
      console.log("=== Content Creation Debug ===");
      console.log("Request body:", req.body);
      console.log(
        "User:",
        req.user
          ? {
              id: req.user._id,
              role: req.user.role,
              branchId: req.user.branchId,
            }
          : "No user"
      );

      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        console.log("Validation errors:", errors.array());
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const {
        title,
        description,
        type,
        content,
        mediaUrl,
        externalUrl,
        mediaUrls,
        externalUrls,
        contentItems,
        estimatedDuration,
        tags,
        visibility,
        moduleId,
        materials,
      } = req.body;

      // Get courseId from URL params
      const { courseId } = req.params;
      console.log("Course ID from params:", courseId);

      // Verify the course exists and user has access
      const course = await ECourse.findById(courseId);
      if (!course) {
        return res.status(404).json({
          success: false,
          message: "Course not found",
        });
      }

      // Check if user owns the course or is an admin
      const isAdmin =
        req.user.roles.includes("admin") ||
        req.user.roles.includes("superadmin") ||
        req.user.roles.includes("branchadmin");

      if (
        !isAdmin &&
        course.instructor.toString() !== req.user._id.toString()
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Access denied. You can only add content to your own courses.",
        });
      }

      // Parse arrays if they come as strings
      const parsedTags =
        typeof tags === "string" ? JSON.parse(tags) : tags || [];
      const parsedMaterials =
        typeof materials === "string" ? JSON.parse(materials) : materials || [];
      const parsedMediaUrls =
        typeof mediaUrls === "string" ? JSON.parse(mediaUrls) : mediaUrls || [];
      const parsedExternalUrls =
        typeof externalUrls === "string"
          ? JSON.parse(externalUrls)
          : externalUrls || [];
      const parsedContentItems =
        typeof contentItems === "string"
          ? JSON.parse(contentItems)
          : contentItems || [];

      // Handle file uploads
      const uploadedFiles = req.files || [];
      const mediaItems = [];

      if (uploadedFiles && uploadedFiles.length > 0) {
        console.log(`Processing ${uploadedFiles.length} uploaded files`);

        for (const file of uploadedFiles) {
          try {
            let uploadResult;

            if (file.mimetype.startsWith("video/")) {
              // Upload to Cloudflare Stream
              uploadResult = await cloudflareService.uploadToStream(
                file.buffer,
                {
                  filename: file.originalname,
                  metadata: {
                    title: title,
                    courseId: courseId,
                    uploadedBy: req.user._id,
                  },
                }
              );

              mediaItems.push({
                type: "video",
                url: uploadResult.playbackUrl,
                streamId: uploadResult.uid,
                thumbnailUrl: uploadResult.thumbnail,
                duration: uploadResult.duration,
                fileName: file.originalname,
                fileSize: file.size,
                fileType: file.mimetype,
              });
            } else {
              // Upload to Cloudflare R2
              uploadResult = await cloudflareService.uploadFile(file.buffer, {
                filename: file.originalname,
                contentType: file.mimetype,
                folder: `course-content/${courseId}`,
              });

              mediaItems.push({
                type: file.mimetype.startsWith("image/")
                  ? "image"
                  : file.mimetype.startsWith("audio/")
                  ? "audio"
                  : "document",
                url: uploadResult.url,
                fileName: file.originalname,
                fileSize: file.size,
                fileType: file.mimetype,
              });
            }

            console.log(`Successfully uploaded file: ${file.originalname}`);
          } catch (error) {
            console.error(`Failed to upload file ${file.originalname}:`, error);
            return res.status(500).json({
              success: false,
              message: `Failed to upload file: ${file.originalname}`,
              error: error.message,
            });
          }
        }
      }

      // Create content data structure based on type
      const contentData = {};

      // Set content based on type
      if (type === "video" && mediaUrl) {
        // Check if it's a YouTube video or external link
        const isYouTubeVideo =
          mediaUrl.includes("youtube.com") || mediaUrl.includes("youtu.be");
        if (isYouTubeVideo) {
          contentData.externalLink = mediaUrl;
          contentData.videoType = "youtube";
        } else {
          contentData.playbackUrl = mediaUrl;
          contentData.videoType = "uploaded";
        }
      } else if (type === "link" && externalUrl) {
        contentData.externalLink = externalUrl;
      } else if (type === "text" && content) {
        contentData.htmlContent = content;
      } else if (type === "mixed") {
        // Handle mixed content with multiple items
        contentData.mediaUrls = Array.isArray(parsedMediaUrls)
          ? parsedMediaUrls
          : [];
        contentData.externalUrls = Array.isArray(parsedExternalUrls)
          ? parsedExternalUrls
          : [];
        contentData.contentItems = Array.isArray(parsedContentItems)
          ? parsedContentItems
          : [];
      }

      // Create materials from uploaded files
      const materialsFromUploads = mediaItems.map((item, index) => ({
        id: `upload_${Date.now()}_${index}`,
        name: item.fileName,
        type: "file",
        description: `${item.type} file`,
        fileUrl: item.url,
        fileName: item.fileName,
        fileSize: item.fileSize,
        mimeType: item.fileType,
        createdAt: new Date(),
      }));

      // Combine with any existing materials
      const allMaterials = [...parsedMaterials, ...materialsFromUploads];

      // Create new content in database
      console.log("Creating new CourseContent with data:", {
        courseId: courseId,
        moduleId: moduleId || null,
        title,
        description,
        type,
        content: contentData,
        branchId: req.user.branchId,
        createdBy: req.user._id,
      });

      const contentPayload = {
        title,
        description,
        type,
        content: contentData,
        materials: allMaterials,
        tags: parsedTags,
        visibility: visibility || "public",
        estimatedDuration: parseInt(estimatedDuration) || 0,
        order: 1, // Will be updated based on existing content count
        isPublished: true,
        createdBy: req.user._id,
        branchId: req.user.branchId,
        courseId: courseId, // Use courseId from params
      };

      // Only add moduleId if it's provided and not empty
      if (moduleId && moduleId.trim() !== "") {
        contentPayload.moduleId = moduleId;
      }

      const newContent = new CourseContent(contentPayload);

      console.log("About to save content to database...");
      // Save to database
      const savedContent = await newContent.save();
      console.log("Content saved successfully:", savedContent._id);

      res.status(201).json({
        success: true,
        message: "Content created successfully",
        data: {
          _id: savedContent._id,
          title: savedContent.title,
          description: savedContent.description,
          type: savedContent.type,
          content: savedContent.content.htmlContent || "",
          mediaUrl:
            savedContent.content.playbackUrl || savedContent.content.fileUrl,
          externalUrl: savedContent.content.externalLink,
          mediaUrls: savedContent.content.mediaUrls || [],
          externalUrls: savedContent.content.externalUrls || [],
          contentItems: savedContent.content.contentItems || [],
          videoType: savedContent.content.videoType || null,
          estimatedDuration: savedContent.estimatedDuration,
          tags: savedContent.tags,
          visibility: savedContent.visibility,
          moduleId: savedContent.moduleId,
          materials: savedContent.materials,
          status: savedContent.isPublished ? "published" : "draft",
          courseId: savedContent.courseId,
          author: req.user.firstName + " " + req.user.lastName,
          authorId: savedContent.createdBy,
          branchId: savedContent.branchId,
          createdAt: savedContent.createdAt,
          updatedAt: savedContent.updatedAt,
        },
      });
    } catch (error) {
      console.error("Error creating content:", error);
      res.status(500).json({
        success: false,
        message: "Error creating content",
        error: error.message,
      });
    }
  }
);

/**
 * @swagger
 * /api/elearning/courses/{courseId}/content/{contentId}:
 *   put:
 *     summary: Update content for a specific course
 *     tags: [E-Learning - Content]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *         description: The course ID
 *       - in: path
 *         name: contentId
 *         required: true
 *         schema:
 *           type: string
 *         description: The content ID
 */
router.put(
  "/courses/:courseId/content/:contentId",
  protect,
  authorize("teacher", "admin", "branchadmin", "superadmin"),
  async (req, res) => {
    try {
      console.log("=== Content Update Debug ===");
      console.log("Request body:", req.body);
      console.log("Course ID:", req.params.courseId);
      console.log("Content ID:", req.params.contentId);
      console.log(
        "User:",
        req.user
          ? {
              id: req.user._id,
              role: req.user.role,
              branchId: req.user.branchId,
            }
          : "No user"
      );

      const { contentId, courseId } = req.params;
      const updateData = req.body;

      // Parse arrays if they come as strings
      if (updateData.tags && typeof updateData.tags === "string") {
        updateData.tags = JSON.parse(updateData.tags);
      }
      if (updateData.materials && typeof updateData.materials === "string") {
        updateData.materials = JSON.parse(updateData.materials);
      }
      if (updateData.mediaUrls && typeof updateData.mediaUrls === "string") {
        updateData.mediaUrls = JSON.parse(updateData.mediaUrls);
      }
      if (
        updateData.externalUrls &&
        typeof updateData.externalUrls === "string"
      ) {
        updateData.externalUrls = JSON.parse(updateData.externalUrls);
      }
      if (
        updateData.contentItems &&
        typeof updateData.contentItems === "string"
      ) {
        updateData.contentItems = JSON.parse(updateData.contentItems);
      }

      // Find existing content
      const existingContent = await CourseContent.findById(contentId);

      if (!existingContent) {
        return res.status(404).json({
          success: false,
          message: "Content not found",
        });
      }

      // Verify the course exists and user has access
      const course = await ECourse.findById(courseId);
      if (!course) {
        return res.status(404).json({
          success: false,
          message: "Course not found",
        });
      }

      // Check if user owns the course or is an admin
      const isAdmin =
        req.user.roles.includes("admin") ||
        req.user.roles.includes("superadmin") ||
        req.user.roles.includes("branchadmin");

      if (
        !isAdmin &&
        course.instructor.toString() !== req.user._id.toString()
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Access denied. You can only edit content in your own courses.",
        });
      }

      // Check if user has permission to update this content
      if (
        !isAdmin &&
        existingContent.createdBy.toString() !== req.user._id.toString()
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied. You can only edit your own content.",
        });
      }

      // Update content data structure based on type
      const contentData = { ...existingContent.content };

      if (updateData.type === "video" && updateData.mediaUrl) {
        contentData.playbackUrl = updateData.mediaUrl;
      } else if (
        updateData.type === "document" ||
        updateData.type === "image"
      ) {
        if (updateData.mediaUrl) {
          contentData.fileUrl = updateData.mediaUrl;
          // Extract filename from URL for updates
          const urlParts = updateData.mediaUrl.split("/");
          const fileName = urlParts[urlParts.length - 1];
          contentData.fileName = fileName;

          // Try to determine file type from extension
          const fileExtension = fileName.split(".").pop()?.toLowerCase();
          if (fileExtension) {
            const mimeTypeMap = {
              pdf: "application/pdf",
              doc: "application/msword",
              docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              jpg: "image/jpeg",
              jpeg: "image/jpeg",
              png: "image/png",
              gif: "image/gif",
              webp: "image/webp",
            };
            contentData.mimeType =
              mimeTypeMap[fileExtension] || "application/octet-stream";
          }

          console.log("Updated file metadata:", {
            fileName: contentData.fileName,
            mimeType: contentData.mimeType,
          });
        }
      } else if (updateData.type === "link" && updateData.externalUrl) {
        contentData.externalLink = updateData.externalUrl;
      } else if (updateData.type === "text" && updateData.content) {
        contentData.htmlContent = updateData.content;
      } else if (updateData.type === "mixed") {
        // Handle mixed content with multiple items
        contentData.mediaUrls = Array.isArray(updateData.mediaUrls)
          ? updateData.mediaUrls
          : [];
        contentData.externalUrls = Array.isArray(updateData.externalUrls)
          ? updateData.externalUrls
          : [];
        contentData.contentItems = Array.isArray(updateData.contentItems)
          ? updateData.contentItems
          : [];
      }

      // Create update payload
      const updatePayload = {
        title: updateData.title || existingContent.title,
        description: updateData.description || existingContent.description,
        type: updateData.type || existingContent.type,
        content: contentData,
        materials: updateData.materials || existingContent.materials,
        tags: updateData.tags || existingContent.tags,
        visibility: updateData.visibility || existingContent.visibility,
        estimatedDuration: updateData.estimatedDuration
          ? parseInt(updateData.estimatedDuration)
          : existingContent.estimatedDuration,
        updatedAt: new Date(),
      };

      // Only update moduleId if provided
      if (updateData.moduleId !== undefined) {
        updatePayload.moduleId = updateData.moduleId || null;
      }

      console.log("Update payload:", updatePayload);

      // Update the content
      const updatedContent = await CourseContent.findByIdAndUpdate(
        contentId,
        updatePayload,
        { new: true }
      ).populate("createdBy", "firstName lastName");

      console.log("Content updated successfully:", updatedContent._id);

      // Transform data to match frontend expectations
      const transformedContent = {
        _id: updatedContent._id,
        title: updatedContent.title,
        description: updatedContent.description,
        type: updatedContent.type,
        content: updatedContent.content.htmlContent || "",
        mediaUrl:
          updatedContent.content.playbackUrl || updatedContent.content.fileUrl,
        externalUrl: updatedContent.content.externalLink,
        mediaUrls: updatedContent.content.mediaUrls || [],
        externalUrls: updatedContent.content.externalUrls || [],
        contentItems: updatedContent.content.contentItems || [],
        estimatedDuration: updatedContent.estimatedDuration,
        tags: updatedContent.tags,
        visibility: updatedContent.visibility,
        moduleId: updatedContent.moduleId,
        materials: updatedContent.materials,
        status: updatedContent.isPublished ? "published" : "draft",
        courseId: updatedContent.courseId,
        author: updatedContent.createdBy
          ? `${updatedContent.createdBy.firstName} ${updatedContent.createdBy.lastName}`
          : "Unknown",
        authorId: updatedContent.createdBy
          ? updatedContent.createdBy._id
          : null,
        branchId: updatedContent.branchId,
        createdAt: updatedContent.createdAt,
        updatedAt: updatedContent.updatedAt,
      };

      res.json({
        success: true,
        message: "Content updated successfully",
        data: transformedContent,
      });
    } catch (error) {
      console.error("Error updating content:", error);
      res.status(500).json({
        success: false,
        message: "Error updating content",
        error: error.message,
      });
    }
  }
);

/**
 * @swagger
 * /api/elearning/content/{id}:
 *   get:
 *     summary: Get content by ID
 *     tags: [E-Learning - Content]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  "/content/:id",
  protect,
  authorize("student", "teacher", "branch-admin", "super-admin"),
  branchAuth,
  async (req, res) => {
    try {
      const { id } = req.params;

      // Fetch content from database
      const content = await CourseContent.findById(id)
        .populate("createdBy", "firstName lastName")
        .populate("courseId", "name")
        .populate("moduleId", "title");

      if (!content) {
        return res.status(404).json({
          success: false,
          message: "Content not found",
        });
      }

      // Check if user has access to this content
      console.log("=== Content Access Debug ===");
      console.log("Content ID:", content._id);
      console.log("Content branchId:", content.branchId);
      console.log("User branchId:", req.user.branchId);
      console.log("Content sharing:", content.sharing);

      const hasAccess = content.canAccess(req.user);
      console.log("Access result:", hasAccess);

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      // Transform data to match frontend expectations
      // Determine the correct media URL based on content type
      let mediaUrl = null;
      let videoType = null;
      let fileName = content.content.fileName;
      let mimeType = content.content.mimeType;

      if (content.type === "video") {
        if (content.content.playbackUrl) {
          mediaUrl = content.content.playbackUrl;
          videoType = "uploaded";
        } else if (content.content.externalLink) {
          mediaUrl = content.content.externalLink;
          videoType = "youtube";
        }
      } else if (content.type === "image") {
        mediaUrl = content.content.imageUrl || content.content.fileUrl;
      } else if (content.type === "audio") {
        mediaUrl = content.content.audioUrl;
      } else if (content.type === "document") {
        mediaUrl = content.content.fileUrl;
      }

      // Fallback: if no mediaUrl but there are file materials, use the first one
      if (!mediaUrl && content.materials && content.materials.length > 0) {
        const firstFileMaterial = content.materials.find(
          (m) => m.type === "file" && m.url
        );
        if (firstFileMaterial) {
          mediaUrl = firstFileMaterial.url;
          fileName = firstFileMaterial.name;
          // Try to determine mime type from filename
          const fileExtension = firstFileMaterial.name
            .split(".")
            .pop()
            ?.toLowerCase();
          if (fileExtension) {
            const mimeTypeMap = {
              // Documents
              pdf: "application/pdf",
              doc: "application/msword",
              docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              txt: "text/plain",
              // Images
              jpg: "image/jpeg",
              jpeg: "image/jpeg",
              png: "image/png",
              gif: "image/gif",
              webp: "image/webp",
              svg: "image/svg+xml",
              // Audio
              mp3: "audio/mpeg",
              wav: "audio/wav",
              ogg: "audio/ogg",
              aac: "audio/aac",
              m4a: "audio/mp4",
            };
            mimeType = mimeTypeMap[fileExtension] || "application/octet-stream";
          }
          console.log("Using file from materials:", {
            mediaUrl,
            fileName,
            mimeType,
          });
        }
      }

      const transformedContent = {
        _id: content._id,
        title: content.title,
        description: content.description,
        type: content.type,
        content: content.content.htmlContent || "",
        mediaUrl: mediaUrl,
        externalUrl: content.content.externalLink,
        // Add new array fields for mixed content support
        mediaUrls: content.content.mediaUrls || [],
        externalUrls: content.content.externalUrls || [],
        contentItems: content.content.contentItems || [],
        videoType: videoType,
        estimatedDuration: content.estimatedDuration,
        tags: content.tags,
        visibility: content.visibility,
        moduleId: content.moduleId,
        materials: content.materials,
        status: content.isPublished ? "published" : "draft",
        courseId: content.courseId,
        author: content.createdBy
          ? `${content.createdBy.firstName} ${content.createdBy.lastName}`
          : "Unknown",
        authorId: content.createdBy ? content.createdBy._id : null,
        branchId: content.branchId,
        createdAt: content.createdAt,
        updatedAt: content.updatedAt,
        // Add file metadata for better frontend handling
        fileName: fileName,
        fileSize: content.content.fileSize,
        mimeType: mimeType,
        // Add explicit media type to help frontend render correctly
        mediaType:
          content.type === "video"
            ? "video"
            : content.type === "image"
            ? "image"
            : content.type === "audio"
            ? "audio"
            : "document",
        // Add flag to indicate if this is a downloadable file vs streamable content
        // Disable download for ALL videos (both uploaded and YouTube)
        isDownloadable:
          content.type !== "video" &&
          (content.type === "document" ||
            content.type === "audio" ||
            (content.type === "image" && mimeType !== "image/gif")),
        isStreamable: content.type === "video" || content.type === "audio",
        // Add specific video handling flags
        isYouTubeVideo: videoType === "youtube",
        isUploadedVideo: videoType === "uploaded",
      };

      console.log("=== Content Response Debug ===");
      console.log("mediaUrl:", transformedContent.mediaUrl);
      console.log("fileName:", transformedContent.fileName);
      console.log("mimeType:", transformedContent.mimeType);
      console.log("type:", transformedContent.type);
      console.log("videoType:", transformedContent.videoType);
      console.log("mediaType:", transformedContent.mediaType);
      console.log("isDownloadable:", transformedContent.isDownloadable);
      console.log("isStreamable:", transformedContent.isStreamable);
      console.log("isYouTubeVideo:", transformedContent.isYouTubeVideo);
      console.log("isUploadedVideo:", transformedContent.isUploadedVideo);
      console.log("content.content object:", content.content);

      res.json({
        success: true,
        message: "Content retrieved successfully",
        data: transformedContent,
      });
    } catch (error) {
      console.error("Error fetching content:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching content",
        error: error.message,
      });
    }
  }
);

/**
 * @swagger
 * /api/elearning/content/{id}:
 *   put:
 *     summary: Update content (Teachers)
 *     tags: [E-Learning - Content]
 *     security:
 *       - bearerAuth: []
 */
router.put(
  "/content/:id",
  protect,
  authorize("teacher", "branch-admin", "super-admin"),
  branchAuth,
  upload.array("files", 10), // Allow up to 10 files for updates
  async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = req.body;

      // Parse arrays if they come as strings
      if (updateData.tags && typeof updateData.tags === "string") {
        updateData.tags = JSON.parse(updateData.tags);
      }
      if (updateData.materials && typeof updateData.materials === "string") {
        updateData.materials = JSON.parse(updateData.materials);
      }

      // Find existing content
      const existingContent = await CourseContent.findById(id);

      if (!existingContent) {
        return res.status(404).json({
          success: false,
          message: "Content not found",
        });
      }

      // Check if user has permission to update
      if (
        existingContent.createdBy.toString() !== req.user._id.toString() &&
        !req.user.roles.includes("branch-admin") &&
        !req.user.roles.includes("super-admin")
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      // Handle file uploads for new materials
      const uploadedFiles = req.files || [];
      let newMaterials = [];

      if (uploadedFiles && uploadedFiles.length > 0) {
        console.log(
          `Processing ${uploadedFiles.length} uploaded files for content update`
        );

        for (const file of uploadedFiles) {
          try {
            let uploadResult;

            if (file.mimetype.startsWith("video/")) {
              // Upload to Cloudflare Stream
              uploadResult = await cloudflareService.uploadToStream(
                file.buffer,
                {
                  filename: file.originalname,
                  metadata: {
                    title: existingContent.title,
                    courseId: existingContent.courseId,
                    contentId: existingContent._id,
                    uploadedBy: req.user._id,
                  },
                }
              );

              newMaterials.push({
                id: `video_${Date.now()}_${Math.random()}`,
                name: file.originalname,
                type: "video",
                fileUrl: uploadResult.playbackUrl,
                fileName: file.originalname,
                fileSize: file.size,
                mimeType: file.mimetype,
                streamId: uploadResult.uid,
                thumbnailUrl: uploadResult.thumbnail,
                createdAt: new Date(),
              });
            } else {
              // Upload to Cloudflare R2
              uploadResult = await cloudflareService.uploadFile(file.buffer, {
                filename: file.originalname,
                contentType: file.mimetype,
                folder: `course-content/${existingContent.courseId}`,
              });

              newMaterials.push({
                id: `file_${Date.now()}_${Math.random()}`,
                name: file.originalname,
                type: file.mimetype.startsWith("image/")
                  ? "image"
                  : file.mimetype.startsWith("audio/")
                  ? "audio"
                  : "document",
                fileUrl: uploadResult.url,
                fileName: file.originalname,
                fileSize: file.size,
                mimeType: file.mimetype,
                createdAt: new Date(),
              });
            }

            console.log(`Successfully uploaded file: ${file.originalname}`);
          } catch (error) {
            console.error(`Failed to upload file ${file.originalname}:`, error);
            return res.status(500).json({
              success: false,
              message: `Failed to upload file: ${file.originalname}`,
              error: error.message,
            });
          }
        }
      }

      // Combine existing materials with new uploaded materials
      const existingMaterials =
        updateData.materials || existingContent.materials || [];
      const allMaterials = [...existingMaterials, ...newMaterials];

      // Update content data structure based on type
      const contentData = existingContent.content;

      if (updateData.type === "video") {
        if (updateData.mediaUrl) {
          // Check if it's a YouTube video or external link
          const isYouTubeVideo =
            updateData.mediaUrl.includes("youtube.com") ||
            updateData.mediaUrl.includes("youtu.be");
          if (isYouTubeVideo) {
            contentData.externalLink = updateData.mediaUrl;
            contentData.videoType = "youtube";
            // Clear any previous playbackUrl if switching from uploaded to youtube
            delete contentData.playbackUrl;
          } else {
            contentData.playbackUrl = updateData.mediaUrl;
            contentData.videoType = "uploaded";
            // Clear any previous externalLink if switching from youtube to uploaded
            delete contentData.externalLink;
          }
        }
      } else if (
        updateData.type === "document" ||
        updateData.type === "image" ||
        updateData.type === "audio"
      ) {
        // Check if we have an uploaded file in materials but no mediaUrl
        let finalMediaUrl = updateData.mediaUrl;
        if (
          !finalMediaUrl &&
          updateData.materials &&
          updateData.materials.length > 0
        ) {
          const uploadedFile = updateData.materials.find(
            (m) => m.type === "file" && m.url
          );
          if (uploadedFile) {
            finalMediaUrl = uploadedFile.url;
            console.log(
              `Using uploaded file URL from materials for ${updateData.type} update:`,
              finalMediaUrl
            );
          }
        }

        if (finalMediaUrl) {
          // Set appropriate URL field based on content type
          if (updateData.type === "image") {
            contentData.imageUrl = finalMediaUrl;
            // Clear other URL fields to avoid conflicts
            delete contentData.fileUrl;
            delete contentData.audioUrl;
          } else if (updateData.type === "audio") {
            contentData.audioUrl = finalMediaUrl;
            // Clear other URL fields to avoid conflicts
            delete contentData.fileUrl;
            delete contentData.imageUrl;
          } else {
            contentData.fileUrl = finalMediaUrl;
            // Clear other URL fields to avoid conflicts
            delete contentData.imageUrl;
            delete contentData.audioUrl;
          }

          // Extract filename from URL
          const urlParts = finalMediaUrl.split("/");
          const fileName = urlParts[urlParts.length - 1];
          contentData.fileName = fileName;

          // Try to determine file type from extension
          const fileExtension = fileName.split(".").pop()?.toLowerCase();
          if (fileExtension) {
            const mimeTypeMap = {
              // Documents
              pdf: "application/pdf",
              doc: "application/msword",
              docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              txt: "text/plain",
              // Images
              jpg: "image/jpeg",
              jpeg: "image/jpeg",
              png: "image/png",
              gif: "image/gif",
              webp: "image/webp",
              svg: "image/svg+xml",
              // Audio
              mp3: "audio/mpeg",
              wav: "audio/wav",
              ogg: "audio/ogg",
              aac: "audio/aac",
              m4a: "audio/mp4",
            };
            contentData.mimeType =
              mimeTypeMap[fileExtension] || "application/octet-stream";
          }

          console.log(`Updated ${updateData.type} metadata:`, {
            fileName: contentData.fileName,
            mimeType: contentData.mimeType,
            url: finalMediaUrl,
          });
        }
      } else if (updateData.type === "link" && updateData.externalUrl) {
        contentData.externalLink = updateData.externalUrl;
      } else if (updateData.type === "text" && updateData.content) {
        contentData.htmlContent = updateData.content;
      }

      // Update the content
      const updatedContent = await CourseContent.findByIdAndUpdate(
        id,
        {
          title: updateData.title || existingContent.title,
          description: updateData.description || existingContent.description,
          type: updateData.type || existingContent.type,
          content: contentData,
          materials: allMaterials,
          tags: updateData.tags || existingContent.tags,
          visibility: updateData.visibility || existingContent.visibility,
          estimatedDuration: updateData.estimatedDuration
            ? parseInt(updateData.estimatedDuration)
            : existingContent.estimatedDuration,
          moduleId: updateData.moduleId || existingContent.moduleId,
        },
        { new: true }
      ).populate("createdBy", "firstName lastName");

      // Transform data to match frontend expectations
      // Determine the correct media URL based on content type
      let mediaUrl = null;
      let videoType = null;
      let fileName = null;
      let mimeType = null;

      if (updatedContent.type === "video") {
        if (updatedContent.content.playbackUrl) {
          mediaUrl = updatedContent.content.playbackUrl;
          videoType = "uploaded";
        } else if (updatedContent.content.externalLink) {
          mediaUrl = updatedContent.content.externalLink;
          videoType = "youtube";
        }
      } else if (updatedContent.type === "image") {
        mediaUrl =
          updatedContent.content.imageUrl || updatedContent.content.fileUrl;
      } else if (updatedContent.type === "audio") {
        mediaUrl = updatedContent.content.audioUrl;
      } else if (updatedContent.type === "document") {
        mediaUrl = updatedContent.content.fileUrl;
      }

      // Get file metadata
      if (updatedContent.content.fileName) {
        fileName = updatedContent.content.fileName;
      }
      if (updatedContent.content.mimeType) {
        mimeType = updatedContent.content.mimeType;
      }

      // Fallback: if no mediaUrl but there are file materials, use the first one
      if (
        !mediaUrl &&
        updatedContent.materials &&
        updatedContent.materials.length > 0
      ) {
        const firstFileMaterial = updatedContent.materials.find(
          (m) => m.type === "file" && m.url
        );
        if (firstFileMaterial) {
          mediaUrl = firstFileMaterial.url;
          fileName = firstFileMaterial.name;
          // Try to determine mime type from filename
          const fileExtension = firstFileMaterial.name
            .split(".")
            .pop()
            ?.toLowerCase();
          if (fileExtension) {
            const mimeTypeMap = {
              // Documents
              pdf: "application/pdf",
              doc: "application/msword",
              docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              txt: "text/plain",
              // Images
              jpg: "image/jpeg",
              jpeg: "image/jpeg",
              png: "image/png",
              gif: "image/gif",
              webp: "image/webp",
              svg: "image/svg+xml",
              // Audio
              mp3: "audio/mpeg",
              wav: "audio/wav",
              ogg: "audio/ogg",
              aac: "audio/aac",
              m4a: "audio/mp4",
            };
            mimeType = mimeTypeMap[fileExtension] || "application/octet-stream";
          }
          console.log("Using file from materials for update response:", {
            mediaUrl,
            fileName,
            mimeType,
          });
        }
      }

      const transformedContent = {
        _id: updatedContent._id,
        title: updatedContent.title,
        description: updatedContent.description,
        type: updatedContent.type,
        content: updatedContent.content.htmlContent || "",
        mediaUrl: mediaUrl,
        externalUrl: updatedContent.content.externalLink,
        videoType: videoType,
        estimatedDuration: updatedContent.estimatedDuration,
        tags: updatedContent.tags,
        visibility: updatedContent.visibility,
        moduleId: updatedContent.moduleId,
        materials: updatedContent.materials,
        status: updatedContent.isPublished ? "published" : "draft",
        courseId: updatedContent.courseId,
        author: updatedContent.createdBy
          ? `${updatedContent.createdBy.firstName} ${updatedContent.createdBy.lastName}`
          : "Unknown",
        authorId: updatedContent.createdBy
          ? updatedContent.createdBy._id
          : null,
        branchId: updatedContent.branchId,
        createdAt: updatedContent.createdAt,
        updatedAt: updatedContent.updatedAt,
        // Add file metadata for better frontend handling
        fileName: fileName,
        fileSize: updatedContent.content.fileSize,
        mimeType: mimeType,
        // Add explicit media type to help frontend render correctly
        mediaType:
          updatedContent.type === "video"
            ? "video"
            : updatedContent.type === "image"
            ? "image"
            : updatedContent.type === "audio"
            ? "audio"
            : "document",
        // Add flag to indicate if this is a downloadable file vs streamable content
        // Disable download for ALL videos (both uploaded and YouTube)
        isDownloadable:
          updatedContent.type !== "video" &&
          (updatedContent.type === "document" ||
            updatedContent.type === "audio" ||
            (updatedContent.type === "image" && mimeType !== "image/gif")),
        isStreamable:
          updatedContent.type === "video" || updatedContent.type === "audio",
        // Add specific video handling flags
        isYouTubeVideo: videoType === "youtube",
        isUploadedVideo: videoType === "uploaded",
      };

      res.json({
        success: true,
        message: "Content updated successfully",
        data: transformedContent,
      });
    } catch (error) {
      console.error("Error updating content:", error);
      res.status(500).json({
        success: false,
        message: "Error updating content",
        error: error.message,
      });
    }
  }
);

/**
 * @swagger
 * /api/elearning/content/{id}:
 *   delete:
 *     summary: Delete content (Teachers)
 *     tags: [E-Learning - Content]
 *     security:
 *       - bearerAuth: []
 */
router.delete(
  "/content/:id",
  protect,
  authorize("teacher", "branch-admin", "super-admin"),
  branchAuth,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { permanent = true } = req.query; // Default to permanent delete for teachers

      // Find existing content
      const existingContent = await CourseContent.findById(id);

      if (!existingContent) {
        return res.status(404).json({
          success: false,
          message: "Content not found",
        });
      }

      // Check if user has permission to delete
      if (
        existingContent.createdBy.toString() !== req.user._id.toString() &&
        !req.user.roles.includes("branch-admin") &&
        !req.user.roles.includes("super-admin")
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      if (permanent) {
        // Permanently delete and clean up Cloudflare materials
        console.log(
          "Permanently deleting content and cleaning up materials..."
        );

        // Delete associated materials from Cloudflare
        const filesToDelete = [];

        // Check materials array
        if (existingContent.materials && existingContent.materials.length > 0) {
          for (const material of existingContent.materials) {
            if (material.fileUrl) {
              filesToDelete.push(material.fileUrl);
            }
          }
        }

        // Check content object for file URLs
        if (existingContent.content) {
          if (existingContent.content.fileUrl) {
            filesToDelete.push(existingContent.content.fileUrl);
          }
          if (existingContent.content.imageUrl) {
            filesToDelete.push(existingContent.content.imageUrl);
          }
          if (existingContent.content.audioUrl) {
            filesToDelete.push(existingContent.content.audioUrl);
          }
        }

        // Delete all files from Cloudflare R2
        for (const fileUrl of filesToDelete) {
          try {
            await cloudflareService.deleteFile(fileUrl);
            console.log(`Deleted file from Cloudflare R2: ${fileUrl}`);
          } catch (error) {
            console.error(`Failed to delete file ${fileUrl}:`, error);
          }
        }

        // Delete associated video from Cloudflare Stream if it exists
        if (existingContent.content && existingContent.content.streamUid) {
          try {
            await cloudflareService.deleteFromStream(
              existingContent.content.streamUid
            );
            console.log(
              `Deleted video from Cloudflare Stream: ${existingContent.content.streamUid}`
            );
          } catch (error) {
            console.error(
              `Failed to delete video from stream ${existingContent.content.streamUid}:`,
              error
            );
          }
        }

        // Remove from module if associated
        if (existingContent.moduleId) {
          await LearningModule.findByIdAndUpdate(existingContent.moduleId, {
            $pull: { contentItems: existingContent._id },
          });
        }

        // Permanently delete from database
        await CourseContent.findByIdAndDelete(id);

        res.json({
          success: true,
          message: "Content permanently deleted and materials cleaned up",
        });
      } else {
        // Soft delete - update isPublished to false
        await CourseContent.findByIdAndUpdate(id, {
          isPublished: false,
          updatedAt: new Date(),
        });

        res.json({
          success: true,
          message: "Content deleted successfully",
        });
      }
    } catch (error) {
      console.error("Error deleting content:", error);
      res.status(500).json({
        success: false,
        message: "Error deleting content",
        error: error.message,
      });
    }
  }
);

// Delete individual material from content
router.delete(
  "/content/:contentId/materials/:materialId",
  protect,
  authorize("teacher", "branch-admin", "super-admin"),
  branchAuth,
  async (req, res) => {
    try {
      const { contentId, materialId } = req.params;

      // Find the content
      const content = await CourseContent.findById(contentId);
      if (!content) {
        return res.status(404).json({
          success: false,
          message: "Content not found",
        });
      }

      // Check if user has permission to modify this content
      if (
        content.createdBy.toString() !== req.user._id.toString() &&
        !req.user.roles.includes("branch-admin") &&
        !req.user.roles.includes("super-admin")
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      // Find the material to delete
      const materialIndex = content.materials.findIndex(
        (material) =>
          material.id === materialId || material._id?.toString() === materialId
      );

      if (materialIndex === -1) {
        return res.status(404).json({
          success: false,
          message: "Material not found",
        });
      }

      const material = content.materials[materialIndex];

      // Delete the file from Cloudflare if it exists
      const fileUrlToDelete = material.fileUrl || material.url;
      console.log("Material to delete:", {
        id: material.id,
        type: material.type,
        fileUrl: material.fileUrl,
        url: material.url,
        fileUrlToDelete,
      });

      if (fileUrlToDelete && material.type !== "link") {
        try {
          console.log(
            `Attempting to delete from Cloudflare: ${fileUrlToDelete}`
          );
          await cloudflareService.deleteFile(fileUrlToDelete);
          console.log(
            `Deleted material file from Cloudflare R2: ${fileUrlToDelete}`
          );
        } catch (error) {
          console.error(
            `Failed to delete material file ${fileUrlToDelete}:`,
            error
          );
          // Don't fail the operation if file deletion fails
        }
      } else {
        console.log(
          "Skipping Cloudflare deletion - no file URL or it's a link"
        );
      }

      // Remove the material from the array
      content.materials.splice(materialIndex, 1);

      // Save the updated content
      await content.save();

      res.json({
        success: true,
        message: "Material deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting material:", error);
      res.status(500).json({
        success: false,
        message: "Error deleting material",
        error: error.message,
      });
    }
  }
);

// Test route to debug middleware issues
router.post("/content-test", async (req, res) => {
  console.log("=== TEST ROUTE HIT (NO MIDDLEWARE) ===");
  console.log("Request body:", req.body);
  res.json({
    success: true,
    message: "Test route working - no middleware",
    data: { received: req.body },
  });
});

// Test route with just protect middleware
router.post("/content-test-auth", protect, async (req, res) => {
  console.log("=== TEST ROUTE HIT (WITH PROTECT) ===");
  console.log(
    "User:",
    req.user
      ? { id: req.user._id, roles: req.user.roles, branchId: req.user.branchId }
      : "No user"
  );
  console.log("Request body:", req.body);
  res.json({
    success: true,
    message: "Test route working - with auth",
    data: { received: req.body, user: req.user ? req.user._id : null },
  });
});

// Test route with protect and authorize middleware
router.post(
  "/content-test-authorize",
  protect,
  authorize("teacher", "branch-admin", "super-admin"),
  async (req, res) => {
    console.log("=== TEST ROUTE HIT (WITH PROTECT + AUTHORIZE) ===");
    console.log(
      "User:",
      req.user
        ? {
            id: req.user._id,
            roles: req.user.roles,
            branchId: req.user.branchId,
          }
        : "No user"
    );
    console.log("Request body:", req.body);
    res.json({
      success: true,
      message: "Test route working - with auth + authorize",
      data: { received: req.body, user: req.user ? req.user._id : null },
    });
  }
);

// Test route with all middleware except validation
router.post(
  "/content-test-full",
  protect,
  authorize("teacher", "branch-admin", "super-admin"),
  branchAuth,
  autoAssociateBranch,
  logBranchAdminAction,
  async (req, res) => {
    console.log("=== TEST ROUTE HIT (WITH ALL MIDDLEWARE) ===");
    console.log(
      "User:",
      req.user
        ? {
            id: req.user._id,
            roles: req.user.roles,
            branchId: req.user.branchId,
          }
        : "No user"
    );
    console.log("Request body:", req.body);
    res.json({
      success: true,
      message: "Test route working - with all middleware",
      data: { received: req.body, user: req.user ? req.user._id : null },
    });
  }
);

// Test individual middleware
router.post(
  "/content-test-branch-auth",
  protect,
  authorize("teacher", "branch-admin", "super-admin"),
  branchAuth,
  async (req, res) => {
    console.log("=== TEST ROUTE HIT (WITH BRANCH AUTH) ===");
    console.log(
      "User:",
      req.user
        ? {
            id: req.user._id,
            roles: req.user.roles,
            branchId: req.user.branchId,
          }
        : "No user"
    );
    console.log("Request body:", req.body);
    res.json({
      success: true,
      message: "Test route working - with branchAuth",
      data: { received: req.body, user: req.user ? req.user._id : null },
    });
  }
);

router.post(
  "/content-test-auto-associate",
  protect,
  authorize("teacher", "branch-admin", "super-admin"),
  branchAuth,
  autoAssociateBranch,
  async (req, res) => {
    console.log("=== TEST ROUTE HIT (WITH AUTO ASSOCIATE) ===");
    console.log(
      "User:",
      req.user
        ? {
            id: req.user._id,
            roles: req.user.roles,
            branchId: req.user.branchId,
          }
        : "No user"
    );
    console.log("Request body:", req.body);
    res.json({
      success: true,
      message: "Test route working - with autoAssociateBranch",
      data: { received: req.body, user: req.user ? req.user._id : null },
    });
  }
);

// ===========================
// ALL COURSES FOR QUIZ CREATION
// ===========================

/**
 * @swagger
 * /api/elearning/all-courses:
 *   get:
 *     summary: Get all courses (both e-learning and regular) for quiz creation
 *     tags: [E-Learning - Courses]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All courses retrieved successfully
 */
router.get(
  "/all-courses",
  protect,
  authorize("teacher", "admin", "branch-admin", "super-admin"),
  branchAuth,
  async (req, res) => {
    try {
      const { ECourse } = require("../models/elearning");
      const Course = require("../models/Course");

      console.log(
        "Loading courses for user:",
        req.user._id,
        "branch:",
        req.user.branchId
      );

      // Get e-learning courses
      const eCourses = await ECourse.find({
        instructor: req.user._id,
        branchId: req.user.branchId,
        status: { $in: ["published", "draft"] },
      }).select("_id title description category level status");

      console.log("Found e-learning courses:", eCourses.length);

      // Get regular courses taught by this teacher
      const regularCourses = await Course.find({
        branchId: req.user.branchId,
        // You might need to adjust this filter based on how teachers are associated with courses
        // For now, let's get all courses from the branch
      }).select("_id name description category level code");

      console.log("Found regular courses:", regularCourses.length);

      // Format the response to have a consistent structure
      const formattedECourses = eCourses.map((course) => ({
        _id: course._id,
        title: course.title,
        description: course.description,
        category: course.category,
        level: course.level,
        type: "e-learning",
        status: course.status,
      }));

      const formattedRegularCourses = regularCourses.map((course) => ({
        _id: course._id,
        title: course.name,
        description: course.description,
        category: course.category,
        level: course.level,
        code: course.code,
        type: "regular",
      }));

      const allCourses = [...formattedECourses, ...formattedRegularCourses];

      console.log("Returning total courses:", allCourses.length);

      res.json({
        success: true,
        data: allCourses,
        count: allCourses.length,
      });
    } catch (error) {
      console.error("Error fetching all courses:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching courses",
        error: error.message,
      });
    }
  }
);

// ===========================
// QUIZ ROUTES (modular mount)
// ===========================

// Mount the dedicated quiz routes router which contains
// full quiz management endpoints (questions, analytics, etc.).
const quizRoutes = require("./elearning/quizRoutes");
router.use("/quizzes", quizRoutes);

// Quiz Attempt Routes
const quizController = require("../controllers/elearning/quizController");

// Student quiz start route - returns quiz, questions and attempt data
router.post(
  "/quiz/:id/start",
  protect,
  authorize("student"),
  quizController.startQuizWithData
);

// Student quiz answer route - save answer during quiz
router.post(
  "/quiz/:id/answer",
  protect,
  authorize("student"),
  quizController.saveQuizAnswer
);

// Student quiz submit route - submit completed quiz
router.post(
  "/quiz/:id/submit",
  protect,
  authorize("student"),
  quizController.submitQuiz
);

router.post(
  "/quiz-attempts/:id/submit",
  protect,
  authorize("student"),
  quizController.submitQuizAttempt
);

router.get(
  "/quiz-attempts/:id",
  protect,
  authorize("student"),
  quizController.getQuizAttempt
);

router.post(
  "/quiz-attempts/:id/answers",
  protect,
  authorize("student"),
  quizController.submitAnswer
);

// ===========================
// LIVE SESSIONS ROUTES
// ===========================

/**
 * @swagger
 * /api/elearning/live-sessions:
 *   post:
 *     summary: Schedule a live session
 *     tags: [E-Learning - Live Sessions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - courseId
 *               - startAt
 *               - endAt
 *             properties:
 *               courseId:
 *                 type: string
 *               moduleId:
 *                 type: string
 *               contentId:
 *                 type: string
 *               startAt:
 *                 type: string
 *                 format: date-time
 *               endAt:
 *                 type: string
 *                 format: date-time
 *               timezone:
 *                 type: string
 *                 default: UTC
 *   get:
 *     summary: Get user's live sessions
 *     tags: [E-Learning - Live Sessions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [scheduled, cancelled, completed]
 *           default: scheduled
 *       - in: query
 *         name: upcoming
 *         schema:
 *           type: boolean
 *           default: true
 */
router.post(
  "/live-sessions",
  protect,
  authorize("teacher"),
  [
    body("courseId").isMongoId().withMessage("Valid course ID is required"),
    body("moduleId")
      .optional()
      .isMongoId()
      .withMessage("Valid module ID is required"),
    body("contentId").optional().isString(),
    body("startAt").isISO8601().withMessage("Valid start time is required"),
    body("endAt").isISO8601().withMessage("Valid end time is required"),
    body("timezone").optional().isString(),
  ],
  liveSessionController.scheduleLiveSession
);

router.get(
  "/live-sessions",
  protect,
  liveSessionController.getUserLiveSessions
);

/**
 * @swagger
 * /api/elearning/live-sessions/{id}:
 *   patch:
 *     summary: Update a live session
 *     tags: [E-Learning - Live Sessions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               startAt:
 *                 type: string
 *                 format: date-time
 *               endAt:
 *                 type: string
 *                 format: date-time
 *               timezone:
 *                 type: string
 *   delete:
 *     summary: Cancel a live session
 *     tags: [E-Learning - Live Sessions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 */
router.patch(
  "/live-sessions/:id",
  protect,
  authorize("teacher"),
  [
    body("startAt")
      .optional()
      .isISO8601()
      .withMessage("Valid start time required"),
    body("endAt").optional().isISO8601().withMessage("Valid end time required"),
    body("timezone").optional().isString(),
  ],
  liveSessionController.updateLiveSession
);

router.delete(
  "/live-sessions/:id",
  protect,
  authorize("teacher"),
  liveSessionController.cancelLiveSession
);

/**
 * @swagger
 * /api/elearning/courses/{courseId}/live-sessions:
 *   get:
 *     summary: Get live sessions for a course (teacher view)
 *     tags: [E-Learning - Live Sessions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 */
router.get(
  "/courses/:courseId/live-sessions",
  protect,
  authorize("teacher"),
  liveSessionController.getCourseLiveSessions
);

// Note: quiz routes are handled by the mounted router above (./elearning/quizRoutes)

// ===========================
// RATING ROUTES
// ===========================

const ratingController = require("../controllers/elearning/ratingController");
const certificateController = require("../controllers/elearning/certificateController");

/**
 * @swagger
 * /api/elearning/courses/{courseId}/ratings:
 *   post:
 *     summary: Add or update a course rating
 *     tags: [E-Learning - Ratings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rating
 *             properties:
 *               rating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               review:
 *                 type: string
 *                 maxlength: 1000
 *   get:
 *     summary: Get all ratings for a course
 *     tags: [E-Learning - Ratings]
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           default: "-createdAt"
 *   delete:
 *     summary: Delete user's rating for a course
 *     tags: [E-Learning - Ratings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 */
router.post(
  "/courses/:courseId/ratings",
  protect,
  authorize("student"),
  [
    body("rating")
      .isInt({ min: 1, max: 5 })
      .withMessage("Rating must be between 1 and 5"),
    body("review")
      .optional()
      .isLength({ max: 1000 })
      .withMessage("Review cannot exceed 1000 characters"),
  ],
  ratingController.addOrUpdateRating
);

router.get("/courses/:courseId/ratings", ratingController.getCourseRatings);

router.delete(
  "/courses/:courseId/ratings",
  protect,
  authorize("student"),
  ratingController.deleteRating
);

/**
 * @swagger
 * /api/elearning/courses/{courseId}/rating-summary:
 *   get:
 *     summary: Get rating summary for a course
 *     tags: [E-Learning - Ratings]
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 */
router.get(
  "/courses/:courseId/ratings/summary",
  ratingController.getCourseRatingSummary
);

/**
 * @swagger
 * /api/elearning/certificates:
 *   get:
 *     summary: Get student's certificates
 *     tags: [E-Learning - Certificates]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Certificates retrieved successfully
 *       404:
 *         description: Student profile not found
 */
router.get(
  "/certificates",
  protect,
  authorize("student"),
  certificateController.getStudentCertificates
);

/**
 * @swagger
 * /api/elearning/certificates/generate:
 *   post:
 *     summary: Generate certificate for completed course
 *     tags: [E-Learning - Certificates]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - courseId
 *             properties:
 *               courseId:
 *                 type: string
 *                 description: ID of the completed course
 *     responses:
 *       201:
 *         description: Certificate generated successfully
 *       403:
 *         description: Course not completed or access denied
 *       404:
 *         description: Student or course not found
 */
router.post(
  "/certificates/generate",
  protect,
  authorize("student"),
  [body("courseId").isMongoId().withMessage("Valid course ID is required")],
  certificateController.generateCertificate
);

/**
 * @swagger
 * /api/elearning/certificates/{certificateId}:
 *   get:
 *     summary: Get certificate details
 *     tags: [E-Learning - Certificates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: certificateId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Certificate details retrieved successfully
 *       404:
 *         description: Certificate not found
 */
router.get(
  "/certificates/:certificateId",
  protect,
  authorize("student"),
  certificateController.getCertificate
);

/**
 * @swagger
 * /api/elearning/certificates/{certificateId}/download:
 *   get:
 *     summary: Get certificate download URL
 *     tags: [E-Learning - Certificates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: certificateId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Download URL generated successfully
 *       404:
 *         description: Certificate not found
 */
router.get(
  "/certificates/:certificateId/download",
  protect,
  authorize("student"),
  certificateController.downloadCertificate
);

/**
 * @swagger
 * /api/elearning/certificates/verify/{verificationCode}:
 *   get:
 *     summary: Verify certificate by verification code
 *     tags: [E-Learning - Certificates]
 *     parameters:
 *       - in: path
 *         name: verificationCode
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Certificate verified successfully
 *       404:
 *         description: Certificate not found or invalid code
 */
router.get(
  "/certificates/verify/:verificationCode",
  certificateController.verifyCertificate
);

/**
 * @swagger
 * /api/elearning/certificates/download/{fileName}:
 *   get:
 *     summary: Download certificate file (local development)
 *     tags: [E-Learning - Certificates]
 *     parameters:
 *       - in: path
 *         name: fileName
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Certificate file
 */
router.get("/certificates/download/:fileName", (req, res) => {
  const fileName = req.params.fileName;
  const filePath = path.join(__dirname, "../certificates", fileName);

  // Check if file exists
  if (fs.existsSync(filePath)) {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } else {
    res.status(404).json({
      success: false,
      message: "Certificate file not found",
    });
  }
});

/**
 * @swagger
 * /api/elearning/analytics/dashboard:
 *   get:
 *     summary: Get analytics dashboard overview
 *     tags: [E-Learning - Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Analytics dashboard data retrieved successfully
 */
router.get(
  "/analytics/dashboard",
  protect,
  authorize("teacher", "admin", "superadmin"),
  analyticsController.getAnalyticsDashboard
);

/**
 * @swagger
 * /api/elearning/analytics/student-progress:
 *   get:
 *     summary: Get student progress analytics
 *     tags: [E-Learning - Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: courseId
 *         in: query
 *         schema:
 *           type: string
 *         description: Filter by course ID
 *       - name: studentId
 *         in: query
 *         schema:
 *           type: string
 *         description: Filter by student ID
 *       - name: branchId
 *         in: query
 *         schema:
 *           type: string
 *         description: Filter by branch ID
 *     responses:
 *       200:
 *         description: Student progress analytics retrieved successfully
 */
router.get(
  "/analytics/student-progress",
  protect,
  authorize("teacher", "admin", "superadmin"),
  analyticsController.getStudentProgressAnalytics
);

/**
 * @swagger
 * /api/elearning/analytics/course-completion:
 *   get:
 *     summary: Get course completion rate analytics
 *     tags: [E-Learning - Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: courseId
 *         in: query
 *         schema:
 *           type: string
 *         description: Filter by course ID
 *       - name: branchId
 *         in: query
 *         schema:
 *           type: string
 *         description: Filter by branch ID
 *       - name: startDate
 *         in: query
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by start date
 *       - name: endDate
 *         in: query
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by end date
 *     responses:
 *       200:
 *         description: Course completion analytics retrieved successfully
 */
router.get(
  "/analytics/course-completion",
  protect,
  authorize("teacher", "admin", "superadmin"),
  analyticsController.getCourseCompletionAnalytics
);

/**
 * @swagger
 * /api/elearning/analytics/quiz-performance:
 *   get:
 *     summary: Get quiz performance analytics
 *     tags: [E-Learning - Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: quizId
 *         in: query
 *         schema:
 *           type: string
 *         description: Filter by quiz ID
 *       - name: courseId
 *         in: query
 *         schema:
 *           type: string
 *         description: Filter by course ID
 *       - name: branchId
 *         in: query
 *         schema:
 *           type: string
 *         description: Filter by branch ID
 *       - name: startDate
 *         in: query
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by start date
 *       - name: endDate
 *         in: query
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by end date
 *     responses:
 *       200:
 *         description: Quiz performance analytics retrieved successfully
 */
router.get(
  "/analytics/quiz-performance",
  protect,
  authorize("teacher", "admin", "superadmin"),
  analyticsController.getQuizPerformanceAnalytics
);

// Discussion Routes
/**
 * @swagger
 * /api/elearning/courses/{courseId}/discussions:
 *   get:
 *     summary: Get all discussions for a course
 *     tags: [Discussions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: courseId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *           default: 1
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 20
 *       - name: type
 *         in: query
 *         schema:
 *           type: string
 *           enum: [general, question, announcement, assignment_discussion, peer_review]
 *       - name: category
 *         in: query
 *         schema:
 *           type: string
 *           enum: [course_content, technical_help, study_group, project_collaboration, general_chat]
 *       - name: search
 *         in: query
 *         schema:
 *           type: string
 *       - name: sortBy
 *         in: query
 *         schema:
 *           type: string
 *           enum: [recent, popular, oldest]
 *     responses:
 *       200:
 *         description: Discussions retrieved successfully
 */
router.get(
  "/courses/:courseId/discussions",
  protect,
  discussionController.getCourseDiscussions
);

/**
 * @swagger
 * /api/elearning/courses/{courseId}/discussions:
 *   post:
 *     summary: Create a new discussion
 *     tags: [Discussions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: courseId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - content
 *             properties:
 *               title:
 *                 type: string
 *                 maxLength: 200
 *               description:
 *                 type: string
 *                 maxLength: 1000
 *               content:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [general, question, announcement, assignment_discussion, peer_review]
 *                 default: general
 *               category:
 *                 type: string
 *                 enum: [course_content, technical_help, study_group, project_collaboration, general_chat]
 *                 default: course_content
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               visibility:
 *                 type: string
 *                 enum: [public, class_only, module_only, teacher_only]
 *                 default: class_only
 *     responses:
 *       201:
 *         description: Discussion created successfully
 */
router.post(
  "/courses/:courseId/discussions",
  protect,
  [
    body("title")
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage("Title is required and must be less than 200 characters"),
    body("content")
      .trim()
      .isLength({ min: 1 })
      .withMessage("Content is required"),
  ],
  discussionController.createDiscussion
);

/**
 * @swagger
 * /api/elearning/discussions/{discussionId}:
 *   get:
 *     summary: Get a single discussion with replies
 *     tags: [Discussions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: discussionId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Discussion retrieved successfully
 */
router.get(
  "/discussions/:discussionId",
  protect,
  discussionController.getDiscussion
);

/**
 * @swagger
 * /api/elearning/discussions/{discussionId}:
 *   put:
 *     summary: Update a discussion
 *     tags: [Discussions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: discussionId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 maxLength: 200
 *               description:
 *                 type: string
 *                 maxLength: 1000
 *               content:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [general, question, announcement, assignment_discussion, peer_review]
 *               category:
 *                 type: string
 *                 enum: [course_content, technical_help, study_group, project_collaboration, general_chat]
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               visibility:
 *                 type: string
 *                 enum: [public, class_only, module_only, teacher_only]
 *     responses:
 *       200:
 *         description: Discussion updated successfully
 */
router.put(
  "/discussions/:discussionId",
  protect,
  discussionController.updateDiscussion
);

/**
 * @swagger
 * /api/elearning/discussions/{discussionId}:
 *   delete:
 *     summary: Delete a discussion
 *     tags: [Discussions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: discussionId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Discussion deleted successfully
 */
router.delete(
  "/discussions/:discussionId",
  protect,
  discussionController.deleteDiscussion
);

/**
 * @swagger
 * /api/elearning/discussions/{discussionId}/vote:
 *   post:
 *     summary: Vote on a discussion
 *     tags: [Discussions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: discussionId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - voteType
 *             properties:
 *               voteType:
 *                 type: string
 *                 enum: [up, down]
 *     responses:
 *       200:
 *         description: Vote recorded successfully
 */
router.post(
  "/discussions/:discussionId/vote",
  protect,
  discussionController.voteDiscussion
);

/**
 * @swagger
 * /api/elearning/discussions/{discussionId}/pin:
 *   post:
 *     summary: Toggle pin status of a discussion (teacher only)
 *     tags: [Discussions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: discussionId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Discussion pin status updated successfully
 */
router.post(
  "/discussions/:discussionId/pin",
  protect,
  authorize("teacher"),
  discussionController.togglePinDiscussion
);

/**
 * @swagger
 * /api/elearning/discussions/{discussionId}/moderate:
 *   post:
 *     summary: Moderate a discussion (teacher only)
 *     tags: [Discussions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: discussionId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - action
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [approve, reject, delete]
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Discussion moderated successfully
 */
router.post(
  "/discussions/:discussionId/moderate",
  protect,
  authorize("teacher"),
  discussionController.moderateDiscussion
);

/**
 * @swagger
 * /api/elearning/discussions/{discussionId}/replies:
 *   post:
 *     summary: Create a reply to a discussion
 *     tags: [Discussion Replies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: discussionId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *               parentReplyId:
 *                 type: string
 *                 description: ID of parent reply for nested replies
 *     responses:
 *       201:
 *         description: Reply created successfully
 */
router.post(
  "/discussions/:discussionId/replies",
  protect,
  [
    body("content")
      .trim()
      .isLength({ min: 1 })
      .withMessage("Content is required"),
  ],
  discussionController.createReply
);

/**
 * @swagger
 * /api/elearning/replies/{replyId}:
 *   put:
 *     summary: Update a reply
 *     tags: [Discussion Replies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: replyId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *     responses:
 *       200:
 *         description: Reply updated successfully
 */
router.put(
  "/replies/:replyId",
  protect,
  [
    body("content")
      .trim()
      .isLength({ min: 1 })
      .withMessage("Content is required"),
  ],
  discussionController.updateReply
);

/**
 * @swagger
 * /api/elearning/replies/{replyId}:
 *   delete:
 *     summary: Delete a reply
 *     tags: [Discussion Replies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: replyId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Reply deleted successfully
 */
router.delete("/replies/:replyId", protect, discussionController.deleteReply);

/**
 * @swagger
 * /api/elearning/replies/{replyId}/vote:
 *   post:
 *     summary: Vote on a reply
 *     tags: [Discussion Replies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: replyId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - voteType
 *             properties:
 *               voteType:
 *                 type: string
 *                 enum: [like, dislike]
 *     responses:
 *       200:
 *         description: Vote recorded successfully
 */
router.post("/replies/:replyId/vote", protect, discussionController.voteReply);

/**
 * @swagger
 * /api/elearning/replies/{replyId}/moderate:
 *   post:
 *     summary: Moderate a reply (teacher only)
 *     tags: [Discussion Replies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: replyId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - action
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [approve, reject]
 *     responses:
 *       200:
 *         description: Reply moderated successfully
 */
router.post(
  "/replies/:replyId/moderate",
  protect,
  authorize("teacher"),
  discussionController.moderateReply
);

module.exports = router;
