const { validationResult } = require("express-validator");
const Staff = require("../models/Staff");

// @desc    Get active staff for landing page
// @route   GET /api/landing/staff
// @access  Public
const getActiveStaff = async (req, res) => {
  try {
    const department = req.query.department;
    let staff;

    if (department) {
      staff = await Staff.getByDepartment(department);
    } else {
      staff = await Staff.getActive();
    }

    // Transform image field for frontend compatibility
    const transformedStaff = staff.map((item) => ({
      ...item.toObject(),
      imageUrl: item.image?.url,
      imageAlt: item.image?.alt,
    }));

    res.status(200).json({
      success: true,
      count: transformedStaff.length,
      data: transformedStaff,
    });
  } catch (error) {
    console.error("Error fetching staff:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching staff",
    });
  }
};

// @desc    Get all staff (admin)
// @route   GET /api/landing/staff/admin
// @access  Private (SuperAdmin)
const getAllStaff = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const status = req.query.status; // 'active', 'inactive', or undefined for all

    let query = {};
    if (status) {
      query.status = status;
    }

    const total = await Staff.countDocuments(query);
    const staff = await Staff.find(query)
      .sort({ displayOrder: 1, createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Transform image field for frontend compatibility
    const transformedStaff = staff.map((item) => ({
      ...item.toObject(),
      imageUrl: item.image?.url,
      imageAlt: item.image?.alt,
    }));

    res.status(200).json({
      success: true,
      count: transformedStaff.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: transformedStaff,
    });
  } catch (error) {
    console.error("Error fetching staff:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching staff",
    });
  }
};

// @desc    Get single staff member
// @route   GET /api/landing/staff/:id
// @access  Private (SuperAdmin)
const getStaff = async (req, res) => {
  try {
    const staff = await Staff.findById(req.params.id);

    if (!staff) {
      return res.status(404).json({
        success: false,
        message: "Staff member not found",
      });
    }

    // Transform image field for frontend compatibility
    const transformedStaff = {
      ...staff.toObject(),
      imageUrl: staff.image?.url,
      imageAlt: staff.image?.alt,
    };

    res.status(200).json({
      success: true,
      data: transformedStaff,
    });
  } catch (error) {
    console.error("Error fetching staff:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching staff",
    });
  }
};

// @desc    Create new staff member
// @route   POST /api/landing/staff
// @access  Private (SuperAdmin)
const createStaff = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation errors",
        errors: errors.array(),
      });
    }

    const staffData = { ...req.body };

    // Handle imageUrl transformation to image.url
    if (staffData.imageUrl) {
      staffData.image = {
        url: staffData.imageUrl,
        alt: staffData.imageAlt || staffData.name || "Staff image",
      };
      delete staffData.imageUrl;
      delete staffData.imageAlt;
    }

    const staff = await Staff.create(staffData);

    // Transform image field for frontend compatibility
    const transformedStaff = {
      ...staff.toObject(),
      imageUrl: staff.image?.url,
      imageAlt: staff.image?.alt,
    };

    res.status(201).json({
      success: true,
      message: "Staff member created successfully",
      data: transformedStaff,
    });
  } catch (error) {
    console.error("Error creating staff:", error);
    res.status(500).json({
      success: false,
      message: "Server error while creating staff",
    });
  }
};

// @desc    Update staff member
// @route   PUT /api/landing/staff/:id
// @access  Private (SuperAdmin)
const updateStaff = async (req, res) => {
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
        alt: req.body.imageAlt || req.body.name || "Staff image",
      };
      delete req.body.imageUrl;
      delete req.body.imageAlt;
    }

    const staff = await Staff.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!staff) {
      return res.status(404).json({
        success: false,
        message: "Staff member not found",
      });
    }

    // Transform image field for frontend compatibility
    const transformedStaff = {
      ...staff.toObject(),
      imageUrl: staff.image?.url,
      imageAlt: staff.image?.alt,
    };

    res.status(200).json({
      success: true,
      message: "Staff member updated successfully",
      data: transformedStaff,
    });
  } catch (error) {
    console.error("Error updating staff:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating staff",
    });
  }
};

// @desc    Delete staff member
// @route   DELETE /api/landing/staff/:id
// @access  Private (SuperAdmin)
const deleteStaff = async (req, res) => {
  try {
    const staff = await Staff.findByIdAndDelete(req.params.id);

    if (!staff) {
      return res.status(404).json({
        success: false,
        message: "Staff member not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Staff member deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting staff:", error);
    res.status(500).json({
      success: false,
      message: "Server error while deleting staff",
    });
  }
};

// @desc    Update staff display order
// @route   PATCH /api/landing/staff/:id/order
// @access  Private (SuperAdmin)
const updateStaffOrder = async (req, res) => {
  try {
    const { displayOrder } = req.body;

    if (typeof displayOrder !== "number" || displayOrder < 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid display order",
      });
    }

    const staff = await Staff.findByIdAndUpdate(
      req.params.id,
      { displayOrder },
      { new: true }
    );

    if (!staff) {
      return res.status(404).json({
        success: false,
        message: "Staff member not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Staff display order updated successfully",
      data: staff,
    });
  } catch (error) {
    console.error("Error updating staff order:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating staff order",
    });
  }
};

// @desc    Activate staff member
// @route   PATCH /api/landing/staff/:id/activate
// @access  Private (SuperAdmin)
const activateStaff = async (req, res) => {
  try {
    const staff = await Staff.findByIdAndUpdate(
      req.params.id,
      { status: "active" },
      { new: true }
    );

    if (!staff) {
      return res.status(404).json({
        success: false,
        message: "Staff member not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Staff member activated successfully",
      data: staff,
    });
  } catch (error) {
    console.error("Error activating staff:", error);
    res.status(500).json({
      success: false,
      message: "Server error while activating staff",
    });
  }
};

// @desc    Deactivate staff member
// @route   PATCH /api/landing/staff/:id/deactivate
// @access  Private (SuperAdmin)
const deactivateStaff = async (req, res) => {
  try {
    const staff = await Staff.findByIdAndUpdate(
      req.params.id,
      { status: "inactive" },
      { new: true }
    );

    if (!staff) {
      return res.status(404).json({
        success: false,
        message: "Staff member not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Staff member deactivated successfully",
      data: staff,
    });
  } catch (error) {
    console.error("Error deactivating staff:", error);
    res.status(500).json({
      success: false,
      message: "Server error while deactivating staff",
    });
  }
};

module.exports = {
  getActiveStaff,
  getAllStaff,
  getStaff,
  createStaff,
  updateStaff,
  deleteStaff,
  updateStaffOrder,
  activateStaff,
  deactivateStaff,
};
