const { validationResult } = require("express-validator");
const mongoose = require("mongoose");
const Student = require("../models/Student");
const User = require("../models/User");
const Branch = require("../models/Branch");
const { generateId, generateAdmissionNumber } = require("../utils/helpers");
const {
  canAccessBranchResource,
  getBranchQueryFilter,
  canPerformBranchOperation,
  isSuperAdmin,
  hasAdminPrivileges,
} = require("../utils/accessControl");

// @desc    Create a new student
// @route   POST /api/students
// @access  Private (Admin, Secretary)
const createStudent = async (req, res) => {
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
        message: "Access denied. Cannot create students in this branch",
      });
    }

    const {
      // User data
      email,
      password,
      firstName,
      lastName,
      profileDetails,
      // Student specific data
      currentClassId,
      enrollmentDate,
      photoUrl, // Add photo URL
      parentGuardianInfo,
      medicalInfo,
      specialNeeds,
      courses, // Add courses field
    } = req.body;

    // Check if user with email already exists
    existingUser = await User.findOne({ email });

    // If user exists, check if they already have a student record
    if (existingUser) {
      const existingStudent = await Student.findOne({
        userId: existingUser._id,
      });
      if (existingStudent) {
        return res.status(400).json({
          success: false,
          message: "Student with this email already exists",
        });
      }

      // Check if user belongs to the same branch
      if (existingUser.branchId.toString() !== req.branchId.toString()) {
        return res.status(400).json({
          success: false,
          message: "User with this email exists in a different branch",
        });
      }

      // Check if user has student role
      if (!existingUser.roles.includes("student")) {
        // Add student role to existing user
        existingUser.roles.push("student");
        await existingUser.save();
      }
    }

    // Get branch configuration for student ID generation
    const branch = await Branch.findById(req.branchId);
    if (!branch) {
      return res.status(404).json({
        success: false,
        message: "Branch not found",
      });
    }

    // Generate admission number
    let admissionNumber;
    try {
      admissionNumber = await generateAdmissionNumber(branch);
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }

    // Generate unique student ID with retry logic
    let studentId;
    let attempts = 0;
    const maxAttempts = 5;

    do {
      const studentIdPrefix = branch.configuration.studentIdPrefix || "STU";
      studentId = generateId(studentIdPrefix, 6);

      const existingStudent = await Student.findOne({
        studentId,
        branchId: req.branchId,
      });

      if (!existingStudent) {
        break; // Found unique ID
      }

      attempts++;
    } while (attempts < maxAttempts);

    if (attempts >= maxAttempts) {
      return res.status(500).json({
        success: false,
        message: "Unable to generate unique student ID. Please try again.",
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
        roles: ["student"],
        branchId: req.branchId,
        profileDetails: {
          ...processedProfileDetails,
          studentId,
          ...(photoUrl !== undefined && { profilePicture: photoUrl }), // Add profile picture if photo was uploaded
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
          `Verification email sent successfully to student: ${createdUser.email}`
        );
      } catch (emailError) {
        console.error("Student verification email sending failed:", emailError);
        // Don't fail registration if email fails
      }
    } else {
      // Use existing user and update profile details
      createdUser = existingUser;
      createdUser.profileDetails = {
        ...createdUser.profileDetails,
        ...processedProfileDetails,
        studentId,
        ...(photoUrl !== undefined && { profilePicture: photoUrl }), // Add profile picture if photo was uploaded
      };
      await createdUser.save();
    }

    // Create student record (without class assignment initially)
    const student = await Student.create({
      userId: createdUser._id,
      branchId: req.branchId,
      studentId,
      admissionNumber,
      // currentClassId will be set later when assigning to a class
      enrollmentDate: enrollmentDate || new Date(),
      photoUrl: photoUrl, // Add photo URL from upload
      parentGuardianInfo,
      medicalInfo,
      specialNeeds,
    });

    // If a class was specified, assign the student to it
    if (currentClassId) {
      await student.assignToClass(currentClassId);
    }

    // If courses were specified, assign them to the student
    if (courses && Array.isArray(courses) && courses.length > 0) {
      await student.assignCourses(courses);
    }

    // Populate student data
    await student.populate([
      { path: "userId", select: "firstName lastName email profileDetails" },
      { path: "currentClassId", select: "name" },
      { path: "branchId", select: "name" },
      { path: "courses", select: "name code" },
    ]);

    res.status(201).json({
      success: true,
      message:
        "Student created successfully. They will receive an email to verify their account.",
      student,
    });
  } catch (error) {
    console.error("Create student error:", error);

    // If student creation failed but user was created, clean up the user
    if (createdUser && !existingUser && error.name !== "ValidationError") {
      try {
        await User.findByIdAndDelete(createdUser._id);
        console.log("Cleaned up orphaned user after student creation failure");
      } catch (cleanupError) {
        console.error("Error cleaning up orphaned user:", cleanupError);
      }
    }

    if (error.code === 11000) {
      // Determine which field caused the duplicate key error
      let field = "email or student ID";
      if (error.keyPattern?.email) {
        field = "email";
      } else if (error.keyPattern?.studentId) {
        field = "student ID";
      }

      return res.status(400).json({
        success: false,
        message: `Student with this ${field} already exists`,
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error during student creation",
    });
  }
};

// @desc    Get all students
// @route   GET /api/students
// @access  Private (Admin, Teacher, Secretary)
const getStudents = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      classId,
      courseId,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
      branchId, // Allow superadmin to filter by specific branch
    } = req.query;

    console.log("getStudents called with courseId:", courseId);

    // Apply branch-based filtering
    const branchFilter = getBranchQueryFilter(req.user, branchId);
    const query = { ...branchFilter };

    // Filter by academic status
    if (status) {
      query.academicStatus = status;
    }

    // Filter by class
    if (classId) {
      query.currentClassId = classId;
    }

    // Filter by course enrollment
    if (courseId) {
      query.courses = { $in: [new mongoose.Types.ObjectId(courseId)] };
    }

    console.log("Final query:", JSON.stringify(query, null, 2));

    // Build aggregation pipeline for search
    const pipeline = [
      { $match: query },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "userInfo",
        },
      },
      { $unwind: "$userInfo" },
      {
        $lookup: {
          from: "classes",
          localField: "currentClassId",
          foreignField: "_id",
          as: "classInfo",
        },
      },
      {
        $lookup: {
          from: "courses",
          localField: "courses",
          foreignField: "_id",
          as: "coursesInfo",
        },
      },
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
            { studentId: { $regex: search, $options: "i" } },
            { admissionNumber: { $regex: search, $options: "i" } },
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
    const students = await Student.aggregate(pipeline);

    // Get total count for pagination
    const totalCountPipeline = [...pipeline];
    totalCountPipeline.splice(-2); // Remove skip and limit stages
    totalCountPipeline.push({ $count: "total" });

    const countResult = await Student.aggregate(totalCountPipeline);
    const total = countResult.length > 0 ? countResult[0].total : 0;

    res.json({
      success: true,
      count: students.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      students,
    });
  } catch (error) {
    console.error("Get students error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching students",
    });
  }
};

// @desc    Get current student profile
// @route   GET /api/students/me
// @access  Private (Student only)
const getCurrentStudent = async (req, res) => {
  try {
    const userId = req.user.id;

    // Find student by userId with full aggregation pipeline
    const pipeline = [
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "userInfo",
        },
      },
      {
        $lookup: {
          from: "classes",
          localField: "currentClassId",
          foreignField: "_id",
          as: "classInfo",
        },
      },
      {
        $lookup: {
          from: "branches",
          localField: "branchId",
          foreignField: "_id",
          as: "branchInfo",
        },
      },
      {
        $lookup: {
          from: "courses",
          localField: "courses",
          foreignField: "_id",
          as: "coursesInfo",
        },
      },
      {
        $lookup: {
          from: "teachers",
          localField: "classInfo.schedule.periods.teacherId",
          foreignField: "_id",
          as: "scheduleTeachers",
        },
      },
      {
        $addFields: {
          userInfo: { $arrayElemAt: ["$userInfo", 0] },
          classInfo: { $arrayElemAt: ["$classInfo", 0] },
          branchInfo: { $arrayElemAt: ["$branchInfo", 0] },
          fees: {
            totalFeeStructure: { $ifNull: ["$fees.totalFeeStructure", 0] },
            totalPaid: { $ifNull: ["$fees.totalPaid", 0] },
            totalBalance: {
              $subtract: [
                { $ifNull: ["$fees.totalFeeStructure", 0] },
                { $ifNull: ["$fees.totalPaid", 0] },
              ],
            },
            feeStatus: { $ifNull: ["$fees.feeStatus", "pending"] },
            scholarshipApplied: {
              $ifNull: ["$fees.scholarshipApplied", false],
            },
            scholarshipAmount: { $ifNull: ["$fees.scholarshipAmount", 0] },
          },
          schedule: {
            $ifNull: ["$classInfo.schedule", null],
          },
        },
      },
      {
        $project: {
          userInfo: {
            firstName: "$userInfo.firstName",
            lastName: "$userInfo.lastName",
            email: "$userInfo.email",
            profileDetails: "$userInfo.profileDetails",
          },
          studentId: 1,
          admissionNumber: 1,
          currentClassId: 1,
          courses: 1,
          enrollmentDate: 1,
          academicStatus: 1,
          academicRecords: 1,
          parentGuardianInfo: 1,
          photoUrl: 1,
          isActive: 1,
          classInfo: 1,
          branchInfo: 1,
          coursesInfo: 1,
          schedule: 1,
          scheduleTeachers: 1,
          fees: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    ];

    const result = await Student.aggregate(pipeline);

    if (!result || result.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    res.json({
      success: true,
      student: result[0],
    });
  } catch (error) {
    console.error("Get current student error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching student profile",
    });
  }
};

// @desc    Get single student
// @route   GET /api/students/:id
// @access  Private (Admin, Teacher, Secretary, Student - own record)
const getStudent = async (req, res) => {
  try {
    const { id } = req.params;

    const student = await Student.findOne({
      _id: id,
      branchId: req.branchId,
    }).populate([
      { path: "userId", select: "firstName lastName email profileDetails" },
      { path: "currentClassId", select: "name capacity" },
      { path: "branchId", select: "name configuration" },
      {
        path: "academicRecords.subjects.teacherId",
        select: "firstName lastName",
      },
    ]);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    // Check if user can access this student record
    if (req.user.hasRole("student")) {
      if (student.userId._id.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "Access denied. You can only view your own record",
        });
      }
    }

    res.json({
      success: true,
      student,
    });
  } catch (error) {
    console.error("Get student error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching student",
    });
  }
};

// @desc    Update student
// @route   PUT /api/students/:id
// @access  Private (Admin, Secretary)
const updateStudent = async (req, res) => {
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
    const { courses, photoUrl } = req.body; // Extract courses and photoUrl before removing them
    delete updateData.userId; // Prevent updating user reference
    delete updateData.branchId; // Prevent updating branch reference
    delete updateData.studentId; // Prevent updating student ID
    delete updateData.courses; // Handle courses separately
    delete updateData.photoUrl; // Handle photo URL separately

    // First get the current student to track status changes
    const currentStudent = await Student.findOne({
      _id: id,
      branchId: req.branchId,
    });
    if (!currentStudent) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    const oldStatus = currentStudent.academicStatus;
    const newStatus = updateData.academicStatus;

    const student = await Student.findOneAndUpdate(
      { _id: id, branchId: req.branchId },
      {
        ...updateData,
        ...(photoUrl !== undefined && { photoUrl }),
        updatedAt: Date.now(),
      },
      { new: true, runValidators: true }
    ).populate([
      { path: "userId", select: "firstName lastName email profileDetails" },
      { path: "currentClassId", select: "name" },
      { path: "branchId", select: "name" },
      { path: "courses", select: "name code" },
    ]);

    // Handle course assignments if provided
    if (courses !== undefined) {
      if (Array.isArray(courses)) {
        await student.assignCourses(courses);
      } else {
        await student.assignCourses([]);
      }
      // Re-populate after course assignment
      await student.populate({ path: "courses", select: "name code" });
    }

    // Track status changes if academicStatus was updated
    if (newStatus && oldStatus !== newStatus) {
      if (!student.statusHistory) {
        student.statusHistory = [];
      }

      student.statusHistory.push({
        oldStatus,
        newStatus,
        changedBy: req.user._id,
        changedAt: new Date(),
        reason: `Status changed from ${oldStatus} to ${newStatus} via edit form`,
      });

      await student.save();

      // Log for audit purposes
      console.log(
        `Student ${student.studentId} status changed from ${oldStatus} to ${newStatus} by user ${req.user._id}`
      );
    }

    // Update user profile if provided
    if (
      req.body.profileDetails ||
      req.body.firstName ||
      req.body.lastName ||
      req.body.email ||
      photoUrl !== undefined
    ) {
      const userUpdateData = {};

      if (req.body.firstName) userUpdateData.firstName = req.body.firstName;
      if (req.body.lastName) userUpdateData.lastName = req.body.lastName;
      if (req.body.email) userUpdateData.email = req.body.email;

      if (req.body.profileDetails || photoUrl !== undefined) {
        userUpdateData.profileDetails = {
          ...student.userId.profileDetails,
          ...req.body.profileDetails,
          ...(photoUrl !== undefined && { profilePicture: photoUrl }), // Update profile picture if photo URL provided
        };
      }

      userUpdateData.updatedAt = Date.now();

      await User.findByIdAndUpdate(student.userId._id, userUpdateData);
    }

    res.json({
      success: true,
      message: "Student updated successfully",
      student,
    });
  } catch (error) {
    console.error("Update student error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during student update",
    });
  }
};

// @desc    Delete student
// @route   DELETE /api/students/:id
// @access  Private (Admin only)
const deleteStudent = async (req, res) => {
  try {
    const { id } = req.params;

    const student = await Student.findOne({ _id: id, branchId: req.branchId });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    // Delete user account as well
    await User.findByIdAndDelete(student.userId);

    // Delete student record
    await Student.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "Student deleted successfully",
    });
  } catch (error) {
    console.error("Delete student error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during student deletion",
    });
  }
};

// @desc    Add academic record to student
// @route   POST /api/students/:id/academic-records
// @access  Private (Admin, Teacher, Secretary)
const addAcademicRecord = async (req, res) => {
  try {
    const { id } = req.params;
    const { academicTermId, classId } = req.body;

    const student = await Student.findOne({ _id: id, branchId: req.branchId });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    await student.addAcademicRecord(academicTermId, classId);

    res.json({
      success: true,
      message: "Academic record added successfully",
      student,
    });
  } catch (error) {
    console.error("Add academic record error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while adding academic record",
    });
  }
};

// @desc    Add grade to student
// @route   POST /api/students/:id/grades
// @access  Private (Admin, Teacher)
const addGrade = async (req, res) => {
  try {
    const { id } = req.params;
    const { academicTermId, subjectName, examType, score, maxScore, remarks } =
      req.body;

    const student = await Student.findOne({ _id: id, branchId: req.branchId });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    await student.addGrade(academicTermId, subjectName, {
      examType,
      score,
      maxScore,
      remarks,
      teacherId: req.user._id,
    });

    res.json({
      success: true,
      message: "Grade added successfully",
      student,
    });
  } catch (error) {
    console.error("Add grade error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while adding grade",
    });
  }
};

// @desc    Update student attendance
// @route   PUT /api/students/:id/attendance
// @access  Private (Admin, Teacher, Secretary)
const updateAttendance = async (req, res) => {
  try {
    const { id } = req.params;
    const { academicTermId, attendanceData } = req.body;

    const student = await Student.findOne({ _id: id, branchId: req.branchId });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    await student.updateAttendance(academicTermId, attendanceData);

    res.json({
      success: true,
      message: "Attendance updated successfully",
      student,
    });
  } catch (error) {
    console.error("Update attendance error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating attendance",
    });
  }
};

// @desc    Get students by class
// @route   GET /api/students/class/:classId
// @access  Private (Admin, Teacher, Secretary)
const getStudentsByClass = async (req, res) => {
  try {
    const { classId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const students = await Student.findByBranch(req.branchId, {
      classId,
      status: "active",
    })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ "userInfo.firstName": 1 });

    const total = await Student.countDocuments({
      branchId: req.branchId,
      currentClassId: classId,
      academicStatus: "active",
    });

    res.json({
      success: true,
      count: students.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      students,
    });
  } catch (error) {
    console.error("Get students by class error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching students by class",
    });
  }
};

// @desc    Get student statistics
// @route   GET /api/students/statistics
// @access  Private (Admin, Secretary)
const getStudentStatistics = async (req, res) => {
  try {
    const [totalStudents, activeStudents, statusCounts, classCounts] =
      await Promise.all([
        Student.countDocuments({ branchId: req.branchId }),
        Student.countDocuments({
          branchId: req.branchId,
          academicStatus: "active",
        }),
        Student.getCountByStatus(req.branchId),
        Student.aggregate([
          { $match: { branchId: new mongoose.Types.ObjectId(req.branchId) } },
          { $group: { _id: "$currentClassId", count: { $sum: 1 } } },
          {
            $lookup: {
              from: "classes",
              localField: "_id",
              foreignField: "_id",
              as: "classInfo",
            },
          },
          { $unwind: { path: "$classInfo", preserveNullAndEmptyArrays: true } },
        ]),
      ]);

    res.json({
      success: true,
      statistics: {
        totalStudents,
        activeStudents,
        statusCounts: statusCounts.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        classCounts: classCounts.map((item) => ({
          classId: item._id,
          className: item.classInfo?.name || "Unassigned",
          count: item.count,
        })),
      },
    });
  } catch (error) {
    console.error("Get student statistics error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching student statistics",
    });
  }
};

// @desc    Clean up orphaned user records (users without corresponding student records)
// @route   POST /api/students/cleanup-orphaned-users
// @access  Private (Admin only)
const cleanupOrphanedUsers = async (req, res) => {
  try {
    // Find all users with student role in this branch
    const studentUsers = await User.find({
      branchId: req.branchId,
      roles: "student",
    });

    const orphanedUsers = [];

    // Check each user to see if they have a corresponding student record
    for (const user of studentUsers) {
      const student = await Student.findOne({ userId: user._id });
      if (!student) {
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

// @desc    Assign student to a class
// @route   POST /api/students/:id/assign-class
// @access  Private (Admin, Secretary)
const assignStudentToClass = async (req, res) => {
  try {
    const { id } = req.params;
    const { classId, academicTermId } = req.body;

    const student = await Student.findOne({ _id: id, branchId: req.branchId });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    // Verify the class exists and belongs to the same branch
    const Class = require("../models/Class");
    const classExists = await Class.findOne({
      _id: classId,
      branchId: req.branchId,
    });

    if (!classExists) {
      return res.status(404).json({
        success: false,
        message: "Class not found or doesn't belong to this branch",
      });
    }

    await student.assignToClass(classId, academicTermId);

    await student.populate([
      { path: "userId", select: "firstName lastName email profileDetails" },
      { path: "currentClassId", select: "name section" },
      { path: "branchId", select: "name" },
    ]);

    res.json({
      success: true,
      message: "Student assigned to class successfully",
      student,
    });
  } catch (error) {
    console.error("Assign student to class error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while assigning student to class",
    });
  }
};

// @desc    Remove student from current class
// @route   DELETE /api/students/:id/remove-from-class
// @access  Private (Admin, Secretary)
const removeStudentFromClass = async (req, res) => {
  try {
    const { id } = req.params;

    const student = await Student.findOne({ _id: id, branchId: req.branchId });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    if (!student.currentClassId) {
      return res.status(400).json({
        success: false,
        message: "Student is not currently assigned to any class",
      });
    }

    await student.removeFromClass();

    await student.populate([
      { path: "userId", select: "firstName lastName email profileDetails" },
      { path: "branchId", select: "name" },
    ]);

    res.json({
      success: true,
      message: "Student removed from class successfully",
      student,
    });
  } catch (error) {
    console.error("Remove student from class error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while removing student from class",
    });
  }
};

// @desc    Record payment for student
// @route   POST /api/students/:id/payment
// @access  Private (Admin, Secretary)
const recordStudentPayment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation errors",
        errors: errors.array(),
      });
    }

    const { id: studentId } = req.params;
    const { amount, paymentMethod, referenceNumber, notes } = req.body;

    // Find the student and verify branch access
    const student = await Student.findOne({
      _id: studentId,
      branchId: req.user.branchId,
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    // Validate payment amount
    const currentBalance = student.fees?.totalBalance || 0;
    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Payment amount must be greater than 0",
      });
    }

    if (amount > currentBalance) {
      return res.status(400).json({
        success: false,
        message: "Payment amount cannot exceed outstanding balance",
      });
    }

    // Update student fee information
    const currentTotalPaid = student.fees?.totalPaid || 0;
    const newTotalPaid = currentTotalPaid + amount;
    const newBalance = currentBalance - amount;

    let newFeeStatus = "pending";
    if (newBalance === 0) {
      newFeeStatus = "paid";
    } else if (newTotalPaid > 0) {
      newFeeStatus = "partial";
    }

    // Update the student's fee information
    const updatedStudent = await Student.findByIdAndUpdate(
      studentId,
      {
        $set: {
          "fees.totalPaid": newTotalPaid,
          "fees.totalBalance": newBalance,
          "fees.feeStatus": newFeeStatus,
        },
        $push: {
          "fees.paymentHistory": {
            amount,
            paymentMethod,
            referenceNumber,
            paymentDate: new Date(),
            recordedBy: req.user._id,
            notes,
          },
        },
      },
      { new: true, runValidators: true }
    ).populate("userId", "firstName lastName email phone");

    // Log the payment activity
    console.log(
      `Payment recorded: ${amount} for student ${student.studentId} by ${req.user.firstName} ${req.user.lastName}`
    );

    res.status(200).json({
      success: true,
      message: "Payment recorded successfully",
      data: {
        student: updatedStudent,
        payment: {
          amount,
          paymentMethod,
          referenceNumber,
          paymentDate: new Date(),
          newBalance,
          newTotalPaid,
        },
      },
    });
  } catch (error) {
    console.error("Record student payment error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Get payment history for student
// @route   GET /api/students/:id/payments
// @access  Private (Admin, Secretary)
const getStudentPaymentHistory = async (req, res) => {
  try {
    const { id } = req.params;

    console.log("Getting payment history for student:", id);
    console.log(
      "User:",
      req.user.firstName,
      req.user.lastName,
      "Role:",
      req.user.roles
    );
    console.log("User branchId:", req.user.branchId);
    console.log("Request branchId:", req.branchId);

    // Find student with payment history (use branchId from middleware)
    const student = await Student.findOne({
      _id: id,
      branchId: req.branchId,
    })
      .populate([
        { path: "userId", select: "firstName lastName email profileDetails" },
        { path: "currentClassId", select: "name capacity" },
        { path: "branchId", select: "name configuration" },
      ])
      .select("studentId fees userId currentClassId branchId createdAt");

    console.log("Found student:", student ? student.studentId : "Not found");

    if (student) {
      console.log("Student fees data:", JSON.stringify(student.fees, null, 2));
      console.log(
        "Payment history length:",
        student.fees?.paymentHistory?.length || 0
      );
    }

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found or access denied",
      });
    }

    // Extract and format payment history
    const paymentHistory = student.fees?.paymentHistory || [];
    const sortedPayments = paymentHistory.sort(
      (a, b) => new Date(b.paymentDate) - new Date(a.paymentDate)
    );

    // Calculate fee summary
    const feeSummary = {
      totalFeeStructure: student.fees?.totalFeeStructure || 0,
      totalPaid: student.fees?.totalPaid || 0,
      totalBalance: student.fees?.totalBalance || 0,
      feeStatus: student.fees?.feeStatus || "pending",
      scholarshipAmount: student.fees?.scholarshipAmount || 0,
      lastPaymentDate:
        paymentHistory.length > 0
          ? paymentHistory[paymentHistory.length - 1].paymentDate
          : null,
      totalPayments: paymentHistory.length,
    };

    console.log("Calculated fee summary:", JSON.stringify(feeSummary, null, 2));

    res.json({
      success: true,
      data: {
        student: {
          _id: student._id,
          studentId: student.studentId,
          userInfo: student.userId,
          class: student.currentClassId,
          branch: student.branchId,
          enrollmentDate: student.createdAt,
        },
        feeSummary,
        paymentHistory: sortedPayments,
      },
    });
  } catch (error) {
    console.error("Get student payment history error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching payment history",
      error: error.message,
    });
  }
};

// @desc    Generate receipt for student payment history entry
// @route   GET /api/students/:id/payment-receipt/:reference
// @access  Private (Admin, Secretary, Student)
const generateStudentPaymentReceipt = async (req, res) => {
  try {
    const { id, reference } = req.params;

    console.log("Download receipt request:", {
      id,
      reference,
      userId: req.user._id,
      userRole: req.user.roles,
      branchId: req.branchId,
    });

    // Find student with payment history
    const student = await Student.findOne({
      _id: id,
      branchId: req.branchId,
    }).populate([
      { path: "userId", select: "firstName lastName email phone" },
      { path: "currentClassId", select: "name" },
      { path: "branchId", select: "name address phone email configuration" },
    ]);

    console.log(
      "Found student:",
      student
        ? {
            id: student._id,
            studentId: student.studentId,
            userId: student.userId?._id,
            branchId: student.branchId?._id,
            hasFees: !!student.fees,
            paymentHistoryLength: student.fees?.paymentHistory?.length || 0,
          }
        : "Not found"
    );

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found or access denied",
      });
    }

    // Check if user can access this receipt
    if (
      req.user.roles.includes("student") &&
      student.userId._id.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only download your own receipts",
      });
    }

    // Find the payment in history by reference number
    const paymentEntry = student.fees?.paymentHistory?.find(
      (payment) => payment.referenceNumber === reference
    );

    console.log(
      "Payment entry found:",
      paymentEntry
        ? {
            referenceNumber: paymentEntry.referenceNumber,
            amount: paymentEntry.amount,
            paymentDate: paymentEntry.paymentDate,
          }
        : "Not found"
    );

    if (!paymentEntry) {
      return res.status(404).json({
        success: false,
        message: "Payment record not found",
      });
    }

    // Generate a basic receipt URL (for now, we'll return a simple JSON receipt)
    // In a real implementation, you'd generate a PDF and store/serve it
    const receiptData = {
      receiptNumber: paymentEntry.referenceNumber,
      studentName: `${student.userId.firstName} ${student.userId.lastName}`,
      studentId: student.studentId,
      amount: paymentEntry.amount,
      paymentDate: paymentEntry.paymentDate,
      paymentMethod: paymentEntry.paymentMethod,
      notes: paymentEntry.notes,
      branchName: student.branchId.name,
    };

    res.json({
      success: true,
      data: {
        receiptUrl: `/api/students/${id}/payment-receipt/${reference}/download`,
        receipt: receiptData,
      },
    });
  } catch (error) {
    console.error("Generate student payment receipt error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate receipt",
    });
  }
};

// @desc    Download receipt PDF for student payment history entry
// @route   GET /api/students/:id/payment-receipt/:reference/download
// @access  Private (Admin, Secretary, Student)
const downloadStudentPaymentReceipt = async (req, res) => {
  try {
    const { id, reference } = req.params;

    console.log("Download receipt request:", {
      id,
      reference,
      userId: req.user._id,
      userRole: req.user.roles,
      branchId: req.branchId,
    });

    // For students, find their own record regardless of branch filtering
    let query = { _id: id };
    if (!req.user.roles.includes("student")) {
      // For non-students, apply branch filtering
      query.branchId = req.branchId;
    }

    // Find student with payment history
    const student = await Student.findOne(query).populate([
      { path: "userId", select: "firstName lastName email phone" },
      { path: "currentClassId", select: "name" },
      { path: "branchId", select: "name address phone email configuration" },
    ]);

    console.log(
      "Found student:",
      student
        ? {
            id: student._id,
            studentId: student.studentId,
            userId: student.userId?._id,
            branchId: student.branchId?._id,
            hasFees: !!student.fees,
            paymentHistoryLength: student.fees?.paymentHistory?.length || 0,
          }
        : "Not found"
    );

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found or access denied",
      });
    }

    // Check if user can access this receipt
    if (
      req.user.roles.includes("student") &&
      student.userId._id.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only download your own receipts",
      });
    }

    // Find the payment in history by reference number
    const paymentEntry = student.fees?.paymentHistory?.find(
      (payment) => payment.referenceNumber === reference
    );

    console.log(
      "Payment entry found:",
      paymentEntry
        ? {
            referenceNumber: paymentEntry.referenceNumber,
            amount: paymentEntry.amount,
            paymentDate: paymentEntry.paymentDate,
          }
        : "Not found"
    );

    if (!paymentEntry) {
      return res.status(404).json({
        success: false,
        message: "Payment record not found",
      });
    }

    // Import PDF generation library
    const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

    console.log("Starting PDF generation...");

    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 800]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    console.log("PDF document created, starting to draw content...");

    // Set up colors
    const black = rgb(0, 0, 0);
    const green = rgb(0, 0.6, 0); // Bright green (already good)
    const darkGreen = rgb(0, 0.4, 0); // Darker green tone
    const deepGreen = rgb(0, 0.2, 0);
    const gray = rgb(0.5, 0.5, 0.5);
    const lightGray = rgb(0.9, 0.9, 0.9);

    // College Header - with null checks
    const collegeName =
      `ATIAM COLLEGE - ${student.branchId?.name}` || "Educational Institution";
    page.drawText(collegeName, {
      x: 50,
      y: 770,
      size: 20,
      font: boldFont,
      color: green,
    });

    // College contact information
    let contactY = 750;
    if (
      student.branchId?.address &&
      typeof student.branchId.address === "string"
    ) {
      page.drawText(student.branchId.address, {
        x: 50,
        y: contactY,
        size: 10,
        font: font,
        color: black,
      });
      contactY -= 15;
    }

    const contactInfo = [];
    if (student.branchId?.phone && typeof student.branchId.phone === "string")
      contactInfo.push(`Tel: ${student.branchId.phone}`);
    if (student.branchId?.email && typeof student.branchId.email === "string")
      contactInfo.push(`Email: ${student.branchId.email}`);

    if (contactInfo.length > 0) {
      page.drawText(contactInfo.join(" | "), {
        x: 50,
        y: contactY,
        size: 10,
        font: font,
        color: black,
      });
    }

    // Receipt Title
    page.drawRectangle({
      x: 200,
      y: 680,
      width: 200,
      height: 30,
      color: green,
    });

    page.drawText("PAYMENT RECEIPT", {
      x: 220,
      y: 695,
      size: 16,
      font: boldFont,
      color: rgb(1, 1, 1),
    });

    // Receipt details box
    page.drawRectangle({
      x: 50,
      y: 620,
      width: 500,
      height: 60,
      borderColor: green,
      borderWidth: 1,
    });

    // Receipt number and date
    page.drawText("Receipt No:", {
      x: 60,
      y: 650,
      size: 12,
      font: boldFont,
      color: black,
    });

    page.drawText(paymentEntry.referenceNumber || "N/A", {
      x: 140,
      y: 650,
      size: 12,
      font: font,
      color: black,
    });

    page.drawText("Date:", {
      x: 350,
      y: 650,
      size: 12,
      font: boldFont,
      color: black,
    });

    // Safely format payment date
    let paymentDateString = "N/A";
    try {
      if (paymentEntry.paymentDate) {
        paymentDateString = new Date(
          paymentEntry.paymentDate
        ).toLocaleDateString();
      }
    } catch (error) {
      console.warn("Invalid payment date:", paymentEntry.paymentDate);
    }

    page.drawText(paymentDateString, {
      x: 390,
      y: 650,
      size: 12,
      font: font,
      color: black,
    });

    // Student Information Section
    page.drawText("STUDENT INFORMATION", {
      x: 50,
      y: 590,
      size: 14,
      font: boldFont,
      color: darkGreen,
    });

    page.drawLine({
      start: { x: 50, y: 585 },
      end: { x: 550, y: 585 },
      thickness: 1,
      color: green,
    });

    const studentName = student.userId
      ? `${student.userId.firstName || "Unknown"} ${
          student.userId.lastName || "Student"
        }`
      : "Unknown Student";
    const studentDetails = [
      { label: "Student Name:", value: studentName },
      { label: "Admission No:", value: student.admissionNumber || "N/A" },
      {
        label: "Class:",
        value: student.currentClassId?.name || "Not Assigned",
      },
      { label: "Email:", value: student.userId?.email || "N/A" },
    ];

    let studentY = 560;
    studentDetails.forEach((detail) => {
      page.drawText(detail.label, {
        x: 60,
        y: studentY,
        size: 11,
        font: boldFont,
        color: black,
      });

      page.drawText(detail.value, {
        x: 160,
        y: studentY,
        size: 11,
        font: font,
        color: black,
      });

      studentY -= 20;
    });

    // Payment Details Section
    page.drawText("PAYMENT DETAILS", {
      x: 50,
      y: 460,
      size: 14,
      font: boldFont,
      color: darkGreen,
    });

    page.drawLine({
      start: { x: 50, y: 455 },
      end: { x: 550, y: 455 },
      thickness: 1,
      color: green,
    });

    const paymentDetails = [
      {
        label: "Amount Paid:",
        value: `KSh ${
          typeof paymentEntry.amount === "number" && !isNaN(paymentEntry.amount)
            ? paymentEntry.amount.toLocaleString()
            : "0"
        }`,
      },
      {
        label: "Payment Method:",
        value: paymentEntry.paymentMethod?.toUpperCase() || "N/A",
      },
      { label: "Reference No:", value: paymentEntry.referenceNumber || "N/A" },
      {
        label: "Payment Date:",
        value: (() => {
          try {
            return paymentEntry.paymentDate
              ? new Date(paymentEntry.paymentDate).toLocaleDateString("en-KE", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "N/A";
          } catch (error) {
            console.warn(
              "Invalid payment date in details:",
              paymentEntry.paymentDate
            );
            return "N/A";
          }
        })(),
      },
    ];

    let paymentY = 430;
    paymentDetails.forEach((detail) => {
      page.drawText(detail.label, {
        x: 60,
        y: paymentY,
        size: 11,
        font: boldFont,
        color: black,
      });

      page.drawText(detail.value, {
        x: 180,
        y: paymentY,
        size: 11,
        font: font,
        color: black,
      });

      paymentY -= 20;
    });

    // Amount in a highlighted box
    page.drawRectangle({
      x: 350,
      y: 430,
      width: 180,
      height: 25,
      color: lightGray,
      borderColor: green,
      borderWidth: 1,
    });

    page.drawText("TOTAL AMOUNT:", {
      x: 360,
      y: 440,
      size: 12,
      font: boldFont,
      color: darkGreen,
    });

    page.drawText(
      `KSh ${
        typeof paymentEntry.amount === "number" && !isNaN(paymentEntry.amount)
          ? paymentEntry.amount.toLocaleString()
          : "0"
      }`,
      {
        x: 470,
        y: 440,
        size: 14,
        font: boldFont,
        color: rgb(0, 0.6, 0), // Green color for amount
      }
    );

    // Notes section if present
    if (paymentEntry.notes && typeof paymentEntry.notes === "string") {
      page.drawText("Notes:", {
        x: 60,
        y: 350,
        size: 11,
        font: boldFont,
        color: black,
      });

      page.drawText(paymentEntry.notes, {
        x: 110,
        y: 350,
        size: 10,
        font: font,
        color: gray,
        maxWidth: 400,
      });
    }

    // Footer
    page.drawLine({
      start: { x: 50, y: 120 },
      end: { x: 550, y: 120 },
      thickness: 1,
      color: gray,
    });

    page.drawText("Thank you for your payment!", {
      x: 50,
      y: 100,
      size: 12,
      font: boldFont,
      color: darkGreen,
    });

    page.drawText(
      `Generated on: ${new Date().toLocaleDateString("en-KE", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })}`,
      {
        x: 50,
        y: 80,
        size: 9,
        font: font,
        color: gray,
      }
    );

    page.drawText(
      "This is a computer-generated receipt and does not require a signature.",
      {
        x: 50,
        y: 65,
        size: 8,
        font: font,
        color: gray,
      }
    );

    page.drawText(
      `© ${new Date().getFullYear()} ${
        student.branchId.name || "Educational Institution"
      }. All rights reserved.`,
      {
        x: 50,
        y: 50,
        size: 8,
        font: font,
        color: gray,
      }
    );

    // Serialize the PDF
    const pdfBytes = await pdfDoc.save();

    console.log("PDF generated successfully, size:", pdfBytes.length, "bytes");

    // Set response headers for PDF download
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Receipt-${
        paymentEntry.referenceNumber || "UNKNOWN"
      }.pdf"`
    );
    res.setHeader("Content-Length", pdfBytes.length);

    // Send the PDF
    res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error("Download student payment receipt error:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({
      success: false,
      message: "Failed to download receipt",
      error: error.message,
    });
  }
};

const Course = require("../models/Course");

// @desc    Get course materials for enrolled student
// @route   GET /api/students/courses/:courseId/materials
// @access  Private (Student)
const getStudentCourseMaterials = async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.id;

    // Find student by userId
    const student = await Student.findOne({ userId }).populate("courses");
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    // Check if student is enrolled in this course
    const isEnrolled = student.courses.some(
      (course) => course._id.toString() === courseId
    );
    if (!isEnrolled) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You are not enrolled in this course",
      });
    }

    // Get the course with materials
    const course = await Course.findById(courseId).select(
      "name code resources.materials"
    );
    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    res.json({
      success: true,
      course: {
        id: course._id,
        name: course.name,
        code: course.code,
        materials: course.resources.materials || [],
      },
    });
  } catch (error) {
    console.error("Get student course materials error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching course materials",
    });
  }
};

module.exports = {
  createStudent,
  getStudents,
  getCurrentStudent,
  getStudent,
  updateStudent,
  deleteStudent,
  addAcademicRecord,
  addGrade,
  updateAttendance,
  getStudentsByClass,
  getStudentStatistics,
  cleanupOrphanedUsers,
  assignStudentToClass,
  removeStudentFromClass,
  recordStudentPayment,
  getStudentPaymentHistory,
  generateStudentPaymentReceipt,
  downloadStudentPaymentReceipt,
  getStudentCourseMaterials,
};
