const { validationResult } = require("express-validator");
const mongoose = require("mongoose");
const Course = require("../models/Course");
const { generateId } = require("../utils/helpers");
const {
  canAccessBranchResource,
  getBranchQueryFilter,
  canPerformBranchOperation,
  isSuperAdmin,
  hasAdminPrivileges,
} = require("../utils/accessControl");

// @desc    Create a new course
// @route   POST /api/courses
// @access  Private (Admin, Academic Head)
const createCourse = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation errors",
        errors: errors.array(),
      });
    }

    // Branch access validation
    const targetBranchId = req.body.branchId || req.branchId;
    if (!canPerformBranchOperation(req.user, targetBranchId)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Cannot create courses in this branch",
      });
    }

    const courseData = {
      ...req.body,
      branchId: req.branchId,
    };

    // Generate course code if not provided
    if (!courseData.code) {
      const prefix = courseData.level.toUpperCase().substring(0, 2);
      courseData.code = generateId(prefix, 4);
    }

    const course = await Course.create(courseData);

    res.status(201).json({
      success: true,
      message: "Course created successfully",
      course,
    });
  } catch (error) {
    console.error("Create course error:", error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Course with this code already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error during course creation",
    });
  }
};

// @desc    Get all courses
// @route   GET /api/courses
// @access  Private (Admin, Teacher, Secretary)
const getCourses = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      level,
      category,
      search,
      isActive,
    } = req.query;

    // Debug: Log the branchId to see if it's being set correctly
    console.log("Branch ID in getCourses:", req.branchId);
    console.log(
      "User info:",
      req.user ? { id: req.user._id, roles: req.user.roles } : "No user"
    );
    console.log("Original isActive from query:", req.query.isActive);

    const query = { branchId: req.branchId };

    // Filter by level
    if (level) {
      query.level = level;
    }

    // Filter by category
    if (category) {
      query.category = category;
    }

    // Filter by active status - only apply filter if explicitly provided
    if (req.query.hasOwnProperty("isActive")) {
      // Handle both boolean and string values
      if (typeof isActive === "string") {
        query.isActive = isActive.toLowerCase() === "true";
      } else {
        query.isActive = Boolean(isActive);
      }
    }

    // Add search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { code: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    console.log("Query being executed:", query);

    // Also check total courses without branchId filter for debugging
    const totalCoursesInDB = await Course.countDocuments({});
    console.log("Total courses in database (all branches):", totalCoursesInDB);

    const courses = await Course.find(query)
      .populate("prerequisites", "code name")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ level: 1, code: 1 });

    const total = await Course.countDocuments(query);

    console.log("Courses found for branch:", courses.length);
    console.log("Total count for branch:", total);

    res.json({
      success: true,
      count: courses.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      courses,
      // Add debug info
      debug: {
        branchId: req.branchId,
        query,
        totalCoursesInDB,
      },
    });
  } catch (error) {
    console.error("Get courses error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching courses",
    });
  }
};

// @desc    Get single course
// @route   GET /api/courses/:id
// @access  Private
const getCourse = async (req, res) => {
  try {
    const { id } = req.params;

    const course = await Course.findOne({
      _id: id,
      branchId: req.branchId,
    }).populate("prerequisites", "code name");

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    res.json({
      success: true,
      course,
    });
  } catch (error) {
    console.error("Get course error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching course",
    });
  }
};

// @desc    Update course
// @route   PUT /api/courses/:id
// @access  Private (Admin, Academic Head)
const updateCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };
    delete updateData.branchId; // Prevent updating branch reference

    const course = await Course.findOneAndUpdate(
      { _id: id, branchId: req.branchId },
      { ...updateData, updatedAt: Date.now() },
      { new: true, runValidators: true }
    ).populate("prerequisites", "code name");

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    res.json({
      success: true,
      message: "Course updated successfully",
      course,
    });
  } catch (error) {
    console.error("Update course error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during course update",
    });
  }
};

// @desc    Delete course
// @route   DELETE /api/courses/:id
// @access  Private (Admin only)
const deleteCourse = async (req, res) => {
  try {
    const { id } = req.params;

    const course = await Course.findOne({ _id: id, branchId: req.branchId });

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Soft delete - mark as inactive instead of removing
    course.isActive = false;
    await course.save();

    res.json({
      success: true,
      message: "Course deactivated successfully",
    });
  } catch (error) {
    console.error("Delete course error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during course deletion",
    });
  }
};

// @desc    Get courses by level
// @route   GET /api/courses/level/:level
// @access  Private
const getCoursesByLevel = async (req, res) => {
  try {
    const { level } = req.params;

    const courses = await Course.findByBranchAndLevel(req.branchId, level);

    res.json({
      success: true,
      count: courses.length,
      courses,
    });
  } catch (error) {
    console.error("Get courses by level error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching courses by level",
    });
  }
};

// @desc    Debug: Get all courses without branch filter
// @route   GET /api/courses/debug/all
// @access  Private (Admin only) - temporary debug endpoint
const debugGetAllCourses = async (req, res) => {
  try {
    const courses = await Course.find({}).populate(
      "prerequisites",
      "code name"
    );

    console.log("DEBUG: All courses in database:", courses.length);

    res.json({
      success: true,
      message: "Debug endpoint - all courses without branch filter",
      count: courses.length,
      courses: courses.map((course) => ({
        _id: course._id,
        name: course.name,
        code: course.code,
        level: course.level,
        branchId: course.branchId,
        isActive: course.isActive,
      })),
    });
  } catch (error) {
    console.error("Debug get all courses error:", error);
    res.status(500).json({
      success: false,
      message: "Server error in debug endpoint",
    });
  }
};

// @desc    Get course statistics
// @route   GET /api/courses/statistics
// @access  Private (Admin, Academic Head)
const getCourseStatistics = async (req, res) => {
  try {
    const [totalCourses, activeCourses] = await Promise.all([
      Course.countDocuments({ branchId: req.branchId }),
      Course.countDocuments({ branchId: req.branchId, isActive: true }),
    ]);

    const inactiveCourses = totalCourses - activeCourses;

    // Get courses by category and level
    const coursesByCategory = await Course.aggregate([
      { $match: { branchId: new mongoose.Types.ObjectId(req.branchId) } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ]);

    const coursesByLevel = await Course.aggregate([
      { $match: { branchId: new mongoose.Types.ObjectId(req.branchId) } },
      { $group: { _id: "$level", count: { $sum: 1 } } },
    ]);

    // Calculate average credits
    const creditStats = await Course.aggregate([
      { $match: { branchId: new mongoose.Types.ObjectId(req.branchId) } },
      {
        $group: {
          _id: null,
          totalCredits: { $sum: "$credits" },
          count: { $sum: 1 },
        },
      },
    ]);

    const averageCredits =
      creditStats.length > 0
        ? creditStats[0].totalCredits / creditStats[0].count
        : 0;

    res.json({
      success: true,
      statistics: {
        totalCourses,
        activeCourses,
        inactiveCourses,
        coursesByCategory: coursesByCategory.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        coursesByLevel: coursesByLevel.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        averageCredits: Math.round(averageCredits * 10) / 10, // Round to 1 decimal place
      },
    });
  } catch (error) {
    console.error("Get course statistics error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching course statistics",
    });
  }
};

module.exports = {
  createCourse,
  getCourses,
  getCourse,
  updateCourse,
  deleteCourse,
  getCoursesByLevel,
  getCourseStatistics,
  debugGetAllCourses,
};
