const express = require("express");
const { body } = require("express-validator");
const {
  createCourse,
  getCourses,
  getCourse,
  updateCourse,
  deleteCourse,
  getCoursesByLevel,
} = require("../controllers/courseController");
const { protect, requireAdmin } = require("../middlewares/auth");
const { branchAuth } = require("../middlewares/branchAuth");
const {
  autoAssociateBranch,
  validateBranchOwnership,
  filterByBranch,
  logBranchAdminAction,
} = require("../middlewares/branchAutoAssociation");
const Course = require("../models/Course");
const cloudflareService = require("../services/cloudflareService");

/**
 * @swagger
 * components:
 *   schemas:
 *     Course:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           description: Unique identifier for the course
 *         name:
 *           type: string
 *           description: Name of the course
 *         level:
 *           type: string
 *           enum: [Begginner, Intermediate, Advanced]
 *           description: Course difficulty level
 *         category:
 *           type: string
 *           enum: [core, elective, practical, theory]
 *           description: Course category
 *         credits:
 *           type: number
 *           minimum: 0.5
 *           maximum: 10
 *           description: Number of credits for the course
 *         description:
 *           type: string
 *           description: Course description
 *         prerequisites:
 *           type: array
 *           items:
 *             type: string
 *           description: Array of prerequisite course IDs
 *         branch:
 *           type: string
 *           description: Branch ID this course belongs to
 *         isActive:
 *           type: boolean
 *           description: Whether the course is active
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *       example:
 *         _id: 64f7c9b8e123456789abcdef
 *         name: Advanced Mathematics
 *         level: Advanced
 *         category: core
 *         credits: 3
 *         description: Advanced mathematical concepts and applications
 *         isActive: true
 *
 *     CreateCourseRequest:
 *       type: object
 *       required:
 *         - name
 *         - level
 *       properties:
 *         name:
 *           type: string
 *           minLength: 2
 *           maxLength: 100
 *           description: Name of the course
 *         level:
 *           type: string
 *           enum: [Begginner, Intermediate, Advanced]
 *           description: Course difficulty level
 *         category:
 *           type: string
 *           enum: [core, elective, practical, theory]
 *           description: Course category (optional)
 *         credits:
 *           type: number
 *           minimum: 0.5
 *           maximum: 10
 *           description: Number of credits (optional)
 *         description:
 *           type: string
 *           description: Course description (optional)
 *         prerequisites:
 *           type: array
 *           items:
 *             type: string
 *           description: Array of prerequisite course IDs (optional)
 *       example:
 *         name: Advanced Mathematics
 *         level: Advanced
 *         category: core
 *         credits: 3
 *         description: Advanced mathematical concepts and applications
 */

/**
 * @swagger
 * tags:
 *   name: Course Management
 *   description: Course creation, management, and level-based organization
 */

const router = express.Router();

// Validation rules
const courseValidation = [
  body("name")
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Course name must be between 2 and 100 characters"),
  body("level")
    .isIn(["Begginner", "Intermediate", "Advanced"])
    .withMessage("Invalid course level"),
  body("category")
    .optional()
    .isIn(["core", "elective", "practical", "theory"])
    .withMessage("Invalid course category"),
  body("credits")
    .optional()
    .isFloat({ min: 0.5, max: 10 })
    .withMessage("Credits must be between 0.5 and 10"),
];

// Apply middleware to all routes
router.use(protect);
router.use(branchAuth);

// Level-specific routes (should be before :id routes)

/**
 * @swagger
 * /courses/level/{level}:
 *   get:
 *     summary: Get courses by level
 *     tags: [Course Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: level
 *         required: true
 *         schema:
 *           type: string
 *           enum: [Begginner, Intermediate, Advanced]
 *         description: Course level
 *     responses:
 *       200:
 *         description: List of courses for the specified level
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
 *                     $ref: '#/components/schemas/Course'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get("/level/:level", getCoursesByLevel);

// Main CRUD routes

/**
 * @swagger
 * /courses:
 *   post:
 *     summary: Create a new course (Admin only)
 *     tags: [Course Management]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateCourseRequest'
 *     responses:
 *       201:
 *         description: Course created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Course'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.post(
  "/",
  requireAdmin,
  autoAssociateBranch,
  logBranchAdminAction("CREATE_COURSE"),
  courseValidation,
  createCourse
);

/**
 * @swagger
 * /courses:
 *   get:
 *     summary: Get all courses
 *     tags: [Course Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: level
 *         schema:
 *           type: string
 *           enum: [Begginner, Intermediate, Advanced]
 *         description: Filter by course level
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [core, elective, practical, theory]
 *         description: Filter by course category
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by course name
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: List of courses
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
 *                     $ref: '#/components/schemas/Course'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     currentPage:
 *                       type: number
 *                     totalPages:
 *                       type: number
 *                     totalItems:
 *                       type: number
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get("/", filterByBranch, getCourses);

/**
 * @swagger
 * /courses/{id}:
 *   get:
 *     summary: Get a specific course by ID
 *     tags: [Course Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Course ID
 *     responses:
 *       200:
 *         description: Course details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Course'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get("/:id", getCourse);

/**
 * @swagger
 * /courses/{id}:
 *   put:
 *     summary: Update a course (Admin only)
 *     tags: [Course Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Course ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateCourseRequest'
 *     responses:
 *       200:
 *         description: Course updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Course'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.put(
  "/:id",
  requireAdmin,
  validateBranchOwnership(Course),
  logBranchAdminAction("UPDATE_COURSE"),
  updateCourse
);

/**
 * @swagger
 * /courses/{id}:
 *   delete:
 *     summary: Delete a course (Admin only)
 *     tags: [Course Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Course ID
 *     responses:
 *       200:
 *         description: Course deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.delete(
  "/:id",
  requireAdmin,
  validateBranchOwnership(Course),
  logBranchAdminAction("DELETE_COURSE"),
  deleteCourse
);

// Course Materials Routes
router.get(
  "/:id/materials",
  protect,
  branchAuth,
  filterByBranch,
  async (req, res) => {
    try {
      const course = await Course.findOne({
        _id: req.params.id,
        branchId: req.branchId,
      });

      if (!course) {
        return res.status(404).json({
          success: false,
          message: "Course not found",
        });
      }

      res.json({
        success: true,
        materials: course.resources.materials || [],
      });
    } catch (error) {
      console.error("Get course materials error:", error);
      res.status(500).json({
        success: false,
        message: "Server error while fetching course materials",
      });
    }
  }
);

router.post(
  "/:id/materials",
  protect,
  branchAuth,
  validateBranchOwnership(Course),
  async (req, res) => {
    try {
      const { title, description, type, fileUrl, content } = req.body;

      const course = await Course.findOne({
        _id: req.params.id,
        branchId: req.branchId,
      });

      if (!course) {
        return res.status(404).json({
          success: false,
          message: "Course not found",
        });
      }

      const newMaterial = {
        title,
        description,
        type,
        fileUrl,
        content,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      course.resources.materials.push(newMaterial);
      await course.save();

      res.status(201).json({
        success: true,
        message: "Material added successfully",
        material: newMaterial,
      });
    } catch (error) {
      console.error("Add course material error:", error);
      res.status(500).json({
        success: false,
        message: "Server error while adding course material",
      });
    }
  }
);

router.put(
  "/:id/materials/:materialId",
  protect,
  branchAuth,
  validateBranchOwnership(Course),
  async (req, res) => {
    try {
      const { title, description, type, fileUrl, content } = req.body;

      const course = await Course.findOne({
        _id: req.params.id,
        branchId: req.branchId,
      });

      if (!course) {
        return res.status(404).json({
          success: false,
          message: "Course not found",
        });
      }

      const material = course.resources.materials.id(req.params.materialId);

      if (!material) {
        return res.status(404).json({
          success: false,
          message: "Material not found",
        });
      }

      // Delete old file from R2 if fileUrl is changing and old file exists
      if (material.fileUrl && fileUrl !== material.fileUrl) {
        try {
          await cloudflareService.deleteFile(material.fileUrl);
        } catch (deleteError) {
          console.error("Error deleting old file from R2:", deleteError);
          // Continue with update even if old file deletion fails
        }
      }

      material.title = title;
      material.description = description;
      material.type = type;
      material.fileUrl = fileUrl;
      material.content = content;
      material.updatedAt = new Date();

      await course.save();

      res.json({
        success: true,
        message: "Material updated successfully",
        material,
      });
    } catch (error) {
      console.error("Update course material error:", error);
      res.status(500).json({
        success: false,
        message: "Server error while updating course material",
      });
    }
  }
);

router.delete(
  "/:id/materials/:materialId",
  protect,
  branchAuth,
  validateBranchOwnership(Course),
  async (req, res) => {
    try {
      const course = await Course.findOne({
        _id: req.params.id,
        branchId: req.branchId,
      });

      if (!course) {
        return res.status(404).json({
          success: false,
          message: "Course not found",
        });
      }

      const material = course.resources.materials.id(req.params.materialId);

      if (!material) {
        return res.status(404).json({
          success: false,
          message: "Material not found",
        });
      }

      // Delete file from R2 storage if it exists
      if (material.fileUrl) {
        try {
          await cloudflareService.deleteFile(material.fileUrl);
        } catch (deleteError) {
          console.error("Error deleting file from R2:", deleteError);
          // Continue with database deletion even if R2 deletion fails
        }
      }

      course.resources.materials.pull(req.params.materialId);
      await course.save();

      res.json({
        success: true,
        message: "Material deleted successfully",
      });
    } catch (error) {
      console.error("Delete course material error:", error);
      res.status(500).json({
        success: false,
        message: "Server error while deleting course material",
      });
    }
  }
);

module.exports = router;
