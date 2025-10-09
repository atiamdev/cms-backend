const { LearningProgress, Enrollment } = require("../../models/elearning");
const mongoose = require("mongoose");

/**
 * Update content progress for a student
 * PUT /api/elearning/courses/:courseId/modules/:moduleId/content/:contentId/progress
 */
const updateContentProgress = async (req, res) => {
  try {
    const { courseId, moduleId, contentId } = req.params;
    const { status, progress, timeSpent, videoProgress } = req.body;

    // Get student profile
    const Student = require("../../models/Student");
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    const studentId = student._id;

    // Validate required parameters
    if (!courseId || !moduleId || !contentId) {
      return res.status(400).json({
        success: false,
        message: "Course ID, Module ID, and Content ID are required",
      });
    }

    // Check if student is enrolled in the course (allow any status except dropped/suspended)
    const enrollment = await Enrollment.findOne({
      studentId,
      courseId,
      status: { $nin: ["dropped", "suspended"] },
    });

    if (!enrollment) {
      return res.status(403).json({
        success: false,
        message: "Student is not enrolled in this course",
      });
    }

    // Find or create learning progress record
    let learningProgress = await LearningProgress.findOne({
      studentId,
      courseId,
    });

    if (!learningProgress) {
      learningProgress = new LearningProgress({
        studentId,
        courseId,
        branchId: enrollment.branchId,
        moduleProgress: [],
      });
    }

    // Find or create module progress
    let moduleProgress = learningProgress.moduleProgress.find(
      (mp) => mp.moduleId.toString() === moduleId
    );

    if (!moduleProgress) {
      moduleProgress = {
        moduleId,
        status: "in_progress",
        startedAt: new Date(),
        progress: 0,
        contentProgress: [],
      };
      learningProgress.moduleProgress.push(moduleProgress);
    }

    // Find or create content progress
    let contentProgress = moduleProgress.contentProgress.find(
      (cp) => cp.contentId && cp.contentId.toString() === contentId
    );

    if (!contentProgress) {
      contentProgress = {
        contentId,
        status: "in_progress",
        viewedAt: new Date(),
      };
      moduleProgress.contentProgress.push(contentProgress);
    }

    // Update content progress
    if (status) {
      contentProgress.status = status;
      if (status === "completed") {
        contentProgress.completedAt = new Date();
      }
    }

    if (progress !== undefined) {
      contentProgress.progress = progress;
    }

    if (timeSpent !== undefined) {
      contentProgress.timeSpent = (contentProgress.timeSpent || 0) + timeSpent;
    }

    if (videoProgress) {
      contentProgress.videoProgress = {
        ...contentProgress.videoProgress,
        ...videoProgress,
      };
    }

    // Update module progress based on content completion
    const totalContent = moduleProgress.contentProgress.length;
    const completedContent = moduleProgress.contentProgress.filter(
      (cp) => cp.status === "completed"
    ).length;

    moduleProgress.progress =
      totalContent > 0 ? (completedContent / totalContent) * 100 : 0;

    if (moduleProgress.progress >= 100) {
      moduleProgress.status = "completed";
      moduleProgress.completedAt = new Date();
    } else if (moduleProgress.progress > 0) {
      moduleProgress.status = "in_progress";
    }

    moduleProgress.lastAccessedAt = new Date();

    // Update overall course progress
    const totalModules = learningProgress.moduleProgress.length;
    const completedModules = learningProgress.moduleProgress.filter(
      (mp) => mp.status === "completed"
    ).length;

    learningProgress.overallProgress =
      totalModules > 0 ? (completedModules / totalModules) * 100 : 0;

    if (learningProgress.overallProgress >= 100) {
      learningProgress.status = "completed";
    } else if (learningProgress.overallProgress > 0) {
      learningProgress.status = "in_progress";
    }

    learningProgress.lastActivityAt = new Date();
    learningProgress.totalTimeSpent =
      (learningProgress.totalTimeSpent || 0) + (timeSpent || 0);

    // Update enrollment progress
    enrollment.progress = learningProgress.overallProgress;
    enrollment.lastAccessedAt = new Date();

    if (learningProgress.status === "completed") {
      enrollment.status = "completed";
      enrollment.completedAt = new Date();

      // Generate certificate for course completion
      try {
        const certificateService = require("../services/certificateService");
        await certificateService.generateCertificate(
          enrollment.studentId,
          enrollment.courseId,
          enrollment._id
        );
        console.log(
          `Certificate generated for student ${enrollment.studentId} and course ${enrollment.courseId}`
        );
      } catch (certError) {
        console.error("Error generating certificate:", certError);
        // Don't fail the progress update if certificate generation fails
      }

      // Send course completion notification
      try {
        const notificationService = require("../../services/notificationService");
        const course = await require("../../models/elearning").ECourse.findById(
          enrollment.courseId
        );
        const student = await require("../../models/Student")
          .findById(enrollment.studentId)
          .populate("userId");

        if (course && student) {
          await notificationService.notifyUser({
            userId: student.userId._id,
            title: `Course Completed: ${course.title}`,
            message: `Congratulations! You have successfully completed the course "${course.title}". Your certificate is now available.`,
            type: "academic",
            actionUrl: `/student/courses/${enrollment.courseId}/certificate`,
          });
          console.log(
            `Course completion notification sent to student ${student.userId._id}`
          );
        }
      } catch (notifError) {
        console.error(
          "Error sending course completion notification:",
          notifError
        );
        // Don't fail the progress update if notification fails
      }
    }

    await learningProgress.save();
    await enrollment.save();

    res.json({
      success: true,
      message: "Content progress updated successfully",
      data: {
        contentProgress: {
          contentId,
          status: contentProgress.status,
          progress: contentProgress.progress,
          completedAt: contentProgress.completedAt,
        },
        moduleProgress: {
          moduleId,
          progress: moduleProgress.progress,
          status: moduleProgress.status,
        },
        courseProgress: {
          progress: learningProgress.overallProgress,
          status: learningProgress.status,
        },
      },
    });
  } catch (error) {
    console.error("Error updating content progress:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update content progress",
      error: error.message,
    });
  }
};

/**
 * Get learning progress for a course
 * GET /api/elearning/courses/:courseId/progress
 */
const getCourseProgress = async (req, res) => {
  try {
    const { courseId } = req.params;

    // Get student profile
    const Student = require("../../models/Student");
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    const studentId = student._id;

    const learningProgress = await LearningProgress.findOne({
      studentId,
      courseId,
    }).populate({
      path: "moduleProgress.moduleId",
      select: "title description order",
    });

    if (!learningProgress) {
      return res.json({
        success: true,
        data: {
          overallProgress: 0,
          status: "not_started",
          moduleProgress: [],
        },
      });
    }

    res.json({
      success: true,
      data: {
        overallProgress: learningProgress.overallProgress,
        status: learningProgress.status,
        totalTimeSpent: learningProgress.totalTimeSpent,
        lastActivityAt: learningProgress.lastActivityAt,
        moduleProgress: learningProgress.moduleProgress,
      },
    });
  } catch (error) {
    console.error("Error fetching course progress:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch course progress",
      error: error.message,
    });
  }
};

module.exports = {
  updateContentProgress,
  getCourseProgress,
};
