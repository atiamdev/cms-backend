const { validationResult } = require("express-validator");
const mongoose = require("mongoose");
const Class = require("../models/Class");
const Student = require("../models/Student");
const Teacher = require("../models/Teacher");
const Course = require("../models/Course");
const Branch = require("../models/Branch");
const { generateId } = require("../utils/helpers");
const {
  canAccessBranchResource,
  getBranchQueryFilter,
  canPerformBranchOperation,
  isSuperAdmin,
  hasAdminPrivileges,
} = require("../utils/accessControl");

// @desc    Create a new class
// @route   POST /api/classes
// @access  Private (Admin, Academic Head)
const createClass = async (req, res) => {
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
        message: "Access denied. Cannot create classes in this branch",
      });
    }

    const classData = {
      ...req.body,
      branchId: req.branchId,
    };

    // Validate academic term exists in branch
    const branch = await Branch.findById(req.branchId);
    if (!branch) {
      return res.status(404).json({
        success: false,
        message: "Branch not found",
      });
    }

    const academicTerm = branch.academicTerms.id(classData.academicTermId);
    if (!academicTerm) {
      return res.status(400).json({
        success: false,
        message: "Invalid academic term",
      });
    }

    // Check if class with same name and section already exists for this term
    const existingClass = await Class.findOne({
      branchId: req.branchId,
      name: classData.name,
      section: classData.section || "A",
      academicTermId: classData.academicTermId,
    });

    if (existingClass) {
      return res.status(400).json({
        success: false,
        message:
          "Class with this name and section already exists for this academic term",
      });
    }

    const newClass = await Class.create(classData);

    await newClass.populate([
      { path: "classTeacherId", select: "userId employeeId" },
      { path: "branchId", select: "name" },
    ]);

    res.status(201).json({
      success: true,
      message: "Class created successfully",
      class: newClass,
    });
  } catch (error) {
    console.error("Create class error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during class creation",
    });
  }
};

// @desc    Get all classes
// @route   GET /api/classes
// @access  Private (Admin, Teacher, Secretary)
const getClasses = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      grade,
      academicTermId,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
      isActive,
    } = req.query;

    const query = { branchId: req.branchId };

    // Filter by status (prioritize isActive over status for frontend compatibility)
    if (isActive !== undefined) {
      query.status = isActive === "true" ? "active" : "inactive";
    } else if (status) {
      query.status = status;
    }

    // Filter by grade
    if (grade) {
      query.grade = grade;
    }

    // Filter by academic term
    if (academicTermId) {
      query.academicTermId = academicTermId;
    }

    // Build aggregation pipeline for search
    const pipeline = [
      { $match: query },
      {
        $lookup: {
          from: "teachers",
          localField: "classTeacherId",
          foreignField: "_id",
          as: "classTeacherInfo",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "classTeacherInfo.userId",
          foreignField: "_id",
          as: "teacherUserInfo",
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
            { name: { $regex: search, $options: "i" } },
            { grade: { $regex: search, $options: "i" } },
            { section: { $regex: search, $options: "i" } },
            { "teacherUserInfo.firstName": { $regex: search, $options: "i" } },
            { "teacherUserInfo.lastName": { $regex: search, $options: "i" } },
            { "room.number": { $regex: search, $options: "i" } },
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
    const classes = await Class.aggregate(pipeline);

    // Format the classes to include teacherName and other computed fields
    const formattedClasses = classes.map((cls) => {
      const teacherUserInfo = cls.teacherUserInfo && cls.teacherUserInfo[0];
      const classTeacherInfo = cls.classTeacherInfo && cls.classTeacherInfo[0];

      return {
        ...cls,
        teacherName: teacherUserInfo
          ? `${teacherUserInfo.firstName} ${teacherUserInfo.lastName}`.trim()
          : null,
        studentCount: cls.students ? cls.students.length : 0,
        subjectCount: cls.subjects ? cls.subjects.length : 0,
        scheduleCount: cls.schedule ? cls.schedule.length : 0,
        isActive: cls.status === "active",
      };
    });

    // Get total count for pagination
    const totalCountPipeline = [...pipeline];
    totalCountPipeline.splice(-2); // Remove skip and limit stages
    totalCountPipeline.push({ $count: "total" });

    const countResult = await Class.aggregate(totalCountPipeline);
    const total = countResult.length > 0 ? countResult[0].total : 0;

    res.json({
      success: true,
      count: formattedClasses.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      classes: formattedClasses,
    });
  } catch (error) {
    console.error("Get classes error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching classes",
    });
  }
};

// @desc    Get single class
// @route   GET /api/classes/:id
// @access  Private (Admin, Teacher, Secretary)
const getClass = async (req, res) => {
  try {
    const { id } = req.params;

    const classData = await Class.findOne({
      _id: id,
      branchId: req.branchId,
    });

    if (!classData) {
      return res.status(404).json({
        success: false,
        message: "Class not found",
      });
    }

    // Return basic class data first, then try to populate if needed
    const response = {
      success: true,
      class: classData,
    };

    // Try to populate optional fields, but don't fail if they don't exist
    try {
      await classData.populate([
        { path: "branchId", select: "name" },
        {
          path: "classTeacherId",
          select: "userId employeeId",
        },
        {
          path: "subjects.courseId",
          select: "name code level",
        },
      ]);
    } catch (populationError) {
      console.warn(
        "Population failed, returning basic data:",
        populationError.message
      );
    }

    res.json(response);
  } catch (error) {
    console.error("Get class error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching class",
    });
  }
};

// @desc    Update class
// @route   PUT /api/classes/:id
// @access  Private (Admin, Academic Head)
const updateClass = async (req, res) => {
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
    delete updateData.branchId; // Prevent updating branch reference

    const classData = await Class.findOneAndUpdate(
      { _id: id, branchId: req.branchId },
      { ...updateData, updatedAt: Date.now() },
      { new: true, runValidators: true }
    ).populate([
      { path: "classTeacherId", select: "userId employeeId" },
      { path: "branchId", select: "name" },
      { path: "students.studentId", select: "userId studentId" },
    ]);

    if (!classData) {
      return res.status(404).json({
        success: false,
        message: "Class not found",
      });
    }

    res.json({
      success: true,
      message: "Class updated successfully",
      class: classData,
    });
  } catch (error) {
    console.error("Update class error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during class update",
    });
  }
};

// @desc    Delete class
// @route   DELETE /api/classes/:id
// @access  Private (Admin only)
const deleteClass = async (req, res) => {
  try {
    const { id } = req.params;

    const classData = await Class.findOne({ _id: id, branchId: req.branchId });

    if (!classData) {
      return res.status(404).json({
        success: false,
        message: "Class not found",
      });
    }

    // Check if class has active students
    const activeStudents = classData.students.filter(
      (student) => student.status === "active"
    );

    if (activeStudents.length > 0) {
      return res.status(400).json({
        success: false,
        message:
          "Cannot delete class with active students. Please transfer students first.",
      });
    }

    await Class.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "Class deleted successfully",
    });
  } catch (error) {
    console.error("Delete class error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during class deletion",
    });
  }
};

// @desc    Add student to class
// @route   POST /api/classes/:id/students
// @access  Private (Admin, Secretary)
const addStudentToClass = async (req, res) => {
  try {
    const { id } = req.params;
    const { studentId } = req.body;

    const classData = await Class.findOne({ _id: id, branchId: req.branchId });

    if (!classData) {
      return res.status(404).json({
        success: false,
        message: "Class not found",
      });
    }

    // Verify student exists and belongs to same branch
    const student = await Student.findOne({
      _id: studentId,
      branchId: req.branchId,
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    await classData.addStudent(studentId);

    // Update student's current class
    student.currentClassId = id;
    await student.save();

    res.json({
      success: true,
      message: "Student added to class successfully",
      class: classData,
    });
  } catch (error) {
    console.error("Add student to class error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error while adding student to class",
    });
  }
};

// @desc    Remove student from class
// @route   DELETE /api/classes/:id/students/:studentId
// @access  Private (Admin, Secretary)
const removeStudentFromClass = async (req, res) => {
  try {
    const { id, studentId } = req.params;
    const { reason = "transferred" } = req.body;

    const classData = await Class.findOne({ _id: id, branchId: req.branchId });

    if (!classData) {
      return res.status(404).json({
        success: false,
        message: "Class not found",
      });
    }

    await classData.removeStudent(studentId, reason);

    // Update student's current class if removing from current class
    const student = await Student.findOne({
      _id: studentId,
      branchId: req.branchId,
    });
    if (student && student.currentClassId?.toString() === id) {
      student.currentClassId = null;
      await student.save();
    }

    res.json({
      success: true,
      message: "Student removed from class successfully",
      class: classData,
    });
  } catch (error) {
    console.error("Remove student from class error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while removing student from class",
    });
  }
};

// @desc    Add subject to class
// @route   POST /api/classes/:id/subjects
// @access  Private (Admin, Academic Head)
const addSubjectToClass = async (req, res) => {
  try {
    const { id } = req.params;
    const subjectData = req.body;

    const classData = await Class.findOne({ _id: id, branchId: req.branchId });

    if (!classData) {
      return res.status(404).json({
        success: false,
        message: "Class not found",
      });
    }

    // Verify course exists
    const course = await Course.findOne({
      _id: subjectData.courseId,
      branchId: req.branchId,
    });

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    await classData.addSubject(subjectData);

    res.json({
      success: true,
      message: "Subject added to class successfully",
      class: classData,
    });
  } catch (error) {
    console.error("Add subject to class error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error while adding subject to class",
    });
  }
};

// @desc    Assign teacher to subject
// @route   POST /api/classes/:id/subjects/:subjectName/assign-teacher
// @access  Private (Admin, Academic Head)
const assignTeacherToSubject = async (req, res) => {
  try {
    const { id, subjectName } = req.params;
    const { teacherId } = req.body;

    const classData = await Class.findOne({ _id: id, branchId: req.branchId });

    if (!classData) {
      return res.status(404).json({
        success: false,
        message: "Class not found",
      });
    }

    // Verify teacher exists
    const teacher = await Teacher.findOne({
      _id: teacherId,
      branchId: req.branchId,
    });

    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: "Teacher not found",
      });
    }

    await classData.assignTeacherToSubject(subjectName, teacherId);

    res.json({
      success: true,
      message: "Teacher assigned to subject successfully",
      class: classData,
    });
  } catch (error) {
    console.error("Assign teacher to subject error:", error);
    res.status(500).json({
      success: false,
      message:
        error.message || "Server error while assigning teacher to subject",
    });
  }
};

// @desc    Set class teacher
// @route   PUT /api/classes/:id/class-teacher
// @access  Private (Admin, Academic Head)
const setClassTeacher = async (req, res) => {
  try {
    const { id } = req.params;
    const { teacherId } = req.body;

    const classData = await Class.findOne({ _id: id, branchId: req.branchId });

    if (!classData) {
      return res.status(404).json({
        success: false,
        message: "Class not found",
      });
    }

    // Verify teacher exists
    if (teacherId) {
      const teacher = await Teacher.findOne({
        _id: teacherId,
        branchId: req.branchId,
      });

      if (!teacher) {
        return res.status(404).json({
          success: false,
          message: "Teacher not found",
        });
      }
    }

    await classData.setClassTeacher(teacherId);

    res.json({
      success: true,
      message: "Class teacher set successfully",
      class: classData,
    });
  } catch (error) {
    console.error("Set class teacher error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while setting class teacher",
    });
  }
};

// @desc    Add period to class schedule
// @route   POST /api/classes/:id/schedule/periods
// @access  Private (Admin, Academic Head)
const addPeriodToSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const periodData = req.body;

    const classData = await Class.findOne({ _id: id, branchId: req.branchId });

    if (!classData) {
      return res.status(404).json({
        success: false,
        message: "Class not found",
      });
    }

    // Verify teacher exists if provided
    if (periodData.teacherId) {
      const teacher = await Teacher.findOne({
        _id: periodData.teacherId,
        branchId: req.branchId,
      });

      if (!teacher) {
        return res.status(404).json({
          success: false,
          message: "Teacher not found",
        });
      }
    }

    await classData.addPeriod(periodData);

    res.json({
      success: true,
      message: "Period added to schedule successfully",
      class: classData,
    });
  } catch (error) {
    console.error("Add period to schedule error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while adding period to schedule",
    });
  }
};

// @desc    Update period in class schedule
// @route   PUT /api/classes/:id/schedule/periods/:periodIndex
// @access  Private (Admin, Secretary)
const updatePeriodInSchedule = async (req, res) => {
  try {
    const { id, periodIndex } = req.params;
    const periodData = req.body;

    const classData = await Class.findOne({ _id: id, branchId: req.branchId });

    if (!classData) {
      return res.status(404).json({
        success: false,
        message: "Class not found",
      });
    }

    // Verify teacher exists if provided
    if (periodData.teacherId) {
      const teacher = await Teacher.findOne({
        _id: periodData.teacherId,
        branchId: req.branchId,
      });

      if (!teacher) {
        return res.status(404).json({
          success: false,
          message: "Teacher not found",
        });
      }
    }

    await classData.updatePeriod(parseInt(periodIndex), periodData);

    res.json({
      success: true,
      message: "Period updated successfully",
      class: classData,
    });
  } catch (error) {
    console.error("Update period error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error while updating period",
    });
  }
};

// @desc    Delete period from class schedule
// @route   DELETE /api/classes/:id/schedule/periods/:periodIndex
// @access  Private (Admin, Secretary)
const deletePeriodFromSchedule = async (req, res) => {
  try {
    const { id, periodIndex } = req.params;

    const classData = await Class.findOne({ _id: id, branchId: req.branchId });

    if (!classData) {
      return res.status(404).json({
        success: false,
        message: "Class not found",
      });
    }

    await classData.deletePeriod(parseInt(periodIndex));

    res.json({
      success: true,
      message: "Period deleted successfully",
      class: classData,
    });
  } catch (error) {
    console.error("Delete period error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error while deleting period",
    });
  }
};

// @desc    Get classes by academic term
// @route   GET /api/classes/term/:termId
// @access  Private (Admin, Teacher, Secretary)
const getClassesByTerm = async (req, res) => {
  try {
    const { termId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const classes = await Class.findByBranch(req.branchId, {
      academicTermId: termId,
      status: "active",
    })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ grade: 1, section: 1 });

    const total = await Class.countDocuments({
      branchId: req.branchId,
      academicTermId: termId,
      status: "active",
    });

    res.json({
      success: true,
      count: classes.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      classes,
    });
  } catch (error) {
    console.error("Get classes by term error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching classes by term",
    });
  }
};

// @desc    Get class statistics
// @route   GET /api/classes/statistics
// @access  Private (Admin, Secretary)
const getClassStatistics = async (req, res) => {
  try {
    const [totalClasses, activeClasses, classByGrade, classStats] =
      await Promise.all([
        Class.countDocuments({ branchId: req.branchId }),
        Class.countDocuments({ branchId: req.branchId, status: "active" }),
        Class.aggregate([
          { $match: { branchId: new mongoose.Types.ObjectId(req.branchId) } },
          { $group: { _id: "$grade", count: { $sum: 1 } } },
        ]),
        Class.getStatistics(req.branchId),
      ]);

    res.json({
      success: true,
      statistics: {
        totalClasses,
        activeClasses,
        totalCapacity: classStats[0]?.totalCapacity || 0,
        totalEnrolled: classStats[0]?.totalEnrolled || 0,
        availableSeats:
          (classStats[0]?.totalCapacity || 0) -
          (classStats[0]?.totalEnrolled || 0),
        gradeDistribution: classByGrade.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
      },
    });
  } catch (error) {
    console.error("Get class statistics error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching class statistics",
    });
  }
};

module.exports = {
  createClass,
  getClasses,
  getClass,
  updateClass,
  deleteClass,
  addStudentToClass,
  removeStudentFromClass,
  addSubjectToClass,
  assignTeacherToSubject,
  setClassTeacher,
  addPeriodToSchedule,
  updatePeriodInSchedule,
  deletePeriodFromSchedule,
  getClassesByTerm,
  getClassStatistics,
};
