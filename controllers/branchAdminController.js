// controllers/branchAdminController.js
const { validationResult } = require("express-validator");
const mongoose = require("mongoose");
const User = require("../models/User");
const Branch = require("../models/Branch");
const Student = require("../models/Student");
const Teacher = require("../models/Teacher");
const AuditLogger = require("../utils/auditLogger");
const {
  isSuperAdmin,
  hasAdminPrivileges,
  canAccessResource,
  getBranchFilter,
} = require("../utils/accessControl");

/**
 * @desc    Create a new branch admin user
 * @route   POST /api/branch-admins
 * @access  Private (SuperAdmin only)
 */
const createBranchAdmin = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    const { email, password, firstName, lastName, branchId, phone, address } =
      req.body;

    // Check if user with this email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User with this email already exists",
      });
    }

    // Verify the branch exists
    const branch = await Branch.findById(branchId);
    if (!branch) {
      return res.status(404).json({
        success: false,
        message: "Branch not found",
      });
    }

    // Create the branch admin user
    const branchAdmin = new User({
      email,
      password,
      firstName,
      lastName,
      branchId,
      roles: ["branchadmin"],
      status: "active",
      phone,
      address,
      createdBy: req.user._id,
    });

    await branchAdmin.save();

    // Send welcome email to new branch admin
    try {
      const { sendEmail, emailTemplates } = require("../utils/emailService");
      const loginUrl = process.env.CMS_FRONTEND_URL || "http://localhost:3000";

      await sendEmail({
        to: branchAdmin.email,
        ...emailTemplates.welcome(
          `${branchAdmin.firstName} ${branchAdmin.lastName}`,
          loginUrl
        ),
      });
      console.log(
        `Welcome email sent successfully to branch admin: ${branchAdmin.email}`
      );
    } catch (emailError) {
      console.error("Branch admin welcome email sending failed:", emailError);
      // Don't fail registration if email fails
    }

    // Remove password from response
    const branchAdminResponse = branchAdmin.toObject();
    delete branchAdminResponse.password;

    // Populate branch information
    await branchAdmin.populate("branchId", "name code location");

    // Log the action
    await AuditLogger.log({
      userId: req.user._id,
      action: "USER_CREATED",
      resourceType: "USER",
      resourceName: `${branchAdmin.firstName} ${branchAdmin.lastName}`,
      description: `Created branch admin user: ${branchAdmin.email}`,
      metadata: {
        targetUserId: branchAdmin._id,
        branchId: branchAdmin.branchId,
        role: "branchadmin",
        category: "USER_MANAGEMENT",
        severity: "MEDIUM",
      },
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      message: "Branch admin created successfully",
      data: branchAdminResponse,
    });
  } catch (error) {
    console.error("Create branch admin error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Get all branch admins
 * @route   GET /api/branch-admins
 * @access  Private (SuperAdmin)
 */
const getBranchAdmins = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      status,
      branchId,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build query
    const query = {
      roles: { $in: ["branchadmin"] },
    };

    // Apply branch filter if user is not superadmin
    if (!isSuperAdmin(req.user)) {
      query.branchId = req.user.branchId;
    } else if (branchId) {
      // SuperAdmin can filter by specific branch
      query.branchId = branchId;
    }

    if (status) {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    // Sort options
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;

    // Execute query
    const [branchAdmins, total] = await Promise.all([
      User.find(query)
        .select("-password")
        .populate("branchId", "name code location")
        .populate("createdBy", "firstName lastName")
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      User.countDocuments(query),
    ]);

    // Calculate pagination info
    const totalPages = Math.ceil(total / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    res.json({
      success: true,
      data: branchAdmins,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalItems: total,
        itemsPerPage: limitNum,
        hasNextPage,
        hasPrevPage,
      },
    });
  } catch (error) {
    console.error("Get branch admins error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Get branch admin by ID
 * @route   GET /api/branch-admins/:id
 * @access  Private (SuperAdmin, or own record)
 */
const getBranchAdminById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    const branchAdmin = await User.findById(id)
      .select("-password")
      .populate("branchId", "name code location address phone")
      .populate("createdBy", "firstName lastName")
      .populate("updatedBy", "firstName lastName")
      .lean();

    if (!branchAdmin) {
      return res.status(404).json({
        success: false,
        message: "Branch admin not found",
      });
    }

    // Check if user is branch admin
    if (!branchAdmin.roles.includes("branchadmin")) {
      return res.status(400).json({
        success: false,
        message: "User is not a branch admin",
      });
    }

    // Check access permissions
    if (
      !isSuperAdmin(req.user) &&
      branchAdmin._id.toString() !== req.user._id.toString()
    ) {
      if (!canAccessResource(req.user, ["superadmin"], branchAdmin.branchId)) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }
    }

    res.json({
      success: true,
      data: branchAdmin,
    });
  } catch (error) {
    console.error("Get branch admin by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Update branch admin
 * @route   PUT /api/branch-admins/:id
 * @access  Private (SuperAdmin, or own record for limited fields)
 */
const updateBranchAdmin = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    const { id } = req.params;
    const updates = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    const branchAdmin = await User.findById(id);
    if (!branchAdmin) {
      return res.status(404).json({
        success: false,
        message: "Branch admin not found",
      });
    }

    // Check if user is branch admin
    if (!branchAdmin.roles.includes("branchadmin")) {
      return res.status(400).json({
        success: false,
        message: "User is not a branch admin",
      });
    }

    // Check permissions
    const isOwnRecord = branchAdmin._id.toString() === req.user._id.toString();
    const canUpdate = isSuperAdmin(req.user) || isOwnRecord;

    if (!canUpdate) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Restrict what non-superadmin can update about themselves
    if (isOwnRecord && !isSuperAdmin(req.user)) {
      const allowedFields = ["firstName", "lastName", "phone", "address"];
      const updateFields = Object.keys(updates);
      const unauthorizedFields = updateFields.filter(
        (field) => !allowedFields.includes(field)
      );

      if (unauthorizedFields.length > 0) {
        return res.status(403).json({
          success: false,
          message: `You can only update: ${allowedFields.join(", ")}`,
        });
      }
    }

    // Store original values for audit
    const originalValues = {
      firstName: branchAdmin.firstName,
      lastName: branchAdmin.lastName,
      email: branchAdmin.email,
      branchId: branchAdmin.branchId,
      status: branchAdmin.status,
    };

    // Check if email is being changed and if it already exists
    if (updates.email && updates.email !== branchAdmin.email) {
      const existingUser = await User.findOne({
        email: updates.email,
        _id: { $ne: id },
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "User with this email already exists",
        });
      }
    }

    // Apply updates
    Object.keys(updates).forEach((key) => {
      if (updates[key] !== undefined) {
        branchAdmin[key] = updates[key];
      }
    });

    branchAdmin.updatedBy = req.user._id;
    await branchAdmin.save();

    // Populate for response
    await branchAdmin.populate([
      { path: "branchId", select: "name code location" },
      { path: "updatedBy", select: "firstName lastName" },
    ]);

    // Remove password from response
    const response = branchAdmin.toObject();
    delete response.password;

    // Log the action
    const changedFields = Object.keys(updates);
    await AuditLogger.log({
      userId: req.user._id,
      action: "USER_UPDATED",
      resourceType: "USER",
      resourceName: `${branchAdmin.firstName} ${branchAdmin.lastName}`,
      description: `Updated branch admin: ${changedFields.join(", ")}`,
      metadata: {
        targetUserId: branchAdmin._id,
        changedFields,
        originalValues: JSON.stringify(originalValues),
        branchId: branchAdmin.branchId,
        category: "USER_MANAGEMENT",
        severity: "MEDIUM",
      },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: "Branch admin updated successfully",
      data: response,
    });
  } catch (error) {
    console.error("Update branch admin error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Delete branch admin (soft delete)
 * @route   DELETE /api/branch-admins/:id
 * @access  Private (SuperAdmin only)
 */
const deleteBranchAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    const branchAdmin = await User.findById(id);
    if (!branchAdmin) {
      return res.status(404).json({
        success: false,
        message: "Branch admin not found",
      });
    }

    // Check if user is branch admin
    if (!branchAdmin.roles.includes("branchadmin")) {
      return res.status(400).json({
        success: false,
        message: "User is not a branch admin",
      });
    }

    // Prevent self-deletion
    if (branchAdmin._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot delete your own account",
      });
    }

    // Soft delete by changing status
    branchAdmin.status = "inactive";
    branchAdmin.updatedBy = req.user._id;
    await branchAdmin.save();

    // Log the action
    await AuditLogger.log({
      userId: req.user._id,
      action: "USER_DELETED",
      resourceType: "USER",
      resourceName: `${branchAdmin.firstName} ${branchAdmin.lastName}`,
      description: `Deleted branch admin user: ${branchAdmin.email}`,
      metadata: {
        targetUserId: branchAdmin._id,
        branchId: branchAdmin.branchId,
        deletionType: "soft",
        category: "USER_MANAGEMENT",
        severity: "HIGH",
      },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: "Branch admin deleted successfully",
    });
  } catch (error) {
    console.error("Delete branch admin error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Assign branch to branch admin
 * @route   PUT /api/branch-admins/:id/assign-branch
 * @access  Private (SuperAdmin only)
 */
const assignBranchToBranchAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { branchId } = req.body;

    if (
      !mongoose.Types.ObjectId.isValid(id) ||
      !mongoose.Types.ObjectId.isValid(branchId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      });
    }

    const [branchAdmin, branch] = await Promise.all([
      User.findById(id),
      Branch.findById(branchId),
    ]);

    if (!branchAdmin) {
      return res.status(404).json({
        success: false,
        message: "Branch admin not found",
      });
    }

    if (!branch) {
      return res.status(404).json({
        success: false,
        message: "Branch not found",
      });
    }

    // Check if user is branch admin
    if (!branchAdmin.roles.includes("branchadmin")) {
      return res.status(400).json({
        success: false,
        message: "User is not a branch admin",
      });
    }

    const previousBranchId = branchAdmin.branchId;
    branchAdmin.branchId = branchId;
    branchAdmin.updatedBy = req.user._id;
    await branchAdmin.save();

    // Populate for response
    await branchAdmin.populate("branchId", "name code location");

    // Log the action
    await AuditLogger.log({
      userId: req.user._id,
      action: "BRANCH_ASSIGNMENT_CHANGED",
      resourceType: "USER",
      resourceName: `${branchAdmin.firstName} ${branchAdmin.lastName}`,
      description: `Assigned branch admin to branch: ${branch.name}`,
      metadata: {
        targetUserId: branchAdmin._id,
        previousBranchId,
        newBranchId: branchId,
        branchName: branch.name,
        category: "USER_MANAGEMENT",
        severity: "MEDIUM",
      },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: "Branch assignment updated successfully",
      data: {
        id: branchAdmin._id,
        branch: branchAdmin.branchId,
      },
    });
  } catch (error) {
    console.error("Assign branch to branch admin error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Get branch admin dashboard stats
 * @route   GET /api/branch-admins/:id/stats
 * @access  Private (SuperAdmin, or own record)
 */
const getBranchAdminStats = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    const branchAdmin = await User.findById(id);
    if (!branchAdmin) {
      return res.status(404).json({
        success: false,
        message: "Branch admin not found",
      });
    }

    // Check permissions
    const isOwnRecord = branchAdmin._id.toString() === req.user._id.toString();
    const canView = isSuperAdmin(req.user) || isOwnRecord;

    if (!canView) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Get branch stats
    const branchId = branchAdmin.branchId;
    const [
      totalStudents,
      activeStudents,
      totalTeachers,
      activeTeachers,
      totalClasses,
    ] = await Promise.all([
      Student.countDocuments({ branchId }),
      Student.countDocuments({ branchId, status: "active" }),
      Teacher.countDocuments({ branchId }),
      Teacher.countDocuments({ branchId, status: "active" }),
      mongoose
        .model("Class")
        .countDocuments({ branchId })
        .catch(() => 0),
    ]);

    const stats = {
      students: {
        total: totalStudents,
        active: activeStudents,
        inactive: totalStudents - activeStudents,
      },
      teachers: {
        total: totalTeachers,
        active: activeTeachers,
        inactive: totalTeachers - activeTeachers,
      },
      classes: {
        total: totalClasses,
      },
      branch: branchAdmin.branchId,
    };

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Get branch admin stats error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

module.exports = {
  createBranchAdmin,
  getBranchAdmins,
  getBranchAdminById,
  updateBranchAdmin,
  deleteBranchAdmin,
  assignBranchToBranchAdmin,
  getBranchAdminStats,
};
