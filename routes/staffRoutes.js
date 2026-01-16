const express = require("express");
const { body } = require("express-validator");
const {
  getActiveStaff,
  getAllStaff,
  getStaff,
  createStaff,
  updateStaff,
  deleteStaff,
  updateStaffOrder,
  activateStaff,
  deactivateStaff,
} = require("../controllers/staffController");
const { protect, requireSuperAdmin } = require("../middlewares/auth");

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Staff:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         name:
 *           type: string
 *         position:
 *           type: string
 *         bio:
 *           type: string
 *         image:
 *           type: object
 *           properties:
 *             url:
 *               type: string
 *             alt:
 *               type: string
 *         department:
 *           type: string
 *         email:
 *           type: string
 *         phone:
 *           type: string
 *         status:
 *           type: string
 *           enum: [active, inactive]
 *         displayOrder:
 *           type: number
 *         socialLinks:
 *           type: object
 *           properties:
 *             linkedin:
 *               type: string
 *             twitter:
 *               type: string
 *             facebook:
 *               type: string
 *         qualifications:
 *           type: array
 *           items:
 *             type: string
 *         experience:
 *           type: number
 */

/**
 * @swagger
 * /api/landing/staff:
 *   get:
 *     summary: Get active staff for landing page
 *     tags: [Landing Page - Staff]
 *     parameters:
 *       - in: query
 *         name: department
 *         schema:
 *           type: string
 *         description: Filter by department
 *     responses:
 *       200:
 *         description: Staff retrieved successfully
 */
router.get("/", getActiveStaff);

/**
 * @swagger
 * /api/landing/staff/admin:
 *   get:
 *     summary: Get all staff (admin)
 *     tags: [Landing Page - Staff]
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
 *         description: Staff retrieved successfully
 */
router.get("/admin", protect, requireSuperAdmin, getAllStaff);

/**
 * @swagger
 * /api/landing/staff/{id}:
 *   get:
 *     summary: Get single staff member
 *     tags: [Landing Page - Staff]
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
 *         description: Staff member retrieved successfully
 *       404:
 *         description: Staff member not found
 */
router.get("/:id", protect, requireSuperAdmin, getStaff);

/**
 * @swagger
 * /api/landing/staff:
 *   post:
 *     summary: Create new staff member
 *     tags: [Landing Page - Staff]
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
 *               - position
 *               - bio
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 100
 *               position:
 *                 type: string
 *                 maxLength: 100
 *               bio:
 *                 type: string
 *                 maxLength: 500
 *               image:
 *                 type: object
 *                 properties:
 *                   url:
 *                     type: string
 *                   alt:
 *                     type: string
 *                     maxLength: 100
 *               department:
 *                 type: string
 *                 maxLength: 100
 *               email:
 *                 type: string
 *                 format: email
 *               phone:
 *                 type: string
 *                 maxLength: 20
 *               displayOrder:
 *                 type: number
 *                 minimum: 0
 *               socialLinks:
 *                 type: object
 *                 properties:
 *                   linkedin:
 *                     type: string
 *                   twitter:
 *                     type: string
 *                   facebook:
 *                     type: string
 *               qualifications:
 *                 type: array
 *                 items:
 *                   type: string
 *                   maxLength: 200
 *               experience:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 50
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *                 default: active
 *     responses:
 *       201:
 *         description: Staff member created successfully
 *       400:
 *         description: Validation error
 */
router.post(
  "/",
  protect,
  requireSuperAdmin,
  [
    body("name")
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage("Name is required and must be less than 100 characters"),
    body("position")
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage("Position is required and must be less than 100 characters"),
    body("bio")
      .trim()
      .isLength({ min: 1, max: 500 })
      .withMessage("Bio is required and must be less than 500 characters"),
    body("image.url").optional().isURL().withMessage("Image URL must be valid"),
    body("image.alt")
      .optional()
      .isLength({ max: 100 })
      .withMessage("Image alt text must be less than 100 characters"),
    body("department")
      .optional()
      .isLength({ max: 100 })
      .withMessage("Department must be less than 100 characters"),
    body("email").optional().isEmail().withMessage("Email must be valid"),
    body("phone")
      .optional()
      .isLength({ max: 20 })
      .withMessage("Phone number must be less than 20 characters"),
    body("displayOrder")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Display order must be a non-negative integer"),
    body("experience")
      .optional()
      .isInt({ min: 0, max: 50 })
      .withMessage("Experience must be between 0 and 50 years"),
  ],
  createStaff
);

/**
 * @swagger
 * /api/landing/staff/{id}:
 *   put:
 *     summary: Update staff member
 *     tags: [Landing Page - Staff]
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
 *                 maxLength: 100
 *               position:
 *                 type: string
 *                 maxLength: 100
 *               bio:
 *                 type: string
 *                 maxLength: 500
 *               image:
 *                 type: object
 *                 properties:
 *                   url:
 *                     type: string
 *                   alt:
 *                     type: string
 *                     maxLength: 100
 *               department:
 *                 type: string
 *                 maxLength: 100
 *               email:
 *                 type: string
 *                 format: email
 *               phone:
 *                 type: string
 *                 maxLength: 20
 *               displayOrder:
 *                 type: number
 *                 minimum: 0
 *               socialLinks:
 *                 type: object
 *                 properties:
 *                   linkedin:
 *                     type: string
 *                   twitter:
 *                     type: string
 *                   facebook:
 *                     type: string
 *               qualifications:
 *                 type: array
 *                 items:
 *                   type: string
 *                   maxLength: 200
 *               experience:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 50
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *     responses:
 *       200:
 *         description: Staff member updated successfully
 *       404:
 *         description: Staff member not found
 */
router.put(
  "/:id",
  protect,
  requireSuperAdmin,
  [
    body("name")
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage("Name must be less than 100 characters"),
    body("position")
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage("Position must be less than 100 characters"),
    body("bio")
      .optional()
      .trim()
      .isLength({ min: 1, max: 500 })
      .withMessage("Bio must be less than 500 characters"),
    body("image.url").optional().isURL().withMessage("Image URL must be valid"),
    body("image.alt")
      .optional()
      .isLength({ max: 100 })
      .withMessage("Image alt text must be less than 100 characters"),
    body("department")
      .optional()
      .isLength({ max: 100 })
      .withMessage("Department must be less than 100 characters"),
    body("email").optional().isEmail().withMessage("Email must be valid"),
    body("phone")
      .optional()
      .isLength({ max: 20 })
      .withMessage("Phone number must be less than 20 characters"),
    body("displayOrder")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Display order must be a non-negative integer"),
    body("experience")
      .optional()
      .isInt({ min: 0, max: 50 })
      .withMessage("Experience must be between 0 and 50 years"),
  ],
  updateStaff
);

/**
 * @swagger
 * /api/landing/staff/{id}:
 *   delete:
 *     summary: Delete staff member
 *     tags: [Landing Page - Staff]
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
 *         description: Staff member deleted successfully
 *       404:
 *         description: Staff member not found
 */
router.delete("/:id", protect, requireSuperAdmin, deleteStaff);

/**
 * @swagger
 * /api/landing/staff/{id}/order:
 *   patch:
 *     summary: Update staff display order
 *     tags: [Landing Page - Staff]
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
 *         description: Staff display order updated successfully
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
  updateStaffOrder
);

/**
 * @swagger
 * /api/landing/staff/{id}/activate:
 *   patch:
 *     summary: Activate staff member
 *     tags: [Landing Page - Staff]
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
 *         description: Staff member activated successfully
 */
router.patch("/:id/activate", protect, requireSuperAdmin, activateStaff);

/**
 * @swagger
 * /api/landing/staff/{id}/deactivate:
 *   patch:
 *     summary: Deactivate staff member
 *     tags: [Landing Page - Staff]
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
 *         description: Staff member deactivated successfully
 */
router.patch("/:id/deactivate", protect, requireSuperAdmin, deactivateStaff);

module.exports = router;
