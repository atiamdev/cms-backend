const express = require("express");
const router = express.Router();

const { handleEquityCallback } = require("../controllers/paymentController");

/**
 * @swagger
 * /api/payments/equity/callback:
 *   post:
 *     summary: Handle Equity Bank payment callback
 *     description: Public endpoint for Jenga payment gateway callbacks
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               callbackType:
 *                 type: string
 *               transaction:
 *                 type: object
 *                 properties:
 *                   reference:
 *                     type: string
 *                   status:
 *                     type: string
 *                     enum: [SUCCESS, FAILED, COMPLETED]
 *                   amount:
 *                     type: number
 *                   date:
 *                     type: string
 *                   paymentMode:
 *                     type: string
 *                   billNumber:
 *                     type: string
 *                   serviceCharge:
 *                     type: number
 *                   orderAmount:
 *                     type: number
 *                   remarks:
 *                     type: string
 *               customer:
 *                 type: object
 *               bank:
 *                 type: object
 *     responses:
 *       200:
 *         description: Callback processed successfully
 *       404:
 *         description: Payment not found
 *       500:
 *         description: Server error
 */
// Equity callback (public endpoint - POST request)
router.post("/equity/callback", handleEquityCallback);

module.exports = router;
