const {
  ECourse,
  CourseContent,
  LearningModule,
  Enrollment,
  LearningProgress,
  Rating,
  QuizAttempt,
} = require("../../models/elearning");
const User = require("../../models/User");
const { validationResult } = require("express-validator");

class ECourseController {
  // Get all e-courses for the current teacher
  async getTeacherCourses(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      const filter = {
        instructor: req.user._id,
        branchId: req.user.branchId,
      };

      // Add status filter if provided
      if (req.query.status) {
        filter.status = req.query.status;
      }

      const courses = await ECourse.find(filter)
        .populate("instructor", "firstName lastName email")
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await ECourse.countDocuments(filter);

      // Get enrollment counts for each course
      const courseIds = courses.map((course) => course._id);
      const enrollmentCounts = await Enrollment.aggregate([
        {
          $match: {
            courseId: { $in: courseIds },
            status: { $in: ["active", "approved", "completed"] },
          },
        },
        {
          $group: {
            _id: "$courseId",
            totalStudents: { $sum: 1 },
          },
        },
      ]);

      // Create a map of courseId to enrollment count
      const enrollmentMap = new Map();
      enrollmentCounts.forEach((count) => {
        enrollmentMap.set(count._id.toString(), count.totalStudents);
      });

      // Add stats to each course
      const coursesWithStats = courses.map((course) => {
        const courseObj = course.toObject();
        courseObj.stats = courseObj.stats || {};
        courseObj.stats.totalStudents =
          enrollmentMap.get(course._id.toString()) || 0;
        return courseObj;
      });

      res.json({
        success: true,
        data: {
          courses: coursesWithStats,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
          },
        },
      });
    } catch (error) {
      console.error("Error fetching teacher courses:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch courses",
        error: error.message,
      });
    }
  }

  // Create a new e-course
  async createCourse(req, res) {
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
        shortDescription,
        category,
        level,
        language,
        duration,
        pricing,
        registration,
        settings,
        tags,
        thumbnail,
      } = req.body;

      const courseData = {
        title,
        description,
        shortDescription,
        category: category || "Other",
        level: level || "Beginner",
        language: language || "English",
        duration: duration || { estimatedHours: 0, estimatedMinutes: 0 },
        pricing: pricing || { type: "free", amount: 0, currency: "KES" },
        registration: registration || { type: "self" },
        settings: settings || {},
        tags: tags || [],
        thumbnail: thumbnail || null,
        instructor: req.user._id,
        branchId: req.user.branchId,
        status: "pending_approval",
        approvalStatus: "pending",
      };
      const course = new ECourse(courseData);
      await course.save();

      // Submit for approval
      await course.submitForApproval(
        req.user._id,
        "Course created and submitted for approval"
      );

      await course.populate("instructor", "firstName lastName email");

      res.status(201).json({
        success: true,
        message: "E-Course created successfully",
        data: course,
      });
    } catch (error) {
      console.error("Error creating course:", error);
      res.status(500).json({
        success: false,
        message: "Failed to create course",
        error: error.message,
      });
    }
  }

  // Get course details
  async getCourse(req, res) {
    try {
      const { courseId } = req.params;

      const course = await ECourse.findById(courseId)
        .populate("instructor", "firstName lastName email")
        .populate("content");

      if (!course) {
        return res.status(404).json({
          success: false,
          message: "Course not found",
        });
      }

      // Check if user has access to this course
      const isInstructor =
        course.instructor._id.toString() === req.user._id.toString();
      const isAdmin =
        req.user.roles.includes("admin") ||
        req.user.roles.includes("superadmin") ||
        req.user.roles.includes("branchadmin");
      const isStudent = req.user.roles.includes("student");

      if (!isInstructor && !isAdmin) {
        if (isStudent) {
          // For students, find the student record first
          const Student = require("../../models/Student");
          const student = await Student.findOne({ userId: req.user._id });
          if (!student) {
            return res.status(404).json({
              success: false,
              message: "Student profile not found",
            });
          }

          // Check enrollment
          const enrollment = await Enrollment.findOne({
            studentId: student._id,
            courseId,
            status: { $in: ["active", "approved", "completed"] },
          });
          if (!enrollment) {
            return res.status(403).json({
              success: false,
              message: "Access denied. You are not enrolled in this course.",
            });
          }
        } else {
          return res.status(403).json({
            success: false,
            message: "Access denied",
          });
        }
      }

      // For students, get enrollment and progress data
      let enrollmentData = null;
      let learningProgress = null;
      let student = null;
      if (isStudent) {
        // Find the student record first
        const Student = require("../../models/Student");
        student = await Student.findOne({ userId: req.user._id });
        if (student) {
          enrollmentData = await Enrollment.findOne({
            studentId: student._id,
            courseId,
            status: { $in: ["active", "approved", "completed"] },
          });

          // Also fetch learning progress
          learningProgress = await LearningProgress.findOne({
            studentId: student._id,
            courseId,
          });
        }
      }

      // Transform the course data to match frontend expectations
      const transformedCourse = course.toObject();

      // Include modules with content for teachers and admins, and lessons for students
      if (isInstructor || isAdmin || isStudent) {
        // Fetch LearningModule documents for this course
        const learningModules = await LearningModule.find({
          courseId,
          branchId: course.branchId,
        })
          .populate("createdBy", "firstName lastName email")
          .sort({ order: 1 });

        // Fetch content for each module
        const modulesWithContent = await Promise.all(
          learningModules.map(async (module) => {
            const content = await CourseContent.find({
              courseId: courseId,
              moduleId: module._id,
              isPublished: true, // Only show published content
              status: { $ne: "deleted" },
            }).sort({ order: 1 });

            if (isInstructor || isAdmin) {
              return {
                _id: module._id,
                title: module.title,
                description: module.description,
                order: module.order,
                estimatedDuration: module.estimatedDuration,
                status: module.status,
                settings: module.settings,
                quizId: module.quizId,
                createdBy: module.createdBy,
                createdAt: module.createdAt,
                updatedAt: module.updatedAt,
                contents: content.map((item) => ({
                  _id: item._id,
                  title: item.title,
                  description: item.description,
                  type: item.type,
                  content:
                    item.content.htmlContent || item.content.externalLink || "",
                  mediaUrl: item.content.playbackUrl || item.content.fileUrl,
                  externalUrl: item.content.externalLink,
                  // Add new array fields for mixed content support
                  mediaUrls: item.content.mediaUrls || [],
                  externalUrls: item.content.externalUrls || [],
                  contentItems: item.content.contentItems || [],
                  videoType: item.content.videoType,
                  quizId: item.quizId, // Add quizId for quiz content
                  estimatedDuration: item.estimatedDuration,
                  materials: item.materials,
                  status: item.isPublished ? "published" : "draft",
                  order: item.order,
                  createdAt: item.createdAt,
                  updatedAt: item.updatedAt,
                })),
              };
            } else if (isStudent) {
              // For students, check if module is accessible based on quiz completion or learning progress
              let isAccessible = true;

              // First module is always accessible
              if (module.order > 1) {
                // Check learning progress first - if module is already in_progress or completed, it's accessible
                if (learningProgress) {
                  const currentModuleProgress =
                    learningProgress.moduleProgress.find(
                      (mp) => mp.moduleId.toString() === module._id.toString()
                    );

                  // If this module is already in_progress or completed, it's accessible
                  if (
                    currentModuleProgress &&
                    (currentModuleProgress.status === "in_progress" ||
                      currentModuleProgress.status === "completed")
                  ) {
                    isAccessible = true;
                  } else {
                    // Otherwise, check if previous module's quiz was completed
                    const prevModule = learningModules.find(
                      (m) => m.order === module.order - 1
                    );

                    if (prevModule) {
                      if (prevModule.quizId) {
                        const quizAttempt = await QuizAttempt.findOne({
                          studentId: student._id,
                          quizId: prevModule.quizId,
                          status: {
                            $in: [
                              "submitted",
                              "submitted_pending_grading",
                              "partially_graded",
                            ],
                          },
                          percentageScore: { $gte: 60 }, // Assuming 60% passing score
                        }).sort({ submittedAt: -1 });
                        isAccessible = !!quizAttempt;
                      } else {
                        // If previous module doesn't have a quiz, check if it's completed in learning progress
                        const prevModuleProgress =
                          learningProgress.moduleProgress.find(
                            (mp) =>
                              mp.moduleId.toString() ===
                              prevModule._id.toString()
                          );
                        isAccessible =
                          prevModuleProgress?.status === "completed";
                      }
                    }
                  }
                } else {
                  // No learning progress, default to checking previous module quiz
                  const prevModule = learningModules.find(
                    (m) => m.order === module.order - 1
                  );

                  if (prevModule && prevModule.quizId) {
                    const quizAttempt = await QuizAttempt.findOne({
                      studentId: student._id,
                      quizId: prevModule.quizId,
                      status: {
                        $in: [
                          "submitted",
                          "submitted_pending_grading",
                          "partially_graded",
                        ],
                      },
                      percentageScore: { $gte: 60 },
                    }).sort({ submittedAt: -1 });
                    isAccessible = !!quizAttempt;
                  } else {
                    isAccessible = false;
                  }
                }
              }

              // For students, transform to lessons
              const lessons = content.map((item, index) => {
                // Check if lesson is completed in progress data
                let isCompleted = false;
                if (learningProgress) {
                  const moduleProgress = learningProgress.moduleProgress.find(
                    (mp) => mp.moduleId.toString() === module._id.toString()
                  );
                  if (moduleProgress) {
                    const contentProgress = moduleProgress.contentProgress.find(
                      (cp) =>
                        cp.contentId &&
                        cp.contentId.toString() === item._id.toString()
                    );
                    if (
                      contentProgress &&
                      contentProgress.status === "completed"
                    ) {
                      isCompleted = true;
                    }
                  }
                }

                // Generate proper video URL
                let videoUrl = item.content?.playbackUrl;
                if (!videoUrl && item.content?.streamUid) {
                  // Generate playback URL from stream UID
                  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
                  videoUrl = `https://customer-${accountId}.cloudflarestream.com/${item.content.streamUid}/manifest/video.m3u8`;
                }
                // If no playbackUrl or streamUid, check for external link (YouTube, etc.)
                if (!videoUrl && item.content?.externalLink) {
                  videoUrl = item.content.externalLink;
                }

                return {
                  _id: item._id,
                  title: item.title,
                  description: item.description,
                  type: item.type,
                  duration: item.estimatedDuration || item.content?.duration,
                  content:
                    item.content?.htmlContent ||
                    item.content?.externalLink ||
                    "",
                  videoUrl,
                  fileUrl: item.content?.fileUrl,
                  // Add mixed content support
                  mediaUrls: item.content?.mediaUrls || [],
                  externalUrls: item.content?.externalUrls || [],
                  contentItems: item.content?.contentItems || [],
                  attachments: item.materials || [],
                  isCompleted,
                  isLocked: !isAccessible, // Inherit module's accessibility
                  order: index + 1,
                };
              });

              // Check if module is completed
              let moduleCompleted = false;
              let quizCompleted = false;
              if (learningProgress) {
                const moduleProgress = learningProgress.moduleProgress.find(
                  (mp) => mp.moduleId.toString() === module._id.toString()
                );
                if (moduleProgress && moduleProgress.status === "completed") {
                  moduleCompleted = true;
                }
              }

              // Check if quiz is completed
              if (module.quizId) {
                const quizAttempt = await QuizAttempt.findOne({
                  studentId: student._id,
                  quizId: module.quizId,
                  status: {
                    $in: [
                      "submitted",
                      "submitted_pending_grading",
                      "partially_graded",
                    ],
                  },
                  percentageScore: { $gte: 60 }, // Assuming 60% passing score
                }).sort({ submittedAt: -1 }); // Get most recent passing attempt
                quizCompleted = !!quizAttempt;
              }

              return {
                _id: module._id,
                title: module.title,
                description: module.description,
                order: module.order,
                estimatedDuration: module.estimatedDuration,
                status: module.status,
                quizId: module.quizId,
                lessons,
                isCompleted: moduleCompleted,
                quizCompleted,
                isAccessible,
                isLocked: !isAccessible,
              };
            }
          })
        );
        transformedCourse.modules = modulesWithContent;
      }

      // Add progress data for students
      if (enrollmentData) {
        // Calculate actual progress from learning progress data
        let completedLessons = 0;
        let totalLessons = 0;

        transformedCourse.modules.forEach((module) => {
          if (module.lessons) {
            totalLessons += module.lessons.length;
            completedLessons += module.lessons.filter(
              (lesson) => lesson.isCompleted
            ).length;
          }
        });

        const percentage =
          totalLessons > 0 ? (completedLessons / totalLessons) * 100 : 0;

        transformedCourse.progress = {
          completedLessons,
          totalLessons,
          percentage,
        };
        transformedCourse.enrollmentDate = enrollmentData.createdAt;
        transformedCourse.isEnrolled = true;
        // Set enrollment status based on actual enrollment status
        transformedCourse.enrollmentStatus =
          enrollmentData.status === "completed" ? "completed" : "enrolled";
      } else {
        const totalLessons = transformedCourse.modules.reduce(
          (total, module) =>
            total + (module.lessons ? module.lessons.length : 0),
          0
        );
        transformedCourse.progress = {
          completedLessons: 0,
          totalLessons,
          percentage: 0,
        };
        transformedCourse.isEnrolled = false;
        transformedCourse.enrollmentStatus = "not_enrolled";
      }

      // Add materials from course content
      transformedCourse.materials = transformedCourse.content || [];

      // Calculate rating statistics
      const ratingStats = await Rating.aggregate([
        { $match: { courseId: courseId, isVerified: true } },
        {
          $group: {
            _id: "$courseId",
            averageRating: { $avg: "$rating" },
            reviewCount: { $sum: 1 },
          },
        },
      ]);

      // Calculate total students enrolled
      const totalStudents = await Enrollment.countDocuments({
        courseId: courseId,
        status: { $in: ["active", "approved", "completed"] },
      });

      // Calculate completion rate
      const completedStudents = await Enrollment.countDocuments({
        courseId: courseId,
        status: "completed",
      });
      const completionRate =
        totalStudents > 0
          ? Math.round((completedStudents / totalStudents) * 100)
          : 0;

      // Add stats
      const ratingData = ratingStats[0];
      transformedCourse.stats = {
        totalStudents,
        completionRate,
        averageRating:
          course.stats?.averageRating ||
          (ratingData ? Math.round(ratingData.averageRating * 10) / 10 : 0),
        totalRatings:
          course.stats?.totalRatings ||
          (ratingData ? ratingData.reviewCount : 0),
      };

      // Keep backward compatibility
      transformedCourse.totalStudents = totalStudents;
      transformedCourse.rating = transformedCourse.stats.averageRating;
      transformedCourse.totalRatings = transformedCourse.stats.totalRatings;
      transformedCourse.reviewCount = transformedCourse.stats.totalRatings;

      res.json({
        success: true,
        data: transformedCourse,
      });
    } catch (error) {
      console.error("Error fetching course:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch course",
        error: error.message,
      });
    }
  }

  // Update course
  async updateCourse(req, res) {
    try {
      const { courseId } = req.params;
      const updates = req.body;

      const course = await ECourse.findById(courseId);

      if (!course) {
        return res.status(404).json({
          success: false,
          message: "Course not found",
        });
      }

      // Check if user can modify this course
      if (!course.canModify(req.user)) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      const isAdmin =
        req.user.roles.includes("admin") ||
        req.user.roles.includes("superadmin");
      const isInstructor =
        course.instructor.toString() === req.user._id.toString();

      if (isAdmin) {
        // Admins can update directly
        Object.keys(updates).forEach((key) => {
          if (updates[key] !== undefined) {
            course[key] = updates[key];
          }
        });

        // If admin is approving pending changes, update approval status
        if (
          updates.approvalStatus === "approved" &&
          course.approvalStatus === "pending"
        ) {
          await course.approve(
            req.user._id,
            updates.approvalNotes || "Approved by admin"
          );
        } else if (
          updates.approvalStatus === "rejected" &&
          course.approvalStatus === "pending"
        ) {
          await course.reject(
            req.user._id,
            updates.approvalNotes || "Rejected by admin"
          );
        }

        await course.save();
      } else if (isInstructor) {
        // Teachers need admin approval for changes
        await course.requestModificationApproval(
          req.user._id,
          updates,
          "Course modification requested"
        );

        // Don't apply changes immediately - they need approval
        return res.json({
          success: true,
          message: "Course modification submitted for approval",
          data: course,
          requiresApproval: true,
        });
      }

      await course.populate("instructor", "firstName lastName email");

      res.json({
        success: true,
        message: "Course updated successfully",
        data: course,
      });
    } catch (error) {
      console.error("Error updating course:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update course",
        error: error.message,
      });
    }
  }

  // Delete course
  async deleteCourse(req, res) {
    try {
      const { courseId } = req.params;

      const course = await ECourse.findById(courseId);

      if (!course) {
        return res.status(404).json({
          success: false,
          message: "Course not found",
        });
      }

      // Check if user can delete this course
      if (!course.canDelete(req.user)) {
        return res.status(403).json({
          success: false,
          message: "Access denied. Only administrators can delete courses.",
        });
      }

      // Check if course has enrollments
      if (course.stats.totalEnrollments > 0) {
        return res.status(400).json({
          success: false,
          message: "Cannot delete course with existing enrollments",
        });
      }

      await ECourse.findByIdAndDelete(courseId);

      res.json({
        success: true,
        message: "Course deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting course:", error);
      res.status(500).json({
        success: false,
        message: "Failed to delete course",
        error: error.message,
      });
    }
  }

  // Reassign course to another teacher
  async reassignCourse(req, res) {
    try {
      const { courseId } = req.params;
      const { newInstructorId } = req.body;

      if (!newInstructorId) {
        return res.status(400).json({
          success: false,
          message: "New instructor ID is required",
        });
      }

      const course = await ECourse.findById(courseId);

      if (!course) {
        return res.status(404).json({
          success: false,
          message: "Course not found",
        });
      }

      // Check if user is admin or superadmin
      const isAdmin =
        req.user.roles.includes("admin") ||
        req.user.roles.includes("superadmin");

      if (!isAdmin) {
        return res.status(403).json({
          success: false,
          message: "Access denied. Only administrators can reassign courses.",
        });
      }

      // Verify the new instructor exists and is active
      const newInstructor = await User.findById(newInstructorId);

      if (!newInstructor) {
        return res.status(404).json({
          success: false,
          message: "New instructor not found",
        });
      }

      if (newInstructor.status !== "active") {
        return res.status(400).json({
          success: false,
          message: "New instructor must be an active user",
        });
      }

      // Update the course instructor
      course.instructor = newInstructorId;
      await course.save();

      await course.populate("instructor", "firstName lastName email");

      res.json({
        success: true,
        message: "Course reassigned successfully",
        data: course,
      });
    } catch (error) {
      console.error("Error reassigning course:", error);
      res.status(500).json({
        success: false,
        message: "Failed to reassign course",
        error: error.message,
      });
    }
  }

  // Publish course
  async publishCourse(req, res) {
    try {
      const { courseId } = req.params;

      const course = await ECourse.findById(courseId);

      if (!course) {
        return res.status(404).json({
          success: false,
          message: "Course not found",
        });
      }

      // Check if user can publish this course
      if (!course.canPublish(req.user)) {
        return res.status(403).json({
          success: false,
          message: "Access denied. Course must be approved before publishing.",
        });
      }

      course.status = "published";
      await course.save();

      res.json({
        success: true,
        message: "Course published successfully",
        data: course,
      });
    } catch (error) {
      console.error("Error publishing course:", error);
      res.status(500).json({
        success: false,
        message: "Failed to publish course",
        error: error.message,
      });
    }
  }

  // Unpublish course
  async unpublishCourse(req, res) {
    try {
      const { courseId } = req.params;

      const course = await ECourse.findById(courseId);

      if (!course) {
        return res.status(404).json({
          success: false,
          message: "Course not found",
        });
      }

      // Check if user can unpublish this course (same permissions as publish)
      if (!course.canPublish(req.user)) {
        return res.status(403).json({
          success: false,
          message:
            "Access denied. You don't have permission to unpublish this course.",
        });
      }

      // Only published courses can be unpublished
      if (course.status !== "published") {
        return res.status(400).json({
          success: false,
          message: "Course is not published.",
        });
      }

      course.status = "approved";
      await course.save();

      res.json({
        success: true,
        message: "Course unpublished successfully",
        data: course,
      });
    } catch (error) {
      console.error("Error unpublishing course:", error);
      res.status(500).json({
        success: false,
        message: "Failed to unpublish course",
        error: error.message,
      });
    }
  }

  // Get public courses for student enrollment
  async getPublicCourses(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 12;
      const skip = (page - 1) * limit;

      const filter = {
        status: "published",
        visibility: { $in: ["public", "branch-only"] },
      };

      // Branch filter for branch-only courses
      if (req.user.branchId) {
        filter.$or = [
          { visibility: "public" },
          { visibility: "branch-only", branchId: req.user.branchId },
        ];
      }

      // Category filter
      if (req.query.category) {
        filter.category = req.query.category;
      }

      // Level filter
      if (req.query.level) {
        filter.level = req.query.level;
      }

      // Search filter
      if (req.query.search) {
        filter.$text = { $search: req.query.search };
      }

      const courses = await ECourse.find(filter)
        .populate("instructor", "firstName lastName")
        .select("-content -modules") // Don't include full content in list
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      // Get rating data for all courses
      const courseIds = courses.map((course) => course._id);
      const ratingStats = await Rating.aggregate([
        { $match: { courseId: { $in: courseIds }, isVerified: true } },
        {
          $group: {
            _id: "$courseId",
            averageRating: { $avg: "$rating" },
            reviewCount: { $sum: 1 },
          },
        },
      ]);

      // Create a map of courseId to rating stats
      const ratingMap = {};
      ratingStats.forEach((stat) => {
        ratingMap[stat._id.toString()] = {
          rating: Math.round(stat.averageRating * 10) / 10, // Round to 1 decimal
          reviewCount: stat.reviewCount,
        };
      });

      // Check enrollment status for each course (for students)
      const coursesWithEnrollment = await Promise.all(
        courses.map(async (course) => {
          const courseObj = course.toObject();

          // Add rating data
          const ratingData = ratingMap[course._id.toString()];
          if (ratingData) {
            courseObj.rating = ratingData.rating;
            courseObj.reviewCount = ratingData.reviewCount;
          } else {
            courseObj.rating = 0;
            courseObj.reviewCount = 0;
          }

          // Only check enrollment for students
          if (req.user.role === "student") {
            const enrollment = await Enrollment.findOne({
              studentId: req.user._id,
              courseId: course._id,
              status: { $in: ["enrolled", "completed"] },
            });

            courseObj.isEnrolled = !!enrollment;
            if (enrollment) {
              courseObj.progress = enrollment.progress || 0;
              courseObj.enrollmentStatus = enrollment.status;
            }
          } else {
            courseObj.isEnrolled = false;
          }

          return courseObj;
        })
      );

      const total = await ECourse.countDocuments(filter);

      res.json({
        success: true,
        data: {
          courses: coursesWithEnrollment,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
          },
        },
      });
    } catch (error) {
      console.error("Error fetching public courses:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch courses",
        error: error.message,
      });
    }
  }

  // Get public course details for students (before enrollment)
  async getPublicCourseDetails(req, res) {
    try {
      const { courseId } = req.params;

      const course = await ECourse.findById(courseId)
        .populate("instructor", "firstName lastName email")
        .populate({
          path: "modules",
          select: "title description order estimatedDuration status",
          options: { sort: { order: 1 } },
          populate: {
            path: "contents",
            select: "title description type order estimatedDuration status",
            options: { sort: { order: 1 } },
          },
        });

      if (!course) {
        return res.status(404).json({
          success: false,
          message: "Course not found",
        });
      }

      // Check if course is published and publicly visible
      if (course.status !== "published") {
        return res.status(404).json({
          success: false,
          message: "Course not found",
        });
      }

      if (course.visibility === "private") {
        return res.status(404).json({
          success: false,
          message: "Course not found",
        });
      }

      // Check branch visibility for branch-only courses
      if (course.visibility === "branch-only" && req.user.branchId) {
        if (
          course.branchId &&
          course.branchId.toString() !== req.user.branchId.toString()
        ) {
          return res.status(404).json({
            success: false,
            message: "Course not found",
          });
        }
      }

      // Get rating statistics
      const ratingStats = await Rating.aggregate([
        { $match: { courseId: course._id, isVerified: true } },
        {
          $group: {
            _id: null,
            averageRating: { $avg: "$rating" },
            reviewCount: { $sum: 1 },
          },
        },
      ]);

      // Get recent reviews
      const recentReviews = await Rating.find({
        courseId: course._id,
        isVerified: true,
      })
        .populate("userId", "firstName lastName")
        .sort({ createdAt: -1 })
        .limit(10)
        .select("rating review createdAt");

      // Check if current user is enrolled (for UI state)
      let enrollmentStatus = null;
      if (req.user.roles.includes("student")) {
        const Student = require("../../models/Student");
        const student = await Student.findOne({ userId: req.user._id });
        if (student) {
          const enrollment = await Enrollment.findOne({
            studentId: student._id,
            courseId,
          });
          if (enrollment) {
            enrollmentStatus = enrollment.status;
          }
        }
      }

      const courseObj = course.toObject();

      // Add rating data
      if (ratingStats.length > 0) {
        courseObj.rating = {
          average: Math.round(ratingStats[0].averageRating * 10) / 10,
          count: ratingStats[0].reviewCount,
        };
      } else {
        courseObj.rating = {
          average: 0,
          count: 0,
        };
      }

      // Add reviews
      courseObj.reviews = recentReviews.map((review) => ({
        rating: review.rating,
        review: review.review,
        createdAt: review.createdAt,
        user: {
          firstName: review.userId?.firstName || "Anonymous",
          lastName: review.userId?.lastName || "",
        },
      }));

      // Add enrollment status
      courseObj.enrollmentStatus = enrollmentStatus;

      // Remove sensitive content (actual content files, etc.)
      // The modules and contents structure is included for course overview

      res.json({
        success: true,
        data: courseObj,
      });
    } catch (error) {
      console.error("Error fetching public course details:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch course details",
        error: error.message,
      });
    }
  }

  // Get courses pending approval (admin only)
  async getPendingApprovalCourses(req, res) {
    try {
      // Check if user is admin
      if (
        !req.user.roles.includes("admin") &&
        !req.user.roles.includes("superadmin") &&
        !req.user.roles.includes("branchadmin")
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied. Admin privileges required.",
        });
      }

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      const filter = {
        approvalStatus: "pending",
        branchId: req.user.branchId, // Only show courses from same branch
      };

      const courses = await ECourse.find(filter)
        .populate("instructor", "firstName lastName email")
        .populate("approvedBy", "firstName lastName")
        .sort({ lastApprovalRequest: -1 })
        .skip(skip)
        .limit(limit);

      const total = await ECourse.countDocuments(filter);

      res.json({
        success: true,
        data: {
          courses,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
          },
        },
      });
    } catch (error) {
      console.error("Error fetching pending approval courses:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch pending approval courses",
        error: error.message,
      });
    }
  }

  // Approve course
  async approveCourse(req, res) {
    try {
      // Check if user is admin
      if (
        !req.user.roles.includes("admin") &&
        !req.user.roles.includes("superadmin") &&
        !req.user.roles.includes("branchadmin")
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied. Admin privileges required.",
        });
      }

      const { courseId } = req.params;
      const { notes } = req.body;

      const course = await ECourse.findById(courseId);

      if (!course) {
        return res.status(404).json({
          success: false,
          message: "Course not found",
        });
      }

      // Check branch access for non-superadmins
      if (
        !req.user.roles.includes("superadmin") &&
        course.branchId.toString() !== req.user.branchId.toString()
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied. Course belongs to different branch.",
        });
      }

      await course.approve(req.user._id, notes);

      await course.populate("instructor", "firstName lastName email");
      await course.populate("approvedBy", "firstName lastName");

      res.json({
        success: true,
        message: "Course approved successfully",
        data: course,
      });
    } catch (error) {
      console.error("Error approving course:", error);
      res.status(500).json({
        success: false,
        message: "Failed to approve course",
        error: error.message,
      });
    }
  }

  // Reject course
  async rejectCourse(req, res) {
    try {
      // Check if user is admin
      if (
        !req.user.roles.includes("admin") &&
        !req.user.roles.includes("superadmin") &&
        !req.user.roles.includes("branchadmin")
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied. Admin privileges required.",
        });
      }

      const { courseId } = req.params;
      const { notes } = req.body;

      const course = await ECourse.findById(courseId);

      if (!course) {
        return res.status(404).json({
          success: false,
          message: "Course not found",
        });
      }

      // Check branch access for non-superadmins
      if (
        !req.user.roles.includes("superadmin") &&
        course.branchId.toString() !== req.user.branchId.toString()
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied. Course belongs to different branch.",
        });
      }

      await course.reject(req.user._id, notes);

      await course.populate("instructor", "firstName lastName email");

      res.json({
        success: true,
        message: "Course rejected",
        data: course,
      });
    } catch (error) {
      console.error("Error rejecting course:", error);
      res.status(500).json({
        success: false,
        message: "Failed to reject course",
        error: error.message,
      });
    }
  }

  // Get course approval history
  async getCourseApprovalHistory(req, res) {
    try {
      const { courseId } = req.params;

      const course = await ECourse.findById(courseId)
        .populate("approvalHistory.performedBy", "firstName lastName email")
        .populate("instructor", "firstName lastName email");

      if (!course) {
        return res.status(404).json({
          success: false,
          message: "Course not found",
        });
      }

      // Check access (instructor, admin, or superadmin)
      const isInstructor =
        course.instructor._id.toString() === req.user._id.toString();
      const isAdmin =
        req.user.roles.includes("admin") ||
        req.user.roles.includes("superadmin");

      if (!isInstructor && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      res.json({
        success: true,
        data: {
          course: {
            _id: course._id,
            title: course.title,
            status: course.status,
            approvalStatus: course.approvalStatus,
          },
          approvalHistory: course.approvalHistory,
        },
      });
    } catch (error) {
      console.error("Error fetching course approval history:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch approval history",
        error: error.message,
      });
    }
  }

  // Get all courses for admin management
  async getAllCourses(req, res) {
    try {
      // Check if user is admin
      if (
        !req.user.roles.includes("admin") &&
        !req.user.roles.includes("superadmin") &&
        !req.user.roles.includes("branchadmin")
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied. Admin privileges required.",
        });
      }

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const skip = (page - 1) * limit;

      const filter = {};

      // Add status filter if provided
      if (req.query.status && req.query.status !== "all") {
        filter.status = req.query.status;
      }

      // Add branch filter for branch admins (not superadmins)
      if (!req.user.roles.includes("superadmin")) {
        filter.branchId = req.user.branchId;
      }

      const courses = await ECourse.find(filter)
        .populate("instructor", "firstName lastName email")
        .populate("approvedBy", "firstName lastName")
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await ECourse.countDocuments(filter);

      // Get enrollment counts for each course
      const courseIds = courses.map((course) => course._id);
      const enrollmentCounts = await Enrollment.aggregate([
        {
          $match: {
            courseId: { $in: courseIds },
            status: { $in: ["active", "approved", "completed"] },
          },
        },
        {
          $group: {
            _id: "$courseId",
            totalStudents: { $sum: 1 },
          },
        },
      ]);

      // Create a map of courseId to enrollment count
      const enrollmentMap = new Map();
      enrollmentCounts.forEach((count) => {
        enrollmentMap.set(count._id.toString(), count.totalStudents);
      });

      // Add stats to each course
      const coursesWithStats = courses.map((course) => {
        const courseObj = course.toObject();
        courseObj.stats = courseObj.stats || {};
        courseObj.stats.totalStudents =
          enrollmentMap.get(course._id.toString()) || 0;
        return courseObj;
      });

      res.json({
        success: true,
        data: {
          courses: coursesWithStats,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
          },
        },
      });
    } catch (error) {
      console.error("Error fetching all courses:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch courses",
        error: error.message,
      });
    }
  }
}

module.exports = new ECourseController();
