const express = require("express");
const { body } = require("express-validator");
const {
  getStudentNotices,
  markNoticeAsRead,
  markAllNoticesAsRead,
  getAllNotices,
  createNotice,
  updateNotice,
  deleteNotice,
  hideNotice,
  unhideNotice,
} = require("../controllers/noticeController");
const {
  protect,
  requireAdmin,
  requireBranchAdmin,
  canCreateNotices,
  canEditNotices,
} = require("../middlewares/auth");
const { branchAuth } = require("../middlewares/branchAuth");

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Notice:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         title:
 *           type: string
 *         content:
 *           type: string
 *         type:
 *           type: string
 *           enum: [urgent, important, academic, info, general]
 *         priority:
 *           type: string
 *           enum: [high, medium, low]
 *         targetAudience:
 *           type: string
 *           enum: [all, students, teachers, staff, parents]
 *         author:
 *           type: object
 *           properties:
 *             name:
 *               type: string
 *             department:
 *               type: string
 *         isActive:
 *           type: boolean
 *         publishDate:
 *           type: string
 *           format: date-time
 *         expiryDate:
 *           type: string
 *           format: date-time
 *         isRead:
 *           type: boolean
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /notices/student:
 *   get:
 *     summary: Get notices for current student
 *     tags: [Notices]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of notices for the student
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
 *                     $ref: '#/components/schemas/Notice'
 */
router.get("/student", protect, getStudentNotices);

/**
 * @swagger
 * /notices/{noticeId}/read:
 *   post:
 *     summary: Mark notice as read
 *     tags: [Notices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: noticeId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Notice marked as read successfully
 */
router.post("/:noticeId/read", protect, markNoticeAsRead);

/**
 * @swagger
 * /notices/mark-all-read:
 *   put:
 *     summary: Mark all notices as read for current user
 *     tags: [Notices]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notices marked as read successfully
 */
router.put("/mark-all-read", protect, markAllNoticesAsRead);

/**
 * @swagger
 * /notices/{noticeId}/hide:
 *   post:
 *     summary: Hide a notice for the current user
 *     tags: [Notices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: noticeId
 *         required: true
 *         schema:
 *           type: string
 *         description: Notice ID
 *     responses:
 *       200:
 *         description: Notice hidden successfully
 *       404:
 *         description: Notice not found
 *       403:
 *         description: Access denied
 */
router.post("/:noticeId/hide", protect, hideNotice);

/**
 * @swagger
 * /notices/{noticeId}/unhide:
 *   post:
 *     summary: Unhide a notice for the current user
 *     tags: [Notices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: noticeId
 *         required: true
 *         schema:
 *           type: string
 *         description: Notice ID
 *     responses:
 *       200:
 *         description: Notice unhidden successfully
 *       404:
 *         description: Notice not found
 *       403:
 *         description: Access denied
 */
router.post("/:noticeId/unhide", protect, unhideNotice);

/**
 * @swagger
 * /notices:
 *   get:
 *     summary: Get all notices (admin only)
 *     tags: [Notices]
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
 *           default: 20
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *       - in: query
 *         name: targetAudience
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of all notices with pagination
 */
router.get("/", protect, branchAuth, getAllNotices);

/**
 * @swagger
 * /notices:
 *   post:
 *     summary: Create new notice (admin only)
 *     tags: [Notices]
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
 *               content:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [urgent, important, academic, info, general]
 *               priority:
 *                 type: string
 *                 enum: [high, medium, low]
 *               targetAudience:
 *                 type: string
 *                 enum: [all, students, teachers, staff, parents]
 *               publishDate:
 *                 type: string
 *                 format: date-time
 *               expiryDate:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: Notice created successfully
 */
router.post(
  "/",
  protect,
  canCreateNotices,
  [
    body("title").notEmpty().withMessage("Title is required"),
    body("content").notEmpty().withMessage("Content is required"),
  ],
  createNotice
);

/**
 * @swagger
 * /notices/{noticeId}:
 *   put:
 *     summary: Update notice (admin only)
 *     tags: [Notices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: noticeId
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
 *               content:
 *                 type: string
 *               type:
 *                 type: string
 *               priority:
 *                 type: string
 *               targetAudience:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *               expiryDate:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Notice updated successfully
 */
router.put("/:noticeId", protect, canEditNotices, updateNotice);

/**
 * @swagger
 * /notices/{noticeId}:
 *   delete:
 *     summary: Delete notice (admin only)
 *     tags: [Notices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: noticeId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Notice deleted successfully
 */
router.delete("/:noticeId", protect, canEditNotices, deleteNotice);

module.exports = router;
