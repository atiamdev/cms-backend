const {
  LearningProgress,
  Enrollment,
  QuizAttempt,
  ECourse,
  Quiz,
  Student,
} = require("../../models/elearning");
const mongoose = require("mongoose");

/**
 * Get student progress analytics for teachers
 * GET /api/elearning/analytics/student-progress
 */
const getStudentProgressAnalytics = async (req, res) => {
  try {
    const { courseId, studentId, branchId } = req.query;
    const teacherId = req.user._id;

    // Build match conditions
    let matchConditions = {};

    // If teacher is specified, filter by their courses (assuming teacher courses relationship exists)
    // For now, allow all courses if no specific filtering

    if (courseId) {
      matchConditions.courseId = mongoose.Types.ObjectId(courseId);
    }

    if (studentId) {
      matchConditions.studentId = mongoose.Types.ObjectId(studentId);
    }

    if (branchId) {
      matchConditions.branchId = mongoose.Types.ObjectId(branchId);
    } else if (req.user.branchId) {
      matchConditions.branchId = req.user.branchId;
    }

    const progressData = await LearningProgress.aggregate([
      { $match: matchConditions },
      {
        $lookup: {
          from: "students",
          localField: "studentId",
          foreignField: "_id",
          as: "student",
        },
      },
      {
        $lookup: {
          from: "ecourses",
          localField: "courseId",
          foreignField: "_id",
          as: "course",
        },
      },
      {
        $unwind: "$student",
      },
      {
        $unwind: "$course",
      },
      {
        $project: {
          studentId: 1,
          studentName: {
            $concat: ["$student.firstName", " ", "$student.lastName"],
          },
          courseId: 1,
          courseName: "$course.title",
          overallProgress: {
            $sum: "$moduleProgress.progress",
          },
          modulesCompleted: {
            $size: {
              $filter: {
                input: "$moduleProgress",
                cond: { $eq: ["$$this.status", "completed"] },
              },
            },
          },
          totalModules: { $size: "$moduleProgress" },
          timeSpent: {
            $sum: "$moduleProgress.timeSpent",
          },
          lastAccessedAt: {
            $max: "$moduleProgress.lastAccessedAt",
          },
          startedAt: {
            $min: "$moduleProgress.startedAt",
          },
        },
      },
      {
        $sort: { lastAccessedAt: -1 },
      },
    ]);

    res.json({
      success: true,
      data: progressData,
    });
  } catch (error) {
    console.error("Student progress analytics error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching student progress analytics",
      error: error.message,
    });
  }
};

/**
 * Get course completion rate analytics
 * GET /api/elearning/analytics/course-completion
 */
const getCourseCompletionAnalytics = async (req, res) => {
  try {
    const { courseId, branchId, startDate, endDate } = req.query;

    let matchConditions = {};

    if (courseId) {
      matchConditions.courseId = mongoose.Types.ObjectId(courseId);
    }

    if (branchId) {
      matchConditions.branchId = mongoose.Types.ObjectId(branchId);
    } else if (req.user.branchId) {
      matchConditions.branchId = req.user.branchId;
    }

    if (startDate || endDate) {
      matchConditions.createdAt = {};
      if (startDate) matchConditions.createdAt.$gte = new Date(startDate);
      if (endDate) matchConditions.createdAt.$lte = new Date(endDate);
    }

    const completionData = await Enrollment.aggregate([
      { $match: matchConditions },
      {
        $lookup: {
          from: "ecourses",
          localField: "courseId",
          foreignField: "_id",
          as: "course",
        },
      },
      {
        $lookup: {
          from: "learningprogresses",
          localField: "studentId",
          foreignField: "studentId",
          as: "progress",
          pipeline: [{ $match: { courseId: "$courseId" } }],
        },
      },
      {
        $unwind: "$course",
      },
      {
        $project: {
          courseId: 1,
          courseName: "$course.title",
          studentId: 1,
          enrollmentStatus: "$status",
          enrolledAt: "$createdAt",
          completionPercentage: {
            $ifNull: [{ $arrayElemAt: ["$progress.overallProgress", 0] }, 0],
          },
          isCompleted: {
            $gte: [
              {
                $ifNull: [
                  { $arrayElemAt: ["$progress.overallProgress", 0] },
                  0,
                ],
              },
              100,
            ],
          },
        },
      },
      {
        $group: {
          _id: "$courseId",
          courseName: { $first: "$courseName" },
          totalEnrollments: { $sum: 1 },
          completedEnrollments: {
            $sum: { $cond: ["$isCompleted", 1, 0] },
          },
          averageCompletion: { $avg: "$completionPercentage" },
          completionRate: {
            $multiply: [
              {
                $divide: [
                  { $sum: { $cond: ["$isCompleted", 1, 0] } },
                  { $sum: 1 },
                ],
              },
              100,
            ],
          },
        },
      },
      {
        $project: {
          courseId: "$_id",
          courseName: 1,
          totalEnrollments: 1,
          completedEnrollments: 1,
          averageCompletion: { $round: ["$averageCompletion", 2] },
          completionRate: { $round: ["$completionRate", 2] },
        },
      },
      {
        $sort: { completionRate: -1 },
      },
    ]);

    res.json({
      success: true,
      data: completionData,
    });
  } catch (error) {
    console.error("Course completion analytics error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching course completion analytics",
      error: error.message,
    });
  }
};

/**
 * Get quiz performance analytics
 * GET /api/elearning/analytics/quiz-performance
 */
const getQuizPerformanceAnalytics = async (req, res) => {
  try {
    const { quizId, courseId, branchId, startDate, endDate } = req.query;

    let matchConditions = {};

    if (quizId) {
      matchConditions.quizId = mongoose.Types.ObjectId(quizId);
    }

    if (courseId) {
      // Find quizzes for the specific course
      const courseQuizzes = await Quiz.find({
        courseId: mongoose.Types.ObjectId(courseId),
      });
      matchConditions.quizId = { $in: courseQuizzes.map((q) => q._id) };
    }

    if (branchId) {
      matchConditions.branchId = mongoose.Types.ObjectId(branchId);
    } else if (req.user.branchId) {
      matchConditions.branchId = req.user.branchId;
    }

    if (startDate || endDate) {
      matchConditions.submittedAt = {};
      if (startDate) matchConditions.submittedAt.$gte = new Date(startDate);
      if (endDate) matchConditions.submittedAt.$lte = new Date(endDate);
    }

    const quizData = await QuizAttempt.aggregate([
      { $match: matchConditions },
      {
        $lookup: {
          from: "quizzes",
          localField: "quizId",
          foreignField: "_id",
          as: "quiz",
        },
      },
      {
        $lookup: {
          from: "students",
          localField: "studentId",
          foreignField: "_id",
          as: "student",
        },
      },
      {
        $unwind: "$quiz",
      },
      {
        $unwind: "$student",
      },
      {
        $project: {
          quizId: 1,
          quizTitle: "$quiz.title",
          studentId: 1,
          studentName: {
            $concat: ["$student.firstName", " ", "$student.lastName"],
          },
          score: "$percentageScore",
          totalScore: "$totalScore",
          totalPossible: "$totalPossible",
          passed: {
            $gte: ["$percentageScore", "$quiz.passingScore"],
          },
          submittedAt: 1,
          timeSpent: 1,
        },
      },
      {
        $group: {
          _id: "$quizId",
          quizTitle: { $first: "$quizTitle" },
          totalAttempts: { $sum: 1 },
          averageScore: { $avg: "$score" },
          highestScore: { $max: "$score" },
          lowestScore: { $min: "$score" },
          passCount: {
            $sum: { $cond: ["$passed", 1, 0] },
          },
          passRate: {
            $multiply: [
              {
                $divide: [{ $sum: { $cond: ["$passed", 1, 0] } }, { $sum: 1 }],
              },
              100,
            ],
          },
          averageTimeSpent: { $avg: "$timeSpent" },
          attempts: {
            $push: {
              studentName: "$studentName",
              score: "$score",
              passed: "$passed",
              submittedAt: "$submittedAt",
              timeSpent: "$timeSpent",
            },
          },
        },
      },
      {
        $project: {
          quizId: "$_id",
          quizTitle: 1,
          totalAttempts: 1,
          averageScore: { $round: ["$averageScore", 2] },
          highestScore: 1,
          lowestScore: 1,
          passCount: 1,
          passRate: { $round: ["$passRate", 2] },
          averageTimeSpent: { $round: ["$averageTimeSpent", 2] },
          attempts: { $slice: ["$attempts", 10] }, // Limit to last 10 attempts for performance
        },
      },
      {
        $sort: { averageScore: -1 },
      },
    ]);

    res.json({
      success: true,
      data: quizData,
    });
  } catch (error) {
    console.error("Quiz performance analytics error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching quiz performance analytics",
      error: error.message,
    });
  }
};

/**
 * Get comprehensive analytics dashboard data
 * GET /api/elearning/analytics/dashboard
 */
const getAnalyticsDashboard = async (req, res) => {
  try {
    const branchId = req.user.branchId;

    // Get overall statistics
    const totalStudents = await Student.countDocuments({ branchId });
    const totalCourses = await ECourse.countDocuments({ branchId });
    const totalEnrollments = await Enrollment.countDocuments({ branchId });
    const totalQuizzes = await Quiz.countDocuments({ branchId });

    // Get completion rates
    const completionStats = await Enrollment.aggregate([
      { $match: { branchId } },
      {
        $lookup: {
          from: "learningprogresses",
          localField: "studentId",
          foreignField: "studentId",
          as: "progress",
        },
      },
      {
        $project: {
          isCompleted: {
            $gte: [
              {
                $ifNull: [
                  { $arrayElemAt: ["$progress.overallProgress", 0] },
                  0,
                ],
              },
              100,
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: { $sum: { $cond: ["$isCompleted", 1, 0] } },
        },
      },
    ]);

    const completionRate =
      completionStats.length > 0
        ? Math.round(
            (completionStats[0].completed / completionStats[0].total) * 100
          )
        : 0;

    // Get quiz performance stats
    const quizStats = await QuizAttempt.aggregate([
      { $match: { branchId } },
      {
        $lookup: {
          from: "quizzes",
          localField: "quizId",
          foreignField: "_id",
          as: "quiz",
        },
      },
      {
        $unwind: "$quiz",
      },
      {
        $project: {
          passed: { $gte: ["$percentageScore", "$quiz.passingScore"] },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          passed: { $sum: { $cond: ["$passed", 1, 0] } },
        },
      },
    ]);

    const quizPassRate =
      quizStats.length > 0
        ? Math.round((quizStats[0].passed / quizStats[0].total) * 100)
        : 0;

    res.json({
      success: true,
      data: {
        overview: {
          totalStudents,
          totalCourses,
          totalEnrollments,
          totalQuizzes,
          completionRate,
          quizPassRate,
        },
      },
    });
  } catch (error) {
    console.error("Analytics dashboard error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching analytics dashboard",
      error: error.message,
    });
  }
};

const getCoursesAnalytics = async (req, res) => {
  try {
    const { branchId } = req.query;

    let matchConditions = {};

    // Filter by branch only if explicitly specified in query
    if (branchId) {
      matchConditions.branch = mongoose.Types.ObjectId(branchId);
    }
    // Note: Removed automatic branch filtering since courses don't have branch fields

    const coursesAnalytics = await ECourse.aggregate([
      { $match: matchConditions },
      {
        $lookup: {
          from: "enrollments",
          localField: "_id",
          foreignField: "courseId",
          as: "enrollments",
        },
      },
      {
        $lookup: {
          from: "learningprogresses",
          localField: "_id",
          foreignField: "courseId",
          as: "progresses",
        },
      },
      {
        $lookup: {
          from: "payments",
          localField: "_id",
          foreignField: "courseId",
          as: "payments",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "instructor",
          foreignField: "_id",
          as: "instructorInfo",
        },
      },
      {
        $lookup: {
          from: "ratings",
          localField: "_id",
          foreignField: "courseId",
          as: "ratings",
        },
      },
      {
        $addFields: {
          enrollments: { $ifNull: ["$enrollments", []] },
          progresses: { $ifNull: ["$progresses", []] },
          payments: { $ifNull: ["$payments", []] },
          instructorInfo: { $ifNull: ["$instructorInfo", []] },
          ratings: { $ifNull: ["$ratings", []] },
        },
      },
      {
        $project: {
          _id: 1,
          title: 1,
          description: 1,
          category: 1,
          level: 1,
          pricing: 1,
          status: 1,
          thumbnail: 1,
          teacher: {
            $cond: {
              if: { $gt: [{ $size: "$instructorInfo" }, 0] },
              then: {
                $let: {
                  vars: {
                    instructor: { $arrayElemAt: ["$instructorInfo", 0] },
                  },
                  in: {
                    name: {
                      $concat: [
                        { $ifNull: ["$$instructor.firstName", ""] },
                        " ",
                        { $ifNull: ["$$instructor.lastName", ""] },
                      ],
                    },
                  },
                },
              },
              else: { name: "N/A" },
            },
          },
          enrollments: { $size: "$enrollments" },
          completions: {
            $size: {
              $filter: {
                input: "$enrollments",
                cond: { $eq: ["$$this.status", "completed"] },
              },
            },
          },
          completionRate: {
            $cond: {
              if: { $gt: [{ $size: "$enrollments" }, 0] },
              then: {
                $multiply: [
                  {
                    $divide: [
                      {
                        $size: {
                          $filter: {
                            input: "$enrollments",
                            cond: { $eq: ["$$this.status", "completed"] },
                          },
                        },
                      },
                      { $size: "$enrollments" },
                    ],
                  },
                  100,
                ],
              },
              else: 0,
            },
          },
          revenue: {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: "$payments",
                    cond: { $eq: ["$$this.status", "completed"] },
                  },
                },
                as: "payment",
                in: "$$payment.amount",
              },
            },
          },
          averageRating: {
            $cond: {
              if: { $gt: [{ $size: "$ratings" }, 0] },
              then: { $avg: "$ratings.rating" },
              else: 0,
            },
          },
          totalRatings: { $size: "$ratings" },
          createdAt: 1,
          updatedAt: 1,
        },
      },
      { $sort: { createdAt: -1 } },
    ]);

    res.json({
      success: true,
      data: coursesAnalytics,
      total: coursesAnalytics.length,
    });
  } catch (error) {
    console.error("Error fetching courses analytics:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching courses analytics",
      error: error.message,
    });
  }
};

module.exports = {
  getStudentProgressAnalytics,
  getCourseCompletionAnalytics,
  getQuizPerformanceAnalytics,
  getAnalyticsDashboard,
  getCoursesAnalytics,
};
