const StudentApplication = require("../models/StudentApplication");
const Student = require("../models/Student");
const User = require("../models/User");
const Department = require("../models/Department");
const Course = require("../models/Course");
const Branch = require("../models/Branch");
const bcrypt = require("bcryptjs");

// @desc    Submit student application (public endpoint)
// @route   POST /api/applications
// @access  Public
const submitApplication = async (req, res) => {
  try {
    const {
      branchId,
      firstName,
      lastName,
      email,
      phone,
      dateOfBirth,
      gender,
      departmentId,
      courseId,
      previousEducation,
      previousInstitution,
      address,
      guardianName,
      guardianPhone,
      guardianEmail,
      guardianRelationship,
      message,
    } = req.body;

    // Validate required fields
    if (
      !branchId ||
      !firstName ||
      !lastName ||
      !email ||
      !phone ||
      !dateOfBirth ||
      !gender ||
      !departmentId ||
      !courseId
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields",
      });
    }

    // Check if branch exists
    const branch = await Branch.findById(branchId);
    if (!branch) {
      return res.status(404).json({
        success: false,
        message: "Branch not found",
      });
    }

    // Check if department exists and belongs to branch
    const department = await Department.findOne({
      _id: departmentId,
      branchId,
    });
    if (!department) {
      return res.status(404).json({
        success: false,
        message: "Department not found in this branch",
      });
    }

    // Check if course exists and belongs to department
    const course = await Course.findOne({ _id: courseId, departmentId });
    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found in this department",
      });
    }

    // Check if application already exists for this email in this branch
    const existingApplication = await StudentApplication.findOne({
      email: email.toLowerCase(),
      branchId,
      status: { $in: ["pending", "approved"] },
    });

    if (existingApplication) {
      return res.status(400).json({
        success: false,
        message:
          "An application with this email already exists for this branch",
      });
    }

    // Create application
    const application = await StudentApplication.create({
      branchId,
      firstName,
      lastName,
      email: email.toLowerCase(),
      phone,
      dateOfBirth,
      gender,
      departmentId,
      courseId,
      previousEducation,
      previousInstitution,
      address,
      guardianName,
      guardianPhone,
      guardianEmail: guardianEmail?.toLowerCase(),
      guardianRelationship,
      message,
    });

    res.status(201).json({
      success: true,
      message: "Application submitted successfully",
      data: {
        applicationNumber: application.applicationNumber,
        status: application.status,
      },
    });
  } catch (error) {
    console.error("Submit application error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to submit application",
      error: error.message,
    });
  }
};

// @desc    Get all applications for a branch
// @route   GET /api/applications
// @access  Private (Secretary, Admin)
const getApplications = async (req, res) => {
  try {
    const { status, departmentId, courseId, search } = req.query;
    const branchId = req.user.branchId;

    // Build query
    const query = { branchId };

    if (status) {
      query.status = status;
    }

    if (departmentId) {
      query.departmentId = departmentId;
    }

    if (courseId) {
      query.courseId = courseId;
    }

    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { applicationNumber: { $regex: search, $options: "i" } },
      ];
    }

    const applications = await StudentApplication.find(query)
      .populate("departmentId", "name")
      .populate("courseId", "name")
      .populate("reviewedBy", "firstName lastName")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: applications.length,
      data: applications,
    });
  } catch (error) {
    console.error("Get applications error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch applications",
      error: error.message,
    });
  }
};

// @desc    Get single application
// @route   GET /api/applications/:id
// @access  Private (Secretary, Admin)
const getApplication = async (req, res) => {
  try {
    const application = await StudentApplication.findOne({
      _id: req.params.id,
      branchId: req.user.branchId,
    })
      .populate("departmentId", "name code")
      .populate("courseId", "name code duration")
      .populate("reviewedBy", "firstName lastName email")
      .populate("studentId", "admissionNumber");

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    res.json({
      success: true,
      data: application,
    });
  } catch (error) {
    console.error("Get application error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch application",
      error: error.message,
    });
  }
};

// @desc    Approve application and create student record
// @route   POST /api/applications/:id/approve
// @access  Private (Secretary, Admin)
const approveApplication = async (req, res) => {
  try {
    const { admissionNumber, classId, reviewNotes } = req.body;

    const application = await StudentApplication.findOne({
      _id: req.params.id,
      branchId: req.user.branchId,
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    if (application.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Application is already ${application.status}`,
      });
    }

    // Generate default password (can be changed later)
    const defaultPassword = `${application.lastName.toLowerCase()}${new Date().getFullYear()}`;
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    // Create user account
    const user = await User.create({
      firstName: application.firstName,
      lastName: application.lastName,
      email: application.email,
      password: hashedPassword,
      phoneNumber: application.phone,
      roles: ["student"],
      branchId: application.branchId,
      status: "active",
    });

    // Create student record
    const student = await Student.create({
      userId: user._id,
      branchId: application.branchId,
      departmentId: application.departmentId,
      courseId: application.courseId,
      classId: classId || null,
      admissionNumber: admissionNumber,
      dateOfBirth: application.dateOfBirth,
      gender: application.gender,
      phone: application.phone,
      address: application.address,
      guardianName: application.guardianName,
      guardianPhone: application.guardianPhone,
      guardianEmail: application.guardianEmail,
      guardianRelationship: application.guardianRelationship,
      previousEducation: application.previousEducation,
      previousInstitution: application.previousInstitution,
      academicStatus: "active",
      enrollmentDate: new Date(),
    });

    // Update application status
    application.status = "approved";
    application.reviewedBy = req.user.id;
    application.reviewedAt = new Date();
    application.reviewNotes = reviewNotes;
    application.studentId = student._id;
    await application.save();

    res.json({
      success: true,
      message: "Application approved and student record created",
      data: {
        application,
        student,
        defaultPassword, // Send this so it can be communicated to the student
      },
    });
  } catch (error) {
    console.error("Approve application error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to approve application",
      error: error.message,
    });
  }
};

// @desc    Reject application
// @route   POST /api/applications/:id/reject
// @access  Private (Secretary, Admin)
const rejectApplication = async (req, res) => {
  try {
    const { reviewNotes } = req.body;

    const application = await StudentApplication.findOne({
      _id: req.params.id,
      branchId: req.user.branchId,
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    if (application.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Application is already ${application.status}`,
      });
    }

    application.status = "rejected";
    application.reviewedBy = req.user.id;
    application.reviewedAt = new Date();
    application.reviewNotes = reviewNotes || "Application rejected";
    await application.save();

    res.json({
      success: true,
      message: "Application rejected",
      data: application,
    });
  } catch (error) {
    console.error("Reject application error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to reject application",
      error: error.message,
    });
  }
};

// @desc    Delete application
// @route   DELETE /api/applications/:id
// @access  Private (Admin only)
const deleteApplication = async (req, res) => {
  try {
    const application = await StudentApplication.findOne({
      _id: req.params.id,
      branchId: req.user.branchId,
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    await application.deleteOne();

    res.json({
      success: true,
      message: "Application deleted successfully",
    });
  } catch (error) {
    console.error("Delete application error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete application",
      error: error.message,
    });
  }
};

module.exports = {
  submitApplication,
  getApplications,
  getApplication,
  approveApplication,
  rejectApplication,
  deleteApplication,
};
