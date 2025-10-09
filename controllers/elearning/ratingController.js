const mongoose = require("mongoose");
const { Rating, ECourse, Enrollment } = require("../../models/elearning");
const { validationResult } = require("express-validator");
const Student = require("../../models/Student");

// @desc    Add or update a course rating
// @route   POST /api/elearning/courses/:courseId/ratings
// @access  Private (Enrolled students only)
const addOrUpdateRating = async (req, res) => {
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
    const { rating, review } = req.body;
    const userId = req.user._id;

    // Find the student record first
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student record not found",
      });
    }

    // Check if course exists
    const course = await ECourse.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Check if user is enrolled in the course
    const enrollment = await Enrollment.findOne({
      studentId: student._id,
      courseId,
      status: { $in: ["active", "approved", "completed"] },
    });

    if (!enrollment) {
      return res.status(403).json({
        success: false,
        message: "You must be enrolled in this course to leave a rating",
      });
    }

    // Check if user has completed the course (for verified reviews)
    // For testing/development, allow reviews from enrolled students
    const isVerified =
      enrollment.status === "completed" ||
      enrollment.status === "active" ||
      enrollment.status === "approved";

    // Find existing rating or create new one
    let userRating = await Rating.findOne({ courseId, userId });

    if (userRating) {
      // Update existing rating
      userRating.rating = rating;
      userRating.review = review;
      userRating.isVerified = isVerified;
      await userRating.save();
    } else {
      // Create new rating
      userRating = await Rating.create({
        courseId,
        userId,
        rating,
        review,
        isVerified,
      });
    }

    // Update course statistics
    await updateCourseRatingStats(courseId);

    // Populate user data for response
    await userRating.populate("userId", "firstName lastName");

    res.status(201).json({
      success: true,
      data: userRating,
      message: userRating
        ? "Rating updated successfully"
        : "Rating added successfully",
    });
  } catch (error) {
    console.error("Error adding/updating rating:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add/update rating",
      error: error.message,
    });
  }
};

// @desc    Get all ratings for a course
// @route   GET /api/elearning/courses/:courseId/ratings
// @access  Public
const getCourseRatings = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { page = 1, limit = 10, sort = "-createdAt" } = req.query;

    // Check if course exists
    const course = await ECourse.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Get ratings with pagination
    const skip = (page - 1) * limit;

    const ratings = await Rating.find({ courseId })
      .populate("userId", "firstName lastName")
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const total = await Rating.countDocuments({ courseId });

    res.json({
      success: true,
      data: {
        ratings,
        pagination: {
          page,
          pages: Math.ceil(total / limit),
          total,
          limit,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching course ratings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch ratings",
      error: error.message,
    });
  }
};

// @desc    Get rating summary for a course
// @route   GET /api/elearning/courses/:courseId/rating-summary
// @access  Public
const getCourseRatingSummary = async (req, res) => {
  try {
    const { courseId } = req.params;

    // Check if course exists
    const course = await ECourse.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Get rating statistics
    const stats = await Rating.aggregate([
      { $match: { courseId: new mongoose.Types.ObjectId(courseId) } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating" },
          totalRatings: { $sum: 1 },
          ratingDistribution: {
            $push: "$rating",
          },
        },
      },
    ]);

    // Calculate rating distribution
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    if (stats.length > 0 && stats[0].ratingDistribution) {
      stats[0].ratingDistribution.forEach((rating) => {
        distribution[rating] = (distribution[rating] || 0) + 1;
      });
    }

    const summary =
      stats.length > 0
        ? {
            averageRating: Math.round((stats[0].averageRating || 0) * 10) / 10,
            totalRatings: stats[0].totalRatings || 0,
            distribution,
          }
        : {
            averageRating: 0,
            totalRatings: 0,
            distribution,
          };

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error("Error fetching rating summary:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch rating summary",
      error: error.message,
    });
  }
};

// @desc    Delete a rating
// @route   DELETE /api/elearning/courses/:courseId/ratings
// @access  Private (Rating owner only)
const deleteRating = async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user._id;

    // Find and delete the rating
    const rating = await Rating.findOneAndDelete({
      courseId,
      userId,
    });

    if (!rating) {
      return res.status(404).json({
        success: false,
        message: "Rating not found",
      });
    }

    // Update course statistics
    await updateCourseRatingStats(courseId);

    res.json({
      success: true,
      message: "Rating deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting rating:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete rating",
      error: error.message,
    });
  }
};

// Helper function to update course rating statistics
const updateCourseRatingStats = async (courseId) => {
  try {
    const stats = await Rating.aggregate([
      {
        $match: {
          courseId: new mongoose.Types.ObjectId(courseId),
          isVerified: true,
        },
      },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating" },
          totalRatings: { $sum: 1 },
        },
      },
    ]);

    const updateData = {
      "stats.averageRating": 0,
      "stats.totalRatings": 0,
    };

    if (stats.length > 0) {
      updateData["stats.averageRating"] =
        Math.round((stats[0].averageRating || 0) * 10) / 10;
      updateData["stats.totalRatings"] = stats[0].totalRatings || 0;
    }

    await ECourse.findByIdAndUpdate(courseId, updateData);
  } catch (error) {
    console.error("Error updating course rating stats:", error);
  }
};

module.exports = {
  addOrUpdateRating,
  getCourseRatings,
  getCourseRatingSummary,
  deleteRating,
};
