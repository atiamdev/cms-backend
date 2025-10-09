const Exam = require("../models/Exam");
const Grade = require("../models/Grade");
const Course = require("../models/Course");
const Student = require("../models/Student");
const Teacher = require("../models/Teacher");

// Helper function to get teacher ID from authenticated user
const { calculateGrade } = require("../utils/helpers");

const getTeacherId = async (userId, branchId) => {
  const teacher = await Teacher.findOne({
    userId: userId,
    branchId: branchId,
  });
  return teacher ? teacher._id : null;
};

// @desc    Create a new exam
// @route   POST /api/exams
// @access  Private (Teacher only)
exports.createExam = async (req, res) => {
  try {
    const {
      courseId,
      title,
      description,
      type,
      quizId,
      schedule,
      venue,
      maxMarks,
      weightage,
      instructions,
      gradeSubmissionDeadline,
    } = req.body;

    // Validate required fields
    if (!courseId || !title || !type || !schedule || !maxMarks || !weightage) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    // Validate exam type specific requirements
    if (type === "online" && !quizId) {
      return res.status(400).json({
        success: false,
        message: "Quiz ID is required for online exams",
      });
    }

    if (type === "physical" && !venue) {
      return res.status(400).json({
        success: false,
        message: "Venue is required for physical exams",
      });
    }

    if (type === "physical" && !gradeSubmissionDeadline) {
      return res.status(400).json({
        success: false,
        message: "Grade submission deadline is required for physical exams",
      });
    }

    // Find the teacher record for the authenticated user
    const teacherId = await getTeacherId(req.user._id, req.user.branchId);

    if (!teacherId) {
      return res.status(404).json({
        success: false,
        message: "Teacher profile not found",
      });
    }

    // Verify course exists and teacher has access
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Check if teacher is assigned to this course (you may need to implement course-teacher assignment)
    // For now, we'll allow any teacher to create exams for any course in their branch

    const exam = await Exam.create({
      branchId: req.user.branchId,
      courseId,
      teacherId,
      title,
      description,
      type,
      quizId: type === "online" ? quizId : undefined,
      schedule,
      venue: type === "physical" ? venue : undefined,
      maxMarks,
      weightage,
      instructions,
      gradeSubmissionDeadline:
        type === "physical" ? gradeSubmissionDeadline : undefined,
    });

    await exam.populate("courseId", "name code");
    await exam.populate("teacherId", "name");

    res.status(201).json({
      success: true,
      data: exam,
      message: "Exam created successfully",
    });
  } catch (error) {
    console.error("Create exam error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Get all exams for a course
// @route   GET /api/exams/course/:courseId
// @access  Private
exports.getExamsForCourse = async (req, res) => {
  try {
    const { courseId } = req.params;

    const exams = await Exam.getExamsForCourse(courseId);

    res.status(200).json({
      success: true,
      data: exams,
    });
  } catch (error) {
    console.error("Get exams for course error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Get exams for current teacher
// @route   GET /api/exams/teacher
// @access  Private (Teacher only)
exports.getTeacherExams = async (req, res) => {
  try {
    const teacherId = await getTeacherId(req.user._id, req.user.branchId);

    if (!teacherId) {
      return res.status(404).json({
        success: false,
        message: "Teacher profile not found",
      });
    }

    const exams = await Exam.getExamsForTeacher(teacherId);

    res.status(200).json({
      success: true,
      data: exams,
    });
  } catch (error) {
    console.error("Get teacher exams error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Update exam
// @route   PUT /api/exams/:id
// @access  Private (Teacher only)
exports.updateExam = async (req, res) => {
  try {
    const examId = req.params.id;
    const updateData = req.body;

    const teacherId = await getTeacherId(req.user._id, req.user.branchId);

    if (!teacherId) {
      return res.status(404).json({
        success: false,
        message: "Teacher profile not found",
      });
    }

    const exam = await Exam.findById(examId);

    if (!exam) {
      return res.status(404).json({
        success: false,
        message: "Exam not found",
      });
    }

    // Check if teacher owns this exam
    if (exam.teacherId.toString() !== teacherId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this exam",
      });
    }

    // Prevent updates if exam is completed or ongoing
    if (exam.status === "completed" || exam.status === "ongoing") {
      return res.status(400).json({
        success: false,
        message: "Cannot update exam that is already completed or ongoing",
      });
    }

    const updatedExam = await Exam.findByIdAndUpdate(examId, updateData, {
      new: true,
      runValidators: true,
    }).populate("courseId", "name code");

    res.status(200).json({
      success: true,
      data: updatedExam,
      message: "Exam updated successfully",
    });
  } catch (error) {
    console.error("Update exam error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Delete exam
// @route   DELETE /api/exams/:id
// @access  Private (Teacher only)
exports.deleteExam = async (req, res) => {
  try {
    const examId = req.params.id;

    const teacherId = await getTeacherId(req.user._id, req.user.branchId);

    if (!teacherId) {
      return res.status(404).json({
        success: false,
        message: "Teacher profile not found",
      });
    }

    const exam = await Exam.findById(examId);

    if (!exam) {
      return res.status(404).json({
        success: false,
        message: "Exam not found",
      });
    }

    // Check if teacher owns this exam
    if (exam.teacherId.toString() !== teacherId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this exam",
      });
    }

    // Prevent deletion if exam has grades
    const gradeCount = await Grade.countDocuments({ examId });
    if (gradeCount > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete exam that has grades submitted",
      });
    }

    await Exam.findByIdAndDelete(examId);

    res.status(200).json({
      success: true,
      message: "Exam deleted successfully",
    });
  } catch (error) {
    console.error("Delete exam error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Submit grades for physical exam
// @route   POST /api/exams/:examId/grades
// @access  Private (Teacher only)
exports.submitExamGrades = async (req, res) => {
  try {
    const { examId } = req.params;
    const { grades } = req.body; // Array of { studentId, marks, remarks }

    const teacherId = await getTeacherId(req.user._id, req.user.branchId);

    if (!teacherId) {
      return res.status(404).json({
        success: false,
        message: "Teacher profile not found",
      });
    }

    const exam = await Exam.findById(examId);

    if (!exam) {
      return res.status(404).json({
        success: false,
        message: "Exam not found",
      });
    }

    // Check if teacher owns this exam
    if (exam.teacherId.toString() !== teacherId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to submit grades for this exam",
      });
    }

    // Check if exam is physical
    if (exam.type !== "physical") {
      return res.status(400).json({
        success: false,
        message: "Grades can only be manually submitted for physical exams",
      });
    }

    // Validate grades array
    if (!grades || !Array.isArray(grades) || grades.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Grades array is required",
      });
    }

    const gradePromises = grades.map(async (gradeData) => {
      const { studentId, marks, remarks } = gradeData;

      // Validate marks
      if (marks < 0 || marks > exam.maxMarks) {
        throw new Error(`Invalid marks for student ${studentId}`);
      }

      // Calculate percentage and grade
      const percentage = (marks / exam.maxMarks) * 100;
      const grade = calculateGrade(percentage);

      // Check if grade already exists
      const existingGrade = await Grade.findOne({ examId, studentId });

      if (existingGrade) {
        // Update existing grade
        existingGrade.marks = marks;
        existingGrade.percentage = percentage;
        existingGrade.grade = grade;
        existingGrade.remarks = remarks;
        existingGrade.submittedBy = req.user._id;
        return existingGrade.save();
      } else {
        // Create new grade
        return Grade.create({
          branchId: exam.branchId,
          examId,
          studentId,
          courseId: exam.courseId,
          marks,
          maxMarks: exam.maxMarks,
          percentage,
          grade,
          remarks,
          submittedBy: req.user._id,
        });
      }
    });

    await Promise.all(gradePromises);

    // Update exam status to completed if all students have grades
    const totalStudents = await Student.countDocuments({
      branchId: exam.branchId,
      courses: exam.courseId,
    });

    const submittedGrades = await Grade.countDocuments({ examId });

    if (submittedGrades >= totalStudents) {
      exam.status = "completed";
      await exam.save();
    }

    res.status(200).json({
      success: true,
      message: "Grades submitted successfully",
    });
  } catch (error) {
    console.error("Submit exam grades error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};

// @desc    Get grades for an exam
// @route   GET /api/exams/:examId/grades
// @access  Private (Teacher only)
exports.getExamGrades = async (req, res) => {
  try {
    const { examId } = req.params;

    const teacherId = await getTeacherId(req.user._id, req.user.branchId);

    if (!teacherId) {
      return res.status(404).json({
        success: false,
        message: "Teacher profile not found",
      });
    }

    const exam = await Exam.findById(examId);

    if (!exam) {
      return res.status(404).json({
        success: false,
        message: "Exam not found",
      });
    }

    // Check if teacher owns this exam
    if (exam.teacherId.toString() !== teacherId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view grades for this exam",
      });
    }

    const grades = await Grade.getExamGrades(examId);

    res.status(200).json({
      success: true,
      data: grades,
    });
  } catch (error) {
    console.error("Get exam grades error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Get student grades for a course
// @route   GET /api/grades/course/:courseId
// @access  Private (Student only)
exports.getStudentGradesForCourse = async (req, res) => {
  try {
    const { courseId } = req.params;

    // Find student record for current user
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    const grades = await Grade.getStudentGradesForCourse(student._id, courseId);
    const overallGrade = await Grade.calculateOverallGrade(
      student._id,
      courseId
    );

    res.status(200).json({
      success: true,
      data: {
        grades,
        overallGrade,
      },
    });
  } catch (error) {
    console.error("Get student grades error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Publish grades for an exam
// @route   PUT /api/exams/:examId/publish-grades
// @access  Private (Teacher only)
exports.publishExamGrades = async (req, res) => {
  try {
    const { examId } = req.params;

    const teacherId = await getTeacherId(req.user._id, req.user.branchId);

    if (!teacherId) {
      return res.status(404).json({
        success: false,
        message: "Teacher profile not found",
      });
    }

    const exam = await Exam.findById(examId);

    if (!exam) {
      return res.status(404).json({
        success: false,
        message: "Exam not found",
      });
    }

    // Check if teacher owns this exam
    if (exam.teacherId.toString() !== teacherId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to publish grades for this exam",
      });
    }

    // Update all grades for this exam to published status
    await Grade.updateMany(
      { examId, status: { $ne: "published" } },
      { status: "published" }
    );

    res.status(200).json({
      success: true,
      message: "Grades published successfully",
    });
  } catch (error) {
    console.error("Publish exam grades error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Get upcoming exams for student
// @route   GET /api/exams/student/upcoming
// @access  Private (Student only)
exports.getUpcomingExams = async (req, res) => {
  try {
    // Find the student record for the authenticated user
    const student = await Student.findOne({
      userId: req.user._id,
      branchId: req.user.branchId,
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    console.log("Student found:", student._id);
    console.log("Student courses:", student.courses);

    // Get current date for filtering upcoming exams
    const now = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(now.getDate() + 7); // Show exams for the next 7 days

    // Also show exams from the last 30 days for reference
    const lastMonth = new Date();
    lastMonth.setDate(now.getDate() - 30);

    // Set time to start/end of day for proper date range filtering
    const startOfLastMonth = new Date(
      lastMonth.getFullYear(),
      lastMonth.getMonth(),
      lastMonth.getDate()
    );
    const endOfNextWeek = new Date(
      nextWeek.getFullYear(),
      nextWeek.getMonth(),
      nextWeek.getDate(),
      23,
      59,
      59
    );

    // Find exams for courses the student is enrolled in
    const exams = await Exam.find({
      courseId: { $in: student.courses },
      "schedule.date": {
        $gte: startOfLastMonth,
        $lte: endOfNextWeek,
      },
      status: { $in: ["scheduled", "ongoing"] },
    })
      .populate("courseId", "name")
      .populate("teacherId", "name")
      .sort({ "schedule.date": 1 });
    console.log(
      "Exam details:",
      exams.map((exam) => ({
        id: exam._id,
        title: exam.title,
        courseId: exam.courseId,
        date: exam.schedule.date,
        status: exam.status,
      }))
    );

    res.status(200).json({
      success: true,
      data: exams,
    });
  } catch (error) {
    console.error("Get upcoming exams error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Get student grades for a specific course
// @route   GET /api/exams/course/:courseId/grades
// @access  Private (Student only)
exports.getStudentGradesForCourse = async (req, res) => {
  try {
    const { courseId } = req.params;

    // Find the student record for the authenticated user
    const student = await Student.findOne({
      userId: req.user._id,
      branchId: req.user.branchId,
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    // Verify student is enrolled in this course
    const isEnrolled = student.courses.some(
      (course) => course.toString() === courseId
    );
    if (!isEnrolled) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view grades for this course",
      });
    }

    // Get grades for this student and course
    const grades = await Grade.getStudentGradesForCourse(student._id, courseId);

    // Calculate overall grade for the course
    const overallGrade = await Grade.calculateOverallGrade(
      student._id,
      courseId
    );

    // Get course information
    const course = await Course.findById(courseId).select("name code");

    res.status(200).json({
      success: true,
      data: {
        course: course
          ? { id: course._id, name: course.name, code: course.code }
          : null,
        grades,
        overallGrade,
      },
    });
  } catch (error) {
    console.error("Get student grades for course error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
