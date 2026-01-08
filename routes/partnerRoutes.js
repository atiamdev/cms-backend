const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const {
  getActivePartners,
  getAllPartners,
  getPartner,
  createPartner,
  updatePartner,
  deletePartner,
  updatePartnerOrder,
  activatePartner,
  deactivatePartner,
} = require("../controllers/partnerController");
const { protect, requireSuperAdmin } = require("../middlewares/auth");

/**
 * @swagger
 * components:
 *   schemas:
 *     Partner:
 *       type: object
 *       required:
 *         - name
 *         - logo
 *         - type
 *       properties:
 *         _id:
 *           type: string
 *         name:
 *           type: string
 *         logo:
 *           type: object
 *           properties:
 *             url:
 *               type: string
 *             alt:
 *               type: string
 *         type:
 *           type: string
 *           enum: [accreditation, partner]
 *         link:
 *           type: string
 *         description:
 *           type: string
 *         status:
 *           type: string
 *           enum: [active, inactive]
 *         displayOrder:
 *           type: number
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/landing/partners:
 *   get:
 *     summary: Get active partners for landing page
 *     tags: [Landing Page - Partners]
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [accreditation, partner]
 *         description: Filter by partner type
 *     responses:
 *       200:
 *         description: Partners retrieved successfully
 */
router.get("/", getActivePartners);

/**
 * @swagger
 * /api/landing/partners/admin:
 *   get:
 *     summary: Get all partners (admin)
 *     tags: [Landing Page - Partners]
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
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [accreditation, partner]
 *     responses:
 *       200:
 *         description: Partners retrieved successfully
 */
router.get("/admin", protect, requireSuperAdmin, getAllPartners);

/**
 * @swagger
 * /api/landing/partners/{id}:
 *   get:
 *     summary: Get single partner
 *     tags: [Landing Page - Partners]
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
 *         description: Partner retrieved successfully
 *       404:
 *         description: Partner not found
 */
router.get("/:id", protect, requireSuperAdmin, getPartner);

/**
 * @swagger
 * /api/landing/partners:
 *   post:
 *     summary: Create new partner
 *     tags: [Landing Page - Partners]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - logo
 *               - type
 *             properties:
 *               name:
 *                 type: string
 *               logo:
 *                 type: object
 *                 properties:
 *                   url:
 *                     type: string
 *                   alt:
 *                     type: string
 *               type:
 *                 type: string
 *                 enum: [accreditation, partner]
 *               link:
 *                 type: string
 *               description:
 *                 type: string
 *               displayOrder:
 *                 type: number
 *     responses:
 *       201:
 *         description: Partner created successfully
 */
router.post(
  "/",
  protect,
  requireSuperAdmin,
  [
    body("name")
      .trim()
      .notEmpty()
      .withMessage("Name is required")
      .isLength({ max: 100 })
      .withMessage("Name must be less than 100 characters"),
    body("logo.url").trim().notEmpty().withMessage("Logo URL is required"),
    body("logo.alt")
      .optional()
      .isLength({ max: 100 })
      .withMessage("Logo alt text must be less than 100 characters"),
    body("type")
      .isIn(["accreditation", "partner"])
      .withMessage("Type must be either accreditation or partner"),
    body("link").optional().trim(),
    body("description")
      .optional()
      .isLength({ max: 500 })
      .withMessage("Description must be less than 500 characters"),
    body("displayOrder")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Display order must be a non-negative integer"),
  ],
  createPartner
);

/**
 * @swagger
 * /api/landing/partners/{id}:
 *   put:
 *     summary: Update partner
 *     tags: [Landing Page - Partners]
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
 *               name:
 *                 type: string
 *               logo:
 *                 type: object
 *                 properties:
 *                   url:
 *                     type: string
 *                   alt:
 *                     type: string
 *               type:
 *                 type: string
 *                 enum: [accreditation, partner]
 *               link:
 *                 type: string
 *               description:
 *                 type: string
 *               displayOrder:
 *                 type: number
 *     responses:
 *       200:
 *         description: Partner updated successfully
 */
router.put(
  "/:id",
  protect,
  requireSuperAdmin,
  [
    body("name")
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage("Name must be less than 100 characters"),
    body("logo.url").optional().trim(),
    body("logo.alt")
      .optional()
      .isLength({ max: 100 })
      .withMessage("Logo alt text must be less than 100 characters"),
    body("type")
      .optional()
      .isIn(["accreditation", "partner"])
      .withMessage("Type must be either accreditation or partner"),
    body("link").optional().trim(),
    body("description")
      .optional()
      .isLength({ max: 500 })
      .withMessage("Description must be less than 500 characters"),
    body("displayOrder")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Display order must be a non-negative integer"),
  ],
  updatePartner
);

/**
 * @swagger
 * /api/landing/partners/{id}:
 *   delete:
 *     summary: Delete partner
 *     tags: [Landing Page - Partners]
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
 *         description: Partner deleted successfully
 *       404:
 *         description: Partner not found
 */
router.delete("/:id", protect, requireSuperAdmin, deletePartner);

/**
 * @swagger
 * /api/landing/partners/{id}/order:
 *   patch:
 *     summary: Update partner display order
 *     tags: [Landing Page - Partners]
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
 *         description: Partner display order updated successfully
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
  updatePartnerOrder
);

/**
 * @swagger
 * /api/landing/partners/{id}/activate:
 *   patch:
 *     summary: Activate partner
 *     tags: [Landing Page - Partners]
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
 *         description: Partner activated successfully
 */
router.patch("/:id/activate", protect, requireSuperAdmin, activatePartner);

/**
 * @swagger
 * /api/landing/partners/{id}/deactivate:
 *   patch:
 *     summary: Deactivate partner
 *     tags: [Landing Page - Partners]
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
 *         description: Partner deactivated successfully
 */
router.patch("/:id/deactivate", protect, requireSuperAdmin, deactivatePartner);

module.exports = router;
