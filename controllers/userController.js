const { validationResult } = require("express-validator");
const mongoose = require("mongoose");
const User = require("../models/User");
const Student = require("../models/Student");
const Teacher = require("../models/Teacher");
const Branch = require("../models/Branch");

// @desc    Get all users
// @route   GET /api/users
// @access  Private (SuperAdmin, Admin)
const getUsers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      role,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
      branchId,
    } = req.query;

    const currentUser = req.user;
    let query = {};

    // Non-superadmin users can only see users in their branch
    if (!currentUser.hasRole("superadmin")) {
      query.branchId = currentUser.branchId;
    } else if (branchId) {
      // SuperAdmin can filter by specific branch
      query.branchId = branchId;
    }

    // Filter by status
    if (status) {
      query.status = status;
    }

    // Filter by role
    if (role) {
      query.roles = { $in: [role] };
    }

    // Build aggregation pipeline for search
    const pipeline = [
      { $match: query },
      {
        $lookup: {
          from: "branches",
          localField: "branchId",
          foreignField: "_id",
          as: "branchInfo",
        },
      },
      {
        $addFields: {
          branchInfo: { $arrayElemAt: ["$branchInfo", 0] },
        },
      },
    ];

    // Add search filter
    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { firstName: { $regex: search, $options: "i" } },
            { lastName: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
            { "branchInfo.name": { $regex: search, $options: "i" } },
          ],
        },
      });
    }

    // Add sorting
    const sortDirection = sortOrder === "desc" ? -1 : 1;
    pipeline.push({ $sort: { [sortBy]: sortDirection } });

    // Add pagination
    pipeline.push(
      { $skip: (page - 1) * parseInt(limit) },
      { $limit: parseInt(limit) }
    );

    // Remove sensitive fields
    pipeline.push({
      $project: {
        password: 0,
        passwordResetToken: 0,
        emailVerificationToken: 0,
        loginAttempts: 0,
        lockUntil: 0,
      },
    });

    // Execute aggregation
    const users = await User.aggregate(pipeline);

    // Get total count
    const totalCountPipeline = [...pipeline];
    totalCountPipeline.splice(-3); // Remove projection, skip and limit stages
    totalCountPipeline.push({ $count: "total" });

    const countResult = await User.aggregate(totalCountPipeline);
    const total = countResult.length > 0 ? countResult[0].total : 0;

    res.json({
      success: true,
      count: users.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      users,
    });
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching users",
    });
  }
};

// @desc    Get single user
// @route   GET /api/users/:id
// @access  Private (SuperAdmin, Admin, Self)
const getUser = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUser = req.user;

    // Build query based on user permissions
    let query = { _id: id };

    // Non-superadmin users can only see users in their branch or themselves
    if (!currentUser.hasRole("superadmin")) {
      if (currentUser._id.toString() !== id) {
        query.branchId = currentUser.branchId;
      }
    }

    const user = await User.findOne(query)
      .populate("branchId", "name address contactInfo")
      .select(
        "-password -passwordResetToken -emailVerificationToken -loginAttempts -lockUntil"
      );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Get additional profile data based on user role
    let additionalData = {};

    if (user.hasRole("student")) {
      const studentProfile = await Student.findOne({ userId: user._id })
        .populate("currentClassId", "name grade section")
        .select("-userId");
      additionalData.studentProfile = studentProfile;
    }

    if (user.hasRole("teacher")) {
      const teacherProfile = await Teacher.findOne({ userId: user._id })
        .populate("classes.classId", "name grade section")
        .select("-userId");
      additionalData.teacherProfile = teacherProfile;
    }

    res.json({
      success: true,
      user: {
        ...user.toObject(),
        ...additionalData,
      },
    });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching user",
    });
  }
};

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private (SuperAdmin, Admin, Self - limited)
const updateUser = async (req, res) => {
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
    const currentUser = req.user;
    const updateData = { ...req.body };

    // Remove fields that shouldn't be updated via this endpoint
    delete updateData.password;
    delete updateData.email; // Email changes require verification
    delete updateData.roles; // Role changes need special handling
    delete updateData.branchId; // Branch changes need special handling
    delete updateData.status; // Status changes have separate endpoint

    // Find the user to update
    const userToUpdate = await User.findById(id);

    if (!userToUpdate) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check permissions
    const isSelf = currentUser._id.toString() === id;
    const isSuperAdmin = currentUser.hasRole("superadmin");
    const isAdmin = currentUser.hasRole("admin");
    const sameBranch =
      userToUpdate.branchId?.toString() === currentUser.branchId?.toString();

    if (!isSelf && !isSuperAdmin && !(isAdmin && samebranch)) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to update this user",
      });
    }

    // If updating self, only allow certain fields
    if (isSelf && !isSuperAdmin && !isAdmin) {
      const allowedSelfUpdateFields = [
        "firstName",
        "lastName",
        "profileDetails",
        "preferences",
      ];
      const requestedFields = Object.keys(updateData);
      const invalidFields = requestedFields.filter(
        (field) => !allowedSelfUpdateFields.includes(field)
      );

      if (invalidFields.length > 0) {
        return res.status(403).json({
          success: false,
          message: `You can only update: ${allowedSelfUpdateFields.join(", ")}`,
        });
      }
    }

    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      id,
      { ...updateData, updatedAt: Date.now() },
      { new: true, runValidators: true }
    )
      .populate("branchId", "name")
      .select("-password -passwordResetToken -emailVerificationToken");

    res.json({
      success: true,
      message: "User updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Update user error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating user",
    });
  }
};

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private (SuperAdmin, Admin - with restrictions)
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUser = req.user;
    const { transferData = false, force = false } = req.query;

    const userToDelete = await User.findById(id);

    if (!userToDelete) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Permission checks
    if (userToDelete._id.toString() === currentUser._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot delete your own account",
      });
    }

    if (
      userToDelete.hasRole("superadmin") &&
      !currentUser.hasRole("superadmin")
    ) {
      return res.status(403).json({
        success: false,
        message: "Only superadmins can delete superadmin accounts",
      });
    }

    if (!currentUser.hasRole("superadmin")) {
      if (
        !userToDelete.branchId ||
        userToDelete.branchId.toString() !== currentUser.branchId.toString()
      ) {
        return res.status(403).json({
          success: false,
          message: "You can only delete users in your branch",
        });
      }
    }

    // Check for associated data
    const associatedData = [];

    if (userToDelete.hasRole("student")) {
      const studentProfile = await Student.findOne({ userId: id });
      if (studentProfile) {
        associatedData.push("Student profile and academic records");
      }
    }

    if (userToDelete.hasRole("teacher")) {
      const teacherProfile = await Teacher.findOne({ userId: id });
      if (teacherProfile && teacherProfile.classes.length > 0) {
        associatedData.push("Teacher profile and class assignments");
      }
    }

    // If there's associated data and force is not specified, warn user
    if (associatedData.length > 0 && !force) {
      return res.status(400).json({
        success: false,
        message: "User has associated data that will be affected",
        associatedData,
        hint: "Use ?force=true to proceed with deletion or ?transferData=true to transfer data first",
      });
    }

    // Handle data transfer or deletion
    if (transferData && userToDelete.hasRole("teacher")) {
      // For teachers, we need to reassign their classes
      const teacherProfile = await Teacher.findOne({ userId: id });
      if (teacherProfile) {
        // You might want to implement a class reassignment logic here
        // For now, we'll just remove the teacher assignments
        teacherProfile.classes = [];
        await teacherProfile.save();
      }
    }

    // Delete associated profiles
    if (userToDelete.hasRole("student")) {
      await Student.findOneAndDelete({ userId: id });
    }

    if (userToDelete.hasRole("teacher")) {
      await Teacher.findOneAndDelete({ userId: id });
    }

    // Delete the user
    await User.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "User deleted successfully",
      deletedAssociatedData: associatedData,
    });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while deleting user",
    });
  }
};

// @desc    Update user roles
// @route   PUT /api/users/:id/roles
// @access  Private (SuperAdmin, Admin - limited)
const updateUserRoles = async (req, res) => {
  try {
    const { id } = req.params;
    const { roles, reason } = req.body;
    const currentUser = req.user;

    if (!Array.isArray(roles) || roles.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Roles must be a non-empty array",
      });
    }

    const validRoles = [
      "student",
      "teacher",
      "admin",
      "secretary",
      "superadmin",
    ];
    const invalidRoles = roles.filter((role) => !validRoles.includes(role));

    if (invalidRoles.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid roles: ${invalidRoles.join(", ")}`,
      });
    }

    const userToUpdate = await User.findById(id);

    if (!userToUpdate) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Permission checks
    if (roles.includes("superadmin") && !currentUser.hasRole("superadmin")) {
      return res.status(403).json({
        success: false,
        message: "Only superadmins can assign superadmin role",
      });
    }

    if (!currentUser.hasRole("superadmin")) {
      if (
        !userToUpdate.branchId ||
        userToUpdate.branchId.toString() !== currentUser.branchId.toString()
      ) {
        return res.status(403).json({
          success: false,
          message: "You can only modify roles for users in your branch",
        });
      }
    }

    // Update roles
    const oldRoles = [...userToUpdate.roles];
    userToUpdate.roles = roles;
    userToUpdate.updatedAt = Date.now();

    // Add to role change history
    if (!userToUpdate.roleHistory) {
      userToUpdate.roleHistory = [];
    }

    userToUpdate.roleHistory.push({
      oldRoles,
      newRoles: roles,
      changedBy: currentUser._id,
      changedAt: new Date(),
      reason: reason || "Role update",
    });

    await userToUpdate.save();

    res.json({
      success: true,
      message: "User roles updated successfully",
      user: userToUpdate,
    });
  } catch (error) {
    console.error("Update user roles error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating user roles",
    });
  }
};

// @desc    Get user statistics
// @route   GET /api/users/statistics
// @access  Private (SuperAdmin, Admin)
const getUserStatistics = async (req, res) => {
  try {
    const currentUser = req.user;
    let matchQuery = {};

    // Non-superadmin users can only see stats for their branch
    if (!currentUser.hasRole("superadmin")) {
      matchQuery.branchId = currentUser.branchId;
    }

    const [totalStats, roleStats, statusStats, branchStats] = await Promise.all(
      [
        // Total users
        User.countDocuments(matchQuery),

        // Users by role
        User.aggregate([
          { $match: matchQuery },
          { $unwind: "$roles" },
          { $group: { _id: "$roles", count: { $sum: 1 } } },
        ]),

        // Users by status
        User.aggregate([
          { $match: matchQuery },
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]),

        // Users by branch (for superadmin)
        currentUser.hasRole("superadmin")
          ? User.aggregate([
              {
                $lookup: {
                  from: "branches",
                  localField: "branchId",
                  foreignField: "_id",
                  as: "branchInfo",
                },
              },
              {
                $group: {
                  _id: "$branchId",
                  count: { $sum: 1 },
                  branchName: { $first: "$branchInfo.name" },
                },
              },
            ])
          : [],
      ]
    );

    res.json({
      success: true,
      statistics: {
        totalUsers: totalStats,
        byRole: roleStats.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        byStatus: statusStats.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        byBranch: branchStats.reduce((acc, item) => {
          acc[item.branchName?.[0] || "No Branch"] = item.count;
          return acc;
        }, {}),
      },
    });
  } catch (error) {
    console.error("Get user statistics error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching user statistics",
    });
  }
};

// @desc    Transfer user to different branch
// @route   PUT /api/users/:id/transfer
// @access  Private (SuperAdmin only)
const transferUserToBranch = async (req, res) => {
  try {
    const { id } = req.params;
    const { targetBranchId, reason } = req.body;
    const currentUser = req.user;

    if (!currentUser.hasRole("superadmin")) {
      return res.status(403).json({
        success: false,
        message: "Only superadmins can transfer users between branches",
      });
    }

    const userToTransfer = await User.findById(id);
    const targetBranch = await Branch.findById(targetBranchId);

    if (!userToTransfer) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!targetBranch) {
      return res.status(404).json({
        success: false,
        message: "Target branch not found",
      });
    }

    if (userToTransfer.hasRole("superadmin")) {
      return res.status(400).json({
        success: false,
        message: "Cannot transfer superadmin users",
      });
    }

    const oldBranchId = userToTransfer.branchId;
    userToTransfer.branchId = targetBranchId;
    userToTransfer.updatedAt = Date.now();

    // Add to transfer history
    if (!userToTransfer.transferHistory) {
      userToTransfer.transferHistory = [];
    }

    userToTransfer.transferHistory.push({
      fromBranchId: oldBranchId,
      toBranchId: targetBranchId,
      transferredBy: currentUser._id,
      transferredAt: new Date(),
      reason: reason || "Branch transfer",
    });

    await userToTransfer.save();

    // Also update associated profiles
    if (userToTransfer.hasRole("student")) {
      await Student.findOneAndUpdate(
        { userId: id },
        { branchId: targetBranchId }
      );
    }

    if (userToTransfer.hasRole("teacher")) {
      await Teacher.findOneAndUpdate(
        { userId: id },
        { branchId: targetBranchId }
      );
    }

    res.json({
      success: true,
      message: "User transferred successfully",
      user: userToTransfer,
    });
  } catch (error) {
    console.error("Transfer user error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while transferring user",
    });
  }
};

// @desc    Update user status
// @route   PUT /api/users/:id/status
// @access  Private (SuperAdmin, Admin - with restrictions)
const updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;
    const currentUser = req.user;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required",
      });
    }

    if (!["active", "inactive", "suspended", "pending"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status value",
      });
    }

    // Find the user to update
    const userToUpdate = await User.findById(id);

    if (!userToUpdate) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check permissions
    const isSuperAdmin = currentUser.hasRole("superadmin");
    const isAdmin = currentUser.hasRole("admin");
    const sameBranch =
      userToUpdate.branchId?.toString() === currentUser.branchId?.toString();

    if (!isSuperAdmin && !(isAdmin && sameBranch)) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to update this user's status",
      });
    }

    // Cannot update superadmin status unless you are superadmin
    if (userToUpdate.hasRole("superadmin") && !isSuperAdmin) {
      return res.status(403).json({
        success: false,
        message: "Only superadmins can update superadmin status",
      });
    }

    // First, check if the user has a malformed address field and fix it
    const userWithBadAddress = await User.findOne({
      _id: id,
      $or: [
        { address: { $type: "string" } },
        { address: null },
        { address: { $exists: false } },
        { address: "" }, // Also handle empty string
      ],
    });

    if (userWithBadAddress) {
      // Fix the address field using raw MongoDB operations to avoid schema validation
      await User.collection.updateOne(
        { _id: new mongoose.Types.ObjectId(id) },
        {
          $unset: { address: "" },
          $set: {
            "profileDetails.address": {
              street: "",
              city: "",
              state: "",
              country: "",
              zipCode: "",
            },
          },
        }
      );
    }

    // Now update the status using findByIdAndUpdate
    const updatedUser = await User.findByIdAndUpdate(
      id,
      {
        status: status,
        updatedAt: Date.now(),
        $push: {
          statusHistory: {
            status: userToUpdate.status, // old status
            changedBy: currentUser._id,
            changedAt: new Date(),
            reason:
              reason ||
              `Status changed from ${userToUpdate.status} to ${status}`,
          },
        },
      },
      { new: true }
    );

    // Send account activation email if status changed to active
    if (status === "active" && userToUpdate.status !== "active") {
      try {
        const { sendEmail, emailTemplates } = require("../utils/emailService");
        const loginUrl =
          process.env.CMS_FRONTEND_URL || "http://localhost:3000";

        await sendEmail({
          to: updatedUser.email,
          ...emailTemplates.accountActivated(
            `${updatedUser.firstName} ${updatedUser.lastName}`,
            loginUrl
          ),
        });
        console.log(`Account activation email sent to ${updatedUser.email}`);
      } catch (emailError) {
        console.error("Account activation email sending failed:", emailError);
        // Don't fail the status update if email fails
      }
    }

    // Get the updated user for response
    const finalUser = await User.findById(id)
      .populate("branchId", "name")
      .select("-password -passwordResetToken -emailVerificationToken");

    res.json({
      success: true,
      message: "User status updated successfully",
      user: finalUser,
    });
  } catch (error) {
    console.error("Update user status error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating user status",
    });
  }
};

module.exports = {
  getUsers,
  getUser,
  updateUser,
  deleteUser,
  updateUserRoles,
  updateUserStatus,
  getUserStatistics,
  transferUserToBranch,
};
