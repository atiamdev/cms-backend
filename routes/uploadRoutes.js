const express = require("express");
const multer = require("multer");
const { protect } = require("../middlewares/auth");
const cloudflareService = require("../services/cloudflareService");
const router = express.Router();

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow only PDFs and images
    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error("Invalid file type. Only PDF and image files are allowed."),
        false
      );
    }
  },
});

/**
 * @swagger
 * /api/upload/file:
 *   post:
 *     summary: Upload file to Cloudflare R2
 *     tags: [Upload]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               filename:
 *                 type: string
 *               destination:
 *                 type: string
 *     responses:
 *       200:
 *         description: File uploaded successfully
 *       400:
 *         description: Invalid file or upload failed
 *       401:
 *         description: Unauthorized
 */
router.post("/file", protect, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file provided",
      });
    }

    const { filename, destination } = req.body;

    // Generate filename if not provided
    const finalFilename =
      filename ||
      `${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 8)}.${req.file.originalname.split(".").pop()}`;

    // Determine upload destination and create proper key
    const folder = destination || "documents";
    const key = `${folder}/${finalFilename}`;

    try {
      // Upload to Cloudflare R2
      const uploadResult = await cloudflareService.uploadFile(req.file.buffer, {
        key: key,
        filename: finalFilename,
        contentType: req.file.mimetype,
        metadata: {
          originalName: req.file.originalname,
          uploadedBy: req.user._id,
          uploadDate: new Date().toISOString(),
        },
      });

      res.json({
        success: true,
        message: "File uploaded successfully",
        data: {
          url: uploadResult.url, // This will be https://e-resource.atiamcollege.com/...
          r2Url: uploadResult.r2Url, // Direct R2 URL for management
          key: uploadResult.key,
          filename: finalFilename,
          size: req.file.size,
          type: req.file.mimetype,
          originalName: req.file.originalname,
        },
      });
    } catch (uploadError) {
      console.error("Cloudflare upload error:", uploadError);

      return res.status(500).json({
        success: false,
        message: "File upload to Cloudflare failed",
        error: uploadError.message,
      });
    }
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({
      success: false,
      message: "Upload failed",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/upload/multiple:
 *   post:
 *     summary: Upload multiple files to Cloudflare R2
 *     tags: [Upload]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Files uploaded successfully
 *       400:
 *         description: Invalid files or upload failed
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/multiple",
  protect,
  upload.array("files", 10),
  async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No files provided",
        });
      }

      const results = [];

      for (const file of req.files) {
        const filename = `${Date.now()}_${Math.random()
          .toString(36)
          .substring(2, 8)}.${file.originalname.split(".").pop()}`;

        const folder = req.body.destination || "documents";
        const key = `${folder}/${filename}`;

        try {
          // Upload to Cloudflare R2
          const uploadResult = await cloudflareService.uploadFile(file.buffer, {
            key: key,
            filename: filename,
            contentType: file.mimetype,
            metadata: {
              originalName: file.originalname,
              uploadedBy: req.user._id,
              uploadDate: new Date().toISOString(),
            },
          });

          results.push({
            url: uploadResult.url, // https://e-resource.atiamcollege.com/...
            r2Url: uploadResult.r2Url,
            key: uploadResult.key,
            filename: filename,
            size: file.size,
            type: file.mimetype,
            originalName: file.originalname,
          });
        } catch (uploadError) {
          console.error(
            "Cloudflare upload error for file:",
            filename,
            uploadError
          );

          // Add failed upload to results with error info
          results.push({
            filename: filename,
            originalName: file.originalname,
            size: file.size,
            type: file.mimetype,
            error: `Upload failed: ${uploadError.message}`,
            success: false,
          });
        }
      }

      res.json({
        success: true,
        message: `${results.length} files uploaded successfully`,
        data: results,
      });
    } catch (error) {
      console.error("Multiple upload error:", error);
      res.status(500).json({
        success: false,
        message: "Upload failed",
        error: error.message,
      });
    }
  }
);

/**
 * @swagger
 * /api/upload/test-url:
 *   post:
 *     summary: Test URL accessibility
 *     tags: [Upload]
 *     security:
 *       - bearerAuth: []
 */
router.post("/test-url", protect, async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        message: "URL is required",
      });
    }

    console.log("=== URL Accessibility Test ===");
    console.log("Testing URL:", url);

    try {
      const response = await fetch(url, { method: "HEAD" });
      console.log("Response status:", response.status);
      console.log(
        "Response headers:",
        Object.fromEntries(response.headers.entries())
      );

      res.json({
        success: true,
        data: {
          url: url,
          accessible: response.status === 200,
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
        },
      });
    } catch (fetchError) {
      console.error("Fetch error:", fetchError);
      res.json({
        success: true,
        data: {
          url: url,
          accessible: false,
          error: fetchError.message,
        },
      });
    }
  } catch (error) {
    console.error("Test URL error:", error);
    res.status(500).json({
      success: false,
      message: "URL test failed",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/upload/photo:
 *   post:
 *     summary: Upload student photo to Cloudflare R2 profiles folder
 *     tags: [Upload]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *                 description: Student photo file (JPEG, PNG, etc.)
 *     responses:
 *       200:
 *         description: Photo uploaded successfully
 *       400:
 *         description: Invalid file or upload failed
 *       401:
 *         description: Unauthorized
 */
router.post("/photo", protect, upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No photo provided",
      });
    }

    // Validate file type for photos
    const allowedPhotoTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
    ];

    if (!allowedPhotoTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: "Invalid file type. Only image files are allowed for photos.",
      });
    }

    // Generate unique filename for photo
    const fileExtension = req.file.originalname.split(".").pop();
    const filename = `profile_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 8)}.${fileExtension}`;

    // Upload to profiles folder in Cloudflare R2
    const key = `profiles/${filename}`;

    try {
      // Upload to Cloudflare R2
      const uploadResult = await cloudflareService.uploadFile(req.file.buffer, {
        key: key,
        filename: filename,
        contentType: req.file.mimetype,
        metadata: {
          originalName: req.file.originalname,
          uploadedBy: req.user._id,
          uploadDate: new Date().toISOString(),
          type: "student-photo",
        },
      });

      res.json({
        success: true,
        message: "Photo uploaded successfully",
        data: {
          url: uploadResult.url, // Public URL for accessing the photo
          r2Url: uploadResult.r2Url, // Direct R2 URL for management
          key: uploadResult.key,
          filename: filename,
          size: req.file.size,
          type: req.file.mimetype,
          originalName: req.file.originalname,
        },
      });
    } catch (uploadError) {
      console.error("Cloudflare photo upload error:", uploadError);

      return res.status(500).json({
        success: false,
        message: "Photo upload to Cloudflare failed",
        error: uploadError.message,
      });
    }
  } catch (error) {
    console.error("Photo upload error:", error);
    res.status(500).json({
      success: false,
      message: "Photo upload failed",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/upload/file:
 *   delete:
 *     summary: Delete file from Cloudflare R2
 *     tags: [Upload]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: File key to delete
 *     responses:
 *       200:
 *         description: File deleted successfully
 *       400:
 *         description: Invalid key or delete failed
 *       401:
 *         description: Unauthorized
 */
router.delete("/file", protect, async (req, res) => {
  try {
    const { key } = req.query;

    if (!key) {
      return res.status(400).json({
        success: false,
        message: "File key is required",
      });
    }

    try {
      // Delete from Cloudflare R2
      await cloudflareService.deleteFile(key);

      res.json({
        success: true,
        message: "File deleted successfully",
      });
    } catch (deleteError) {
      console.error("Cloudflare delete error:", deleteError);

      return res.status(500).json({
        success: false,
        message: "File deletion from Cloudflare failed",
        error: deleteError.message,
      });
    }
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({
      success: false,
      message: "Delete failed",
      error: error.message,
    });
  }
});

module.exports = router;
