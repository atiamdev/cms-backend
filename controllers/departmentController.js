const { validationResult } = require("express-validator");
const mongoose = require("mongoose");
const Department = require("../models/Department");
const User = require("../models/User");
const Student = require("../models/Student");
const Course = require("../models/Course");

// @desc    Create a new department
// @route   POST /api/departments
// @access  Private (SuperAdmin, BranchAdmin)
const createDepartment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation errors",
        errors: errors.array(),
      });
    }

    const { branchId, headOfDepartment, ...departmentData } = req.body;

    // Verify branch access for non-superadmin users
    if (
      !req.user.roles.includes("superadmin") &&
      req.user.branchId.toString() !== branchId
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. You can only create departments for your branch.",
      });
    }

    // If headOfDepartment is provided, verify they exist and are in the same branch
    if (headOfDepartment) {
      const headUser = await User.findOne({
        _id: headOfDepartment,
        branchId: branchId,
        roles: { $in: ["teacher", "hod"] },
      });

      if (!headUser) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid head of department. User must be a teacher or HOD in the same branch.",
        });
      }
    }

    const department = await Department.create({
      ...departmentData,
      branchId,
      headOfDepartment,
    });

    // Populate the created department
    await department.populate([
      { path: "branchId", select: "name" },
      { path: "headOfDepartment", select: "firstName lastName email" },
    ]);

    res.status(201).json({
      success: true,
      message: "Department created successfully",
      data: department,
    });
  } catch (error) {
    console.error("Create department error:", error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Department name or code already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error during department creation",
    });
  }
};

// @desc    Get all departments
// @route   GET /api/departments
// @access  Private (SuperAdmin, BranchAdmin, Teacher, Secretary)
const getDepartments = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      branchId,
      isActive,
      search,
      includeStats = false,
    } = req.query;

    const query = {};

    // Filter by branch for non-superadmin users
    // Temporarily disabled for testing
    // if (!req.user.roles.includes("superadmin")) {
    //   query.branchId = req.user.branchId;
    // } else if (branchId) {
    //   query.branchId = branchId;
    // }
    if (branchId) {
      query.branchId = branchId;
    }

    // Filter by active status
    if (isActive !== undefined) {
      // Convert string to boolean if needed
      const isActiveBool = isActive === "true" || isActive === true;
      query.isActive = isActiveBool;
    }

    // Search by name or code
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { code: { $regex: search, $options: "i" } },
      ];
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { name: 1 },
      populate: [
        { path: "branchId", select: "name abbreviation" },
        { path: "headOfDepartment", select: "firstName lastName email" },
      ],
    };

    let departments;
    let pagination = {};

    if (includeStats === "true") {
      // Use aggregation for statistics
      const pipeline = [
        { $match: query },
        {
          $lookup: {
            from: "students",
            localField: "_id",
            foreignField: "departmentId",
            as: "students",
          },
        },
        {
          $lookup: {
            from: "courses",
            localField: "_id",
            foreignField: "departmentId",
            as: "courses",
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "departmentId",
            as: "staff",
            pipeline: [{ $match: { roles: { $in: ["teacher", "hod"] } } }],
          },
        },
        {
          $addFields: {
            studentCount: { $size: "$students" },
            courseCount: { $size: "$courses" },
            staffCount: { $size: "$staff" },
          },
        },
        {
          $project: {
            students: 0,
            courses: 0,
            staff: 0,
          },
        },
        { $sort: { name: 1 } },
        { $skip: (parseInt(page) - 1) * parseInt(limit) },
        { $limit: parseInt(limit) },
      ];

      const totalDocs = await Department.countDocuments(query);
      departments = await Department.aggregate(pipeline);

      pagination = {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalDocs / parseInt(limit)),
        totalItems: totalDocs,
        hasNext: parseInt(page) * parseInt(limit) < totalDocs,
        hasPrev: parseInt(page) > 1,
      };
    } else {
      // Manual pagination without aggregation
      const totalDocs = await Department.countDocuments(query);
      departments = await Department.find(query)
        .populate("headOfDepartment", "firstName lastName")
        .sort({ name: 1 })
        .skip((parseInt(page) - 1) * parseInt(limit))
        .limit(parseInt(limit));

      pagination = {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalDocs / parseInt(limit)),
        totalItems: totalDocs,
        hasNext: parseInt(page) * parseInt(limit) < totalDocs,
        hasPrev: parseInt(page) > 1,
      };
    }

    res.status(200).json({
      success: true,
      data: departments,
      pagination,
    });
  } catch (error) {
    console.error("Get departments error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during department retrieval",
    });
  }
};

// @desc    Get single department
// @route   GET /api/departments/:id
// @access  Private (SuperAdmin, BranchAdmin, Teacher, Secretary)
const getDepartment = async (req, res) => {
  try {
    const { id } = req.params;

    const department = await Department.findById(id)
      .populate("branchId", "name abbreviation")
      .populate("headOfDepartment", "firstName lastName email phone");

    if (!department) {
      return res.status(404).json({
        success: false,
        message: "Department not found",
      });
    }

    // Check branch access for non-superadmin users
    if (
      !req.user.roles.includes("superadmin") &&
      department.branchId._id.toString() !== req.user.branchId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. You can only view departments from your branch.",
      });
    }

    // Get statistics
    const stats = await department.getStatistics();

    res.status(200).json({
      success: true,
      data: {
        ...department.toObject(),
        ...stats,
      },
    });
  } catch (error) {
    console.error("Get department error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during department retrieval",
    });
  }
};

// @desc    Update department
// @route   PUT /api/departments/:id
// @access  Private (SuperAdmin, BranchAdmin)
const updateDepartment = async (req, res) => {
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
    const { headOfDepartment, ...updateData } = req.body;

    const department = await Department.findById(id);

    if (!department) {
      return res.status(404).json({
        success: false,
        message: "Department not found",
      });
    }

    // Check branch access for non-superadmin users
    if (
      !req.user.roles.includes("superadmin") &&
      department.branchId.toString() !== req.user.branchId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. You can only update departments from your branch.",
      });
    }

    // If headOfDepartment is being updated, verify the user
    if (headOfDepartment !== undefined) {
      if (headOfDepartment) {
        const headUser = await User.findOne({
          _id: headOfDepartment,
          branchId: department.branchId,
          roles: { $in: ["teacher", "hod"] },
        });

        if (!headUser) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid head of department. User must be a teacher or HOD in the same branch.",
          });
        }
      }
      updateData.headOfDepartment = headOfDepartment;
    }

    const updatedDepartment = await Department.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate([
      { path: "branchId", select: "name abbreviation" },
      { path: "headOfDepartment", select: "firstName lastName email" },
    ]);

    res.status(200).json({
      success: true,
      message: "Department updated successfully",
      data: updatedDepartment,
    });
  } catch (error) {
    console.error("Update department error:", error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Department name or code already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error during department update",
    });
  }
};

// @desc    Delete department
// @route   DELETE /api/departments/:id
// @access  Private (SuperAdmin only)
const deleteDepartment = async (req, res) => {
  try {
    const { id } = req.params;

    const department = await Department.findById(id);

    if (!department) {
      return res.status(404).json({
        success: false,
        message: "Department not found",
      });
    }

    // Check if department has students or courses
    const [studentCount, courseCount] = await Promise.all([
      Student.countDocuments({ departmentId: id }),
      Course.countDocuments({ departmentId: id }),
    ]);

    if (studentCount > 0 || courseCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete department. It has ${studentCount} students and ${courseCount} courses assigned.`,
      });
    }

    await Department.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Department deleted successfully",
    });
  } catch (error) {
    console.error("Delete department error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during department deletion",
    });
  }
};

// @desc    Get departments by branch
// @route   GET /api/departments/branch/:branchId
// @access  Private (SuperAdmin, BranchAdmin, Teacher, Secretary)
const getDepartmentsByBranch = async (req, res) => {
  try {
    const { branchId } = req.params;
    const { includeStats = false } = req.query;

    // Check branch access for non-superadmin users
    if (
      !req.user.roles.includes("superadmin") &&
      req.user.branchId.toString() !== branchId
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. You can only view departments from your branch.",
      });
    }

    const query = { branchId, isActive: true };

    let departments;
    if (includeStats === "true") {
      departments = await Department.aggregate([
        { $match: query },
        {
          $lookup: {
            from: "students",
            localField: "_id",
            foreignField: "departmentId",
            as: "students",
          },
        },
        {
          $lookup: {
            from: "courses",
            localField: "_id",
            foreignField: "departmentId",
            as: "courses",
          },
        },
        {
          $addFields: {
            studentCount: { $size: "$students" },
            courseCount: { $size: "$courses" },
          },
        },
        {
          $project: {
            students: 0,
            courses: 0,
          },
        },
        { $sort: { name: 1 } },
      ]);
    } else {
      departments = await Department.find(query)
        .populate("headOfDepartment", "firstName lastName")
        .sort({ name: 1 });
    }

    res.status(200).json({
      success: true,
      data: departments,
    });
  } catch (error) {
    console.error("Get departments by branch error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during department retrieval",
    });
  }
};

// @desc    Get department statistics
// @route   GET /api/departments/statistics
// @access  Private (SuperAdmin, BranchAdmin, Teacher, Secretary)
const getDepartmentStatistics = async (req, res) => {
  try {
    const { branchId } = req.query;

    // Build match condition
    const matchCondition = {};
    if (branchId) {
      matchCondition.branchId = mongoose.Types.ObjectId(branchId);
    }

    // If user is not superadmin, filter by their branch
    if (!req.user.roles.includes("superadmin")) {
      matchCondition.branchId = req.user.branchId;
    }

    const stats = await Department.aggregate([
      { $match: matchCondition },
      {
        $lookup: {
          from: "branches",
          localField: "branchId",
          foreignField: "_id",
          as: "branch",
        },
      },
      {
        $lookup: {
          from: "students",
          let: { departmentId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$departmentId", "$$departmentId"] },
              },
            },
          ],
          as: "students",
        },
      },
      {
        $lookup: {
          from: "courses",
          let: { departmentId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$departmentId", "$$departmentId"] },
              },
            },
          ],
          as: "courses",
        },
      },
      {
        $lookup: {
          from: "users",
          let: { departmentId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$departmentId", "$$departmentId"] },
                    { $in: ["$roles", ["teacher", "hod"]] },
                  ],
                },
              },
            },
          ],
          as: "staff",
        },
      },
      {
        $group: {
          _id: "$branchId",
          branchName: { $first: "$branch.name" },
          departmentCount: { $sum: 1 },
          studentCount: { $sum: { $size: "$students" } },
          courseCount: { $sum: { $size: "$courses" } },
          staffCount: { $sum: { $size: "$staff" } },
        },
      },
      {
        $project: {
          branchId: "$_id",
          branchName: 1,
          departmentCount: 1,
          studentCount: 1,
          courseCount: 1,
          staffCount: 1,
        },
      },
    ]);

    // Calculate totals
    const totalDepartments = stats.reduce(
      (sum, branch) => sum + branch.departmentCount,
      0
    );
    const totalStudents = stats.reduce(
      (sum, branch) => sum + branch.studentCount,
      0
    );
    const totalCourses = stats.reduce(
      (sum, branch) => sum + branch.courseCount,
      0
    );
    const totalStaff = stats.reduce(
      (sum, branch) => sum + branch.staffCount,
      0
    );

    // Count active departments
    const activeDepartments = await Department.countDocuments({
      ...matchCondition,
      isActive: true,
    });

    res.status(200).json({
      success: true,
      data: {
        totalDepartments,
        activeDepartments,
        totalStudents,
        totalCourses,
        totalStaff,
        departmentsByBranch: stats,
      },
    });
  } catch (error) {
    console.error("Get department statistics error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during statistics retrieval",
    });
  }
};

module.exports = {
  createDepartment,
  getDepartments,
  getDepartment,
  updateDepartment,
  deleteDepartment,
  getDepartmentsByBranch,
  getDepartmentStatistics,
};
