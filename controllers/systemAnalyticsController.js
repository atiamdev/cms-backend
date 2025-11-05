const User = require("../models/User");
const Branch = require("../models/Branch");
const Student = require("../models/Student");
const Teacher = require("../models/Teacher");
const Class = require("../models/Class");
const Course = require("../models/Course");
const Fee = require("../models/Fee");
const Payment = require("../models/Payment");
const Expense = require("../models/Expense");
const Attendance = require("../models/Attendance");

const os = require("os");
const { performance } = require("perf_hooks");
const mongoose = require("mongoose");

// System Health Metrics
const getSystemHealth = async (req, res) => {
  try {
    const startTime = performance.now();

    // Run all health checks in parallel for better performance
    const [dbHealth, cpuUsage] = await Promise.all([
      checkDatabaseHealth(),
      getCpuUsage(),
    ]);

    // System resources (synchronous)
    const systemResources = getSystemResources();

    // API response time
    const responseTime = performance.now() - startTime;

    // MongoDB connection status
    const mongoStatus = mongoose.connection.readyState;
    const mongoStates = {
      0: "disconnected",
      1: "connected",
      2: "connecting",
      3: "disconnecting",
    };

    const healthData = {
      status:
        dbHealth.healthy && systemResources.memoryUsage < 90
          ? "healthy"
          : "warning",
      timestamp: new Date(),
      database: {
        status: mongoStates[mongoStatus],
        healthy: dbHealth.healthy,
        responseTime: dbHealth.responseTime,
        collections: dbHealth.collections,
      },
      system: {
        uptime: process.uptime(),
        memory: systemResources,
        cpu: cpuUsage,
        nodeVersion: process.version,
        environment: process.env.NODE_ENV || "development",
      },
      api: {
        responseTime: Math.round(responseTime * 100) / 100,
      },
    };

    res.json({
      success: true,
      data: healthData,
    });
  } catch (error) {
    console.error("Error getting system health:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get system health",
      error: error.message,
    });
  }
};

// System Analytics Dashboard
const getSystemAnalytics = async (req, res) => {
  try {
    const { timeframe = "30d" } = req.query;

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();

    switch (timeframe) {
      case "7d":
        startDate.setDate(endDate.getDate() - 7);
        break;
      case "30d":
        startDate.setDate(endDate.getDate() - 30);
        break;
      case "90d":
        startDate.setDate(endDate.getDate() - 90);
        break;
      case "1y":
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
      default:
        startDate.setDate(endDate.getDate() - 30);
    }

    // Get various analytics
    const [
      userAnalytics,
      financialAnalytics,
      academicAnalytics,
      activityAnalytics,
      growthAnalytics,
    ] = await Promise.all([
      getUserAnalytics(startDate, endDate),
      getFinancialAnalytics(startDate, endDate),
      getAcademicAnalytics(startDate, endDate),
      getActivityAnalytics(startDate, endDate),
      getGrowthAnalytics(startDate, endDate),
    ]);

    const analytics = {
      timeframe,
      period: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      user: userAnalytics,
      financial: financialAnalytics,
      academic: academicAnalytics,
      activity: activityAnalytics,
      growth: growthAnalytics,
    };

    res.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    console.error("Error getting system analytics:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get system analytics",
      error: error.message,
    });
  }
};

// User Activity Analytics
const getUserActivityAnalytics = async (req, res) => {
  try {
    const { timeframe = "7d" } = req.query;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - parseInt(timeframe));

    // Active users by role
    const activeUsersByRole = await User.aggregate([
      {
        $match: {
          lastLogin: { $gte: startDate },
          isActive: true,
        },
      },
      {
        $group: {
          _id: { $arrayElemAt: ["$roles", 0] },
          count: { $sum: 1 },
          users: {
            $push: {
              firstName: "$firstName",
              lastName: "$lastName",
              lastLogin: "$lastLogin",
            },
          },
        },
      },
    ]);

    // Daily active users
    const dailyActiveUsers = await User.aggregate([
      {
        $match: {
          lastLogin: { $gte: startDate },
          isActive: true,
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$lastLogin" },
            month: { $month: "$lastLogin" },
            day: { $dayOfMonth: "$lastLogin" },
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 },
      },
    ]);

    // User registration trends
    const registrationTrends = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 },
      },
    ]);

    res.json({
      success: true,
      data: {
        activeUsersByRole,
        dailyActiveUsers,
        registrationTrends,
        timeframe,
      },
    });
  } catch (error) {
    console.error("Error getting user activity analytics:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get user activity analytics",
      error: error.message,
    });
  }
};

// System Performance Metrics
const getSystemPerformance = async (req, res) => {
  try {
    const performance = {
      database: await getDatabasePerformance(),
      memory: getMemoryUsage(),
      cpu: await getCpuUsage(),
      disk: getDiskUsage(),
      network: getNetworkStats(),
      errors: await getErrorStats(),
    };

    res.json({
      success: true,
      data: performance,
    });
  } catch (error) {
    console.error("Error getting system performance:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get system performance",
      error: error.message,
    });
  }
};

// Helper Functions
const checkDatabaseHealth = async () => {
  const start = Date.now();

  try {
    // Test basic database operations
    const collections = await Promise.all([
      User.countDocuments(),
      Branch.countDocuments(),
      Student.countDocuments(),
      Teacher.countDocuments(),
    ]);

    const responseTime = Date.now() - start;

    return {
      healthy: true,
      responseTime,
      collections: {
        users: collections[0],
        branches: collections[1],
        students: collections[2],
        teachers: collections[3],
      },
    };
  } catch (error) {
    return {
      healthy: false,
      responseTime: Date.now() - start,
      error: error.message,
    };
  }
};

const getSystemResources = () => {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;

  return {
    totalMemory: Math.round(totalMemory / 1024 / 1024), // MB
    freeMemory: Math.round(freeMemory / 1024 / 1024), // MB
    usedMemory: Math.round(usedMemory / 1024 / 1024), // MB
    memoryUsage: Math.round((usedMemory / totalMemory) * 100),
    cpuCount: os.cpus().length,
    platform: os.platform(),
    arch: os.arch(),
    hostname: os.hostname(),
  };
};

const getCpuUsage = () => {
  return new Promise((resolve) => {
    const startTime = process.hrtime();
    const startUsage = process.cpuUsage();

    setTimeout(() => {
      const endTime = process.hrtime(startTime);
      const endUsage = process.cpuUsage(startUsage);

      const totalTime = endTime[0] * 1000000 + endTime[1] / 1000;
      const totalUsage = endUsage.user + endUsage.system;

      const cpuPercent = Math.round((totalUsage / totalTime) * 100);

      resolve({
        percent: cpuPercent,
        user: Math.round(endUsage.user / 1000),
        system: Math.round(endUsage.system / 1000),
      });
    }, 100);
  });
};

const getUserAnalytics = async (startDate, endDate) => {
  const [totalUsers, activeUsers, newUsers, usersByRole] = await Promise.all([
    User.countDocuments(), // Count all users
    User.countDocuments({
      lastLogin: { $gte: startDate }, // Count users who logged in within timeframe
    }),
    User.countDocuments({
      createdAt: { $gte: startDate, $lte: endDate },
    }),
    User.aggregate([
      { $match: {} }, // Count all users by role, not just active ones
      { $unwind: "$roles" },
      { $group: { _id: "$roles", count: { $sum: 1 } } },
    ]),
  ]);

  return {
    totalUsers,
    activeUsers,
    newUsers,
    usersByRole: usersByRole.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {}),
  };
};

const getFinancialAnalytics = async (startDate, endDate) => {
  const [payments, expenses, feeCollection] = await Promise.all([
    Payment.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: "completed",
        },
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]),
    Expense.aggregate([
      {
        $match: {
          date: { $gte: startDate, $lte: endDate },
          approvalStatus: "approved",
        },
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]),
    Fee.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$totalAmount" },
          paidAmount: { $sum: "$paidAmount" },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const paymentData = payments[0] || { totalAmount: 0, count: 0 };
  const expenseData = expenses[0] || { totalAmount: 0, count: 0 };
  const feeData = feeCollection[0] || {
    totalAmount: 0,
    paidAmount: 0,
    count: 0,
  };

  return {
    totalRevenue: paymentData.totalAmount,
    totalExpenses: expenseData.totalAmount,
    netProfit: paymentData.totalAmount - expenseData.totalAmount,
    collectionRate:
      feeData.totalAmount > 0
        ? Math.round((feeData.paidAmount / feeData.totalAmount) * 100)
        : 0,
    transactions: {
      payments: paymentData.count,
      expenses: expenseData.count,
      fees: feeData.count,
    },
  };
};

const getAcademicAnalytics = async (startDate, endDate) => {
  const [students, teachers, classes, courses, attendance] = await Promise.all([
    Student.countDocuments({ academicStatus: "active" }),
    Teacher.countDocuments({ employmentStatus: "active" }),
    Class.countDocuments(), // Classes don't seem to have status field
    Course.countDocuments(), // Courses don't seem to have status field
    Attendance.aggregate([
      {
        $match: {
          date: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const attendanceData = attendance.reduce(
    (acc, item) => {
      acc[item._id] = item.count;
      return acc;
    },
    { present: 0, absent: 0, late: 0 }
  );

  const totalAttendance = Object.values(attendanceData).reduce(
    (sum, count) => sum + count,
    0
  );
  const attendanceRate =
    totalAttendance > 0
      ? Math.round((attendanceData.present / totalAttendance) * 100)
      : 0;

  return {
    totalStudents: students,
    totalTeachers: teachers,
    totalClasses: classes,
    totalCourses: courses,
    attendanceRate,
    attendanceBreakdown: attendanceData,
  };
};

const getActivityAnalytics = async (startDate, endDate) => {
  // This would typically come from activity logs
  // For now, we'll use model operations as proxy
  const [recentPayments, recentExpenses, recentStudents] = await Promise.all([
    Payment.countDocuments({ createdAt: { $gte: startDate, $lte: endDate } }),
    Expense.countDocuments({ createdAt: { $gte: startDate, $lte: endDate } }),
    Student.countDocuments({ createdAt: { $gte: startDate, $lte: endDate } }),
  ]);

  return {
    totalActivities: recentPayments + recentExpenses + recentStudents,
    breakdown: {
      payments: recentPayments,
      expenses: recentExpenses,
      studentRegistrations: recentStudents,
    },
  };
};

const getGrowthAnalytics = async (startDate, endDate) => {
  const prevStartDate = new Date(startDate);
  prevStartDate.setDate(
    prevStartDate.getDate() - (endDate - startDate) / (24 * 60 * 60 * 1000)
  );

  const [currentPeriod, previousPeriod] = await Promise.all([
    Promise.all([
      Student.countDocuments({ createdAt: { $gte: startDate, $lte: endDate } }),
      Payment.aggregate([
        { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
    ]),
    Promise.all([
      Student.countDocuments({
        createdAt: { $gte: prevStartDate, $lt: startDate },
      }),
      Payment.aggregate([
        { $match: { createdAt: { $gte: prevStartDate, $lt: startDate } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
    ]),
  ]);

  const currentStudents = currentPeriod[0];
  const currentRevenue = currentPeriod[1][0]?.total || 0;
  const previousStudents = previousPeriod[0];
  const previousRevenue = previousPeriod[1][0]?.total || 0;

  return {
    studentGrowth:
      previousStudents > 0
        ? Math.round(
            ((currentStudents - previousStudents) / previousStudents) * 100
          )
        : 100,
    revenueGrowth:
      previousRevenue > 0
        ? Math.round(
            ((currentRevenue - previousRevenue) / previousRevenue) * 100
          )
        : 100,
    current: {
      students: currentStudents,
      revenue: currentRevenue,
    },
    previous: {
      students: previousStudents,
      revenue: previousRevenue,
    },
  };
};

const getDatabasePerformance = async () => {
  // Basic database performance metrics
  return {
    connectionStatus:
      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    averageResponseTime: 0, // This would need to be tracked over time
    activeConnections:
      mongoose.connection.db?.topology?.s?.pool?.availableConnections || 0,
    slowQueries: 0, // This would need query profiling
  };
};

const getMemoryUsage = () => {
  const memUsage = process.memoryUsage();
  return {
    heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
    heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
    external: Math.round(memUsage.external / 1024 / 1024),
    rss: Math.round(memUsage.rss / 1024 / 1024),
  };
};

const getDiskUsage = () => {
  // This would typically use a disk monitoring library
  // For now, return basic info
  return {
    total: 0,
    used: 0,
    available: 0,
    percentage: 0,
  };
};

const getNetworkStats = () => {
  // This would typically track network I/O
  return {
    bytesIn: 0,
    bytesOut: 0,
    connections: 0,
  };
};

const getErrorStats = async () => {
  // This would typically come from error tracking
  return {
    last24Hours: 0,
    last7Days: 0,
    last30Days: 0,
  };
};

// Secretary Dashboard Statistics
const getSecretaryDashboardStats = async (req, res) => {
  try {
    const branchId = req.user.branchId; // Secretary's branch context

    // Calculate date ranges
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    // Build branch filter if secretary has branch context
    const branchFilter = branchId ? { branchId } : {};

    // 1. Students Registered
    const [totalStudents, studentsThisMonth, studentsLastMonth] =
      await Promise.all([
        Student.countDocuments(branchFilter),
        Student.countDocuments({
          ...branchFilter,
          createdAt: { $gte: startOfMonth },
        }),
        Student.countDocuments({
          ...branchFilter,
          createdAt: {
            $gte: startOfLastMonth,
            $lte: endOfLastMonth,
          },
        }),
      ]);

    const studentGrowth =
      studentsLastMonth > 0
        ? (
            ((studentsThisMonth - studentsLastMonth) / studentsLastMonth) *
            100
          ).toFixed(1)
        : studentsThisMonth > 0
        ? 100
        : 0;

    // 2. Payments Processed
    const [
      totalPayments,
      paymentsThisMonth,
      paymentsLastMonth,
      paymentAmountThisMonth,
    ] = await Promise.all([
      Payment.countDocuments(branchFilter),
      Payment.countDocuments({
        ...branchFilter,
        paymentDate: { $gte: startOfMonth },
      }),
      Payment.countDocuments({
        ...branchFilter,
        paymentDate: {
          $gte: startOfLastMonth,
          $lte: endOfLastMonth,
        },
      }),
      Payment.aggregate([
        {
          $match: {
            ...branchFilter,
            paymentDate: { $gte: startOfMonth },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$amount" },
          },
        },
      ]),
    ]);

    const paymentGrowth =
      paymentsLastMonth > 0
        ? (
            ((paymentsThisMonth - paymentsLastMonth) / paymentsLastMonth) *
            100
          ).toFixed(1)
        : paymentsThisMonth > 0
        ? 100
        : 0;

    const totalAmountThisMonth = paymentAmountThisMonth[0]?.total || 0;

    // 3. Receipts Generated (same as payments for now)
    const receiptsThisMonth = paymentsThisMonth;
    const totalReceipts = totalPayments;
    const receiptGrowth = paymentGrowth;

    // 4. Pending Tasks
    const [newStudents, pendingPayments, expiredFees] = await Promise.all([
      // New students registered in last 7 days
      Student.countDocuments({
        ...branchFilter,
        createdAt: {
          $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        },
      }),
      // Fees with outstanding balance (unpaid, partially_paid, or overdue)
      Fee.countDocuments({
        ...branchFilter,
        balance: { $gt: 0 },
        status: { $in: ["unpaid", "partially_paid", "overdue"] },
      }),
      // Fees past due date with outstanding balance
      Fee.countDocuments({
        ...branchFilter,
        balance: { $gt: 0 },
        dueDate: { $lt: now },
        status: { $in: ["unpaid", "partially_paid", "overdue"] },
      }),
    ]);

    // 5. Recent Activity (last 10 payments)
    const recentPayments = await Payment.find(branchFilter)
      .populate({
        path: "studentId",
        select: "userId",
        populate: {
          path: "userId",
          select: "firstName lastName",
        },
      })
      .sort({ paymentDate: -1 })
      .limit(10)
      .lean();

    // 6. Recent Student Registrations (last 10)
    const recentStudents = await Student.find(branchFilter)
      .populate("currentClassId", "name")
      .populate("userId", "firstName lastName")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // Format recent activity
    const recentActivity = [];

    // Add recent payments
    recentPayments.forEach((payment) => {
      const studentName = payment.studentId?.userId
        ? `${payment.studentId.userId.firstName || ""} ${
            payment.studentId.userId.lastName || ""
          }`.trim() || "Unknown Student"
        : "Unknown Student";

      recentActivity.push({
        type: "payment",
        icon: "CreditCard",
        title: "Payment processed",
        description: `${studentName} - KSh ${
          payment.amount?.toLocaleString() || 0
        } fee payment`,
        timestamp: payment.paymentDate || payment.createdAt,
        receiptNumber: payment.receiptNumber,
      });
    });

    // Add recent registrations
    recentStudents.forEach((student) => {
      const studentName = student.userId
        ? `${student.userId.firstName || ""} ${
            student.userId.lastName || ""
          }`.trim() || "Unknown Student"
        : "Unknown Student";

      const className = student.currentClassId?.name || "";

      recentActivity.push({
        type: "registration",
        icon: "UserPlus",
        title: "New student registered",
        description: `${studentName}${className ? " - " + className : ""}`,
        timestamp: student.createdAt,
      });
    });

    // Sort by timestamp and take top 10
    recentActivity.sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
    );
    const topRecentActivity = recentActivity.slice(0, 10);

    const dashboardStats = {
      studentsRegistered: {
        total: totalStudents,
        thisMonth: studentsThisMonth,
        growth: parseFloat(studentGrowth),
      },
      paymentsProcessed: {
        total: totalPayments,
        thisMonth: paymentsThisMonth,
        amount: totalAmountThisMonth,
        growth: parseFloat(paymentGrowth),
      },
      receiptsGenerated: {
        total: totalReceipts,
        thisMonth: receiptsThisMonth,
        growth: parseFloat(receiptGrowth),
      },
      pendingTasks: {
        newStudents,
        pendingPayments,
        expiredFees,
      },
      recentActivity: topRecentActivity,
    };

    res.json({
      success: true,
      data: dashboardStats,
    });
  } catch (error) {
    console.error("Error getting secretary dashboard stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get secretary dashboard statistics",
      error: error.message,
    });
  }
};

module.exports = {
  getSystemHealth,
  getSystemAnalytics,
  getUserActivityAnalytics,
  getSystemPerformance,
  getSecretaryDashboardStats,
};
