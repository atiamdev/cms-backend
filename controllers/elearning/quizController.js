const Quiz = require("../../models/elearning/Quiz");
const QuizAttempt = require("../../models/elearning/QuizAttempt");
const Course = require("../../models/Course");
const ECourse = require("../../models/elearning/ECourse");
const Enrollment = require("../../models/elearning/Enrollment");
const Student = require("../../models/Student");
const mongoose = require("mongoose");
const { validationResult } = require("express-validator");
const quizSchedulingService = require("../../services/quizSchedulingService");
const quizQuestionService = require("../../services/quizQuestionService");
const {
  storeNotificationAsNotice,
} = require("../../utils/notificationStorage");
const moment = require("moment-timezone");

/**
 * Create a new quiz
 */
const createQuiz = async (req, res) => {
  try {
    console.log("=== Create Quiz Debug ===");
    console.log("Request body:", req.body);
    console.log("User:", req.user.id, "roles:", req.user.roles);

    // Check for validation errors
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
      instructions,
      courseId,
      courseType,
      moduleId,
      timeLimit,
      attempts,
      passingScore,
      questions,
      settings,
      grading,
      schedule,
      shuffleQuestions,
      shuffleOptions,
      showResults,
      showCorrectAnswers,
    } = req.body;

    // Check if course exists and user has access
    let course = null;
    let detectedCourseType = courseType || "ecourse"; // Default to ecourse

    // Try to find as ECourse first, then regular Course
    if (detectedCourseType === "ecourse" || !courseType) {
      course = await ECourse.findById(courseId);
      if (course) {
        detectedCourseType = "ecourse";
      }
    }

    if (!course && (detectedCourseType === "course" || !courseType)) {
      course = await Course.findById(courseId);
      if (course) {
        detectedCourseType = "course";
      }
    }

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Check if user has permission to create quiz for this course
    const isTeacher = req.user.roles.includes("teacher");
    const isAdmin = req.user.roles.some((role) =>
      ["admin", "branch-admin", "super-admin"].includes(role)
    );

    if (isTeacher) {
      if (detectedCourseType === "ecourse") {
        // For ECourse, check instructor field
        if (
          course.instructor &&
          course.instructor.toString() !== req.user._id.toString()
        ) {
          return res.status(403).json({
            success: false,
            message:
              "Access denied. You can only create quizzes for courses you teach.",
          });
        }
      } else {
        // For regular Course, check if teacher is assigned to course
        // Derive a stable userId string from available properties
        const userIdStr =
          req.user && (req.user._id || req.user.id)
            ? (req.user._id || req.user.id).toString()
            : String(req.user);

        let hasTeacher =
          Array.isArray(course.teachers) &&
          course.teachers.some((t) => t.toString() === userIdStr);

        // If course.teachers is not defined, try to find a Teacher record
        // that links the current user to this course (subjects or class assignments)
        if (!hasTeacher) {
          try {
            const Teacher = require("../../models/Teacher");

            const teacherRecord = await Teacher.findOne({
              userId: userIdStr,
              $or: [
                { "subjects.courseId": course._id },
                { "classes.courses": course._id },
              ],
            });

            if (teacherRecord) {
              hasTeacher = true;
            }
          } catch (err) {
            console.error(
              "Error checking Teacher record for course assignment:",
              err
            );
          }
        }

        if (!hasTeacher) {
          // Debug info to help trace unexpected 403s in development
          console.debug("Quiz create permission check failed", {
            courseId: course._id?.toString(),
            teachers: Array.isArray(course.teachers)
              ? course.teachers.map((x) => x.toString())
              : course.teachers,
            userIdStr,
          });

          return res.status(403).json({
            success: false,
            message:
              "Access denied. You can only create quizzes for courses you teach.",
          });
        }
      }
    } else if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only teachers and admins can create quizzes.",
      });
    }

    // Process and validate questions if provided
    let processedQuestions = [];
    if (questions && questions.length > 0) {
      const validationErrors = [];
      for (let i = 0; i < questions.length; i++) {
        const result = quizQuestionService.createQuestion(questions[i]);
        if (!result.success) {
          validationErrors.push({
            questionIndex: i + 1,
            errors: result.errors,
          });
        } else {
          processedQuestions.push(result.question);
        }
      }
      if (validationErrors.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Question validation failed",
          errors: validationErrors,
        });
      }
    }

    // Validate schedule dates
    if (schedule?.availableFrom && schedule?.availableUntil) {
      const startDate = new Date(schedule.availableFrom);
      const endDate = new Date(schedule.availableUntil);

      if (startDate >= endDate) {
        return res.status(400).json({
          success: false,
          message: "Quiz start time must be before end time",
        });
      }
    }

    // Create the quiz
    const quiz = new Quiz({
      title,
      description,
      instructions,
      courseId,
      courseType: detectedCourseType,
      branchId: req.user.branchId,
      moduleId: moduleId || null,
      timeLimit: timeLimit || 0,
      attempts: attempts || 1,
      passingScore: passingScore || 60,
      questions: processedQuestions,
      shuffleQuestions: shuffleQuestions || false,
      shuffleOptions: shuffleOptions || false,
      showResults: showResults !== undefined ? showResults : true,
      showCorrectAnswers:
        showCorrectAnswers !== undefined ? showCorrectAnswers : true,
      settings: {
        randomizeQuestions: settings?.randomizeQuestions || false,
        oneQuestionAtATime: settings?.oneQuestionAtATime || false,
        preventBacktracking: settings?.preventBacktracking || false,
        lockQuestionsAfterAnswering:
          settings?.lockQuestionsAfterAnswering || false,
        requireWebcam: settings?.requireWebcam || false,
        fullScreenMode: settings?.fullScreenMode || false,
        showProgressBar:
          settings?.showProgressBar !== undefined
            ? settings.showProgressBar
            : true,
      },
      grading: {
        autoGrade: grading?.autoGrade !== undefined ? grading.autoGrade : true,
        gradingMethod: grading?.gradingMethod || "highest",
        releaseGrades: grading?.releaseGrades || "immediately",
      },
      schedule: {
        availableFrom: schedule?.availableFrom
          ? new Date(schedule.availableFrom)
          : null,
        availableUntil: schedule?.availableUntil
          ? new Date(schedule.availableUntil)
          : null,
        dueDate: schedule?.dueDate ? new Date(schedule.dueDate) : null,
      },
      branchId: req.user.branchId,
      createdBy: req.user._id,
    });

    const savedQuiz = await quiz.save();

    // Schedule the quiz if it has a start time
    if (savedQuiz.schedule?.availableFrom && savedQuiz.isPublished) {
      quizSchedulingService.scheduleQuizStart(savedQuiz);
    }

    // Schedule the quiz end if it has an end time
    if (savedQuiz.schedule?.availableUntil && savedQuiz.isPublished) {
      quizSchedulingService.scheduleQuizEnd(savedQuiz);
    }

    // Send push notification to students when quiz is published
    if (savedQuiz.isPublished) {
      try {
        const pushController = require("../../controllers/pushController");

        // Get enrolled students based on course type
        let studentUserIds = [];
        if (detectedCourseType === "ecourse") {
          const enrollments = await Enrollment.find({
            courseId: savedQuiz.courseId,
          }).populate({
            path: "studentId",
            populate: { path: "userId" },
          });
          studentUserIds = enrollments
            .map((e) => e.studentId?.userId?._id)
            .filter(Boolean);
        } else {
          // For regular courses, get students from associated class
          const Class = require("../../models/Class");
          const classes = await Class.find({
            "subjects.courseId": savedQuiz.courseId,
            status: "active",
          }).populate({
            path: "students.studentId",
            populate: { path: "userId" },
          });

          studentUserIds = classes.flatMap((cls) =>
            cls.students
              .filter((s) => s.status === "active" && s.studentId?.userId)
              .map((s) => s.studentId.userId._id)
          );
        }

        if (studentUserIds.length > 0) {
          const dueText = savedQuiz.schedule?.dueDate
            ? ` - Due ${moment(savedQuiz.schedule.dueDate).format(
                "MMM D, HH:mm"
              )}`
            : "";

          const payload = {
            title: `New Quiz: ${savedQuiz.title}`,
            body: `A new quiz has been published${dueText}`,
            icon: "/logo.png",
            tag: `quiz-created-${savedQuiz._id}`,
            type: "quiz-created",
            quizId: savedQuiz._id.toString(),
            courseId: savedQuiz.courseId.toString(),
            quizTitle: savedQuiz.title,
            url: `/student/quizzes/${savedQuiz._id}`,
          };

          // Store as notice
          await storeNotificationAsNotice({
            userIds: studentUserIds,
            title: payload.title,
            content: payload.body,
            type: "academic",
            priority: "medium",
            targetAudience: "students",
          });

          await pushController.sendNotification(studentUserIds, payload);

          console.log(
            `[Quiz] Sent creation notification to ${studentUserIds.length} students`
          );
        }
      } catch (error) {
        console.error("[Quiz] Error sending creation notification:", error);
      }
    }

    res.status(201).json({
      success: true,
      message: "Quiz created successfully",
      data: {
        ...savedQuiz.toObject(),
        timeUntilStart: quizSchedulingService.getTimeUntilStart(savedQuiz),
        timeUntilEnd: quizSchedulingService.getTimeUntilEnd(savedQuiz),
        isAvailable: quizSchedulingService.isQuizAvailable(savedQuiz),
      },
    });
  } catch (error) {
    console.error("Error creating quiz:", error);
    res.status(500).json({
      success: false,
      message: "Error creating quiz",
      error: error.message,
    });
  }
};

/**
 * Get all quizzes for a teacher
 */
const getTeacherQuizzes = async (req, res) => {
  try {
    const { courseId, page = 1, limit = 10, status } = req.query;
    const skip = (page - 1) * limit;

    // Build query
    const query = {
      branchId: req.user.branchId,
    };

    // If user is teacher, only show their quizzes
    if (req.user.roles.includes("teacher")) {
      query.createdBy = req.user._id;
    }

    if (courseId) {
      query.courseId = courseId;
    }

    if (status === "published") {
      query.isPublished = true;
      query.status = { $ne: "archived" };
    } else if (status === "draft") {
      query.isPublished = false;
      query.status = { $ne: "archived" };
    } else if (status === "archived") {
      query.status = "archived";
    } else {
      // Default: exclude archived quizzes
      query.status = { $ne: "archived" };
    }

    // Get total count for pagination
    const total = await Quiz.countDocuments(query);

    const quizzes = await Quiz.find(query)
      .populate("moduleId", "title")
      .populate("createdBy", "firstName lastName")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Populate courseId based on courseType
    for (let quiz of quizzes) {
      if (quiz.courseType === "ecourse") {
        await quiz.populate("courseId", "title name");
      } else {
        await quiz.populate("courseId", "name");
      }
    }

    // Get pending grading counts for each quiz
    const quizIds = quizzes.map((q) => q._id);
    const pendingGradingCounts = await QuizAttempt.aggregate([
      {
        $match: {
          quizId: { $in: quizIds },
          status: { $in: ["submitted_pending_grading", "partially_graded"] },
        },
      },
      {
        $group: {
          _id: "$quizId",
          count: { $sum: 1 },
        },
      },
    ]);

    // Create a map of quizId to pending count
    const pendingCountsMap = {};
    pendingGradingCounts.forEach((item) => {
      pendingCountsMap[item._id.toString()] = item.count;
    });

    // Add question count and attempt count to each quiz
    const quizzesWithCounts = quizzes.map((quiz) => ({
      ...quiz.toObject(),
      questionCount: quiz.questions ? quiz.questions.length : 0,
      attemptCount: 0, // We'll calculate this if needed
      pendingGradingCount: pendingCountsMap[quiz._id.toString()] || 0,
    }));

    res.json({
      success: true,
      message: "Quizzes retrieved successfully",
      quizzes: quizzesWithCounts,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Error fetching quizzes:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching quizzes",
      error: error.message,
    });
  }
};
/**
 * Get quiz by ID
 */
const getQuizById = async (req, res) => {
  try {
    const { id } = req.params;

    const quiz = await Quiz.findById(id)
      .populate("moduleId", "title")
      .populate("createdBy", "firstName lastName");

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found",
      });
    }

    // Populate courseId based on courseType
    if (quiz.courseType === "ecourse") {
      await quiz.populate("courseId", "title name");
    } else {
      await quiz.populate("courseId", "name");
    }

    // Check access permissions
    const isOwner = quiz.createdBy._id.toString() === req.user._id.toString();
    const isAdmin = req.user.roles.some((role) =>
      ["admin", "branch-admin", "super-admin"].includes(role)
    );
    const isStudent = req.user.roles.includes("student");
    const sameBranch =
      quiz.branchId.toString() === req.user.branchId.toString();

    if (!isOwner && !isAdmin && !sameBranch && !isStudent) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // For students, check availability and enrollment
    let isAvailable = true;
    if (req.user.roles.includes("student")) {
      // First check if student is enrolled in the course
      const Student = require("../../models/Student");
      const student = await Student.findOne({ userId: req.user.id });
      console.log(
        "getQuizById - Student lookup:",
        student
          ? { id: student._id, userId: student.userId }
          : "No student found"
      );
      if (!student) {
        return res.status(404).json({
          success: false,
          message: "Student profile not found",
        });
      }

      // Check enrollment in the course
      let hasAccess = false;

      if (quiz.courseType === "ecourse") {
        // For e-courses, check Enrollment model
        const enrollment = await Enrollment.findOne({
          studentId: student._id,
          courseId: quiz.courseId,
          status: { $in: ["active", "approved", "completed"] },
        });
        hasAccess = !!enrollment;
        console.log("getQuizById - E-course enrollment check:", {
          studentId: student._id,
          courseId: quiz.courseId,
          enrollment: enrollment ? "found" : "not found",
        });
      } else {
        // For regular courses, check if courseId is in student's courses array
        hasAccess =
          student.courses &&
          student.courses.some(
            (courseId) => courseId.toString() === quiz.courseId.toString()
          );
        console.log("getQuizById - Regular course enrollment check:", {
          studentId: student._id,
          courseId: quiz.courseId,
          studentCourses: student.courses,
          hasAccess: hasAccess,
        });
      }

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "Access denied. You are not enrolled in this course.",
        });
      }

      const now = new Date();
      if (quiz.schedule?.availableFrom && now < quiz.schedule.availableFrom) {
        isAvailable = false;
      }
      if (quiz.schedule?.availableUntil && now > quiz.schedule.availableUntil) {
        isAvailable = false;
      }
      if (!quiz.isPublished) {
        isAvailable = false;
      }
    }

    // Add availability info to the response
    const quizData = quiz.toObject();
    quizData.isAvailable = isAvailable;

    // Convert populated courseId back to string for frontend compatibility
    if (quizData.courseId && typeof quizData.courseId === "object") {
      quizData.courseId = quizData.courseId._id || quizData.courseId;
    }

    res.json({
      success: true,
      message: "Quiz retrieved successfully",
      data: quizData,
    });
  } catch (error) {
    console.error("Error fetching quiz:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching quiz",
      error: error.message,
    });
  }
};

/**
 * Update quiz
 */
const updateQuiz = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Find the quiz
    const quiz = await Quiz.findById(id);
    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found",
      });
    }

    // Check permissions
    const isOwner = quiz.createdBy.toString() === req.user._id.toString();
    const isAdmin = req.user.roles.some((role) =>
      ["admin", "branch-admin", "super-admin"].includes(role)
    );

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only update your own quizzes.",
      });
    }

    // Check if quiz has attempts (for certain restrictions)
    const hasAttempts = await QuizAttempt.exists({ quizId: id });

    if (hasAttempts) {
      // Restrict certain changes if quiz has attempts
      const restrictedFields = ["questions", "passingScore", "timeLimit"];
      const changedRestrictedFields = restrictedFields.filter((field) =>
        updateData.hasOwnProperty(field)
      );

      if (changedRestrictedFields.length > 0) {
        return res.status(400).json({
          success: false,
          message:
            "Cannot modify questions, passing score, or time limit after students have attempted the quiz.",
          restrictedFields: changedRestrictedFields,
        });
      }
    }

    // Process schedule dates to ensure they're Date objects
    if (updateData.schedule) {
      updateData.schedule = {
        availableFrom: updateData.schedule.availableFrom
          ? new Date(updateData.schedule.availableFrom)
          : null,
        availableUntil: updateData.schedule.availableUntil
          ? new Date(updateData.schedule.availableUntil)
          : null,
        dueDate: updateData.schedule.dueDate
          ? new Date(updateData.schedule.dueDate)
          : null,
      };
    }

    // Merge settings with existing settings to avoid overwriting
    if (updateData.settings) {
      updateData.settings = {
        ...(quiz.settings?.toObject?.() || quiz.settings || {}),
        ...updateData.settings,
      };
    }

    // Merge grading with existing grading to avoid overwriting
    if (updateData.grading) {
      updateData.grading = {
        ...(quiz.grading?.toObject?.() || quiz.grading || {}),
        ...updateData.grading,
      };
    }

    // Update the quiz
    const updatedQuiz = await Quiz.findByIdAndUpdate(
      id,
      {
        ...updateData,
        // Ensure these fields can't be changed via update
        branchId: quiz.branchId,
        createdBy: quiz.createdBy,
      },
      { new: true, runValidators: true }
    )
      .populate("moduleId", "title")
      .populate("createdBy", "firstName lastName");

    // Populate courseId based on courseType
    if (updatedQuiz.courseType === "ecourse") {
      await updatedQuiz.populate("courseId", "title name");
    } else {
      await updatedQuiz.populate("courseId", "name");
    }

    res.json({
      success: true,
      message: "Quiz updated successfully",
      data: updatedQuiz,
    });
  } catch (error) {
    console.error("Error updating quiz:", error);
    res.status(500).json({
      success: false,
      message: "Error updating quiz",
      error: error.message,
    });
  }
};

/**
 * Archive quiz
 */
const archiveQuiz = async (req, res) => {
  try {
    const { id } = req.params;

    // Find the quiz
    const quiz = await Quiz.findById(id);
    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found",
      });
    }

    // Check permissions
    const isOwner = quiz.createdBy.toString() === req.user._id.toString();
    const isAdmin = req.user.roles.some((role) =>
      ["admin", "branch-admin", "super-admin"].includes(role)
    );

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only archive your own quizzes.",
      });
    }

    const archivedQuiz = await Quiz.findByIdAndUpdate(
      id,
      { status: "archived", isPublished: false },
      { new: true }
    ).populate("courseId", "name");

    res.json({
      success: true,
      message: "Quiz archived successfully",
      data: archivedQuiz,
    });
  } catch (error) {
    console.error("Error archiving quiz:", error);
    res.status(500).json({
      success: false,
      message: "Error archiving quiz",
      error: error.message,
    });
  }
};

/**
 * Unarchive quiz
 */
const unarchiveQuiz = async (req, res) => {
  try {
    const { id } = req.params;

    // Find the quiz
    const quiz = await Quiz.findById(id);
    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found",
      });
    }

    // Check permissions
    const isOwner = quiz.createdBy.toString() === req.user._id.toString();
    const isAdmin = req.user.roles.some((role) =>
      ["admin", "branch-admin", "super-admin"].includes(role)
    );

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only unarchive your own quizzes.",
      });
    }

    // Only allow unarchiving archived quizzes
    if (quiz.status !== "archived") {
      return res.status(400).json({
        success: false,
        message: "Can only unarchive archived quizzes",
      });
    }

    const unarchivedQuiz = await Quiz.findByIdAndUpdate(
      id,
      { status: "published", isPublished: true },
      { new: true }
    ).populate("courseId", "name");

    res.json({
      success: true,
      message: "Quiz unarchived successfully",
      data: unarchivedQuiz,
    });
  } catch (error) {
    console.error("Error unarchiving quiz:", error);
    res.status(500).json({
      success: false,
      message: "Error unarchiving quiz",
      error: error.message,
    });
  }
};

/**
 * Delete quiz
 */
const deleteQuiz = async (req, res) => {
  try {
    const { id } = req.params;

    // Find the quiz
    const quiz = await Quiz.findById(id);
    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found",
      });
    }

    // Check permissions
    const isOwner = quiz.createdBy.toString() === req.user._id.toString();
    const isAdmin = req.user.roles.some((role) =>
      ["admin", "branch-admin", "super-admin"].includes(role)
    );

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only delete your own quizzes.",
      });
    }

    // Check if quiz has attempts
    const attemptCount = await QuizAttempt.countDocuments({ quizId: id });

    if (attemptCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete quiz with ${attemptCount} student attempts. Consider unpublishing instead.`,
        attemptCount,
      });
    }

    // Delete the quiz
    await Quiz.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "Quiz deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting quiz:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting quiz",
      error: error.message,
    });
  }
};

/**
 * Publish/unpublish quiz
 */
const toggleQuizPublication = async (req, res) => {
  try {
    const { id } = req.params;
    const { isPublished } = req.body;

    // Find the quiz
    const quiz = await Quiz.findById(id);
    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found",
      });
    }

    // Check permissions
    const isOwner = quiz.createdBy.toString() === req.user._id.toString();
    const isAdmin = req.user.roles.some((role) =>
      ["admin", "branch-admin", "super-admin"].includes(role)
    );

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Validate quiz before publishing
    if (isPublished && quiz.questions.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot publish quiz without questions",
      });
    }

    // Update publication status
    quiz.isPublished = isPublished;
    quiz.status = isPublished ? "published" : "draft";
    await quiz.save();

    res.json({
      success: true,
      message: `Quiz ${isPublished ? "published" : "unpublished"} successfully`,
      data: { isPublished },
    });
  } catch (error) {
    console.error("Error toggling quiz publication:", error);
    res.status(500).json({
      success: false,
      message: "Error updating quiz publication status",
      error: error.message,
    });
  }
};

/**
 * Add question to quiz
 */
const addQuestion = async (req, res) => {
  try {
    const { id } = req.params;
    const questionData = req.body;

    // Find the quiz
    const quiz = await Quiz.findById(id);
    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found",
      });
    }

    // Check permissions
    const isOwner = quiz.createdBy.toString() === req.user._id.toString();
    const isAdmin = req.user.roles.some((role) =>
      ["admin", "branch-admin", "super-admin"].includes(role)
    );

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Check if quiz has attempts
    const hasAttempts = await QuizAttempt.exists({ quizId: id });
    if (hasAttempts) {
      return res.status(400).json({
        success: false,
        message: "Cannot add questions after students have attempted the quiz",
      });
    }

    // Add the question
    await quiz.addQuestion(questionData);

    res.status(201).json({
      success: true,
      message: "Question added successfully",
      data: quiz,
    });
  } catch (error) {
    console.error("Error adding question:", error);
    res.status(500).json({
      success: false,
      message: "Error adding question",
      error: error.message,
    });
  }
};

/**
 * Update question in quiz
 */
const updateQuestion = async (req, res) => {
  try {
    const { id, questionId } = req.params;
    const questionData = req.body;

    // Find the quiz
    const quiz = await Quiz.findById(id);
    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found",
      });
    }

    // Check permissions
    const isOwner = quiz.createdBy.toString() === req.user._id.toString();
    const isAdmin = req.user.roles.some((role) =>
      ["admin", "branch-admin", "super-admin"].includes(role)
    );

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Check if quiz has attempts
    const hasAttempts = await QuizAttempt.exists({ quizId: id });
    if (hasAttempts) {
      return res.status(400).json({
        success: false,
        message:
          "Cannot modify questions after students have attempted the quiz",
      });
    }

    // Update the question
    await quiz.updateQuestion(questionId, questionData);

    res.json({
      success: true,
      message: "Question updated successfully",
      data: quiz,
    });
  } catch (error) {
    console.error("Error updating question:", error);
    res.status(500).json({
      success: false,
      message: "Error updating question",
      error: error.message,
    });
  }
};

/**
 * Remove question from quiz
 */
const removeQuestion = async (req, res) => {
  try {
    const { id, questionId } = req.params;

    // Find the quiz
    const quiz = await Quiz.findById(id);
    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found",
      });
    }

    // Check permissions
    const isOwner = quiz.createdBy.toString() === req.user._id.toString();
    const isAdmin = req.user.roles.some((role) =>
      ["admin", "branch-admin", "super-admin"].includes(role)
    );

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Check if quiz has attempts
    const hasAttempts = await QuizAttempt.exists({ quizId: id });
    if (hasAttempts) {
      return res.status(400).json({
        success: false,
        message:
          "Cannot remove questions after students have attempted the quiz",
      });
    }

    // Remove the question
    await quiz.removeQuestion(questionId);

    res.json({
      success: true,
      message: "Question removed successfully",
      data: quiz,
    });
  } catch (error) {
    console.error("Error removing question:", error);
    res.status(500).json({
      success: false,
      message: "Error removing question",
      error: error.message,
    });
  }
};

/**
 * Get quiz analytics
 */
const getQuizAnalytics = async (req, res) => {
  try {
    const { id } = req.params;

    // Find the quiz
    const quiz = await Quiz.findById(id);
    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found",
      });
    }

    // Check permissions
    const isOwner = quiz.createdBy.toString() === req.user._id.toString();
    const isAdmin = req.user.roles.some((role) =>
      ["admin", "branch-admin", "super-admin"].includes(role)
    );

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Get quiz attempts
    const attempts = await QuizAttempt.find({ quizId: id })
      .populate("studentId", "firstName lastName email")
      .sort({ createdAt: -1 });

    // Calculate analytics
    const analytics = {
      totalAttempts: attempts.length,
      uniqueStudents: new Set(attempts.map((a) => a.studentId._id.toString()))
        .size,
      completedAttempts: attempts.filter(
        (a) => a.status === "completed" || a.status === "submitted"
      ).length,
      pendingGradingAttempts: attempts.filter(
        (a) =>
          a.status === "submitted_pending_grading" ||
          a.status === "partially_graded"
      ).length,
      averageScore: 0,
      averageTimeSpent: 0,
      passRate: 0,
      scoreDistribution: {
        "0-20": 0,
        "21-40": 0,
        "41-60": 0,
        "61-80": 0,
        "81-100": 0,
      },
      recentAttempts: attempts.slice(0, 10),
    };

    if (analytics.completedAttempts > 0) {
      const completedAttempts = attempts.filter(
        (a) => a.status === "completed" || a.status === "submitted"
      );

      analytics.averageScore =
        completedAttempts.reduce((sum, a) => sum + a.score, 0) /
        completedAttempts.length;
      analytics.averageTimeSpent =
        completedAttempts.reduce((sum, a) => sum + (a.timeSpent || 0), 0) /
        completedAttempts.length;
      analytics.passRate =
        (completedAttempts.filter((a) => a.score >= quiz.passingScore).length /
          completedAttempts.length) *
        100;

      // Score distribution
      completedAttempts.forEach((attempt) => {
        const score = attempt.score;
        if (score <= 20) analytics.scoreDistribution["0-20"]++;
        else if (score <= 40) analytics.scoreDistribution["21-40"]++;
        else if (score <= 60) analytics.scoreDistribution["41-60"]++;
        else if (score <= 80) analytics.scoreDistribution["61-80"]++;
        else analytics.scoreDistribution["81-100"]++;
      });
    }

    res.json({
      success: true,
      message: "Quiz analytics retrieved successfully",
      data: {
        quiz: {
          _id: quiz._id,
          title: quiz.title,
          totalPoints: quiz.totalPoints,
          questionCount: quiz.questionCount,
          passingScore: quiz.passingScore,
        },
        analytics,
      },
    });
  } catch (error) {
    console.error("Error fetching quiz analytics:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching quiz analytics",
      error: error.message,
    });
  }
};

/**
 * Add questions to an existing quiz (enhanced version)
 */
const addQuestions = async (req, res) => {
  try {
    const { quizId } = req.params;
    const { questions } = req.body;

    // Validate input
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Questions array is required and must not be empty",
      });
    }

    // Find the quiz
    const quiz = await Quiz.findOne({
      _id: quizId,
      branchId: req.user.branchId,
    });

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found",
      });
    }

    // Check permissions
    const canModify =
      req.user.roles.some((role) =>
        ["admin", "branch-admin", "super-admin"].includes(role)
      ) || quiz.createdBy.toString() === req.user._id.toString();

    if (!canModify) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only modify quizzes you created.",
      });
    }

    // Process and validate new questions
    const processedQuestions = [];
    const validationErrors = [];
    for (let i = 0; i < questions.length; i++) {
      const result = quizQuestionService.createQuestion(questions[i]);
      if (!result.success) {
        validationErrors.push({
          questionIndex: i + 1,
          errors: result.errors,
        });
      } else {
        processedQuestions.push(result.question);
      }
    }
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Question validation failed",
        errors: validationErrors,
      });
    }

    // Add questions to quiz
    quiz.questions.push(...processedQuestions);
    await quiz.save();

    res.json({
      success: true,
      message: `${processedQuestions.length} questions added successfully`,
      data: {
        quiz,
        addedQuestions: processedQuestions,
      },
    });
  } catch (error) {
    console.error("Error adding questions:", error);
    res.status(500).json({
      success: false,
      message: "Error adding questions",
      error: error.message,
    });
  }
};

/**
 * Update quiz schedule with enhanced scheduling
 */
const updateQuizSchedule = async (req, res) => {
  try {
    const { quizId } = req.params;
    const { schedule } = req.body;

    // Find the quiz
    const quiz = await Quiz.findOne({
      _id: quizId,
      branchId: req.user.branchId,
    });

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found",
      });
    }

    // Check permissions
    const canModify =
      req.user.roles.some((role) =>
        ["admin", "branch-admin", "super-admin"].includes(role)
      ) || quiz.createdBy.toString() === req.user._id.toString();

    if (!canModify) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only modify quizzes you created.",
      });
    }

    // Validate schedule dates
    if (schedule?.availableFrom && schedule?.availableUntil) {
      const startDate = new Date(schedule.availableFrom);
      const endDate = new Date(schedule.availableUntil);

      if (startDate >= endDate) {
        return res.status(400).json({
          success: false,
          message: "Quiz start time must be before end time",
        });
      }
    }

    // Update schedule
    quiz.schedule = {
      availableFrom: schedule?.availableFrom
        ? new Date(schedule.availableFrom)
        : null,
      availableUntil: schedule?.availableUntil
        ? new Date(schedule.availableUntil)
        : null,
      dueDate: schedule?.dueDate ? new Date(schedule.dueDate) : null,
    };

    await quiz.save();

    // Update scheduled tasks
    if (quiz.isPublished) {
      quizSchedulingService.updateQuizSchedule(quiz);
    }

    res.json({
      success: true,
      message: "Quiz schedule updated successfully",
      data: {
        schedule: quiz.schedule,
        timeUntilStart: quizSchedulingService.getTimeUntilStart(quiz),
        timeUntilEnd: quizSchedulingService.getTimeUntilEnd(quiz),
        isAvailable: quizSchedulingService.isQuizAvailable(quiz),
      },
    });
  } catch (error) {
    console.error("Error updating quiz schedule:", error);
    res.status(500).json({
      success: false,
      message: "Error updating quiz schedule",
      error: error.message,
    });
  }
};

/**
 * Import questions from various formats
 */
const importQuestions = async (req, res) => {
  try {
    const { quizId } = req.params;
    const { questions, format = "json" } = req.body;

    // Find the quiz
    const quiz = await Quiz.findOne({
      _id: quizId,
      branchId: req.user.branchId,
    });

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found",
      });
    }

    // Check permissions
    const canModify =
      req.user.roles.some((role) =>
        ["admin", "branch-admin", "super-admin"].includes(role)
      ) || quiz.createdBy.toString() === req.user._id.toString();

    if (!canModify) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only modify quizzes you created.",
      });
    }

    // Import questions
    const importedQuestions = quizQuestionService.importQuestions(
      questions,
      format
    );

    if (importedQuestions.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid questions found in import data",
      });
    }

    // Add imported questions to quiz
    quiz.questions.push(...importedQuestions);
    await quiz.save();

    res.json({
      success: true,
      message: `${importedQuestions.length} questions imported successfully`,
      data: {
        importedCount: importedQuestions.length,
        totalQuestions: quiz.questions.length,
      },
    });
  } catch (error) {
    console.error("Error importing questions:", error);
    res.status(500).json({
      success: false,
      message: "Error importing questions",
      error: error.message,
    });
  }
};

// Quiz Attempt Methods
const startQuizAttempt = async (req, res) => {
  try {
    const { id: quizId } = req.params;

    // Find student by user ID
    const Student = require("../../models/Student");
    const student = await Student.findOne({ userId: req.user.id });
    console.log(
      "startQuizAttempt - Student lookup:",
      student ? { id: student._id, userId: student.userId } : "No student found"
    );
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    const studentId = student._id;

    // Check if quiz exists and is published
    const quiz = await Quiz.findById(quizId);
    if (!quiz || !quiz.isPublished) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found or not available",
      });
    }

    // Check if student is enrolled in the course
    let hasAccess = false;

    if (quiz.courseType === "ecourse") {
      // For e-courses, check Enrollment model
      const enrollment = await Enrollment.findOne({
        studentId,
        courseId: quiz.courseId,
        status: { $in: ["active", "approved", "completed"] },
      });
      hasAccess = !!enrollment;
    } else {
      // For regular courses, check if courseId is in student's courses array
      hasAccess =
        student.courses &&
        student.courses.some(
          (courseId) => courseId.toString() === quiz.courseId.toString()
        );
    }

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "You are not enrolled in this course",
      });
    }

    // Check if quiz is available (time-based availability)
    const now = new Date();
    let isAvailable = true;
    if (quiz.schedule?.availableFrom && now < quiz.schedule.availableFrom) {
      isAvailable = false;
    }
    if (quiz.schedule?.availableUntil && now > quiz.schedule.availableUntil) {
      isAvailable = false;
    }

    if (!isAvailable) {
      return res.status(403).json({
        success: false,
        message: "Quiz is not available at this time",
      });
    }

    // Check attempt limits - count only submitted attempts
    const submittedAttempts = await QuizAttempt.countDocuments({
      quizId,
      studentId,
      submittedAt: { $exists: true },
    });

    if (quiz.attempts > 0 && submittedAttempts >= quiz.attempts) {
      return res.status(403).json({
        success: false,
        message: "Maximum attempts reached",
      });
    }

    // Check if there's already an in-progress attempt
    const inProgressAttempt = await QuizAttempt.findOne({
      quizId,
      studentId,
      submittedAt: { $exists: false },
    });

    if (inProgressAttempt) {
      return res.json({
        success: true,
        data: {
          _id: inProgressAttempt._id,
          quizId: inProgressAttempt.quizId,
          startedAt: inProgressAttempt.startedAt,
          attempt: inProgressAttempt.attempt,
        },
      });
    }

    // Create new attempt
    const attempt = new QuizAttempt({
      quizId,
      studentId,
      attempt: submittedAttempts + 1,
      branchId: quiz.branchId,
    });

    await attempt.save();

    res.json({
      success: true,
      data: {
        _id: attempt._id,
        quizId: attempt.quizId,
        startedAt: attempt.startedAt,
        attempt: attempt.attempt,
      },
    });
  } catch (error) {
    console.error("Error starting quiz attempt:", error);
    res.status(500).json({
      success: false,
      message: "Error starting quiz attempt",
      error: error.message,
    });
  }
};

// Start quiz and return full data (quiz, questions, attempt) for QuizInterface
const startQuizWithData = async (req, res) => {
  try {
    const { id: quizId } = req.params;

    // Find student by user ID
    const Student = require("../../models/Student");
    const student = await Student.findOne({ userId: req.user.id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    const studentId = student._id;

    // Check if quiz exists and is published
    const quiz = await Quiz.findById(quizId);
    if (!quiz || !quiz.isPublished) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found or not available",
      });
    }

    // Check if student is enrolled in the course
    let hasAccess = false;

    if (quiz.courseType === "ecourse") {
      const enrollment = await Enrollment.findOne({
        studentId,
        courseId: quiz.courseId,
        status: { $in: ["active", "approved", "completed"] },
      });
      hasAccess = !!enrollment;
    } else {
      hasAccess =
        student.courses &&
        student.courses.some(
          (courseId) => courseId.toString() === quiz.courseId.toString()
        );
    }

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "You are not enrolled in this course",
      });
    }

    // Check if quiz is available (time-based availability)
    const now = new Date();
    let isAvailable = true;
    if (quiz.schedule?.availableFrom && now < quiz.schedule.availableFrom) {
      isAvailable = false;
    }
    if (quiz.schedule?.availableUntil && now > quiz.schedule.availableUntil) {
      isAvailable = false;
    }

    if (!isAvailable) {
      return res.status(403).json({
        success: false,
        message: "Quiz is not available at this time",
      });
    }

    // Check attempt limits - count only submitted attempts
    const submittedAttempts = await QuizAttempt.countDocuments({
      quizId,
      studentId,
      submittedAt: { $exists: true },
    });

    if (quiz.attempts > 0 && submittedAttempts >= quiz.attempts) {
      return res.status(403).json({
        success: false,
        message: "Maximum attempts reached",
      });
    }

    // Sanitize questions for student (remove correct answers)
    const sanitizedQuestions = quiz.questions.map((q) => {
      const sanitized = {
        _id: q._id,
        type: q.type,
        question: q.question,
        options: q.options,
        points: q.points,
        difficulty: q.difficulty,
        tags: q.tags,
        estimatedTime: q.estimatedTime,
      };
      if (q.type === "matching" && q.pairs) {
        sanitized.pairs = q.pairs;
      }
      return sanitized;
    });

    // Prepare quiz data for response (without sensitive info)
    const quizForStudent = {
      _id: quiz._id,
      title: quiz.title,
      description: quiz.description,
      instructions: quiz.instructions,
      timeLimit: quiz.timeLimit,
      attempts: quiz.attempts,
      shuffleQuestions: quiz.shuffleQuestions,
      shuffleOptions: quiz.shuffleOptions,
      showResults: quiz.showResults,
      showCorrectAnswers: quiz.showCorrectAnswers,
      passingScore: quiz.passingScore,
      settings: quiz.settings,
      grading: {
        releaseGrades: quiz.grading?.releaseGrades,
        releaseReview: quiz.grading?.releaseReview,
      },
      schedule: quiz.schedule,
    };

    // Check if there's already an in-progress attempt
    const inProgressAttempt = await QuizAttempt.findOne({
      quizId,
      studentId,
      submittedAt: { $exists: false },
    });

    if (inProgressAttempt) {
      return res.json({
        success: true,
        data: {
          quiz: quizForStudent,
          questions: sanitizedQuestions,
          attempt: {
            _id: inProgressAttempt._id,
            quizId: inProgressAttempt.quizId,
            startedAt: inProgressAttempt.startedAt,
            attempt: inProgressAttempt.attempt,
          },
        },
      });
    }

    // Create new attempt
    const attempt = new QuizAttempt({
      quizId,
      studentId,
      attempt: submittedAttempts + 1,
      branchId: quiz.branchId,
    });

    await attempt.save();

    res.json({
      success: true,
      data: {
        quiz: quizForStudent,
        questions: sanitizedQuestions,
        attempt: {
          _id: attempt._id,
          quizId: attempt.quizId,
          startedAt: attempt.startedAt,
          attempt: attempt.attempt,
        },
      },
    });
  } catch (error) {
    console.error("Error starting quiz attempt:", error);
    res.status(500).json({
      success: false,
      message: "Error starting quiz attempt",
      error: error.message,
    });
  }
};

const submitQuizAttempt = async (req, res) => {
  try {
    const { id: attemptId } = req.params;

    // Find student by user ID
    const Student = require("../../models/Student");
    const student = await Student.findOne({ userId: req.user.id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    const studentId = student._id;

    // Find the attempt
    const attempt = await QuizAttempt.findById(attemptId).populate("quizId");
    if (!attempt) {
      return res.status(404).json({
        success: false,
        message: "Attempt not found",
      });
    }

    // Check ownership
    if (attempt.studentId.toString() !== studentId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Check if already submitted
    if (attempt.submittedAt) {
      // Return the existing submitted attempt data
      return res.json({
        success: true,
        data: attempt,
        message: "Attempt was already submitted",
      });
    }

    // Submit the quiz using the model method
    await attempt.submitQuiz();

    // Create grade for this quiz (either linked to exam or standalone)
    try {
      const Exam = require("../../models/Exam");
      const Grade = require("../../models/Grade");
      const Quiz = require("../../models/elearning/Quiz");

      // Ensure quiz data is populated
      let quiz = attempt.quizId;
      if (typeof quiz === "string" || quiz instanceof mongoose.Types.ObjectId) {
        quiz = await Quiz.findById(attempt.quizId);
      }

      if (!quiz) {
        console.error("Quiz not found for attempt:", attemptId);
        return;
      }

      // Check if this quiz is linked to an exam
      let exam = await Exam.findOne({
        quizId: quiz._id,
        type: "online",
        status: { $in: ["scheduled", "ongoing", "completed"] },
      });

      // If no exam exists for this quiz, create a virtual exam record for grading purposes
      if (!exam) {
        const maxMarks =
          quiz.questions?.reduce((total, q) => total + (q.points || 1), 0) ||
          attempt.totalPossible ||
          10;

        exam = await Exam.create({
          title: quiz.title,
          courseId: quiz.courseId,
          branchId: quiz.branchId || student.branchId,
          teacherId: quiz.createdBy, // Required field
          type: "online",
          quizId: quiz._id,
          maxMarks: maxMarks,
          weightage: 100, // Required field - set to 100% for standalone quizzes
          schedule: {
            date: new Date(), // Use current date for standalone quizzes
            startTime: "00:00",
            endTime: "23:59",
            duration: quiz.timeLimit || 60,
          },
          status: "completed", // Mark as completed since quiz is done
          createdBy: quiz.createdBy,
        });
      }

      const courseId = exam.courseId;

      // Create or update grade for this exam/quiz
      const existingGrade = await Grade.findOne({
        examId: exam._id,
        studentId: studentId,
      });

      const gradeData = {
        branchId: exam.branchId,
        examId: exam._id,
        studentId: studentId,
        courseId: courseId,
        marks: attempt.totalScore,
        maxMarks: exam.maxMarks,
        percentage: attempt.percentageScore,
        grade:
          attempt.percentageScore >= 80
            ? "A"
            : attempt.percentageScore >= 70
            ? "B"
            : attempt.percentageScore >= 60
            ? "C"
            : attempt.percentageScore >= 50
            ? "D"
            : "F",
        quizAttemptId: attempt._id,
        submittedBy: null, // System-generated
      };

      if (existingGrade) {
        // Update existing grade
        Object.assign(existingGrade, gradeData);
        await existingGrade.save();
      } else {
        // Create new grade
        await Grade.create(gradeData);
      }

      // For standalone quizzes, mark the virtual exam as completed
      if (exam.status !== "completed") {
        exam.status = "completed";
        await exam.save();
      }
    } catch (gradeError) {
      console.error("Error creating automatic grade:", gradeError);
      // Don't fail the quiz submission if grade creation fails
    }

    // Update course progress for e-learning courses
    try {
      const quiz = attempt.quizId; // Get the populated quiz
      console.log(
        "Progress update - quiz:",
        quiz?._id,
        "courseType:",
        quiz?.courseType,
        "moduleId:",
        quiz?.moduleId
      );
      if (quiz && quiz.courseType === "ecourse") {
        const LearningProgress = require("../../models/elearning/LearningProgress");
        const LearningModule = require("../../models/elearning/LearningModule");

        // Find the learning progress for this student and course
        let learningProgress = await LearningProgress.findOne({
          studentId,
          courseId: quiz.courseId,
        });
        console.log(
          "Progress update - learningProgress found:",
          !!learningProgress
        );

        if (learningProgress) {
          // Find which module contains this quiz
          let modules = [];

          if (quiz.moduleId) {
            // If quiz has moduleId, find by that
            console.log(
              "Progress update - finding module by moduleId:",
              quiz.moduleId
            );
            const module = await LearningModule.findById(quiz.moduleId);
            if (module) modules = [module];
            console.log(
              "Progress update - module found by moduleId:",
              !!module
            );
          } else {
            // Otherwise, find by quizId
            console.log(
              "Progress update - finding modules by quizId:",
              quiz._id
            );
            modules = await LearningModule.find({
              courseId: quiz.courseId,
              quizId: quiz._id,
            });
            console.log(
              "Progress update - modules found by quizId:",
              modules.length
            );
          }

          if (modules.length > 0) {
            const module = modules[0];
            console.log(
              "Progress update - module found:",
              module._id,
              "title:",
              module.title
            );
            const moduleProgressIndex =
              learningProgress.moduleProgress.findIndex(
                (mp) => mp.moduleId.toString() === module._id.toString()
              );

            console.log(
              "Progress update - moduleProgressIndex:",
              moduleProgressIndex
            );

            if (moduleProgressIndex >= 0) {
              const moduleProgress =
                learningProgress.moduleProgress[moduleProgressIndex];

              // Update assessment results
              const existingResultIndex =
                moduleProgress.assessmentResults.findIndex(
                  (ar) => ar.assessmentId.toString() === quiz._id.toString()
                );

              const assessmentResult = {
                assessmentId: quiz._id,
                assessmentType: "quiz",
                score: attempt.totalScore,
                maxScore: attempt.totalPossible,
                percentage: attempt.percentageScore,
                attempts: 1, // This would need to be calculated properly
                bestAttemptScore: attempt.totalScore,
                submittedAt: attempt.submittedAt,
                passed: attempt.percentageScore >= 60, // Assuming 60% is passing
              };

              if (existingResultIndex >= 0) {
                // Update existing result
                moduleProgress.assessmentResults[existingResultIndex] =
                  assessmentResult;
              } else {
                // Add new result
                moduleProgress.assessmentResults.push(assessmentResult);
              }

              // Update completion criteria
              moduleProgress.completionCriteria.requiredAssessmentsCompleted =
                moduleProgress.assessmentResults.filter(
                  (ar) => ar.passed
                ).length;

              // Check if module is now completed
              const totalAssessments = 1; // For now, assume 1 quiz per module
              const hasPassedQuiz = assessmentResult.passed;

              console.log(
                "Progress update - hasPassedQuiz:",
                hasPassedQuiz,
                "module status:",
                moduleProgress.status
              );

              // Mark module as completed if quiz is passed
              if (hasPassedQuiz) {
                const wasAlreadyCompleted =
                  moduleProgress.status === "completed";

                if (!wasAlreadyCompleted) {
                  moduleProgress.status = "completed";
                  moduleProgress.completedAt = new Date();
                  moduleProgress.progress = 100;
                  console.log("Progress update - module marked as completed");
                }

                // Always try to unlock next module when quiz is passed (even if module was already completed)
                const allModules = await LearningModule.find({
                  courseId: quiz.courseId,
                }).sort({ order: 1 });

                const currentModuleIndex = allModules.findIndex(
                  (m) => m._id.toString() === module._id.toString()
                );

                console.log(
                  "Progress update - currentModuleIndex:",
                  currentModuleIndex,
                  "total modules:",
                  allModules.length
                );

                if (
                  currentModuleIndex >= 0 &&
                  currentModuleIndex < allModules.length - 1
                ) {
                  const nextModule = allModules[currentModuleIndex + 1];
                  const nextModuleProgressIndex =
                    learningProgress.moduleProgress.findIndex(
                      (mp) =>
                        mp.moduleId.toString() === nextModule._id.toString()
                    );

                  console.log(
                    "Progress update - unlocking next module:",
                    nextModule._id,
                    "title:",
                    nextModule.title,
                    "progressIndex:",
                    nextModuleProgressIndex
                  );

                  if (nextModuleProgressIndex >= 0) {
                    const nextModuleStatus =
                      learningProgress.moduleProgress[nextModuleProgressIndex]
                        .status;
                    console.log(
                      "Progress update - next module current status:",
                      nextModuleStatus
                    );

                    // Only unlock if the next module is not_started (not yet started)
                    if (nextModuleStatus === "not_started") {
                      learningProgress.moduleProgress[
                        nextModuleProgressIndex
                      ].status = "in_progress";
                      console.log(
                        "Progress update - next module unlocked from not_started to in_progress!"
                      );
                    } else {
                      console.log(
                        "Progress update - next module already unlocked, status:",
                        nextModuleStatus
                      );
                    }
                  } else {
                    console.log(
                      "Progress update - next module progress not found, creating it"
                    );
                    // Create progress for next module if it doesn't exist
                    learningProgress.moduleProgress.push({
                      moduleId: nextModule._id,
                      status: "in_progress",
                      progress: 0,
                      contentProgress: [],
                      assessmentResults: [],
                      completionCriteria: {
                        requiredContentCompleted: 0,
                        requiredAssessmentsCompleted: 0,
                      },
                    });
                    console.log(
                      "Progress update - next module progress created and unlocked!"
                    );
                  }

                  // Verify the save worked by reloading
                  await learningProgress.save();
                  console.log("Progress update - learningProgress saved");

                  const verifyProgress = await LearningProgress.findOne({
                    studentId,
                    courseId: quiz.courseId,
                  });
                  if (verifyProgress && nextModule) {
                    const nextModuleVerify = verifyProgress.moduleProgress.find(
                      (mp) =>
                        mp.moduleId.toString() === nextModule._id.toString()
                    );
                    console.log(
                      "Progress update - verification after save, next module status:",
                      nextModuleVerify?.status
                    );
                  }
                } else {
                  // No next module to unlock, just save
                  await learningProgress.save();
                  console.log(
                    "Progress update - learningProgress saved (no next module)"
                  );
                }
              } else {
                // Quiz not passed, just save the progress
                await learningProgress.save();
                console.log(
                  "Progress update - learningProgress saved (quiz not passed)"
                );
              }
            } else {
              console.log(
                "Progress update - module progress not found in learningProgress"
              );
            }
          } else {
            console.log("Progress update - no modules found for quiz");
          }
        } else {
          console.log("Progress update - no learningProgress found");
        }
      } else {
        console.log("Progress update - quiz not found or not ecourse");
      }
    } catch (progressError) {
      console.error("Error updating course progress:", progressError);
      // Don't fail the quiz submission if progress update fails
    }

    res.json({
      success: true,
      data: attempt,
    });
  } catch (error) {
    console.error("Error submitting quiz attempt:", error);
    res.status(500).json({
      success: false,
      message: "Error submitting quiz attempt",
      error: error.message,
    });
  }
};

const getQuizAttempt = async (req, res) => {
  try {
    const { id: attemptId } = req.params;

    // Find student by user ID
    const Student = require("../../models/Student");
    const student = await Student.findOne({ userId: req.user.id });
    console.log(
      "getQuizAttempt - Student lookup:",
      student ? { id: student._id, userId: student.userId } : "No student found"
    );
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    const studentId = student._id;
    console.log(
      "getQuizAttempt - Attempt ID:",
      attemptId,
      "Student ID:",
      studentId
    );

    const attempt = await QuizAttempt.findById(attemptId).populate("quizId");
    console.log(
      "getQuizAttempt - Attempt found:",
      attempt
        ? {
            id: attempt._id,
            studentId: attempt.studentId,
            quizId: attempt.quizId?._id,
          }
        : "No attempt found"
    );
    if (!attempt) {
      return res.status(404).json({
        success: false,
        message: "Attempt not found",
      });
    }

    // Check ownership
    console.log(
      "getQuizAttempt - Ownership check:",
      attempt.studentId.toString(),
      "vs",
      studentId.toString()
    );
    if (attempt.studentId.toString() !== studentId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    res.json({
      success: true,
      data: attempt,
    });
  } catch (error) {
    console.error("Error getting quiz attempt:", error);
    res.status(500).json({
      success: false,
      message: "Error getting quiz attempt",
      error: error.message,
    });
  }
};

const submitAnswer = async (req, res) => {
  try {
    const { id: attemptId } = req.params;
    const { questionId, answer } = req.body;

    console.log("submitAnswer - req.user:", {
      id: req.user.id,
      _id: req.user._id,
      email: req.user.email,
    });

    // Find student by user ID
    const Student = require("../../models/Student");
    const student = await Student.findOne({ userId: req.user.id });
    console.log(
      "submitAnswer - student lookup result:",
      student
        ? {
            id: student._id,
            userId: student.userId,
            studentId: student.studentId,
          }
        : "No student found"
    );

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    const studentId = student._id;

    // Find the attempt
    const attempt = await QuizAttempt.findById(attemptId).populate("quizId");
    console.log(
      "submitAnswer - attempt lookup result:",
      attempt
        ? {
            id: attempt._id,
            studentId: attempt.studentId,
            quizId: attempt.quizId?._id,
            submittedAt: attempt.submittedAt,
          }
        : "No attempt found"
    );

    if (!attempt) {
      return res.status(404).json({
        success: false,
        message: "Attempt not found",
      });
    }

    // Check ownership
    console.log("submitAnswer - ownership check:", {
      attemptStudentId: attempt.studentId.toString(),
      requestStudentId: studentId.toString(),
      match: attempt.studentId.toString() === studentId.toString(),
    });

    if (attempt.studentId.toString() !== studentId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Check if already submitted
    if (attempt.submittedAt) {
      return res.status(400).json({
        success: false,
        message: "Attempt already submitted",
      });
    }

    // Find the question
    const question = attempt.quizId.questions.find(
      (q) => q._id.toString() === questionId
    );
    if (!question) {
      return res.status(404).json({
        success: false,
        message: "Question not found",
      });
    }

    // Check if answer already exists
    let existingAnswer = attempt.answers.find(
      (a) => a.questionId.toString() === questionId
    );
    if (existingAnswer) {
      // Update existing answer
      existingAnswer.answer = answer;
      existingAnswer.answeredAt = new Date();
    } else {
      // Add new answer
      attempt.answers.push({
        questionId,
        answer,
        answeredAt: new Date(),
      });
    }

    await attempt.save();

    res.json({
      success: true,
      message: "Answer submitted successfully",
    });
  } catch (error) {
    console.error("Error submitting answer:", error);
    res.status(500).json({
      success: false,
      message: "Error submitting answer",
      error: error.message,
    });
  }
};

const getStudentAttempts = async (req, res) => {
  try {
    const { id: quizId } = req.params;

    // Find student by user ID
    const Student = require("../../models/Student");
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    const studentId = student._id;

    // Check if quiz exists
    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found",
      });
    }

    // Check if student is enrolled
    let hasAccess = false;

    if (quiz.courseType === "ecourse") {
      // For e-courses, check Enrollment model
      const enrollment = await Enrollment.findOne({
        studentId,
        courseId: quiz.courseId,
        status: { $in: ["active", "approved", "completed"] },
      });
      hasAccess = !!enrollment;
    } else {
      // For regular courses, check if courseId is in student's courses array
      hasAccess =
        student.courses &&
        student.courses.some(
          (courseId) => courseId.toString() === quiz.courseId.toString()
        );
    }

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "You are not enrolled in this course",
      });
    }

    // Get student's attempts for this quiz
    const attempts = await QuizAttempt.find({
      quizId,
      studentId,
    })
      .sort({ createdAt: -1 })
      .populate("quizId", "title");

    res.json({
      success: true,
      data: attempts,
    });
  } catch (error) {
    console.error("Error getting student attempts:", error);
    res.status(500).json({
      success: false,
      message: "Error getting attempts",
      error: error.message,
    });
  }
};

/**
 * Grade a quiz attempt (for manual grading questions)
 */
const gradeQuizAttempt = async (req, res) => {
  try {
    const { attemptId } = req.params;
    const { grades, feedback } = req.body; // grades: { questionId: score }, feedback: { questionId: feedback }

    console.log("=== Grade Quiz Attempt Debug ===");
    console.log("Attempt ID:", attemptId);
    console.log("Grades:", grades);
    console.log("Feedback:", feedback);

    // Find the attempt
    const attempt = await QuizAttempt.findById(attemptId).populate("quizId");
    if (!attempt) {
      return res.status(404).json({
        success: false,
        message: "Quiz attempt not found",
      });
    }

    // Check if user has permission to grade (teacher or branch admin)
    if (
      !req.user.roles.includes("teacher") &&
      !req.user.roles.includes("branch_admin")
    ) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized to grade quiz attempts",
      });
    }

    // Check if the teacher has access to this quiz's course
    const quiz = attempt.quizId;
    if (
      req.user.roles.includes("teacher") &&
      !quiz.createdBy.equals(req.user.id)
    ) {
      return res.status(403).json({
        success: false,
        message: "You can only grade quizzes you created",
      });
    }

    let totalManualScore = 0;
    let totalManualPoints = 0;

    // Update grades for each question
    for (const [questionId, score] of Object.entries(grades)) {
      console.log(`Processing question ${questionId} with score ${score}`);
      const questionIndex = attempt.answers.findIndex(
        (a) => a.questionId.toString() === questionId
      );
      console.log(`Question index: ${questionIndex}`);
      if (questionIndex !== -1) {
        const question = quiz.questions.find(
          (q) => q._id.toString() === questionId
        );
        console.log(
          `Found question:`,
          question ? { type: question.type, _id: question._id } : null
        );
        if (question && attempt.answers[questionIndex].needsManualGrading) {
          console.log(`Updating essay question ${questionId}`);
          attempt.answers[questionIndex].score = score;
          attempt.answers[questionIndex].pointsEarned = score;
          attempt.answers[questionIndex].feedback = feedback[questionId] || "";
          attempt.answers[questionIndex].gradedAt = new Date();
          attempt.answers[questionIndex].gradedBy = req.user.id;
          attempt.answers[questionIndex].needsManualGrading = false;
          attempt.answers[questionIndex].isCorrect =
            score >= (question.points || 10) * 0.6; // 60% for correct

          totalManualScore += score;
          totalManualPoints += question.points || 10;
          console.log(`Updated answer for question ${questionId}`);
        } else {
          console.log(`Question ${questionId} is not an essay or not found`);
        }
      } else {
        console.log(`Answer not found for question ${questionId}`);
      }
    }

    // Calculate total score including auto-graded questions
    let totalScore = 0;
    let totalPoints = 0;

    attempt.answers.forEach((answer) => {
      const question = quiz.questions.find(
        (q) => q._id.toString() === answer.questionId.toString()
      );
      if (question) {
        console.log(
          `Processing answer for question ${question._id}: needsManualGrading=${answer.needsManualGrading}, score=${answer.score}, pointsEarned=${answer.pointsEarned}, question.points=${question.points}`
        );
        if (answer.needsManualGrading) {
          // Manually graded questions use the score field
          totalScore += answer.score || 0;
        } else {
          // Auto-graded questions already have scores
          totalScore += answer.pointsEarned || 0;
        }
        totalPoints += question.points || 10;
        console.log(
          `Running totals: totalScore=${totalScore}, totalPoints=${totalPoints}`
        );
      }
    });

    // Update attempt status and scores (use schema fields: totalPossible, percentageScore)
    attempt.manualScore = totalManualScore;
    attempt.totalScore = totalScore;
    attempt.totalPossible = totalPoints;
    attempt.percentageScore =
      totalPoints > 0 ? Math.round((totalScore / totalPoints) * 100) : 0;

    console.log(
      `Final scores - totalScore: ${totalScore}, totalPossible: ${totalPoints}, percentageScore: ${attempt.percentageScore}`
    );

    // Determine final status
    if (attempt.answers.some((a) => a.needsManualGrading && !a.gradedAt)) {
      attempt.status = "partially_graded";
    } else {
      attempt.status = "submitted";
      attempt.gradedAt = new Date();
      attempt.gradedBy = req.user.id;
    }

    await attempt.save();
    console.log(
      `Attempt saved successfully. New status: ${attempt.status}, totalScore: ${attempt.totalScore}, totalPossible: ${attempt.totalPossible}, percentageScore: ${attempt.percentageScore}`
    );

    // Send quiz result notification if fully graded
    if (attempt.status === "submitted") {
      try {
        const notificationService = require("../../services/notificationService");
        const pushController = require("../../controllers/pushController");
        const student = await require("../../models/Student")
          .findById(attempt.studentId)
          .populate("userId");
        const quiz = await require("../../models/elearning/Quiz").findById(
          attempt.quizId
        );

        if (student && quiz) {
          // Calculate grade
          const score = attempt.percentageScore;
          let grade = "F";
          if (score >= 90) grade = "A";
          else if (score >= 80) grade = "B";
          else if (score >= 70) grade = "C";
          else if (score >= 60) grade = "D";

          // Send in-app notification
          await notificationService.notifyQuizResult({
            studentId: student._id,
            quizId: attempt.quizId,
            quizTitle: quiz.title,
            score: attempt.percentageScore,
            grade,
            actionUrl: `/student/quizzes/${attempt.quizId}/results`,
          });

          // Send push notification
          if (student.userId) {
            const payload = {
              title: `Quiz Graded: ${quiz.title}`,
              body: `You scored ${score}% (Grade: ${grade})`,
              icon: "/logo.png",
              tag: `quiz-graded-${attempt._id}`,
              type: "quiz-graded",
              quizId: attempt.quizId.toString(),
              attemptId: attempt._id.toString(),
              score: score,
              grade: grade,
              url: `/student/quizzes/${attempt.quizId}/results`,
            };

            // Store as notice
            await storeNotificationAsNotice({
              userIds: [student.userId._id],
              title: payload.title,
              content: payload.body,
              type: "academic",
              priority: "medium",
              branchId: student.branchId,
              targetAudience: "students",
            });

            await pushController.sendNotification(
              [student.userId._id],
              payload
            );
            console.log(
              `[Quiz] Sent grading notification to student ${student.userId._id} for quiz ${quiz.title}`
            );
          }
        }
      } catch (notifError) {
        console.error("Error sending quiz result notification:", notifError);
        // Don't fail the grading if notification fails
      }
    }

    res.json({
      success: true,
      message: "Quiz attempt graded successfully",
      attempt: {
        _id: attempt._id,
        status: attempt.status,
        totalScore: attempt.totalScore,
        totalPossible: attempt.totalPossible,
        percentageScore: attempt.percentageScore,
        gradedAt: attempt.gradedAt,
      },
    });
  } catch (error) {
    console.error("Error grading quiz attempt:", error);
    res.status(500).json({
      success: false,
      message: "Failed to grade quiz attempt",
      error: error.message,
    });
  }
};

/**
 * Get quiz attempts for a specific quiz (for teachers to grade)
 */
const getQuizAttempts = async (req, res) => {
  try {
    const { quizId } = req.params;
    const { page = 1, limit = 10, studentId } = req.query;

    console.log("=== Get Quiz Attempts Debug ===");
    console.log("Quiz ID:", quizId);
    console.log("User:", req.user._id, "roles:", req.user.roles);

    // Find the quiz
    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found",
      });
    }

    // Check if user has permission to view attempts
    const isOwner = quiz.createdBy.toString() === req.user._id.toString();
    const isAdmin = req.user.roles.some((role) =>
      ["admin", "branch-admin", "super-admin"].includes(role)
    );

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Build query
    const query = { quizId };

    if (studentId) {
      query.studentId = studentId;
    }

    // Get total count
    const total = await QuizAttempt.countDocuments(query);

    // Get attempts with pagination
    const attempts = await QuizAttempt.find(query)
      .populate("studentId", "firstName lastName email")
      .sort({ submittedAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({
      success: true,
      message: "Quiz attempts retrieved successfully",
      attempts,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Error getting quiz attempts:", error);
    res.status(500).json({
      success: false,
      message: "Error getting quiz attempts",
      error: error.message,
    });
  }
};

// Save quiz answer - accepts attemptId from body instead of URL params
const saveQuizAnswer = async (req, res) => {
  try {
    const { id: quizId } = req.params;
    const { questionId, answer, attemptId } = req.body;

    if (!attemptId) {
      return res.status(400).json({
        success: false,
        message: "Attempt ID is required",
      });
    }

    // Find student by user ID
    const Student = require("../../models/Student");
    const student = await Student.findOne({ userId: req.user.id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    const studentId = student._id;

    // Find the attempt
    const attempt = await QuizAttempt.findById(attemptId).populate("quizId");
    if (!attempt) {
      return res.status(404).json({
        success: false,
        message: "Attempt not found",
      });
    }

    // Verify the attempt belongs to this quiz
    if (attempt.quizId._id.toString() !== quizId) {
      return res.status(400).json({
        success: false,
        message: "Attempt does not belong to this quiz",
      });
    }

    // Check ownership
    if (attempt.studentId.toString() !== studentId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Check if already submitted
    if (attempt.submittedAt) {
      return res.status(400).json({
        success: false,
        message: "Attempt already submitted",
      });
    }

    // Find the question
    const question = attempt.quizId.questions.find(
      (q) => q._id.toString() === questionId
    );
    if (!question) {
      return res.status(404).json({
        success: false,
        message: "Question not found",
      });
    }

    // Check if answer already exists
    let existingAnswer = attempt.answers.find(
      (a) => a.questionId.toString() === questionId
    );
    if (existingAnswer) {
      existingAnswer.answer = answer;
      existingAnswer.answeredAt = new Date();
    } else {
      attempt.answers.push({
        questionId,
        answer,
        answeredAt: new Date(),
      });
    }

    await attempt.save();

    res.json({
      success: true,
      message: "Answer saved successfully",
    });
  } catch (error) {
    console.error("Error saving answer:", error);
    res.status(500).json({
      success: false,
      message: "Error saving answer",
      error: error.message,
    });
  }
};

// Submit quiz - accepts attemptId from body instead of URL params
const submitQuiz = async (req, res) => {
  try {
    const { id: quizId } = req.params;
    const { answers, attemptId } = req.body;

    if (!attemptId) {
      return res.status(400).json({
        success: false,
        message: "Attempt ID is required",
      });
    }

    // Find student by user ID
    const Student = require("../../models/Student");
    const student = await Student.findOne({ userId: req.user.id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    const studentId = student._id;

    // Find the attempt
    const attempt = await QuizAttempt.findById(attemptId).populate("quizId");
    if (!attempt) {
      return res.status(404).json({
        success: false,
        message: "Attempt not found",
      });
    }

    // Verify the attempt belongs to this quiz
    if (attempt.quizId._id.toString() !== quizId) {
      return res.status(400).json({
        success: false,
        message: "Attempt does not belong to this quiz",
      });
    }

    // Check ownership
    if (attempt.studentId.toString() !== studentId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Check if already submitted
    if (attempt.submittedAt) {
      return res.status(400).json({
        success: false,
        message: "Quiz already submitted",
      });
    }

    const quiz = attempt.quizId;

    // Update answers from the submission (in case any weren't auto-saved)
    if (answers && typeof answers === "object") {
      for (const [questionId, answer] of Object.entries(answers)) {
        let existingAnswer = attempt.answers.find(
          (a) => a.questionId.toString() === questionId
        );
        if (existingAnswer) {
          existingAnswer.answer = answer;
          existingAnswer.answeredAt = new Date();
        } else {
          attempt.answers.push({
            questionId,
            answer,
            answeredAt: new Date(),
          });
        }
      }
    }

    // Grade the quiz if autoGrade is enabled
    let totalScore = 0;
    let totalPossible = 0;

    if (quiz.grading?.autoGrade !== false) {
      for (const question of quiz.questions) {
        totalPossible += question.points || 1;

        const studentAnswer = attempt.answers.find(
          (a) => a.questionId.toString() === question._id.toString()
        );

        if (studentAnswer) {
          let isCorrect = false;
          let pointsEarned = 0;

          switch (question.type) {
            case "multiple_choice":
            case "true_false":
              isCorrect =
                studentAnswer.answer?.toLowerCase() ===
                question.correctAnswer?.toLowerCase();
              break;
            case "short_answer":
              // Case-insensitive comparison, trim whitespace
              isCorrect =
                studentAnswer.answer?.trim()?.toLowerCase() ===
                question.correctAnswer?.trim()?.toLowerCase();
              break;
            case "fill_blank":
              // Check if answer matches any of the correct answers
              if (
                question.correctAnswers &&
                question.correctAnswers.length > 0
              ) {
                isCorrect = question.correctAnswers.some(
                  (correct) =>
                    studentAnswer.answer?.trim()?.toLowerCase() ===
                    correct?.trim()?.toLowerCase()
                );
              } else {
                isCorrect =
                  studentAnswer.answer?.trim()?.toLowerCase() ===
                  question.correctAnswer?.trim()?.toLowerCase();
              }
              break;
            case "matching":
              // Matching questions need special handling
              if (
                question.pairs &&
                studentAnswer.answer &&
                typeof studentAnswer.answer === "object"
              ) {
                let correctPairs = 0;
                for (const pair of question.pairs) {
                  if (studentAnswer.answer[pair.left] === pair.right) {
                    correctPairs++;
                  }
                }
                // Partial credit for matching
                pointsEarned =
                  (correctPairs / question.pairs.length) *
                  (question.points || 1);
                isCorrect = correctPairs === question.pairs.length;
              }
              break;
            case "essay":
              // Essay questions need manual grading
              isCorrect = false;
              pointsEarned = 0;
              break;
          }

          if (question.type !== "matching") {
            pointsEarned = isCorrect ? question.points || 1 : 0;
          }

          studentAnswer.isCorrect = isCorrect;
          studentAnswer.pointsEarned = pointsEarned;
          totalScore += pointsEarned;
        }
      }
    }

    // Calculate time spent
    const timeSpent = Math.round(
      (new Date() - new Date(attempt.startedAt)) / 60000
    ); // in minutes

    // Update attempt
    attempt.submittedAt = new Date();
    attempt.totalScore = totalScore;
    attempt.totalPossible = totalPossible;
    attempt.percentageScore =
      totalPossible > 0 ? Math.round((totalScore / totalPossible) * 100) : 0;
    attempt.timeSpent = timeSpent;
    attempt.status = "submitted";

    await attempt.save();

    // Update quiz analytics
    await Quiz.findByIdAndUpdate(quizId, {
      $inc: {
        "analytics.attemptCount": 1,
        "analytics.completionCount": 1,
      },
    });

    res.json({
      success: true,
      message: "Quiz submitted successfully",
      data: {
        attempt: {
          _id: attempt._id,
          totalScore: attempt.totalScore,
          totalPossible: attempt.totalPossible,
          percentageScore: attempt.percentageScore,
          timeSpent: attempt.timeSpent,
          submittedAt: attempt.submittedAt,
          status: attempt.status,
        },
      },
    });
  } catch (error) {
    console.error("Error submitting quiz:", error);
    res.status(500).json({
      success: false,
      message: "Error submitting quiz",
      error: error.message,
    });
  }
};

module.exports = {
  createQuiz,
  getTeacherQuizzes,
  getQuizById,
  updateQuiz,
  archiveQuiz,
  unarchiveQuiz,
  deleteQuiz,
  toggleQuizPublication,
  addQuestion,
  updateQuestion,
  removeQuestion,
  getQuizAnalytics,
  addQuestions,
  updateQuizSchedule,
  importQuestions,
  startQuizAttempt,
  startQuizWithData,
  submitQuizAttempt,
  getQuizAttempt,
  submitAnswer,
  getStudentAttempts,
  gradeQuizAttempt,
  getQuizAttempts,
  saveQuizAnswer,
  submitQuiz,
};
