const express = require("express");
const { body } = require("express-validator");
const {
  getUpcomingEvents,
  getRecentEvents,
  getAllEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  publishEvent,
  cancelEvent,
} = require("../controllers/eventController");
const { protect, requireSuperAdmin } = require("../middlewares/auth");

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Event:
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
 *         eventDate:
 *           type: string
 *           format: date-time
 *         endDate:
 *           type: string
 *           format: date-time
 *         location:
 *           type: object
 *           properties:
 *             venue:
 *               type: string
 *             address:
 *               type: string
 *             city:
 *               type: string
 *         status:
 *           type: string
 *           enum: [draft, published, cancelled]
 *         eventType:
 *           type: string
 *           enum: [academic, cultural, sports, workshop, seminar, other]
 *         registrationRequired:
 *           type: boolean
 *         registrationUrl:
 *           type: string
 *         capacity:
 *           type: number
 *         organizer:
 *           type: object
 *           properties:
 *             name:
 *               type: string
 *             contact:
 *               type: string
 *         featured:
 *           type: boolean
 */

/**
 * @swagger
 * /api/landing/events:
 *   get:
 *     summary: Get upcoming events for landing page
 *     tags: [Landing Page - Events]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of events to return
 *       - in: query
 *         name: featured
 *         schema:
 *           type: boolean
 *         description: Return only featured events
 *     responses:
 *       200:
 *         description: Events retrieved successfully
 */
router.get("/", getUpcomingEvents);

/**
 * @swagger
 * /api/landing/events/recent:
 *   get:
 *     summary: Get recent past events for landing page
 *     tags: [Landing Page - Events]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 5
 *         description: Number of events to return
 *     responses:
 *       200:
 *         description: Events retrieved successfully
 */
router.get("/recent", getRecentEvents);

/**
 * @swagger
 * /api/landing/events/admin:
 *   get:
 *     summary: Get all events (admin)
 *     tags: [Landing Page - Events]
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
 *           enum: [draft, published, cancelled]
 *     responses:
 *       200:
 *         description: Events retrieved successfully
 */
router.get("/admin", protect, requireSuperAdmin, getAllEvents);

/**
 * @swagger
 * /api/landing/events/{id}:
 *   get:
 *     summary: Get single event
 *     tags: [Landing Page - Events]
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
 *         description: Event retrieved successfully
 *       404:
 *         description: Event not found
 */
router.get("/:id", protect, requireSuperAdmin, getEvent);

/**
 * @swagger
 * /api/landing/events:
 *   post:
 *     summary: Create new event
 *     tags: [Landing Page - Events]
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
 *               - eventDate
 *             properties:
 *               title:
 *                 type: string
 *                 maxLength: 200
 *               description:
 *                 type: string
 *               shortDescription:
 *                 type: string
 *                 maxLength: 200
 *               image:
 *                 type: object
 *                 properties:
 *                   url:
 *                     type: string
 *                   alt:
 *                     type: string
 *                     maxLength: 100
 *               eventDate:
 *                 type: string
 *                 format: date-time
 *               endDate:
 *                 type: string
 *                 format: date-time
 *               location:
 *                 type: object
 *                 properties:
 *                   venue:
 *                     type: string
 *                   address:
 *                     type: string
 *                   city:
 *                     type: string
 *               eventType:
 *                 type: string
 *                 enum: [academic, cultural, sports, workshop, seminar, other]
 *               registrationRequired:
 *                 type: boolean
 *               registrationUrl:
 *                 type: string
 *               capacity:
 *                 type: number
 *                 minimum: 0
 *               organizer:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                   contact:
 *                     type: string
 *               featured:
 *                 type: boolean
 *               status:
 *                 type: string
 *                 enum: [draft, published, cancelled]
 *                 default: draft
 *     responses:
 *       201:
 *         description: Event created successfully
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
    body("description")
      .trim()
      .isLength({ min: 1 })
      .withMessage("Description is required"),
    body("shortDescription")
      .optional()
      .isLength({ max: 200 })
      .withMessage("Short description must be less than 200 characters"),
    body("eventDate").isISO8601().withMessage("Valid event date is required"),
    body("endDate")
      .optional()
      .isISO8601()
      .withMessage("End date must be valid ISO date"),
    body("image.url").optional().isURL().withMessage("Image URL must be valid"),
    body("image.alt")
      .optional()
      .isLength({ max: 100 })
      .withMessage("Image alt text must be less than 100 characters"),
    body("capacity")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Capacity must be a positive number"),
    body("registrationUrl")
      .optional()
      .isURL()
      .withMessage("Registration URL must be valid"),
  ],
  createEvent
);

/**
 * @swagger
 * /api/landing/events/{id}:
 *   put:
 *     summary: Update event
 *     tags: [Landing Page - Events]
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
 *               description:
 *                 type: string
 *               shortDescription:
 *                 type: string
 *                 maxLength: 200
 *               image:
 *                 type: object
 *                 properties:
 *                   url:
 *                     type: string
 *                   alt:
 *                     type: string
 *                     maxLength: 100
 *               eventDate:
 *                 type: string
 *                 format: date-time
 *               endDate:
 *                 type: string
 *                 format: date-time
 *               location:
 *                 type: object
 *                 properties:
 *                   venue:
 *                     type: string
 *                   address:
 *                     type: string
 *                   city:
 *                     type: string
 *               eventType:
 *                 type: string
 *                 enum: [academic, cultural, sports, workshop, seminar, other]
 *               registrationRequired:
 *                 type: boolean
 *               registrationUrl:
 *                 type: string
 *               capacity:
 *                 type: number
 *               organizer:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                   contact:
 *                     type: string
 *               featured:
 *                 type: boolean
 *               status:
 *                 type: string
 *                 enum: [draft, published, cancelled]
 *     responses:
 *       200:
 *         description: Event updated successfully
 *       404:
 *         description: Event not found
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
    body("description")
      .optional()
      .trim()
      .isLength({ min: 1 })
      .withMessage("Description is required"),
    body("shortDescription")
      .optional()
      .isLength({ max: 200 })
      .withMessage("Short description must be less than 200 characters"),
    body("eventDate")
      .optional()
      .isISO8601()
      .withMessage("Event date must be valid ISO date"),
    body("endDate")
      .optional()
      .isISO8601()
      .withMessage("End date must be valid ISO date"),
    body("image.url").optional().isURL().withMessage("Image URL must be valid"),
    body("image.alt")
      .optional()
      .isLength({ max: 100 })
      .withMessage("Image alt text must be less than 100 characters"),
    body("capacity")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Capacity must be a positive number"),
    body("registrationUrl")
      .optional()
      .isURL()
      .withMessage("Registration URL must be valid"),
  ],
  updateEvent
);

/**
 * @swagger
 * /api/landing/events/{id}:
 *   delete:
 *     summary: Delete event
 *     tags: [Landing Page - Events]
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
 *         description: Event deleted successfully
 *       404:
 *         description: Event not found
 */
router.delete("/:id", protect, requireSuperAdmin, deleteEvent);

/**
 * @swagger
 * /api/landing/events/{id}/publish:
 *   patch:
 *     summary: Publish event
 *     tags: [Landing Page - Events]
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
 *         description: Event published successfully
 */
router.patch("/:id/publish", protect, requireSuperAdmin, publishEvent);

/**
 * @swagger
 * /api/landing/events/{id}/cancel:
 *   patch:
 *     summary: Cancel event
 *     tags: [Landing Page - Events]
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
 *         description: Event cancelled successfully
 */
router.patch("/:id/cancel", protect, requireSuperAdmin, cancelEvent);

module.exports = router;
