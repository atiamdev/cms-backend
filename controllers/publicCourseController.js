const { validationResult } = require("express-validator");
const PublicCourse = require("../models/PublicCourse");

// @desc    Get active courses for landing page
// @route   GET /api/landing/courses
// @access  Public
const getActiveCourses = async (req, res) => {
  try {
    const category = req.query.category;
    const featured = req.query.featured === "true";
    let courses;

    if (featured) {
      courses = await PublicCourse.getFeatured();
    } else if (category) {
      courses = await PublicCourse.getByCategory(category);
    } else {
      courses = await PublicCourse.getActive();
    }

    // Transform image field for frontend compatibility
    const transformedCourses = courses.map((item) => ({
      ...item.toObject(),
      imageUrl: item.image?.url,
      imageAlt: item.image?.alt,
      pricing: item.fee
        ? {
            amount: item.fee.amount,
            currency: "KES",
            isFree: item.fee.amount === 0 || item.fee.formatted === "Free",
          }
        : {
            amount: 0,
            currency: "KES",
            isFree: true,
          },
    }));

    res.status(200).json({
      success: true,
      count: transformedCourses.length,
      data: transformedCourses,
    });
  } catch (error) {
    console.error("Error fetching courses:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching courses",
    });
  }
};

// @desc    Get all courses (admin)
// @route   GET /api/landing/courses/admin
// @access  Private (SuperAdmin)
const getAllCourses = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const status = req.query.status; // 'active', 'inactive', or undefined for all

    let query = {};
    if (status) {
      query.status = status;
    }

    const total = await PublicCourse.countDocuments(query);
    const courses = await PublicCourse.find(query)
      .sort({ displayOrder: 1, createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Transform image field for frontend compatibility
    const transformedCourses = courses.map((item) => ({
      ...item.toObject(),
      imageUrl: item.image?.url,
      imageAlt: item.image?.alt,
      pricing: item.fee
        ? {
            amount: item.fee.amount,
            currency: "KES",
            isFree: item.fee.amount === 0 || item.fee.formatted === "Free",
          }
        : {
            amount: 0,
            currency: "KES",
            isFree: true,
          },
    }));

    res.status(200).json({
      success: true,
      count: transformedCourses.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: transformedCourses,
    });
  } catch (error) {
    console.error("Error fetching courses:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching courses",
    });
  }
};

// @desc    Get single course
// @route   GET /api/landing/courses/:id
// @access  Private (SuperAdmin)
const getCourse = async (req, res) => {
  try {
    const course = await PublicCourse.findById(req.params.id);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Transform image field for frontend compatibility
    const transformedCourse = {
      ...course.toObject(),
      imageUrl: course.image?.url,
      imageAlt: course.image?.alt,
      pricing: course.fee
        ? {
            amount: course.fee.amount,
            currency: "KES",
            isFree: course.fee.amount === 0 || course.fee.formatted === "Free",
          }
        : {
            amount: 0,
            currency: "KES",
            isFree: true,
          },
    };

    res.status(200).json({
      success: true,
      data: transformedCourse,
    });
  } catch (error) {
    console.error("Error fetching course:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching course",
    });
  }
};

// @desc    Create new course
// @route   POST /api/landing/courses
// @access  Private (SuperAdmin)
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

    const courseData = { ...req.body };

    // Handle imageUrl transformation to image.url
    if (courseData.imageUrl) {
      courseData.image = {
        url: courseData.imageUrl,
        alt: courseData.imageAlt || courseData.title || "Course image",
      };
      delete courseData.imageUrl;
      delete courseData.imageAlt;
    }

    // Handle pricing transformation to fee
    if (courseData.pricing) {
      courseData.fee = {
        amount: courseData.pricing.amount,
        currency: "KES", // Always use KES
        formatted: courseData.pricing.isFree
          ? "Free"
          : `KES ${courseData.pricing.amount}`,
      };
      delete courseData.pricing;
    }

    const course = await PublicCourse.create(courseData);

    // Transform image field for frontend compatibility
    const transformedCourse = {
      ...course.toObject(),
      imageUrl: course.image?.url,
      imageAlt: course.image?.alt,
      pricing: course.fee
        ? {
            amount: course.fee.amount,
            currency: "KES",
            isFree: course.fee.amount === 0 || course.fee.formatted === "Free",
          }
        : {
            amount: 0,
            currency: "KES",
            isFree: true,
          },
    };

    res.status(201).json({
      success: true,
      message: "Course created successfully",
      data: transformedCourse,
    });
  } catch (error) {
    console.error("Error creating course:", error);
    res.status(500).json({
      success: false,
      message: "Server error while creating course",
    });
  }
};

// @desc    Update course
// @route   PUT /api/landing/courses/:id
// @access  Private (SuperAdmin)
const updateCourse = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation errors",
        errors: errors.array(),
      });
    }

    // Handle imageUrl transformation to image.url
    if (req.body.imageUrl) {
      req.body.image = {
        url: req.body.imageUrl,
        alt: req.body.imageAlt || req.body.title || "Course image",
      };
      delete req.body.imageUrl;
      delete req.body.imageAlt;
    }

    // Handle pricing transformation to fee
    if (req.body.pricing) {
      req.body.fee = {
        amount: req.body.pricing.amount,
        currency: "KES", // Always use KES
        formatted: req.body.pricing.isFree
          ? "Free"
          : `KES ${req.body.pricing.amount}`,
      };
      delete req.body.pricing;
    }

    const course = await PublicCourse.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Transform image field for frontend compatibility
    const transformedCourse = {
      ...course.toObject(),
      imageUrl: course.image?.url,
      imageAlt: course.image?.alt,
      pricing: course.fee
        ? {
            amount: course.fee.amount,
            currency: "KES",
            isFree: course.fee.amount === 0 || course.fee.formatted === "Free",
          }
        : {
            amount: 0,
            currency: "KES",
            isFree: true,
          },
    };

    res.status(200).json({
      success: true,
      message: "Course updated successfully",
      data: transformedCourse,
    });
  } catch (error) {
    console.error("Error updating course:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating course",
    });
  }
};

// @desc    Delete course
// @route   DELETE /api/landing/courses/:id
// @access  Private (SuperAdmin)
const deleteCourse = async (req, res) => {
  try {
    const course = await PublicCourse.findByIdAndDelete(req.params.id);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Course deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting course:", error);
    res.status(500).json({
      success: false,
      message: "Server error while deleting course",
    });
  }
};

// @desc    Update course display order
// @route   PATCH /api/landing/courses/:id/order
// @access  Private (SuperAdmin)
const updateCourseOrder = async (req, res) => {
  try {
    const { displayOrder } = req.body;

    if (typeof displayOrder !== "number" || displayOrder < 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid display order",
      });
    }

    const course = await PublicCourse.findByIdAndUpdate(
      req.params.id,
      { displayOrder },
      { new: true }
    );

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Course display order updated successfully",
      data: course,
    });
  } catch (error) {
    console.error("Error updating course order:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating course order",
    });
  }
};

// @desc    Activate course
// @route   PATCH /api/landing/courses/:id/activate
// @access  Private (SuperAdmin)
const activateCourse = async (req, res) => {
  try {
    const course = await PublicCourse.findByIdAndUpdate(
      req.params.id,
      { status: "active" },
      { new: true }
    );

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Course activated successfully",
      data: course,
    });
  } catch (error) {
    console.error("Error activating course:", error);
    res.status(500).json({
      success: false,
      message: "Server error while activating course",
    });
  }
};

// @desc    Deactivate course
// @route   PATCH /api/landing/courses/:id/deactivate
// @access  Private (SuperAdmin)
const deactivateCourse = async (req, res) => {
  try {
    const course = await PublicCourse.findByIdAndUpdate(
      req.params.id,
      { status: "inactive" },
      { new: true }
    );

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Course deactivated successfully",
      data: course,
    });
  } catch (error) {
    console.error("Error deactivating course:", error);
    res.status(500).json({
      success: false,
      message: "Server error while deactivating course",
    });
  }
};

module.exports = {
  getActiveCourses,
  getAllCourses,
  getCourse,
  createCourse,
  updateCourse,
  deleteCourse,
  updateCourseOrder,
  activateCourse,
  deactivateCourse,
};
