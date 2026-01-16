// routes/branchAdminRoutes.js
const express = require("express");
const { body, param, query } = require("express-validator");
const router = express.Router();

const {
  protect,
  requireSuperAdmin,
  authorize,
} = require("../middlewares/auth");
const {
  createBranchAdmin,
  getBranchAdmins,
  getBranchAdminById,
  updateBranchAdmin,
  deleteBranchAdmin,
  assignBranchToBranchAdmin,
  getBranchAdminStats,
} = require("../controllers/branchAdminController");

/**
 * @swagger
 * components:
 *   schemas:
 *     BranchAdmin:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           description: User ID
 *         email:
 *           type: string
 *           format: email
 *           description: Email address
 *         firstName:
 *           type: string
 *           description: First name
 *         lastName:
 *           type: string
 *           description: Last name
 *         branchId:
 *           $ref: '#/components/schemas/Branch'
 *         roles:
 *           type: array
 *           items:
 *             type: string
 *           description: User roles
 *         status:
 *           type: string
 *           enum: [active, inactive, suspended, pending]
 *           description: Account status
 *         phone:
 *           type: string
 *           description: Phone number
 *         address:
 *           type: string
 *           description: Address
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     CreateBranchAdminRequest:
 *       type: object
 *       required:
 *         - email
 *         - password
 *         - firstName
 *         - lastName
 *         - branchId
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           description: Email address
 *         password:
 *           type: string
 *           minLength: 6
 *           description: Password
 *         firstName:
 *           type: string
 *           description: First name
 *         lastName:
 *           type: string
 *           description: Last name
 *         branchId:
 *           type: string
 *           description: Branch ID
 *         phone:
 *           type: string
 *           description: Phone number
 *         address:
 *           type: string
 *           description: Address
 *     UpdateBranchAdminRequest:
 *       type: object
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *         firstName:
 *           type: string
 *         lastName:
 *           type: string
 *         branchId:
 *           type: string
 *         status:
 *           type: string
 *           enum: [active, inactive, suspended, pending]
 *         phone:
 *           type: string
 *         address:
 *           type: string
 */

/**
 * @swagger
 * /branch-admins:
 *   post:
 *     summary: Create a new branch admin
 *     tags: [Branch Admin Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateBranchAdminRequest'
 *     responses:
 *       201:
 *         description: Branch admin created successfully
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
 *                   $ref: '#/components/schemas/BranchAdmin'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.post(
  "/",
  protect,
  requireSuperAdmin,
  [
    body("email")
      .isEmail()
      .normalizeEmail()
      .withMessage("Please provide a valid email"),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters long"),
    body("firstName")
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage("First name must be between 2 and 50 characters"),
    body("lastName")
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage("Last name must be between 2 and 50 characters"),
    body("branchId")
      .isMongoId()
      .withMessage("Please provide a valid branch ID"),
    body("phone")
      .optional()
      .isMobilePhone()
      .withMessage("Please provide a valid phone number"),
    body("address")
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage("Address cannot exceed 200 characters"),
  ],
  createBranchAdmin
);

/**
 * @swagger
 * /branch-admins:
 *   get:
 *     summary: Get all branch admins
 *     tags: [Branch Admin Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, suspended, pending]
 *         description: Filter by status
 *       - in: query
 *         name: branchId
 *         schema:
 *           type: string
 *         description: Filter by branch ID (SuperAdmin only)
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: createdAt
 *         description: Sort field
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *     responses:
 *       200:
 *         description: List of branch admins
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
 *                     $ref: '#/components/schemas/BranchAdmin'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
router.get(
  "/",
  protect,
  requireSuperAdmin,
  [
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 100 }),
    query("status")
      .optional()
      .isIn(["active", "inactive", "suspended", "pending"]),
    query("branchId").optional().isMongoId(),
    query("sortBy").optional().isString(),
    query("sortOrder").optional().isIn(["asc", "desc"]),
  ],
  getBranchAdmins
);

/**
 * @swagger
 * /branch-admins/{id}:
 *   get:
 *     summary: Get branch admin by ID
 *     tags: [Branch Admin Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Branch admin ID
 *     responses:
 *       200:
 *         description: Branch admin details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/BranchAdmin'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get(
  "/:id",
  protect,
  authorize(["superadmin", "branchadmin"]),
  [param("id").isMongoId().withMessage("Please provide a valid ID")],
  getBranchAdminById
);

/**
 * @swagger
 * /branch-admins/{id}:
 *   put:
 *     summary: Update branch admin
 *     tags: [Branch Admin Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Branch admin ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateBranchAdminRequest'
 *     responses:
 *       200:
 *         description: Branch admin updated successfully
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
 *                   $ref: '#/components/schemas/BranchAdmin'
 */
router.put(
  "/:id",
  protect,
  authorize(["superadmin", "branchadmin"]),
  [
    param("id").isMongoId().withMessage("Please provide a valid ID"),
    body("email")
      .optional()
      .isEmail()
      .normalizeEmail()
      .withMessage("Please provide a valid email"),
    body("firstName")
      .optional()
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage("First name must be between 2 and 50 characters"),
    body("lastName")
      .optional()
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage("Last name must be between 2 and 50 characters"),
    body("branchId")
      .optional()
      .isMongoId()
      .withMessage("Please provide a valid branch ID"),
    body("status")
      .optional()
      .isIn(["active", "inactive", "suspended", "pending"])
      .withMessage("Invalid status"),
    body("phone")
      .optional()
      .isMobilePhone()
      .withMessage("Please provide a valid phone number"),
    body("address")
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage("Address cannot exceed 200 characters"),
  ],
  updateBranchAdmin
);

/**
 * @swagger
 * /branch-admins/{id}:
 *   delete:
 *     summary: Delete branch admin (soft delete)
 *     tags: [Branch Admin Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Branch admin ID
 *     responses:
 *       200:
 *         description: Branch admin deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 */
router.delete(
  "/:id",
  protect,
  requireSuperAdmin,
  [param("id").isMongoId().withMessage("Please provide a valid ID")],
  deleteBranchAdmin
);

/**
 * @swagger
 * /branch-admins/{id}/assign-branch:
 *   put:
 *     summary: Assign branch to branch admin
 *     tags: [Branch Admin Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Branch admin ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - branchId
 *             properties:
 *               branchId:
 *                 type: string
 *                 description: New branch ID
 *     responses:
 *       200:
 *         description: Branch assignment updated successfully
 */
router.put(
  "/:id/assign-branch",
  protect,
  requireSuperAdmin,
  [
    param("id").isMongoId().withMessage("Please provide a valid ID"),
    body("branchId")
      .isMongoId()
      .withMessage("Please provide a valid branch ID"),
  ],
  assignBranchToBranchAdmin
);

/**
 * @swagger
 * /branch-admins/{id}/stats:
 *   get:
 *     summary: Get branch admin dashboard stats
 *     tags: [Branch Admin Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Branch admin ID
 *     responses:
 *       200:
 *         description: Branch admin stats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     students:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: number
 *                         active:
 *                           type: number
 *                         inactive:
 *                           type: number
 *                     teachers:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: number
 *                         active:
 *                           type: number
 *                         inactive:
 *                           type: number
 *                     classes:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: number
 */
router.get(
  "/:id/stats",
  protect,
  authorize(["superadmin", "branchadmin"]),
  [param("id").isMongoId().withMessage("Please provide a valid ID")],
  getBranchAdminStats
);

module.exports = router;
