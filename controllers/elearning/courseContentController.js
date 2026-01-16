const { CourseContent, LearningModule } = require("../../models/elearning");
const Course = require("../../models/Course");
const cloudflareService = require("../../services/cloudflareService");
const { validationResult } = require("express-validator");

class CourseContentController {
  // Create new course content
  async createContent(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const {
        title,
        description,
        courseId,
        moduleId,
        contentType,
        content,
        settings,
        metadata,
        sharingSettings,
        externalUrl,
        mediaUrl,
      } = req.body;

      // Verify course exists and user has access
      const course = await Course.findById(courseId);
      if (!course) {
        return res.status(404).json({
          success: false,
          message: "Course not found",
        });
      }

      // Verify module exists if provided
      if (moduleId) {
        const module = await LearningModule.findById(moduleId);
        if (!module || module.courseId.toString() !== courseId) {
          return res.status(404).json({
            success: false,
            message: "Module not found or does not belong to this course",
          });
        }
      }

      const contentData = {
        title,
        description,
        courseId,
        moduleId,
        contentType,
        content,
        settings: settings || {},
        metadata: metadata || {},
        sharingSettings: sharingSettings || {},
        branchId: req.user.branchId,
        authorId: req.user._id,
        authorType: req.user.role === "teacher" ? "Teacher" : "User",
      };

      // Handle file uploads if present
      if (req.files && req.files.length > 0) {
        try {
          const uploadPromises = req.files.map(async (file) => {
            let uploadResult;

            if (file.mimetype.startsWith("video/")) {
              // Upload video to Cloudflare R2 (same as documents)
              uploadResult = await cloudflareService.uploadFile(file.buffer, {
                filename: file.originalname,
                contentType: file.mimetype,
                folder: `course-content/${courseId}`,
              });

              return {
                type: "video",
                url: uploadResult.url,
                fileName: file.originalname,
                fileSize: file.size,
                fileType: file.mimetype,
              };
            } else {
              // Upload to Cloudflare R2
              uploadResult = await cloudflareService.uploadFile(file.buffer, {
                filename: file.originalname,
                contentType: file.mimetype,
                folder: `course-content/${courseId}`,
              });

              return {
                type: file.mimetype.startsWith("image/") ? "image" : "document",
                url: uploadResult.url,
                fileName: file.originalname,
                fileSize: file.size,
                fileType: file.mimetype,
              };
            }
          });

          const uploadResults = await Promise.all(uploadPromises);

          // Map upload results to content fields based on content type
          if (uploadResults.length > 0) {
            const primaryUpload = uploadResults[0]; // Use first upload as primary content

            if (primaryUpload.type === "video") {
              contentData.content = {
                ...contentData.content,
                fileUrl: primaryUpload.url,
                fileName: primaryUpload.fileName,
                fileSize: primaryUpload.fileSize,
                mimeType: primaryUpload.fileType,
                videoType: "uploaded",
              };
              // Set mediaUrl for video uploads so frontend validation passes
              contentData.mediaUrl = primaryUpload.url;
            } else if (primaryUpload.type === "document") {
              contentData.content = {
                ...contentData.content,
                fileUrl: primaryUpload.url,
                fileName: primaryUpload.fileName,
                fileSize: primaryUpload.fileSize,
                mimeType: primaryUpload.fileType,
              };
            } else if (primaryUpload.type === "image") {
              contentData.content = {
                ...contentData.content,
                imageUrl: primaryUpload.url,
              };
            }

            // Store additional uploads as materials
            if (uploadResults.length > 1) {
              contentData.materials = uploadResults.slice(1).map((result) => ({
                id: `material_${Date.now()}_${Math.random()}`,
                name: result.fileName,
                type: result.type === "document" ? "file" : result.type,
                fileUrl: result.url,
                fileName: result.fileName,
                fileSize: result.fileSize,
                mimeType: result.fileType,
              }));
            }
          }
        } catch (uploadError) {
          console.error("File upload failed:", uploadError);
          return res.status(500).json({
            success: false,
            message: `File upload failed: ${uploadError.message}`,
            error: uploadError.message,
          });
        }
      }

      // Handle content based on contentType when no files are uploaded
      if (!req.files || req.files.length === 0) {
        if (contentType === "link" && (content?.externalLink || externalUrl)) {
          contentData.content = {
            ...contentData.content,
            externalLink: content?.externalLink || externalUrl,
          };
        } else if (contentType === "text" && content?.htmlContent) {
          contentData.content = {
            ...contentData.content,
            htmlContent: content.htmlContent,
          };
        } else if (
          contentType === "video" &&
          (content?.externalLink || externalUrl)
        ) {
          // Handle external video links (YouTube, etc.)
          contentData.content = {
            ...contentData.content,
            externalLink: content?.externalLink || externalUrl,
            videoType: content?.videoType || "youtube",
          };
        }
      }

      const courseContent = new CourseContent(contentData);
      await courseContent.save();

      // Update module with new content if moduleId provided
      if (moduleId) {
        await LearningModule.findByIdAndUpdate(moduleId, {
          $push: { contentItems: courseContent._id },
        });
      }

      await courseContent.populate([
        { path: "courseId", select: "title description" },
        { path: "moduleId", select: "title description" },
        { path: "authorId", select: "name email" },
      ]);

      res.status(201).json({
        success: true,
        message: "Course content created successfully",
        data: courseContent,
      });
    } catch (error) {
      console.error("Error creating course content:", error);
      res.status(500).json({
        success: false,
        message: "Failed to create course content",
        error: error.message,
      });
    }
  }

  // Get course content by ID
  async getContent(req, res) {
    try {
      const { id } = req.params;
      const { includeAnalytics = false } = req.query;

      const courseContent = await CourseContent.findById(id).populate([
        { path: "courseId", select: "title description" },
        { path: "moduleId", select: "title description" },
        { path: "authorId", select: "name email" },
      ]);

      if (!courseContent) {
        return res.status(404).json({
          success: false,
          message: "Course content not found",
        });
      }

      // Check access permissions
      const hasAccess = await courseContent.checkAccess(
        req.user._id,
        req.user.role,
        req.user.branchId
      );

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "Access denied to this content",
        });
      }

      // Record view
      await courseContent.recordView(req.user._id, req.user.role);

      // Include analytics if requested and user has permission
      let responseData = courseContent.toObject();
      if (
        includeAnalytics &&
        (req.user.role === "teacher" || req.user.role === "admin")
      ) {
        responseData.analytics = courseContent.analytics;
      }

      res.json({
        success: true,
        data: responseData,
      });
    } catch (error) {
      console.error("Error fetching course content:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch course content",
        error: error.message,
      });
    }
  }

  // Get content by course
  async getContentByCourse(req, res) {
    try {
      const { courseId } = req.params;
      const {
        moduleId,
        contentType,
        status = "published",
        page = 1,
        limit = 20,
        sortBy = "order",
      } = req.query;

      // Build query
      const query = {
        courseId,
        branchId: req.user.branchId,
      };

      // Handle status filtering - convert to isPublished
      if (status === "published") {
        query.isPublished = true;
      } else if (status === "draft") {
        query.isPublished = false;
      }
      // If status is not specified, get all content (published and draft)

      if (moduleId) query.moduleId = moduleId;
      if (contentType) query.type = contentType;

      // Build sort options
      let sortOptions = {};
      switch (sortBy) {
        case "title":
          sortOptions = { title: 1 };
          break;
        case "date":
          sortOptions = { createdAt: -1 };
          break;
        case "views":
          sortOptions = { "analytics.viewCount": -1 };
          break;
        default:
          sortOptions = { order: 1, createdAt: 1 };
      }

      const skip = (page - 1) * limit;

      const [content, total] = await Promise.all([
        CourseContent.find(query)
          .populate([
            { path: "moduleId", select: "title description" },
            { path: "createdBy", select: "firstName lastName" },
          ])
          .sort(sortOptions)
          .skip(skip)
          .limit(parseInt(limit)),
        CourseContent.countDocuments(query),
      ]);

      // Transform data to match frontend expectations
      const transformedContent = content.map((item) => {
        let mediaUrl =
          item.mediaUrl ||
          item.content?.playbackUrl ||
          item.content?.fileUrl ||
          "";
        let videoType = item.content?.videoType || null;

        // For videos with externalLink, use that as mediaUrl for YouTube videos
        if (item.type === "video" && item.content?.externalLink && !mediaUrl) {
          mediaUrl = item.content.externalLink;
          videoType = "youtube";
        }

        // Fallback: if no mediaUrl but there are file materials, use the first one
        if (!mediaUrl && item.materials && item.materials.length > 0) {
          const firstFileMaterial = item.materials.find(
            (m) => m.type === "file" && m.url
          );
          if (firstFileMaterial) {
            mediaUrl = firstFileMaterial.url;
          }
        }

        return {
          _id: item._id,
          title: item.title,
          description: item.description,
          type: item.type,
          content: item.content?.htmlContent || "",
          mediaUrl: mediaUrl,
          externalUrl: item.content?.externalLink || "",
          videoType: videoType,
          estimatedDuration: item.estimatedDuration,
          tags: item.tags || [],
          visibility: item.visibility,
          moduleId: item.moduleId,
          materials: item.materials || [],
          status: item.isPublished ? "published" : "draft",
          courseId: item.courseId,
          author: item.createdBy
            ? `${item.createdBy.firstName} ${item.createdBy.lastName}`
            : "Unknown",
          authorId: item.createdBy?._id,
          branchId: item.branchId,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          // Add metadata for better frontend handling
          fileName: item.content?.fileName,
          mimeType: item.content?.mimeType,
          mediaType:
            item.type === "video"
              ? "video"
              : item.type === "image"
              ? "image"
              : "document",
          // Disable download for ALL videos (both uploaded and YouTube)
          isDownloadable:
            item.type !== "video" &&
            (item.type === "document" || item.type === "image"),
          isStreamable: item.type === "video",
          // Add specific video handling flags
          isYouTubeVideo: videoType === "youtube",
          isUploadedVideo: videoType === "uploaded",
        };
      });

      res.json({
        success: true,
        data: transformedContent, // Return transformed content array directly
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error("Error fetching course content:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch course content",
        error: error.message,
      });
    }
  }

  // Update course content
  async updateContent(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;

      const courseContent = await CourseContent.findById(id);
      if (!courseContent) {
        return res.status(404).json({
          success: false,
          message: "Course content not found",
        });
      }

      // Check permissions
      const canEdit = await courseContent.canEdit(req.user._id, req.user.role);
      if (!canEdit) {
        return res.status(403).json({
          success: false,
          message: "Permission denied to edit this content",
        });
      }

      // Handle file uploads if present
      if (req.files && req.files.length > 0) {
        // Delete old media files if replacing
        if (courseContent.media && courseContent.media.length > 0) {
          for (const mediaItem of courseContent.media) {
            if (mediaItem.streamId) {
              await cloudflareService.deleteFromStream(mediaItem.streamId);
            } else if (mediaItem.url) {
              await cloudflareService.deleteFile(mediaItem.url);
            }
          }
        }

        // Upload new files
        const uploadPromises = req.files.map(async (file) => {
          let uploadResult;

          if (file.mimetype.startsWith("video/")) {
            uploadResult = await cloudflareService.uploadToStream(file.buffer, {
              filename: file.originalname,
              metadata: {
                title: updates.title || courseContent.title,
                courseId: courseContent.courseId,
                uploadedBy: req.user._id,
              },
            });

            return {
              type: "video",
              url: uploadResult.playbackUrl,
              streamId: uploadResult.uid,
              thumbnailUrl: uploadResult.thumbnail,
              duration: uploadResult.duration,
              fileName: file.originalname,
              fileSize: file.size,
            };
          } else {
            uploadResult = await cloudflareService.uploadFile(file.buffer, {
              filename: file.originalname,
              contentType: file.mimetype,
              folder: `course-content/${courseContent.courseId}`,
            });

            return {
              type: file.mimetype.startsWith("image/") ? "image" : "document",
              url: uploadResult.url,
              fileName: file.originalname,
              fileSize: file.size,
              fileType: file.mimetype,
            };
          }
        });

        const uploadResults = await Promise.all(uploadPromises);
        updates.media = uploadResults;
      }

      // Track version history
      await courseContent.createVersion(
        req.user._id,
        updates.versionNotes || "Content updated"
      );

      // Update content
      Object.assign(courseContent, updates);
      courseContent.lastModifiedBy = req.user._id;
      courseContent.lastModifiedAt = new Date();

      await courseContent.save();

      await courseContent.populate([
        { path: "courseId", select: "title description" },
        { path: "moduleId", select: "title description" },
        { path: "authorId", select: "name email" },
      ]);

      res.json({
        success: true,
        message: "Course content updated successfully",
        data: courseContent,
      });
    } catch (error) {
      console.error("Error updating course content:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update course content",
        error: error.message,
      });
    }
  }

  // Delete course content
  async deleteContent(req, res) {
    try {
      const { id } = req.params;
      const { permanent = false } = req.query;

      const courseContent = await CourseContent.findById(id);
      if (!courseContent) {
        return res.status(404).json({
          success: false,
          message: "Course content not found",
        });
      }

      // Check permissions
      const canDelete = await courseContent.canDelete(
        req.user._id,
        req.user.role
      );
      if (!canDelete) {
        return res.status(403).json({
          success: false,
          message: "Permission denied to delete this content",
        });
      }

      if (permanent) {
        // Permanently delete
        if (courseContent.media && courseContent.media.length > 0) {
          for (const mediaItem of courseContent.media) {
            if (mediaItem.streamId) {
              await cloudflareService.deleteFromStream(mediaItem.streamId);
            } else if (mediaItem.url) {
              await cloudflareService.deleteFile(mediaItem.url);
            }
          }
        }

        // Remove from module if associated
        if (courseContent.moduleId) {
          await LearningModule.findByIdAndUpdate(courseContent.moduleId, {
            $pull: { contentItems: courseContent._id },
          });
        }

        await CourseContent.findByIdAndDelete(id);

        res.json({
          success: true,
          message: "Course content permanently deleted",
        });
      } else {
        // Soft delete
        courseContent.status = "deleted";
        courseContent.deletedBy = req.user._id;
        courseContent.deletedAt = new Date();
        await courseContent.save();

        res.json({
          success: true,
          message: "Course content deleted successfully",
        });
      }
    } catch (error) {
      console.error("Error deleting course content:", error);
      res.status(500).json({
        success: false,
        message: "Failed to delete course content",
        error: error.message,
      });
    }
  }

  // Share content
  async shareContent(req, res) {
    try {
      const { id } = req.params;
      const { shareWith, permissions, expiresAt, message } = req.body;

      const courseContent = await CourseContent.findById(id);
      if (!courseContent) {
        return res.status(404).json({
          success: false,
          message: "Course content not found",
        });
      }

      // Check if user can share this content
      const canShare = await courseContent.canShare(
        req.user._id,
        req.user.role
      );
      if (!canShare) {
        return res.status(403).json({
          success: false,
          message: "Permission denied to share this content",
        });
      }

      await courseContent.shareWith(
        shareWith.userId,
        shareWith.userType,
        permissions,
        req.user._id,
        expiresAt,
        message
      );

      res.json({
        success: true,
        message: "Content shared successfully",
      });
    } catch (error) {
      console.error("Error sharing content:", error);
      res.status(500).json({
        success: false,
        message: "Failed to share content",
        error: error.message,
      });
    }
  }

  // Get content analytics
  async getAnalytics(req, res) {
    try {
      const { id } = req.params;
      const { period = "30d" } = req.query;

      const courseContent = await CourseContent.findById(id);
      if (!courseContent) {
        return res.status(404).json({
          success: false,
          message: "Course content not found",
        });
      }

      // Check permissions
      if (req.user.role !== "teacher" && req.user.role !== "admin") {
        return res.status(403).json({
          success: false,
          message: "Permission denied to view analytics",
        });
      }

      const analytics = await courseContent.getDetailedAnalytics(period);

      res.json({
        success: true,
        data: analytics,
      });
    } catch (error) {
      console.error("Error fetching analytics:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch analytics",
        error: error.message,
      });
    }
  }

  // Duplicate content
  async duplicateContent(req, res) {
    try {
      const { id } = req.params;
      const { title, targetCourseId, targetModuleId } = req.body;

      const originalContent = await CourseContent.findById(id);
      if (!originalContent) {
        return res.status(404).json({
          success: false,
          message: "Course content not found",
        });
      }

      // Check permissions
      const canDuplicate = await originalContent.canEdit(
        req.user._id,
        req.user.role
      );
      if (!canDuplicate) {
        return res.status(403).json({
          success: false,
          message: "Permission denied to duplicate this content",
        });
      }

      const duplicatedContent = await originalContent.duplicate(
        title || `${originalContent.title} (Copy)`,
        targetCourseId || originalContent.courseId,
        targetModuleId || originalContent.moduleId,
        req.user._id
      );

      await duplicatedContent.populate([
        { path: "courseId", select: "title description" },
        { path: "moduleId", select: "title description" },
        { path: "authorId", select: "name email" },
      ]);

      res.status(201).json({
        success: true,
        message: "Content duplicated successfully",
        data: duplicatedContent,
      });
    } catch (error) {
      console.error("Error duplicating content:", error);
      res.status(500).json({
        success: false,
        message: "Failed to duplicate content",
        error: error.message,
      });
    }
  }

  // Search content
  async searchContent(req, res) {
    try {
      const {
        q: searchTerm,
        courseId,
        contentType,
        tags,
        page = 1,
        limit = 20,
      } = req.query;

      if (!searchTerm) {
        return res.status(400).json({
          success: false,
          message: "Search term is required",
        });
      }

      const filters = {
        branchId: req.user.branchId,
        status: "published",
      };

      if (courseId) filters.courseId = courseId;
      if (contentType) filters.contentType = contentType;
      if (tags) filters.tags = { $in: tags.split(",") };

      const skip = (page - 1) * limit;

      const [results, total] = await Promise.all([
        CourseContent.searchContent(searchTerm, filters, skip, parseInt(limit)),
        CourseContent.countDocuments({
          $text: { $search: searchTerm },
          ...filters,
        }),
      ]);

      res.json({
        success: true,
        data: {
          results,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit),
          },
        },
      });
    } catch (error) {
      console.error("Error searching content:", error);
      res.status(500).json({
        success: false,
        message: "Failed to search content",
        error: error.message,
      });
    }
  }
}

module.exports = new CourseContentController();
