const express = require("express");
const { body } = require("express-validator");
const {
  getActivePopup,
  trackPopupInteraction,
  getAllPopups,
  getPopup,
  createPopup,
  updatePopup,
  deletePopup,
  publishPopup,
  unpublishPopup,
} = require("../controllers/popupController");
const { protect, requireSuperAdmin } = require("../middlewares/auth");

const router = express.Router();

// Validation rules
const popupValidation = [
  body("title")
    .trim()
    .notEmpty()
    .withMessage("Title is required")
    .isLength({ max: 200 })
    .withMessage("Title cannot exceed 200 characters"),
  body("contentType")
    .isIn(["image", "text"])
    .withMessage("Content type must be either 'image' or 'text'"),
  body("content")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("Content cannot exceed 500 characters"),
  body("displayDuration")
    .optional()
    .isInt({ min: 1, max: 60 })
    .withMessage("Display duration must be between 1 and 60 seconds"),
  body("delayBeforeShow")
    .optional()
    .isInt({ min: 0, max: 30000 })
    .withMessage("Delay must be between 0 and 30000 milliseconds"),
  body("priority")
    .optional()
    .isInt()
    .withMessage("Priority must be an integer"),
];

/**
 * @swagger
 * /api/landing/popup:
 *   get:
 *     summary: Get active popup for landing page
 *     tags: [Landing Page - Popup]
 *     responses:
 *       200:
 *         description: Active popup retrieved successfully
 */
router.get("/", getActivePopup);

/**
 * @swagger
 * /api/landing/popup/{id}/track:
 *   post:
 *     summary: Track popup interaction (click or dismiss)
 *     tags: [Landing Page - Popup]
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
 *               action:
 *                 type: string
 *                 enum: [click, dismiss]
 *     responses:
 *       200:
 *         description: Interaction tracked successfully
 */
router.post("/:id/track", trackPopupInteraction);

/**
 * @swagger
 * /api/landing/popup/admin:
 *   get:
 *     summary: Get all popups (admin)
 *     tags: [Landing Page - Popup]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, published]
 *     responses:
 *       200:
 *         description: Popups retrieved successfully
 */
router.get("/admin", protect, requireSuperAdmin, getAllPopups);

/**
 * @swagger
 * /api/landing/popup/admin/{id}:
 *   get:
 *     summary: Get single popup (admin)
 *     tags: [Landing Page - Popup]
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
 *         description: Popup retrieved successfully
 */
router.get("/admin/:id", protect, requireSuperAdmin, getPopup);

/**
 * @swagger
 * /api/landing/popup/admin:
 *   post:
 *     summary: Create new popup
 *     tags: [Landing Page - Popup]
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
 *               - contentType
 *             properties:
 *               title:
 *                 type: string
 *               contentType:
 *                 type: string
 *                 enum: [image, text]
 *               content:
 *                 type: string
 *               image:
 *                 type: object
 *               buttonText:
 *                 type: string
 *               buttonLink:
 *                 type: string
 *     responses:
 *       201:
 *         description: Popup created successfully
 */
router.post("/admin", protect, requireSuperAdmin, popupValidation, createPopup);

/**
 * @swagger
 * /api/landing/popup/admin/{id}:
 *   put:
 *     summary: Update popup
 *     tags: [Landing Page - Popup]
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
 *         description: Popup updated successfully
 */
router.put(
  "/admin/:id",
  protect,
  requireSuperAdmin,
  popupValidation,
  updatePopup
);

/**
 * @swagger
 * /api/landing/popup/admin/{id}:
 *   delete:
 *     summary: Delete popup
 *     tags: [Landing Page - Popup]
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
 *         description: Popup deleted successfully
 */
router.delete("/admin/:id", protect, requireSuperAdmin, deletePopup);

/**
 * @swagger
 * /api/landing/popup/admin/{id}/publish:
 *   patch:
 *     summary: Publish popup
 *     tags: [Landing Page - Popup]
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
 *         description: Popup published successfully
 */
router.patch("/admin/:id/publish", protect, requireSuperAdmin, publishPopup);

/**
 * @swagger
 * /api/landing/popup/admin/{id}/unpublish:
 *   patch:
 *     summary: Unpublish popup
 *     tags: [Landing Page - Popup]
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
 *         description: Popup unpublished successfully
 */
router.patch(
  "/admin/:id/unpublish",
  protect,
  requireSuperAdmin,
  unpublishPopup
);

module.exports = router;
