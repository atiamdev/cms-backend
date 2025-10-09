const {
  LearningModule,
  CourseContent,
  ECourse,
} = require("../../models/elearning");
const { validationResult } = require("express-validator");

class LearningModuleController {
  // Create new learning module
  async createModule(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { courseId } = req.params;
      const {
        title,
        description,
        estimatedDuration,
        status,
        settings,
        contents,
      } = req.body;

      // Verify course exists and user has access
      const course = await ECourse.findById(courseId);
      if (!course) {
        return res.status(404).json({
          success: false,
          message: "Course not found",
        });
      }

      // Check if user has permission to create modules for this course
      if (course.branchId.toString() !== req.user.branchId.toString()) {
        return res.status(403).json({
          success: false,
          message: "Permission denied to create modules for this course",
        });
      }

      // Get next order
      const nextOrder = course.modules ? course.modules.length + 1 : 1;

      const moduleData = {
        title,
        description,
        order: nextOrder,
        estimatedDuration: estimatedDuration || 0,
        status: status || "draft",
        settings: settings || {
          allowSkip: false,
          requireCompletion: true,
          attempts: 1,
        },
        contents: contents || [],
        createdAt: new Date(),
      };

      // Add module to course
      course.modules.push(moduleData);
      await course.save();

      // Return the newly created module
      const newModule = course.modules[course.modules.length - 1];

      res.status(201).json({
        success: true,
        message: "Learning module created successfully",
        data: {
          ...newModule.toObject(),
          _id: newModule._id,
        },
      });
    } catch (error) {
      console.error("Error creating learning module:", error);
      res.status(500).json({
        success: false,
        message: "Failed to create learning module",
        error: error.message,
      });
    }
  }

  // Get module by ID
  async getModule(req, res) {
    try {
      const { id } = req.params;
      const { includeContent = false, includeAnalytics = false } = req.query;

      let populateFields = [
        { path: "courseId", select: "title description" },
        { path: "createdBy", select: "name email" },
      ];

      if (includeContent === "true") {
        populateFields.push({
          path: "contents",
          match: { status: "published" },
          select: "title description type order estimatedDuration",
          options: { sort: { order: 1 } },
        });
      }

      const learningModule = await LearningModule.findById(id).populate(
        populateFields
      );

      if (!learningModule) {
        return res.status(404).json({
          success: false,
          message: "Learning module not found",
        });
      }

      // Check access permissions
      if (learningModule.branchId.toString() !== req.user.branchId.toString()) {
        return res.status(403).json({
          success: false,
          message: "Access denied to this module",
        });
      }

      let responseData = learningModule.toObject();

      // Include analytics if requested and user has permission
      if (
        includeAnalytics === "true" &&
        (req.user.role === "teacher" || req.user.role === "admin")
      ) {
        responseData.analytics = learningModule.analytics;
        responseData.completionStats =
          await learningModule.getCompletionStats();
      }

      res.json({
        success: true,
        data: responseData,
      });
    } catch (error) {
      console.error("Error fetching learning module:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch learning module",
        error: error.message,
      });
    }
  }

  // Get modules by course
  async getModulesByCourse(req, res) {
    try {
      const { courseId } = req.params;
      const {
        includeContent = false,
        status,
        page = 1,
        limit = 50,
      } = req.query;

      // Verify course access
      const course = await ECourse.findById(courseId);
      if (!course) {
        return res.status(404).json({
          success: false,
          message: "Course not found",
        });
      }

      if (course.branchId.toString() !== req.user.branchId.toString()) {
        return res.status(403).json({
          success: false,
          message: "Access denied to this course",
        });
      }

      // Filter modules based on status if provided
      let modules = course.modules || [];
      if (status) {
        modules = modules.filter((module) => module.status === status);
      }

      // Sort by order
      modules.sort((a, b) => a.order - b.order);

      // Pagination
      const skip = (page - 1) * limit;
      const paginatedModules = modules.slice(skip, skip + parseInt(limit));

      res.json({
        success: true,
        data: {
          modules: paginatedModules,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: modules.length,
            pages: Math.ceil(modules.length / limit),
          },
        },
      });
    } catch (error) {
      console.error("Error fetching course modules:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch course modules",
        error: error.message,
      });
    }
  }

  // Update learning module
  async updateModule(req, res) {
    try {
      const { courseId, moduleId } = req.params;
      const updates = req.body;

      // Find the course
      const course = await ECourse.findById(courseId);
      if (!course) {
        return res.status(404).json({
          success: false,
          message: "Course not found",
        });
      }

      // Check permissions
      if (course.branchId.toString() !== req.user.branchId.toString()) {
        return res.status(403).json({
          success: false,
          message: "Permission denied to edit this module",
        });
      }

      // Find the module in the course
      const moduleIndex = course.modules.findIndex(
        (m) => m._id.toString() === moduleId
      );
      if (moduleIndex === -1) {
        return res.status(404).json({
          success: false,
          message: "Module not found",
        });
      }

      // Update the module
      Object.assign(course.modules[moduleIndex], updates);
      await course.save();

      res.json({
        success: true,
        message: "Learning module updated successfully",
        data: course.modules[moduleIndex],
      });
    } catch (error) {
      console.error("Error updating learning module:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update learning module",
        error: error.message,
      });
    }
  }

  // Delete learning module
  async deleteModule(req, res) {
    try {
      const { courseId, moduleId } = req.params;

      // Find the course
      const course = await ECourse.findById(courseId);
      if (!course) {
        return res.status(404).json({
          success: false,
          message: "Course not found",
        });
      }

      // Check permissions
      if (course.branchId.toString() !== req.user.branchId.toString()) {
        return res.status(403).json({
          success: false,
          message: "Permission denied to delete this module",
        });
      }

      // Find and remove the module
      const moduleIndex = course.modules.findIndex(
        (m) => m._id.toString() === moduleId
      );
      if (moduleIndex === -1) {
        return res.status(404).json({
          success: false,
          message: "Module not found",
        });
      }

      // Remove the module from the array
      course.modules.splice(moduleIndex, 1);
      await course.save();

      res.json({
        success: true,
        message: "Learning module deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting learning module:", error);
      res.status(500).json({
        success: false,
        message: "Failed to delete learning module",
        error: error.message,
      });
    }
  }

  // Reorder modules
  async reorderModules(req, res) {
    try {
      const { courseId } = req.params;
      const { moduleOrders } = req.body; // Array of { id, order }

      // Verify course access
      const course = await Course.findById(courseId);
      if (!course) {
        return res.status(404).json({
          success: false,
          message: "Course not found",
        });
      }

      if (course.branchId.toString() !== req.user.branchId.toString()) {
        return res.status(403).json({
          success: false,
          message: "Access denied to this course",
        });
      }

      // Update each module's order
      const updatePromises = moduleOrders.map(({ id, order }) =>
        LearningModule.findByIdAndUpdate(id, { order })
      );

      await Promise.all(updatePromises);

      // Get updated modules
      const updatedModules = await LearningModule.find({ courseId })
        .sort({ order: 1 })
        .select("title order");

      res.json({
        success: true,
        message: "Modules reordered successfully",
        data: updatedModules,
      });
    } catch (error) {
      console.error("Error reordering modules:", error);
      res.status(500).json({
        success: false,
        message: "Failed to reorder modules",
        error: error.message,
      });
    }
  }

  // Add content to module
  async addContent(req, res) {
    try {
      const { id } = req.params;
      const { contentId } = req.body;

      const learningModule = await LearningModule.findById(id);
      if (!learningModule) {
        return res.status(404).json({
          success: false,
          message: "Learning module not found",
        });
      }

      // Check permissions
      if (learningModule.branchId.toString() !== req.user.branchId.toString()) {
        return res.status(403).json({
          success: false,
          message: "Permission denied to modify this module",
        });
      }

      // Verify content exists
      const content = await CourseContent.findById(contentId);
      if (!content) {
        return res.status(404).json({
          success: false,
          message: "Content not found",
        });
      }

      // Add content to module
      await learningModule.addContent(contentId);

      // Update content's module reference
      content.moduleId = learningModule._id;
      await content.save();

      res.json({
        success: true,
        message: "Content added to module successfully",
      });
    } catch (error) {
      console.error("Error adding content to module:", error);
      res.status(500).json({
        success: false,
        message: "Failed to add content to module",
        error: error.message,
      });
    }
  }

  // Remove content from module
  async removeContent(req, res) {
    try {
      const { id } = req.params;
      const { contentId } = req.body;

      const learningModule = await LearningModule.findById(id);
      if (!learningModule) {
        return res.status(404).json({
          success: false,
          message: "Learning module not found",
        });
      }

      // Check permissions
      if (learningModule.branchId.toString() !== req.user.branchId.toString()) {
        return res.status(403).json({
          success: false,
          message: "Permission denied to modify this module",
        });
      }

      // Remove content from module
      await learningModule.removeContent(contentId);

      // Remove module reference from content
      await CourseContent.findByIdAndUpdate(contentId, {
        $unset: { moduleId: 1 },
      });

      res.json({
        success: true,
        message: "Content removed from module successfully",
      });
    } catch (error) {
      console.error("Error removing content from module:", error);
      res.status(500).json({
        success: false,
        message: "Failed to remove content from module",
        error: error.message,
      });
    }
  }

  // Get module analytics
  async getAnalytics(req, res) {
    try {
      const { id } = req.params;

      const learningModule = await LearningModule.findById(id);
      if (!learningModule) {
        return res.status(404).json({
          success: false,
          message: "Learning module not found",
        });
      }

      // Check permissions
      if (req.user.role !== "teacher" && req.user.role !== "admin") {
        return res.status(403).json({
          success: false,
          message: "Permission denied to view analytics",
        });
      }

      if (learningModule.branchId.toString() !== req.user.branchId.toString()) {
        return res.status(403).json({
          success: false,
          message: "Access denied to this module",
        });
      }

      const analytics = {
        ...learningModule.analytics,
        completionStats: await learningModule.getCompletionStats(),
        progressDistribution: await learningModule.getProgressDistribution(),
        averageTimeSpent: await learningModule.getAverageTimeSpent(),
      };

      res.json({
        success: true,
        data: analytics,
      });
    } catch (error) {
      console.error("Error fetching module analytics:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch module analytics",
        error: error.message,
      });
    }
  }

  // Duplicate module
  async duplicateModule(req, res) {
    try {
      const { id } = req.params;
      const { title, targetCourseId } = req.body;

      const originalModule = await LearningModule.findById(id).populate(
        "contents"
      );

      if (!originalModule) {
        return res.status(404).json({
          success: false,
          message: "Learning module not found",
        });
      }

      // Check permissions
      if (originalModule.branchId.toString() !== req.user.branchId.toString()) {
        return res.status(403).json({
          success: false,
          message: "Permission denied to duplicate this module",
        });
      }

      const duplicatedModule = await originalModule.duplicate(
        title || `${originalModule.title} (Copy)`,
        targetCourseId || originalModule.courseId,
        req.user._id
      );

      await duplicatedModule.populate([
        { path: "courseId", select: "title description" },
        { path: "createdBy", select: "name email" },
        { path: "contents", select: "title type status" },
      ]);

      res.status(201).json({
        success: true,
        message: "Module duplicated successfully",
        data: duplicatedModule,
      });
    } catch (error) {
      console.error("Error duplicating module:", error);
      res.status(500).json({
        success: false,
        message: "Failed to duplicate module",
        error: error.message,
      });
    }
  }

  // Get module prerequisites
  async getPrerequisites(req, res) {
    try {
      const { id } = req.params;

      const learningModule = await LearningModule.findById(id);
      if (!learningModule) {
        return res.status(404).json({
          success: false,
          message: "Learning module not found",
        });
      }

      const prerequisites = await learningModule.getPrerequisiteModules();

      res.json({
        success: true,
        data: prerequisites,
      });
    } catch (error) {
      console.error("Error fetching prerequisites:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch prerequisites",
        error: error.message,
      });
    }
  }

  // Check if prerequisites are met
  async checkPrerequisites(req, res) {
    try {
      const { id } = req.params;
      const { studentId } = req.query;

      const learningModule = await LearningModule.findById(id);
      if (!learningModule) {
        return res.status(404).json({
          success: false,
          message: "Learning module not found",
        });
      }

      const targetStudentId = studentId || req.user._id;
      const prerequisitesMet = await learningModule.checkPrerequisites(
        targetStudentId
      );

      res.json({
        success: true,
        data: { prerequisitesMet },
      });
    } catch (error) {
      console.error("Error checking prerequisites:", error);
      res.status(500).json({
        success: false,
        message: "Failed to check prerequisites",
        error: error.message,
      });
    }
  }
}

module.exports = new LearningModuleController();
