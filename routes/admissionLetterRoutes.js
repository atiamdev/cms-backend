const express = require("express");
const router = express.Router();
const {
  generateAdmissionLetter,
  downloadAdmissionLetter,
} = require("../controllers/admissionLetterController");
const { protect, authorize } = require("../middlewares/auth");
const { enforceOwnBranchOnly } = require("../middlewares/branchAccess");

/**
 * @swagger
 * /api/admission-letters/{studentId}:
 *   get:
 *     summary: Generate and store admission letter for a student
 *     tags: [Admission Letters]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Student ID
 *     responses:
 *       200:
 *         description: Admission letter generated successfully
 *       404:
 *         description: Student not found
 *       500:
 *         description: Server error
 */
router.get(
  "/:studentId",
  protect,
  authorize("secretary", "admin", "branch_admin"),
  enforceOwnBranchOnly,
  generateAdmissionLetter
);

/**
 * @swagger
 * /api/admission-letters/{studentId}/download:
 *   get:
 *     summary: Download admission letter PDF for a student
 *     tags: [Admission Letters]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Student ID
 *     responses:
 *       200:
 *         description: Admission letter PDF downloaded
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Student not found
 *       500:
 *         description: Server error
 */
router.get(
  "/:studentId/download",
  protect,
  authorize("secretary", "admin", "branch_admin", "student"),
  enforceOwnBranchOnly,
  downloadAdmissionLetter
);

module.exports = router;
