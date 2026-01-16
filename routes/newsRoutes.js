const express = require("express");
const { body } = require("express-validator");
const {
  getPublishedNews,
  getAllNews,
  getNews,
  createNews,
  updateNews,
  deleteNews,
  publishNews,
  unpublishNews,
} = require("../controllers/newsController");
const { protect, requireSuperAdmin } = require("../middlewares/auth");

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     News:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         title:
 *           type: string
 *         content:
 *           type: string
 *         excerpt:
 *           type: string
 *         image:
 *           type: object
 *           properties:
 *             url:
 *               type: string
 *             alt:
 *               type: string
 *         status:
 *           type: string
 *           enum: [draft, published]
 *         publishDate:
 *           type: string
 *           format: date-time
 *         author:
 *           type: object
 *           properties:
 *             name:
 *               type: string
 *             role:
 *               type: string
 *         tags:
 *           type: array
 *           items:
 *             type: string
 *         featured:
 *           type: boolean
 */

/**
 * @swagger
 * /api/landing/news:
 *   get:
 *     summary: Get published news for landing page
 *     tags: [Landing Page - News]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of news items to return
 *       - in: query
 *         name: featured
 *         schema:
 *           type: boolean
 *         description: Return only featured news
 *     responses:
 *       200:
 *         description: News retrieved successfully
 */
router.get("/", getPublishedNews);

/**
 * @swagger
 * /api/landing/news/admin:
 *   get:
 *     summary: Get all news (admin)
 *     tags: [Landing Page - News]
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
 *           enum: [draft, published]
 *     responses:
 *       200:
 *         description: News retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - SuperAdmin required
 */
router.get("/admin", protect, requireSuperAdmin, getAllNews);

/**
 * @swagger
 * /api/landing/news/{id}:
 *   get:
 *     summary: Get single news item
 *     tags: [Landing Page - News]
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
 *         description: News retrieved successfully
 *       404:
 *         description: News not found
 */
router.get("/:id", protect, requireSuperAdmin, getNews);

/**
 * @swagger
 * /api/landing/news:
 *   post:
 *     summary: Create new news
 *     tags: [Landing Page - News]
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
 *               - content
 *             properties:
 *               title:
 *                 type: string
 *                 maxLength: 200
 *               content:
 *                 type: string
 *               excerpt:
 *                 type: string
 *                 maxLength: 300
 *               image:
 *                 type: object
 *                 properties:
 *                   url:
 *                     type: string
 *                   alt:
 *                     type: string
 *                     maxLength: 100
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               featured:
 *                 type: boolean
 *               status:
 *                 type: string
 *                 enum: [draft, published]
 *                 default: draft
 *     responses:
 *       201:
 *         description: News created successfully
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
      .isLength({ min: 1, max: 200 })
      .withMessage("Title is required and must be less than 200 characters"),
    body("content")
      .trim()
      .isLength({ min: 1 })
      .withMessage("Content is required"),
    body("excerpt")
      .optional()
      .isLength({ max: 300 })
      .withMessage("Excerpt must be less than 300 characters"),
    body("image.url").optional().isURL().withMessage("Image URL must be valid"),
    body("image.alt")
      .optional()
      .isLength({ max: 100 })
      .withMessage("Image alt text must be less than 100 characters"),
  ],
  createNews
);

/**
 * @swagger
 * /api/landing/news/{id}:
 *   put:
 *     summary: Update news
 *     tags: [Landing Page - News]
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
 *                 maxLength: 200
 *               content:
 *                 type: string
 *               excerpt:
 *                 type: string
 *                 maxLength: 300
 *               image:
 *                 type: object
 *                 properties:
 *                   url:
 *                     type: string
 *                   alt:
 *                     type: string
 *                     maxLength: 100
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               featured:
 *                 type: boolean
 *               status:
 *                 type: string
 *                 enum: [draft, published]
 *     responses:
 *       200:
 *         description: News updated successfully
 *       404:
 *         description: News not found
 */
router.put(
  "/:id",
  protect,
  requireSuperAdmin,
  [
    body("title")
      .optional()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage("Title must be less than 200 characters"),
    body("content")
      .optional()
      .trim()
      .isLength({ min: 1 })
      .withMessage("Content is required"),
    body("excerpt")
      .optional()
      .isLength({ max: 300 })
      .withMessage("Excerpt must be less than 300 characters"),
    body("image.url").optional().isURL().withMessage("Image URL must be valid"),
    body("image.alt")
      .optional()
      .isLength({ max: 100 })
      .withMessage("Image alt text must be less than 100 characters"),
  ],
  updateNews
);

/**
 * @swagger
 * /api/landing/news/{id}:
 *   delete:
 *     summary: Delete news
 *     tags: [Landing Page - News]
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
 *         description: News deleted successfully
 *       404:
 *         description: News not found
 */
router.delete("/:id", protect, requireSuperAdmin, deleteNews);

/**
 * @swagger
 * /api/landing/news/{id}/publish:
 *   patch:
 *     summary: Publish news
 *     tags: [Landing Page - News]
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
 *         description: News published successfully
 */
router.patch("/:id/publish", protect, requireSuperAdmin, publishNews);

/**
 * @swagger
 * /api/landing/news/{id}/unpublish:
 *   patch:
 *     summary: Unpublish news
 *     tags: [Landing Page - News]
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
 *         description: News unpublished successfully
 */
router.patch("/:id/unpublish", protect, requireSuperAdmin, unpublishNews);

module.exports = router;
