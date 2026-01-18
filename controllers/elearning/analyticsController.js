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
    const { branchId, page = 1, limit = 10 } = req.query;

    let matchConditions = {};

    // Filter by branch only if explicitly specified in query
    if (branchId) {
      matchConditions.branch = mongoose.Types.ObjectId(branchId);
    }
    // Note: Removed automatic branch filtering since courses don't have branch fields

    // Get total count first
    const total = await ECourse.countDocuments(matchConditions);

    // Calculate summary statistics from all courses
    const summaryStats = await ECourse.aggregate([
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
          from: "payments",
          localField: "_id",
          foreignField: "courseId",
          as: "payments",
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
          payments: { $ifNull: ["$payments", []] },
          ratings: { $ifNull: ["$ratings", []] },
        },
      },
      {
        $group: {
          _id: null,
          totalRevenue: {
            $sum: {
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
          },
          totalEnrollments: { $sum: { $size: "$enrollments" } },
          totalCompletions: {
            $sum: {
              $size: {
                $filter: {
                  input: "$enrollments",
                  cond: { $eq: ["$$this.status", "completed"] },
                },
              },
            },
          },
          totalCourses: { $sum: 1 },
        },
      },
      {
        $project: {
          totalRevenue: 1,
          totalEnrollments: 1,
          averageCompletionRate: {
            $cond: {
              if: { $gt: ["$totalEnrollments", 0] },
              then: {
                $multiply: [
                  { $divide: ["$totalCompletions", "$totalEnrollments"] },
                  100,
                ],
              },
              else: 0,
            },
          },
          totalCourses: 1,
        },
      },
    ]);

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
      { $skip: (parseInt(page) - 1) * parseInt(limit) },
      { $limit: parseInt(limit) },
    ]);

    res.json({
      success: true,
      data: coursesAnalytics,
      summary: summaryStats[0] || {
        totalRevenue: 0,
        totalEnrollments: 0,
        averageCompletionRate: 0,
        totalCourses: 0,
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNext: parseInt(page) < Math.ceil(total / limit),
        hasPrev: parseInt(page) > 1,
      },
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

/**
 * Get overview analytics for teacher dashboard
 * GET /api/elearning/analytics/overview
 */
const getOverviewAnalytics = async (req, res) => {
  try {
    const teacherId = req.user._id;
    const branchId = req.user.branchId;

    // Get total students enrolled in teacher's courses
    const totalStudents = await Enrollment.countDocuments({
      courseId: {
        $in: await ECourse.find({
          instructor: teacherId,
          branchId: branchId,
        }).distinct("_id"),
      },
      status: { $in: ["active", "approved", "completed"] },
    });

    // Get active courses count
    const activeCourses = await ECourse.countDocuments({
      instructor: teacherId,
      branchId: branchId,
      status: "published",
    });

    // Calculate average completion rate
    const completionStats = await Enrollment.aggregate([
      {
        $match: {
          courseId: {
            $in: await ECourse.find({
              instructor: teacherId,
              branchId: branchId,
            }).distinct("_id"),
          },
          status: { $in: ["active", "approved", "completed"] },
        },
      },
      {
        $group: {
          _id: "$courseId",
          totalEnrolled: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
          },
        },
      },
      {
        $group: {
          _id: null,
          totalEnrolled: { $sum: "$totalEnrolled" },
          totalCompleted: { $sum: "$completed" },
        },
      },
    ]);

    const averageCompletionRate =
      completionStats.length > 0
        ? Math.round(
            (completionStats[0].totalCompleted /
              completionStats[0].totalEnrolled) *
              100
          )
        : 0;

    // Calculate average session duration from learning progress
    const sessionStats = await LearningProgress.aggregate([
      {
        $match: {
          courseId: {
            $in: await ECourse.find({
              instructor: teacherId,
              branchId: branchId,
            }).distinct("_id"),
          },
        },
      },
      {
        $unwind: "$moduleProgress",
      },
      {
        $group: {
          _id: null,
          totalTimeSpent: { $sum: "$moduleProgress.timeSpent" },
          count: { $sum: 1 },
        },
      },
    ]);

    const averageSessionDuration =
      sessionStats.length > 0
        ? Math.round(sessionStats[0].totalTimeSpent / sessionStats[0].count)
        : 0;

    // For now, set growth metrics to 0 (would need historical data)
    const studentGrowth = 0;
    const courseGrowth = 0;
    const completionRateChange = 0;
    const sessionDurationChange = 0;

    // Calculate at-risk students (low progress)
    const atRiskStudents = await LearningProgress.countDocuments({
      courseId: {
        $in: await ECourse.find({
          instructor: teacherId,
          branchId: branchId,
        }).distinct("_id"),
      },
      overallProgress: { $lt: 30 }, // Less than 30% progress
    });

    const overview = {
      totalStudents,
      activeCourses,
      averageCompletionRate,
      averageSessionDuration,
      studentGrowth,
      courseGrowth,
      completionRateChange,
      sessionDurationChange,
      atRiskStudents,
    };

    res.json({ success: true, data: overview });
  } catch (error) {
    console.error("Error fetching overview analytics:", error);
    res.status(500).json({
      success: false,
      message: "Failed to load overview analytics",
      error: error.message,
    });
  }
};

/**
 * Get engagement analytics for teacher dashboard
 * GET /api/elearning/analytics/engagement
 */
const getEngagementAnalytics = async (req, res) => {
  try {
    const teacherId = req.user._id;
    const branchId = req.user.branchId;
    const { timeRange = "30d" } = req.query;

    // Calculate date range
    const now = new Date();
    const startDate = new Date();
    if (timeRange === "7d") {
      startDate.setDate(now.getDate() - 7);
    } else if (timeRange === "30d") {
      startDate.setDate(now.getDate() - 30);
    } else if (timeRange === "90d") {
      startDate.setDate(now.getDate() - 90);
    } else if (timeRange === "1y") {
      startDate.setFullYear(now.getFullYear() - 1);
    }

    // Get course IDs for this teacher
    const courseIds = await ECourse.find({
      instructor: teacherId,
      branchId: branchId,
    }).distinct("_id");

    // Get daily engagement data
    const engagementData = await LearningProgress.aggregate([
      {
        $match: {
          courseId: { $in: courseIds },
          createdAt: { $gte: startDate },
        },
      },
      {
        $unwind: "$moduleProgress",
      },
      {
        $group: {
          _id: {
            date: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$moduleProgress.lastAccessedAt",
              },
            },
          },
          activeUsers: { $addToSet: "$studentId" },
          totalInteractions: { $sum: 1 },
          totalTimeSpent: { $sum: "$moduleProgress.timeSpent" },
        },
      },
      {
        $project: {
          date: "$_id.date",
          activeUsers: { $size: "$activeUsers" },
          totalInteractions: "$totalInteractions",
          avgSessionDuration: {
            $cond: {
              if: { $gt: ["$activeUsers", 0] },
              then: { $divide: ["$totalTimeSpent", { $size: "$activeUsers" }] },
              else: 0,
            },
          },
        },
      },
      {
        $sort: { date: 1 },
      },
    ]);

    res.json({ success: true, data: engagementData });
  } catch (error) {
    console.error("Error fetching engagement analytics:", error);
    res.status(500).json({
      success: false,
      message: "Failed to load engagement analytics",
      error: error.message,
    });
  }
};

/**
 * Get progress analytics for teacher dashboard
 * GET /api/elearning/analytics/progress
 */
const getProgressAnalytics = async (req, res) => {
  try {
    const teacherId = req.user._id;
    const branchId = req.user.branchId;

    // Get course IDs for this teacher
    const courseIds = await ECourse.find({
      instructor: teacherId,
      branchId: branchId,
    }).distinct("_id");

    // Get progress data for each course
    const progressData = await LearningProgress.aggregate([
      {
        $match: {
          courseId: { $in: courseIds },
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
        $unwind: "$course",
      },
      {
        $group: {
          _id: "$courseId",
          courseName: { $first: "$course.title" },
          totalStudents: { $sum: 1 },
          avgProgress: { $avg: "$overallProgress" },
          completedStudents: {
            $sum: {
              $cond: [{ $gte: ["$overallProgress", 100] }, 1, 0],
            },
          },
        },
      },
      {
        $project: {
          courseId: "$_id",
          courseName: 1,
          totalStudents: 1,
          avgProgress: { $round: ["$avgProgress", 1] },
          completionRate: {
            $round: [
              {
                $multiply: [
                  { $divide: ["$completedStudents", "$totalStudents"] },
                  100,
                ],
              },
              1,
            ],
          },
        },
      },
      {
        $sort: { totalStudents: -1 },
      },
    ]);

    res.json({ success: true, data: progressData });
  } catch (error) {
    console.error("Error fetching progress analytics:", error);
    res.status(500).json({
      success: false,
      message: "Failed to load progress analytics",
      error: error.message,
    });
  }
};

/**
 * Get assessment analytics for teacher dashboard
 * GET /api/elearning/analytics/assessments
 */
const getAssessmentAnalytics = async (req, res) => {
  try {
    const teacherId = req.user._id;
    const branchId = req.user.branchId;

    // Get course IDs for this teacher
    const courseIds = await ECourse.find({
      instructor: teacherId,
      branchId: branchId,
    }).distinct("_id");

    // Get quiz performance data
    const assessmentData = await QuizAttempt.aggregate([
      {
        $match: {
          courseId: { $in: courseIds },
        },
      },
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
        $group: {
          _id: "$quizId",
          quizTitle: { $first: "$quiz.title" },
          totalAttempts: { $sum: 1 },
          avgScore: { $avg: "$score" },
          passRate: {
            $avg: {
              $cond: [{ $gte: ["$score", 70] }, 1, 0], // Assuming 70% is passing
            },
          },
        },
      },
      {
        $project: {
          quizId: "$_id",
          quizTitle: 1,
          totalAttempts: 1,
          avgScore: { $round: ["$avgScore", 1] },
          passRate: { $round: [{ $multiply: ["$passRate", 100] }, 1] },
        },
      },
      {
        $sort: { totalAttempts: -1 },
      },
    ]);

    const analytics = {
      totalQuizzes: assessmentData.length,
      averageScore:
        assessmentData.length > 0
          ? Math.round(
              assessmentData.reduce((sum, quiz) => sum + quiz.avgScore, 0) /
                assessmentData.length
            )
          : 0,
      averagePassRate:
        assessmentData.length > 0
          ? Math.round(
              assessmentData.reduce((sum, quiz) => sum + quiz.passRate, 0) /
                assessmentData.length
            )
          : 0,
      quizPerformance: assessmentData,
    };

    res.json({ success: true, data: analytics });
  } catch (error) {
    console.error("Error fetching assessment analytics:", error);
    res.status(500).json({
      success: false,
      message: "Failed to load assessment analytics",
      error: error.message,
    });
  }
};

/**
 * Get content analytics for teacher dashboard
 * GET /api/elearning/analytics/content
 */
const getContentAnalytics = async (req, res) => {
  try {
    const teacherId = req.user._id;
    const branchId = req.user.branchId;

    // Get course IDs for this teacher
    const courseIds = await ECourse.find({
      instructor: teacherId,
      branchId: branchId,
    }).distinct("_id");

    // Get content engagement data
    const contentData = await LearningProgress.aggregate([
      {
        $match: {
          courseId: { $in: courseIds },
        },
      },
      {
        $unwind: "$moduleProgress",
      },
      {
        $unwind: "$moduleProgress.contentProgress",
      },
      {
        $lookup: {
          from: "coursecontents",
          localField: "moduleProgress.contentProgress.contentId",
          foreignField: "_id",
          as: "content",
        },
      },
      {
        $unwind: "$content",
      },
      {
        $group: {
          _id: {
            contentId: "$moduleProgress.contentProgress.contentId",
            type: "$content.type",
          },
          title: { $first: "$content.title" },
          views: { $sum: 1 },
          completions: {
            $sum: {
              $cond: [
                {
                  $eq: ["$moduleProgress.contentProgress.status", "completed"],
                },
                1,
                0,
              ],
            },
          },
          avgTimeSpent: { $avg: "$moduleProgress.contentProgress.timeSpent" },
        },
      },
      {
        $project: {
          contentId: "$_id.contentId",
          title: 1,
          type: "$_id.type",
          views: 1,
          completions: 1,
          completionRate: {
            $round: [
              {
                $multiply: [
                  {
                    $cond: [
                      { $gt: ["$views", 0] },
                      { $divide: ["$completions", "$views"] },
                      0,
                    ],
                  },
                  100,
                ],
              },
              1,
            ],
          },
          avgTimeSpent: { $round: ["$avgTimeSpent", 0] },
        },
      },
      {
        $sort: { views: -1 },
      },
      {
        $limit: 20, // Top 20 content items
      },
    ]);

    const analytics = {
      totalContentItems: contentData.length,
      mostViewedContent: contentData.slice(0, 5),
      contentTypeBreakdown: contentData.reduce((acc, item) => {
        acc[item.type] = (acc[item.type] || 0) + 1;
        return acc;
      }, {}),
      averageCompletionRate:
        contentData.length > 0
          ? Math.round(
              contentData.reduce((sum, item) => sum + item.completionRate, 0) /
                contentData.length
            )
          : 0,
    };

    res.json({ success: true, data: analytics });
  } catch (error) {
    console.error("Error fetching content analytics:", error);
    res.status(500).json({
      success: false,
      message: "Failed to load content analytics",
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
  getOverviewAnalytics,
  getEngagementAnalytics,
  getProgressAnalytics,
  getAssessmentAnalytics,
  getContentAnalytics,
};
