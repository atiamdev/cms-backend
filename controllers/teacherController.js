const { validationResult } = require("express-validator");
const Teacher = require("../models/Teacher");
const User = require("../models/User");
const Branch = require("../models/Branch");
const { generateId } = require("../utils/helpers");
const {
  canAccessBranchResource,
  getBranchQueryFilter,
  canPerformBranchOperation,
  isSuperAdmin,
  hasAdminPrivileges,
} = require("../utils/accessControl");

// @desc    Create a new teacher
// @route   POST /api/teachers
// @access  Private (Admin, Secretary)
const createTeacher = async (req, res) => {
  let createdUser = null;
  let existingUser = null;

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
        message: "Access denied. Cannot create teachers in this branch",
      });
    }

    const {
      // User data
      email,
      password,
      firstName,
      lastName,
      profileDetails,
      // Teacher specific data
      joiningDate,
      employmentType,
      department,
      designation,
      qualification,
      subjects,
      salary,
      emergencyContact,
      bankDetails,
    } = req.body;

    // Check if user with email already exists
    existingUser = await User.findOne({ email });

    // If user exists, check if they already have a teacher record
    if (existingUser) {
      const existingTeacher = await Teacher.findOne({
        userId: existingUser._id,
      });
      if (existingTeacher) {
        return res.status(400).json({
          success: false,
          message: "Teacher with this email already exists",
        });
      }

      // Check if user belongs to the same branch
      if (existingUser.branchId.toString() !== req.branchId.toString()) {
        return res.status(400).json({
          success: false,
          message: "User with this email exists in a different branch",
        });
      }

      // Check if user has teacher role
      if (!existingUser.roles.includes("teacher")) {
        // Add teacher role to existing user
        existingUser.roles.push("teacher");
        await existingUser.save();
      }
    }

    // Get branch configuration for employee ID generation
    const branch = await Branch.findById(req.branchId);
    if (!branch) {
      return res.status(404).json({
        success: false,
        message: "Branch not found",
      });
    }

    // Generate unique employee ID with retry logic
    let employeeId;
    let attempts = 0;
    const maxAttempts = 5;

    do {
      const employeeIdPrefix = branch.configuration.teacherIdPrefix || "TCH";
      employeeId = generateId(employeeIdPrefix, 6);

      const existingTeacher = await Teacher.findOne({
        employeeId,
        branchId: req.branchId,
      });

      if (!existingTeacher) {
        break; // Found unique ID
      }

      attempts++;
    } while (attempts < maxAttempts);

    if (attempts >= maxAttempts) {
      return res.status(500).json({
        success: false,
        message: "Unable to generate unique employee ID. Please try again.",
      });
    }

    // Prepare profile details, handling address field
    let processedProfileDetails = { ...profileDetails };
    if (typeof processedProfileDetails.address === "string") {
      // If address is a string, assume it's the street address
      processedProfileDetails.address = {
        street: processedProfileDetails.address,
        city: "",
        state: "",
        zipCode: "",
        country: "Kenya",
      };
    }

    // Create user account first (if not exists)
    if (!existingUser) {
      const crypto = require("crypto");
      const verificationToken = crypto.randomBytes(32).toString("hex");

      createdUser = await User.create({
        email,
        password,
        firstName,
        lastName,
        roles: ["teacher"],
        branchId: req.branchId,
        profileDetails: {
          ...processedProfileDetails,
          employeeId,
          joiningDate,
          department,
          designation,
        },
        emailVerified: false,
        emailVerificationToken: verificationToken,
      });

      // Send verification email instead of welcome email
      try {
        const { sendEmail, emailTemplates } = require("../utils/emailService");
        const baseUrl = process.env.CMS_FRONTEND_URL || "http://localhost:3000";
        const verificationUrl = `${baseUrl}/verify-email?token=${verificationToken}`;

        await sendEmail({
          to: createdUser.email,
          ...emailTemplates.emailVerification(
            `${createdUser.firstName} ${createdUser.lastName}`,
            verificationUrl
          ),
        });
        console.log(
          `Verification email sent successfully to teacher: ${createdUser.email}`
        );
      } catch (emailError) {
        console.error("Teacher verification email sending failed:", emailError);
        // Don't fail registration if email fails
      }
    } else {
      // Use existing user and update profile details
      createdUser = existingUser;
      createdUser.profileDetails = {
        ...createdUser.profileDetails,
        ...processedProfileDetails,
        employeeId,
        joiningDate,
        department,
        designation,
      };
      await createdUser.save();
    }

    // Create teacher record
    const teacher = await Teacher.create({
      userId: createdUser._id,
      branchId: req.branchId,
      employeeId,
      joiningDate: joiningDate || new Date(),
      employmentType: employmentType || "full_time",
      department,
      designation,
      qualification: qualification || {
        education: [],
        certifications: [],
        experience: { totalYears: 0, previousPositions: [] },
      },
      subjects: subjects || [], // Will reference courses via courseId
      salary: {
        basicSalary: salary?.basicSalary || 0,
        allowances: salary?.allowances || [],
        deductions: salary?.deductions || [],
        paymentSchedule: salary?.paymentSchedule || "monthly",
      },
      emergencyContact,
      bankDetails,
    });

    // Populate teacher data
    await teacher.populate([
      { path: "userId", select: "firstName lastName email profileDetails" },
      { path: "branchId", select: "name" },
    ]);

    res.status(201).json({
      success: true,
      message:
        "Teacher created successfully. They will receive an email to verify their account.",
      teacher,
    });
  } catch (error) {
    console.error("Create teacher error:", error);

    // If teacher creation failed but user was created, clean up the user
    if (createdUser && !existingUser && error.name !== "ValidationError") {
      try {
        await User.findByIdAndDelete(createdUser._id);
        console.log("Cleaned up orphaned user after teacher creation failure");
      } catch (cleanupError) {
        console.error("Error cleaning up orphaned user:", cleanupError);
      }
    }

    if (error.code === 11000) {
      // Determine which field caused the duplicate key error
      let field = "email or employee ID";
      if (error.keyPattern?.email) {
        field = "email";
      } else if (error.keyPattern?.employeeId) {
        field = "employee ID";
      }

      return res.status(400).json({
        success: false,
        message: `Teacher with this ${field} already exists`,
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error during teacher creation",
    });
  }
};

// @desc    Get all teachers
// @route   GET /api/teachers
// @access  Private (Admin, Secretary, Teacher)
const getTeachers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      department,
      course,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
      branchId, // Allow superadmin to filter by specific branch
    } = req.query;

    // Apply branch-based filtering
    const branchFilter = getBranchQueryFilter(req.user, branchId);
    const query = { ...branchFilter };

    // Filter by employment status
    if (status) {
      query.employmentStatus = status;
    }

    // Filter by department
    if (department) {
      query.department = department;
    }

    // Filter by course
    if (course) {
      query["subjects.courseId"] = course;
    }

    // Build aggregation pipeline for search
    const pipeline = [
      { $match: query },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "userInfo",
          pipeline: [
            {
              $project: {
                firstName: 1,
                lastName: 1,
                email: 1,
                status: 1,
                profileDetails: 1,
                roles: 1,
                createdAt: 1,
                updatedAt: 1,
              },
            },
          ],
        },
      },
      { $unwind: "$userInfo" },
      {
        $lookup: {
          from: "branches",
          localField: "branchId",
          foreignField: "_id",
          as: "branchInfo",
        },
      },
    ];

    // Add search filter
    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { "userInfo.firstName": { $regex: search, $options: "i" } },
            { "userInfo.lastName": { $regex: search, $options: "i" } },
            { employeeId: { $regex: search, $options: "i" } },
            { department: { $regex: search, $options: "i" } },
            { designation: { $regex: search, $options: "i" } },
            { "userInfo.email": { $regex: search, $options: "i" } },
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

    // Execute aggregation
    const teachers = await Teacher.aggregate(pipeline);

    // Get total count for pagination
    const totalCountPipeline = [...pipeline];
    totalCountPipeline.splice(-2); // Remove skip and limit stages
    totalCountPipeline.push({ $count: "total" });

    const countResult = await Teacher.aggregate(totalCountPipeline);
    const total = countResult.length > 0 ? countResult[0].total : 0;

    res.json({
      success: true,
      count: teachers.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      teachers,
    });
  } catch (error) {
    console.error("Get teachers error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching teachers",
    });
  }
};

// @desc    Get single teacher
// @route   GET /api/teachers/:id
// @access  Private (Admin, Secretary, Teacher - own record)
const getTeacher = async (req, res) => {
  try {
    const { id } = req.params;

    const teacher = await Teacher.findOne({
      _id: id,
      branchId: req.branchId,
    }).populate([
      {
        path: "userId",
        select:
          "firstName lastName email status profileDetails roles createdAt updatedAt",
      },
      { path: "branchId", select: "name configuration" },
      {
        path: "classes.classId",
        select: "name capacity grade level academicTerm",
      },
      {
        path: "classes.courses",
        select: "name level category credits",
      },
      {
        path: "subjects.courseId",
        select: "name level category credits description",
      },
      {
        path: "performance.appraisals.appraisedBy",
        select: "firstName lastName",
      },
    ]);

    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: "Teacher not found",
      });
    }

    // Check if user can access this teacher record
    if (req.user.hasRole("teacher")) {
      if (teacher.userId._id.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "Access denied. You can only view your own record",
        });
      }
    }

    res.json({
      success: true,
      teacher,
    });
  } catch (error) {
    console.error("Get teacher error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching teacher",
    });
  }
};

// @desc    Get current teacher profile (for authenticated teacher)
// @route   GET /api/teachers/me
// @access  Private (Teacher)
const getMyProfile = async (req, res) => {
  try {
    const teacher = await Teacher.findOne({
      userId: req.user._id,
      branchId: req.branchId,
    }).populate([
      {
        path: "userId",
        select:
          "firstName lastName email status profileDetails roles createdAt updatedAt",
      },
      { path: "branchId", select: "name configuration" },
      { path: "department", select: "name code description" },
      {
        path: "classes.classId",
        select: "name capacity grade level academicTerm students",
      },
      {
        path: "classes.courses",
        select: "name level category credits",
      },
      {
        path: "subjects.courseId",
        select: "name level category credits description",
      },
      {
        path: "performance.appraisals.appraisedBy",
        select: "firstName lastName",
      },
    ]);

    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: "Teacher profile not found. Please contact administrator.",
      });
    }

    res.json({
      success: true,
      teacher,
    });
  } catch (error) {
    console.error("Get teacher profile error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching teacher profile",
    });
  }
};

// @desc    Get current teacher's classes
// @route   GET /api/teacher/classes
// @access  Private (Teacher)
const getMyClasses = async (req, res) => {
  try {
    const teacher = await Teacher.findOne({
      userId: req.user._id,
      branchId: req.branchId,
    }).populate([
      {
        path: "classes.classId",
        select: "name capacity grade level academicTerm students",
        populate: {
          path: "students",
          select: "firstName lastName rollNumber",
        },
      },
      {
        path: "classes.courses",
        select: "name level category credits",
      },
    ]);

    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: "Teacher profile not found. Please contact administrator.",
      });
    }

    // Extract just the classes data
    const classes = teacher.classes.map((classAssignment) => ({
      ...classAssignment.classId.toObject(),
      courses: classAssignment.courses,
      isClassTeacher: classAssignment.isClassTeacher,
    }));

    res.json({
      success: true,
      data: classes,
    });
  } catch (error) {
    console.error("Get teacher classes error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching teacher classes",
    });
  }
};

// @desc    Update teacher
// @route   PUT /api/teachers/:id
// @access  Private (Admin, Secretary)
const updateTeacher = async (req, res) => {
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
    const updateData = { ...req.body };
    delete updateData.userId; // Prevent updating user reference
    delete updateData.branchId; // Prevent updating branch reference
    delete updateData.employeeId; // Prevent updating employee ID
    const { profilePicture } = req.body; // Extract profilePicture separately

    const teacher = await Teacher.findOneAndUpdate(
      { _id: id, branchId: req.branchId },
      { ...updateData, updatedAt: Date.now() },
      { new: true, runValidators: true }
    ).populate([
      { path: "userId", select: "firstName lastName email profileDetails" },
      { path: "branchId", select: "name" },
      { path: "classes.classId", select: "name" },
    ]);

    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: "Teacher not found",
      });
    }

    // Update user profile if provided
    if (req.body.userProfile || profilePicture !== undefined) {
      const userUpdateData = {};

      // Handle core user fields
      if (req.body.userProfile?.firstName)
        userUpdateData.firstName = req.body.userProfile.firstName;
      if (req.body.userProfile?.lastName)
        userUpdateData.lastName = req.body.userProfile.lastName;
      if (req.body.userProfile?.email)
        userUpdateData.email = req.body.userProfile.email;

      // Handle profile details
      const profileDetailsUpdate = {};
      if (req.body.userProfile?.phone)
        profileDetailsUpdate.phone = req.body.userProfile.phone;
      if (req.body.userProfile?.dateOfBirth)
        profileDetailsUpdate.dateOfBirth = req.body.userProfile.dateOfBirth;
      if (req.body.userProfile?.gender)
        profileDetailsUpdate.gender = req.body.userProfile.gender;
      if (req.body.userProfile?.address)
        profileDetailsUpdate.address = req.body.userProfile.address;
      if (profilePicture !== undefined)
        profileDetailsUpdate.profilePicture = profilePicture;

      if (Object.keys(profileDetailsUpdate).length > 0) {
        userUpdateData.profileDetails = {
          ...teacher.userId.profileDetails,
          ...profileDetailsUpdate,
        };
      }

      if (Object.keys(userUpdateData).length > 0) {
        userUpdateData.updatedAt = Date.now();
        await User.findByIdAndUpdate(teacher.userId._id, userUpdateData);
      }
    }

    res.json({
      success: true,
      message: "Teacher updated successfully",
      teacher,
    });
  } catch (error) {
    console.error("Update teacher error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during teacher update",
    });
  }
};

// @desc    Delete teacher
// @route   DELETE /api/teachers/:id
// @access  Private (Admin only)
const deleteTeacher = async (req, res) => {
  try {
    const { id } = req.params;

    const teacher = await Teacher.findOne({ _id: id, branchId: req.branchId });

    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: "Teacher not found",
      });
    }

    // Check if teacher has active class assignments
    const activeAssignments = teacher.classes.filter(
      (cls) => !cls.endDate || cls.endDate > new Date()
    );

    if (activeAssignments.length > 0) {
      return res.status(400).json({
        success: false,
        message:
          "Cannot delete teacher with active class assignments. Please reassign classes first.",
      });
    }

    // Delete user account as well
    await User.findByIdAndDelete(teacher.userId);

    // Delete teacher record
    await Teacher.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "Teacher deleted successfully",
    });
  } catch (error) {
    console.error("Delete teacher error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during teacher deletion",
    });
  }
};

// @desc    Assign class to teacher
// @route   POST /api/teachers/:id/assign-class
// @access  Private (Admin, Secretary)
const assignClass = async (req, res) => {
  try {
    const { id } = req.params;
    const { classId, courses, isClassTeacher, academicTermId } = req.body;

    const teacher = await Teacher.findOne({ _id: id, branchId: req.branchId });

    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: "Teacher not found",
      });
    }

    await teacher.assignClass(classId, courses, isClassTeacher, academicTermId);

    res.json({
      success: true,
      message: "Class assigned successfully",
      teacher,
    });
  } catch (error) {
    console.error("Assign class error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while assigning class",
    });
  }
};

// @desc    Remove class assignment or specific course from class
// @route   DELETE /api/teachers/:id/remove-class/:classId
// @access  Private (Admin, Secretary)
const removeClassAssignment = async (req, res) => {
  try {
    const { id, classId } = req.params;
    const { courseId, academicTermId } = req.query;

    const teacher = await Teacher.findOne({ _id: id, branchId: req.branchId });

    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: "Teacher not found",
      });
    }

    if (courseId) {
      // Remove specific course from class assignment
      await teacher.removeCourseFromClass(classId, courseId, academicTermId);
      res.json({
        success: true,
        message: "Course removed from class assignment successfully",
        teacher,
      });
    } else {
      // Remove entire class assignment (legacy behavior)
      await teacher.removeClassAssignment(classId, academicTermId);
      res.json({
        success: true,
        message: "Class assignment removed successfully",
        teacher,
      });
    }
  } catch (error) {
    console.error("Remove class assignment error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while removing class assignment",
    });
  }
};

// @desc    Add performance appraisal
// @route   POST /api/teachers/:id/appraisals
// @access  Private (Admin only)
const addAppraisal = async (req, res) => {
  try {
    const { id } = req.params;
    const appraisalData = {
      ...req.body,
      appraisedBy: req.user._id,
    };

    const teacher = await Teacher.findOne({ _id: id, branchId: req.branchId });

    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: "Teacher not found",
      });
    }

    await teacher.addAppraisal(appraisalData);

    res.json({
      success: true,
      message: "Performance appraisal added successfully",
      teacher,
    });
  } catch (error) {
    console.error("Add appraisal error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while adding appraisal",
    });
  }
};

// @desc    Apply for leave
// @route   POST /api/teachers/:id/leave
// @access  Private (Admin, Secretary, Teacher - own record)
const applyLeave = async (req, res) => {
  try {
    const { id } = req.params;
    const leaveData = req.body;

    const teacher = await Teacher.findOne({ _id: id, branchId: req.branchId });

    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: "Teacher not found",
      });
    }

    // Check if teacher can apply for their own leave
    if (req.user.hasRole("teacher")) {
      if (teacher.userId.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "Access denied. You can only apply for your own leave",
        });
      }
    }

    await teacher.applyLeave(leaveData);

    res.json({
      success: true,
      message: "Leave application submitted successfully",
      teacher,
    });
  } catch (error) {
    console.error("Apply leave error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while applying for leave",
    });
  }
};

// @desc    Update leave status
// @route   PUT /api/teachers/:id/leave/:leaveId
// @access  Private (Admin only)
const updateLeaveStatus = async (req, res) => {
  try {
    const { id, leaveId } = req.params;
    const { status, remarks } = req.body;

    const teacher = await Teacher.findOne({ _id: id, branchId: req.branchId });

    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: "Teacher not found",
      });
    }

    await teacher.updateLeaveStatus(leaveId, status, req.user._id, remarks);

    res.json({
      success: true,
      message: "Leave status updated successfully",
      teacher,
    });
  } catch (error) {
    console.error("Update leave status error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating leave status",
    });
  }
};

// @desc    Update teacher attendance
// @route   PUT /api/teachers/:id/attendance
// @access  Private (Admin, Secretary)
const updateAttendance = async (req, res) => {
  try {
    const { id } = req.params;
    const attendanceData = req.body;

    const teacher = await Teacher.findOne({ _id: id, branchId: req.branchId });

    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: "Teacher not found",
      });
    }

    await teacher.updateAttendance(attendanceData);

    res.json({
      success: true,
      message: "Attendance updated successfully",
      teacher,
    });
  } catch (error) {
    console.error("Update attendance error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating attendance",
    });
  }
};

// @desc    Get teachers by department
// @route   GET /api/teachers/department/:department
// @access  Private (Admin, Secretary)
const getTeachersByDepartment = async (req, res) => {
  try {
    const { department } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const teachers = await Teacher.findByBranch(req.branchId, {
      department,
      status: "active",
    })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ "userInfo.firstName": 1 });

    const total = await Teacher.countDocuments({
      branchId: req.branchId,
      department,
      employmentStatus: "active",
    });

    res.json({
      success: true,
      count: teachers.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      teachers,
    });
  } catch (error) {
    console.error("Get teachers by department error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching teachers by department",
    });
  }
};

// @desc    Get teacher statistics
// @route   GET /api/teachers/statistics
// @access  Private (Admin, Secretary)
const getTeacherStatistics = async (req, res) => {
  try {
    const [totalTeachers, activeTeachers, statusCounts, departmentCounts] =
      await Promise.all([
        Teacher.countDocuments({ branchId: req.branchId }),
        Teacher.countDocuments({
          branchId: req.branchId,
          employmentStatus: "active",
        }),
        Teacher.getCountByStatus(req.branchId),
        Teacher.getCountByDepartment(req.branchId),
      ]);

    res.json({
      success: true,
      statistics: {
        totalTeachers,
        activeTeachers,
        statusCounts: statusCounts.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        departmentCounts: departmentCounts.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
      },
    });
  } catch (error) {
    console.error("Get teacher statistics error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching teacher statistics",
    });
  }
};

// @desc    Clean up orphaned user records (users without corresponding teacher records)
// @route   POST /api/teachers/cleanup-orphaned-users
// @access  Private (Admin only)
const cleanupOrphanedUsers = async (req, res) => {
  try {
    // Find all users with teacher role in this branch
    const teacherUsers = await User.find({
      branchId: req.branchId,
      roles: "teacher",
    });

    const orphanedUsers = [];

    // Check each user to see if they have a corresponding teacher record
    for (const user of teacherUsers) {
      const teacher = await Teacher.findOne({ userId: user._id });
      if (!teacher) {
        orphanedUsers.push(user);
      }
    }

    // Remove orphaned users
    if (orphanedUsers.length > 0) {
      const userIds = orphanedUsers.map((user) => user._id);
      await User.deleteMany({ _id: { $in: userIds } });
    }

    res.json({
      success: true,
      message: `Cleaned up ${orphanedUsers.length} orphaned user records`,
      cleanedUsers: orphanedUsers.map((user) => ({
        id: user._id,
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
      })),
    });
  } catch (error) {
    console.error("Cleanup orphaned users error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during cleanup",
    });
  }
};

module.exports = {
  createTeacher,
  getTeachers,
  getTeacher,
  updateTeacher,
  deleteTeacher,
  assignClass,
  removeClassAssignment,
  addAppraisal,
  applyLeave,
  updateLeaveStatus,
  updateAttendance,
  getTeachersByDepartment,
  getTeacherStatistics,
  cleanupOrphanedUsers,
  getMyProfile,
  getMyClasses,
};
