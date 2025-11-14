const express = require("express");
const { body } = require("express-validator");
const {
  getActiveCourses,
  getAllCourses,
  getCourse,
  createCourse,
  updateCourse,
  deleteCourse,
  updateCourseOrder,
  activateCourse,
  deactivateCourse,
} = require("../controllers/publicCourseController");
const { protect, requireSuperAdmin } = require("../middlewares/auth");

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     PublicCourse:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         title:
 *           type: string
 *         description:
 *           type: string
 *         shortDescription:
 *           type: string
 *         image:
 *           type: object
 *           properties:
 *             url:
 *               type: string
 *             alt:
 *               type: string
 *         category:
 *           type: string
 *           enum: [language, technology, business, design, other]
 *         level:
 *           type: string
 *           enum: [Beginner, Intermediate, Advanced]
 *         duration:
 *           type: string
 *         modules:
 *           type: array
 *           items:
 *             type: string
 *         fee:
 *           type: object
 *           properties:
 *             amount:
 *               type: number
 *             currency:
 *               type: string
 *             formatted:
 *               type: string
 *         status:
 *           type: string
 *           enum: [active, inactive]
 *         displayOrder:
 *           type: number
 *         featured:
 *           type: boolean
 */

/**
 * @swagger
 * /api/landing/courses:
 *   get:
 *     summary: Get active courses for landing page
 *     tags: [Landing Page - Courses]
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [language, technology, business, design, other]
 *         description: Filter by category
 *       - in: query
 *         name: featured
 *         schema:
 *           type: boolean
 *         description: Return only featured courses
 *     responses:
 *       200:
 *         description: Courses retrieved successfully
 */
router.get("/", getActiveCourses);

/**
 * @swagger
 * /api/landing/courses/admin:
 *   get:
 *     summary: Get all courses (admin)
 *     tags: [Landing Page - Courses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive]
 *     responses:
 *       200:
 *         description: Courses retrieved successfully
 */
router.get("/admin", protect, requireSuperAdmin, getAllCourses);

/**
 * @swagger
 * /api/landing/courses/{id}:
 *   get:
 *     summary: Get single course
 *     tags: [Landing Page - Courses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Course retrieved successfully
 *       404:
 *         description: Course not found
 */
router.get("/:id", protect, requireSuperAdmin, getCourse);

/**
 * @swagger
 * /api/landing/courses:
 *   post:
 *     summary: Create new course
 *     tags: [Landing Page - Courses]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - description
 *             properties:
 *               title:
 *                 type: string
 *                 maxLength: 100
 *               description:
 *                 type: string
 *                 maxLength: 500
 *               shortDescription:
 *                 type: string
 *                 maxLength: 150
 *               image:
 *                 type: object
 *                 properties:
 *                   url:
 *                     type: string
 *                   alt:
 *                     type: string
 *                     maxLength: 100
 *               category:
 *                 type: string
 *                 enum: [language, technology, business, design, other]
 *                 default: other
 *               level:
 *                 type: string
 *                 enum: [Beginner, Intermediate, Advanced]
 *                 default: Beginner
 *               duration:
 *                 type: string
 *                 maxLength: 50
 *               modules:
 *                 type: array
 *                 items:
 *                   type: string
 *                   maxLength: 100
 *               fee:
 *                 type: object
 *                 properties:
 *                   amount:
 *                     type: number
 *                     minimum: 0
 *                   currency:
 *                     type: string
 *                     default: KES
 *                   formatted:
 *                     type: string
 *               displayOrder:
 *                 type: number
 *                 minimum: 0
 *               featured:
 *                 type: boolean
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *                 default: active
 *     responses:
 *       201:
 *         description: Course created successfully
 *       400:
 *         description: Validation error
 */
router.post(
  "/",
  protect,
  requireSuperAdmin,
  [
    body("title")
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage("Title is required and must be less than 100 characters"),
    body("description")
      .trim()
      .isLength({ min: 1, max: 500 })
      .withMessage(
        "Description is required and must be less than 500 characters"
      ),
    body("shortDescription")
      .optional()
      .isLength({ max: 150 })
      .withMessage("Short description must be less than 150 characters"),
    body("image.url").optional().isURL().withMessage("Image URL must be valid"),
    body("image.alt")
      .optional()
      .isLength({ max: 100 })
      .withMessage("Image alt text must be less than 100 characters"),
    body("duration")
      .optional()
      .isLength({ max: 50 })
      .withMessage("Duration must be less than 50 characters"),
    body("fee.amount")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Fee amount must be a positive number"),
    body("displayOrder")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Display order must be a non-negative integer"),
  ],
  createCourse
);

/**
 * @swagger
 * /api/landing/courses/{id}:
 *   put:
 *     summary: Update course
 *     tags: [Landing Page - Courses]
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
 *               title:
 *                 type: string
 *                 maxLength: 100
 *               description:
 *                 type: string
 *                 maxLength: 500
 *               shortDescription:
 *                 type: string
 *                 maxLength: 150
 *               image:
 *                 type: object
 *                 properties:
 *                   url:
 *                     type: string
 *                   alt:
 *                     type: string
 *                     maxLength: 100
 *               category:
 *                 type: string
 *                 enum: [language, technology, business, design, other]
 *               level:
 *                 type: string
 *                 enum: [Beginner, Intermediate, Advanced]
 *               duration:
 *                 type: string
 *                 maxLength: 50
 *               modules:
 *                 type: array
 *                 items:
 *                   type: string
 *                   maxLength: 100
 *               fee:
 *                 type: object
 *                 properties:
 *                   amount:
 *                     type: number
 *                     minimum: 0
 *                   currency:
 *                     type: string
 *                   formatted:
 *                     type: string
 *               displayOrder:
 *                 type: number
 *                 minimum: 0
 *               featured:
 *                 type: boolean
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *     responses:
 *       200:
 *         description: Course updated successfully
 *       404:
 *         description: Course not found
 */
router.put(
  "/:id",
  protect,
  requireSuperAdmin,
  [
    body("title")
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage("Title must be less than 100 characters"),
    body("description")
      .optional()
      .trim()
      .isLength({ min: 1, max: 500 })
      .withMessage("Description must be less than 500 characters"),
    body("shortDescription")
      .optional()
      .isLength({ max: 150 })
      .withMessage("Short description must be less than 150 characters"),
    body("image.url").optional().isURL().withMessage("Image URL must be valid"),
    body("image.alt")
      .optional()
      .isLength({ max: 100 })
      .withMessage("Image alt text must be less than 100 characters"),
    body("duration")
      .optional()
      .isLength({ max: 50 })
      .withMessage("Duration must be less than 50 characters"),
    body("fee.amount")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Fee amount must be a positive number"),
    body("displayOrder")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Display order must be a non-negative integer"),
  ],
  updateCourse
);

/**
 * @swagger
 * /api/landing/courses/{id}:
 *   delete:
 *     summary: Delete course
 *     tags: [Landing Page - Courses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Course deleted successfully
 *       404:
 *         description: Course not found
 */
router.delete("/:id", protect, requireSuperAdmin, deleteCourse);

/**
 * @swagger
 * /api/landing/courses/{id}/order:
 *   patch:
 *     summary: Update course display order
 *     tags: [Landing Page - Courses]
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
 *             required:
 *               - displayOrder
 *             properties:
 *               displayOrder:
 *                 type: number
 *                 minimum: 0
 *     responses:
 *       200:
 *         description: Course display order updated successfully
 */
router.patch(
  "/:id/order",
  protect,
  requireSuperAdmin,
  [
    body("displayOrder")
      .isInt({ min: 0 })
      .withMessage("Display order must be a non-negative integer"),
  ],
  updateCourseOrder
);

/**
 * @swagger
 * /api/landing/courses/{id}/activate:
 *   patch:
 *     summary: Activate course
 *     tags: [Landing Page - Courses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Course activated successfully
 */
router.patch("/:id/activate", protect, requireSuperAdmin, activateCourse);

/**
 * @swagger
 * /api/landing/courses/{id}/deactivate:
 *   patch:
 *     summary: Deactivate course
 *     tags: [Landing Page - Courses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Course deactivated successfully
 */
router.patch("/:id/deactivate", protect, requireSuperAdmin, deactivateCourse);

module.exports = router;
