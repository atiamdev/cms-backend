const { validationResult } = require("express-validator");
const Branch = require("../models/Branch");
const User = require("../models/User");

// @desc    Create a new branch
// @route   POST /api/branches
// @access  Private (SuperAdmin only)
const createBranch = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation errors",
        errors: errors.array(),
      });
    }

    const branch = await Branch.create(req.body);

    res.status(201).json({
      success: true,
      message: "Branch created successfully",
      branch,
    });
  } catch (error) {
    console.error("Create branch error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during branch creation",
    });
  }
};

// @desc    Get all branches
// @route   GET /api/branches
// @access  Private (SuperAdmin only)
const getBranches = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, search } = req.query;

    const query = {};

    // Filter by status if provided
    if (status) {
      query.status = status;
    }

    // Search by name or address
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { "address.city": { $regex: search, $options: "i" } },
        { "address.state": { $regex: search, $options: "i" } },
      ];
    }

    const branches = await Branch.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Branch.countDocuments(query);

    res.json({
      success: true,
      count: branches.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      branches,
    });
  } catch (error) {
    console.error("Get branches error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching branches",
    });
  }
};

// @desc    Get single branch
// @route   GET /api/branches/:id
// @access  Private (SuperAdmin or branch users)
const getBranch = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user can access this branch
    if (
      !req.user.hasRole("superadmin") &&
      req.user.branchId.toString() !== id
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Cannot access other branch data",
      });
    }

    const branch = await Branch.findById(id);

    if (!branch) {
      return res.status(404).json({
        success: false,
        message: "Branch not found",
      });
    }

    // Get branch statistics
    const stats = await getBranchStats(id);

    res.json({
      success: true,
      branch: {
        ...branch.toObject(),
        stats,
      },
    });
  } catch (error) {
    console.error("Get branch error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching branch",
    });
  }
};

// @desc    Update branch
// @route   PUT /api/branches/:id
// @access  Private (SuperAdmin or Branch Admin)
const updateBranch = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation errors",
        errors: errors.array(),
      });
    }

    const { id } = req.params;

    // Check if user can update this branch
    if (
      !req.user.hasRole("superadmin") &&
      req.user.branchId.toString() !== id
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Cannot update other branch data",
      });
    }

    const branch = await Branch.findByIdAndUpdate(
      id,
      { ...req.body, updatedAt: Date.now() },
      { new: true, runValidators: true }
    );

    if (!branch) {
      return res.status(404).json({
        success: false,
        message: "Branch not found",
      });
    }

    res.json({
      success: true,
      message: "Branch updated successfully",
      branch,
    });
  } catch (error) {
    console.error("Update branch error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during branch update",
    });
  }
};

// @desc    Delete branch
// @route   DELETE /api/branches/:id
// @access  Private (SuperAdmin only)
const deleteBranch = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if branch has any users
    const userCount = await User.countDocuments({ branchId: id });
    if (userCount > 0) {
      return res.status(400).json({
        success: false,
        message:
          "Cannot delete branch with existing users. Please reassign or remove users first.",
      });
    }

    const branch = await Branch.findByIdAndDelete(id);

    if (!branch) {
      return res.status(404).json({
        success: false,
        message: "Branch not found",
      });
    }

    res.json({
      success: true,
      message: "Branch deleted successfully",
    });
  } catch (error) {
    console.error("Delete branch error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during branch deletion",
    });
  }
};

// @desc    Activate academic term
// @route   PUT /api/branches/:id/academic-terms/:termId/activate
// @access  Private (SuperAdmin or Branch Admin)
// DEPRECATED: This function has been moved to the centralized academic term management.
// Use /api/academic-terms/:id/activate instead.
// @desc    Add academic term to branch
// @route   POST /api/branches/:id/academic-terms
// @access  Private (SuperAdmin or Branch Admin)
// DEPRECATED: This function has been moved to the centralized academic term management.
// Use POST /api/academic-terms instead.
const addAcademicTerm = async (req, res) => {
  return res.status(410).json({
    success: false,
    message:
      "This endpoint has been deprecated. Please use POST /api/academic-terms instead.",
  });
};
// @desc    Activate academic term
// @route   PUT /api/branches/:id/academic-terms/:termId/activate
// @access  Private (SuperAdmin or Branch Admin)
// DEPRECATED: This function has been moved to the centralized academic term management.
// Use /api/academic-terms/:id/activate instead.
const activateAcademicTerm = async (req, res) => {
  return res.status(410).json({
    success: false,
    message:
      "This endpoint has been deprecated. Please use /api/academic-terms/:id/activate instead.",
  });
};

// Helper function to get branch statistics
const getBranchStats = async (branchId) => {
  try {
    const [totalUsers, totalStudents, totalTeachers, totalAdmins, activeUsers] =
      await Promise.all([
        User.countDocuments({ branchId }),
        User.countDocuments({ branchId, roles: "student" }),
        User.countDocuments({ branchId, roles: "teacher" }),
        User.countDocuments({ branchId, roles: "admin" }),
        User.countDocuments({ branchId, status: "active" }),
      ]);

    return {
      totalUsers,
      totalStudents,
      totalTeachers,
      totalAdmins,
      activeUsers,
      inactiveUsers: totalUsers - activeUsers,
    };
  } catch (error) {
    console.error("Error getting branch stats:", error);
    return {};
  }
};

module.exports = {
  createBranch,
  getBranches,
  getBranch,
  updateBranch,
  deleteBranch,
  addAcademicTerm,
  activateAcademicTerm,
};
