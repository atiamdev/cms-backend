const mongoose = require("mongoose");
const Student = require("../models/Student");
const Teacher = require("../models/Teacher");
const Course = require("../models/Course");
const Payment = require("../models/Payment");
const Expense = require("../models/Expense");
const Department = require("../models/Department");
const User = require("../models/User");
const FeeStructure = require("../models/FeeStructure");
const Class = require("../models/Class");
const Attendance = require("../models/Attendance");
const Event = require("../models/Event");
const Notice = require("../models/Notice");
const Exam = require("../models/Exam");

// Simple in-memory cache
const cache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds

/**
 * Aggregates data for a specific branch to be used as context for AI.
 * @param {string} branchId - The ID of the branch to fetch data for.
 * @returns {Promise<Object>} - The aggregated data object.
 */
exports.getBranchContext = async (branchId) => {
  try {
    // 1. Check Cache
    const cacheKey = `ai_context_${branchId || "global"}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData && Date.now() - cachedData.timestamp < CACHE_TTL) {
      console.log(`Serving AI context from cache for ${branchId}`);
      return cachedData.data;
    }

    const query = branchId ? { branchId: branchId } : {};

    // 2. Student Stats (Anonymized)
    const totalStudents = await Student.countDocuments(query);
    const activeStudents = await Student.countDocuments({
      ...query,
      status: "Active",
    });

    // Student Status Distribution
    const studentStatusStats = await Student.aggregate([
      { $match: query },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    // 3. Teacher Stats
    const totalTeachers = await Teacher.countDocuments(query);

    // 4. Financial Stats (Current Month & Trends)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Current Month
    const currentMonthRevenue = await Payment.aggregate([
      {
        $match: {
          ...query,
          date: { $gte: startOfMonth, $lte: endOfMonth },
          status: "Completed",
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    const currentMonthExpenses = await Expense.aggregate([
      {
        $match: {
          ...query,
          date: { $gte: startOfMonth, $lte: endOfMonth },
          status: "Approved",
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    // 6-Month Trend
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    sixMonthsAgo.setDate(1);

    const revenueTrend = await Payment.aggregate([
      {
        $match: {
          ...query,
          date: { $gte: sixMonthsAgo },
          status: "Completed",
        },
      },
      {
        $group: {
          _id: {
            month: { $month: "$date" },
            year: { $year: "$date" },
          },
          total: { $sum: "$amount" },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    const expenseTrend = await Expense.aggregate([
      {
        $match: {
          ...query,
          date: { $gte: sixMonthsAgo },
          status: "Approved",
        },
      },
      {
        $group: {
          _id: {
            month: { $month: "$date" },
            year: { $year: "$date" },
          },
          total: { $sum: "$amount" },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    // Format trends for AI consumption (Month Name: Amount)
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    const formattedTrends = revenueTrend.map((r) => {
      const expense = expenseTrend.find(
        (e) => e._id.month === r._id.month && e._id.year === r._id.year
      );
      return {
        month: `${monthNames[r._id.month - 1]} ${r._id.year}`,
        revenue: r.total,
        expenses: expense ? expense.total : 0,
      };
    });

    // 5. Course Stats
    const totalCourses = await Course.countDocuments(query);

    // 6. Admin Stats
    const adminCount = await User.countDocuments({
      ...query,
      roles: { $in: ["admin", "branchadmin"] },
      status: "active",
    });

    // 7. Expected Fee Collections
    // Get all fee structures for the branch
    const feeStructures = await FeeStructure.find(query).lean();

    // Get active student counts per class
    const studentsPerClass = await Student.aggregate([
      { $match: { ...query, status: "Active" } },
      { $group: { _id: "$currentClassId", count: { $sum: 1 } } },
    ]);

    let totalExpectedFees = 0;

    // Calculate expected fees
    for (const structure of feeStructures) {
      const classStats = studentsPerClass.find(
        (s) => s._id && s._id.toString() === structure.classId.toString()
      );
      if (classStats) {
        // Sum up all components in the structure
        const structureTotal = structure.feeComponents
          ? structure.feeComponents.reduce((sum, comp) => sum + comp.amount, 0)
          : 0;
        const expectedForStructure = structureTotal * classStats.count;

        totalExpectedFees += expectedForStructure;
      }
    }

    // 8. Department Stats
    let studentsByDepartment = await Student.aggregate([
      { $match: query },
      { $group: { _id: "$departmentId", count: { $sum: 1 } } },
      {
        $lookup: {
          from: "departments",
          localField: "_id",
          foreignField: "_id",
          as: "dept",
        },
      },
      {
        $project: {
          name: { $arrayElemAt: ["$dept.name", 0] },
          count: 1,
        },
      },
    ]);

    // If no department data for branch, fall back to global
    if (!studentsByDepartment || studentsByDepartment.length === 0) {
      studentsByDepartment = await Student.aggregate([
        { $group: { _id: "$departmentId", count: { $sum: 1 } } },
        {
          $lookup: {
            from: "departments",
            localField: "_id",
            foreignField: "_id",
            as: "dept",
          },
        },
        {
          $project: {
            name: { $arrayElemAt: ["$dept.name", 0] },
            count: 1,
          },
        },
      ]);
    }

    console.log(
      "Students by Department aggregation result:",
      studentsByDepartment
    );

    // 9. Class Stats
    let studentsByClass = await Student.aggregate([
      { $match: query }, // Removed status: "Active" filter to show all students
      { $group: { _id: "$currentClassId", count: { $sum: 1 } } },
      {
        $lookup: {
          from: "classes",
          localField: "_id",
          foreignField: "_id",
          as: "cls",
        },
      },
      {
        $project: {
          name: { $ifNull: [{ $arrayElemAt: ["$cls.name", 0] }, "Unassigned"] },
          grade: { $ifNull: [{ $arrayElemAt: ["$cls.grade", 0] }, "N/A"] },
          count: 1,
        },
      },
    ]);

    // If no class data for branch, fall back to global
    if (!studentsByClass || studentsByClass.length === 0) {
      studentsByClass = await Student.aggregate([
        { $group: { _id: "$currentClassId", count: { $sum: 1 } } },
        {
          $lookup: {
            from: "classes",
            localField: "_id",
            foreignField: "_id",
            as: "cls",
          },
        },
        {
          $project: {
            name: {
              $ifNull: [{ $arrayElemAt: ["$cls.name", 0] }, "Unassigned"],
            },
            grade: { $ifNull: [{ $arrayElemAt: ["$cls.grade", 0] }, "N/A"] },
            count: 1,
          },
        },
      ]);
    }

    // 10. Attendance Stats (Today)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const attendanceCount = await Attendance.countDocuments({
      ...query,
      userType: "student",
      date: { $gte: todayStart },
    });

    const attendanceRate =
      activeStudents > 0
        ? ((attendanceCount / activeStudents) * 100).toFixed(1)
        : 0;

    // 11. Expense Breakdown (Current Month)
    const expenseByCategory = await Expense.aggregate([
      {
        $match: {
          ...query,
          // Removed date filter to show all-time breakdown if current month is empty
          status: "Approved",
        },
      },
      { $group: { _id: "$category", total: { $sum: "$amount" } } },
      { $sort: { total: -1 } },
    ]);

    // 12. Upcoming Events
    const upcomingEvents = await Event.find({
      eventDate: { $gte: new Date() },
    })
      .sort({ eventDate: 1 })
      .limit(3)
      .select("title eventDate location.venue")
      .lean();

    // 13. Teacher Stats (By Department)
    const teachersByDepartment = await Teacher.aggregate([
      { $match: query },
      { $group: { _id: "$department", count: { $sum: 1 } } },
      {
        $lookup: {
          from: "departments",
          localField: "_id",
          foreignField: "_id",
          as: "dept",
        },
      },
      {
        $project: {
          name: { $arrayElemAt: ["$dept.name", 0] },
          count: 1,
        },
      },
    ]);

    // 14. Gender Distribution (Students)
    const studentsByGender = await Student.aggregate([
      { $match: query },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $group: {
          _id: "$user.profileDetails.gender",
          count: { $sum: 1 },
        },
      },
    ]);

    // 15. Recent Notices
    const recentNotices = await Notice.find(query)
      .sort({ createdAt: -1 })
      .limit(5)
      .select("title type priority createdAt")
      .lean();

    // 16. Exam Stats
    const totalExams = await Exam.countDocuments(query);
    const upcomingExams = await Exam.countDocuments({
      ...query,
      "schedule.date": { $gte: new Date() },
    });

    // Construct the context object
    // STRICTLY NO PII (Names, Emails, IDs)
    const context = {
      summary: {
        students: {
          total: totalStudents,
          active: activeStudents,
          attendance_rate_today: `${attendanceRate}%`,
          breakdown: studentStatusStats.map((s) => ({
            status: s._id,
            count: s.count,
          })),
          by_department: studentsByDepartment.map((d) => ({
            name: d.name || "Unassigned",
            count: d.count,
          })),
          by_class: studentsByClass.map((c) => ({
            name: c.name,
            grade: c.grade,
            count: c.count,
          })),
          gender_distribution: studentsByGender.map((g) => ({
            gender: g._id || "Unknown",
            count: g.count,
          })),
        },
        teachers: {
          total: totalTeachers,
          by_department: teachersByDepartment.map((d) => ({
            name: d.name || "Unassigned",
            count: d.count,
          })),
        },
        admins: { total: adminCount },
        courses: { total: totalCourses },
        exams: {
          total: totalExams,
          upcoming: upcomingExams,
        },
        notices: {
          recent: recentNotices.map((n) => ({
            title: n.title,
            type: n.type,
            priority: n.priority,
            date: n.createdAt,
          })),
        },
        events: {
          upcoming: upcomingEvents.map((e) => ({
            title: e.title,
            date: e.eventDate,
            venue: e.location ? e.location.venue : "N/A",
          })),
        },
        financials: {
          current_month: {
            revenue: currentMonthRevenue.length
              ? currentMonthRevenue[0].total
              : 0,
            expenses: currentMonthExpenses.length
              ? currentMonthExpenses[0].total
              : 0,
            expense_breakdown: expenseByCategory.map((e) => ({
              category: e._id,
              amount: e.total,
            })),
          },
          expected_collections: {
            total: totalExpectedFees,
            note: "Calculated based on active students and fee structures",
          },
          trends_last_6_months: formattedTrends,
        },
      },
      generatedAt: new Date().toISOString(),
      note: "Data is anonymized and aggregated. Currency is KES.",
    };

    // Save to cache
    cache.set(cacheKey, {
      data: context,
      timestamp: Date.now(),
    });

    return context;
  } catch (error) {
    console.error("Error generating AI context:", error);
    throw error;
  }
};
