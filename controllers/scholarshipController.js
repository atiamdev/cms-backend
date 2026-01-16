const Scholarship = require("../models/Scholarship");
const Student = require("../models/Student");
const Fee = require("../models/Fee");
const { validationResult } = require("express-validator");
const {
  canAccessBranchResource,
  getBranchQueryFilter,
  canPerformBranchOperation,
  isSuperAdmin,
  hasAdminPrivileges,
} = require("../utils/accessControl");

// Note: Student fee summaries are now calculated dynamically from invoices
// in aggregation queries. No need to update student.fees fields directly.

// @desc    Offer scholarship to a student
// @route   POST /api/scholarships/offer
// @access  Private (Admin, SuperAdmin)
const offerScholarship = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation errors",
        errors: errors.array(),
      });
    }

    const { studentId, percentage, reason } = req.body;

    // Find student
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    // Check branch access
    if (!canPerformBranchOperation(req.user, student.branchId)) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. Cannot offer scholarship to student in this branch",
      });
    }

    // Check if student already has active scholarship
    const existingScholarship = await Scholarship.findOne({
      studentId: studentId,
      isActive: true,
    });

    if (existingScholarship) {
      return res.status(400).json({
        success: false,
        message: "Student already has an active scholarship",
      });
    }

    // Create scholarship record
    const scholarship = new Scholarship({
      studentId: studentId,
      branchId: student.branchId,
      percentage: percentage,
      assignedBy: req.user._id,
      reason: reason,
    });

    await scholarship.save();

    // Update student record
    student.scholarshipPercentage = percentage;
    student.scholarshipAssignedBy = req.user._id;
    student.scholarshipAssignedDate = new Date();
    student.scholarshipReason = reason;
    await student.save();

    // Update existing unpaid fees for this student
    const unpaidFees = await Fee.find({
      studentId: studentId,
      status: { $in: ["unpaid", "partially_paid", "overdue"] },
    });

    for (const fee of unpaidFees) {
      const computedAmount = Math.round(
        (fee.totalAmountDue * percentage) / 100
      );
      // If invoice has an existing discount amount from legacy registration and no payments were made, migrate it to scholarshipAmount
      if (fee.discountAmount > 0 && fee.amountPaid === 0) {
        // Preserve audit trail: move discountAmount into scholarshipAmount and clear discount
        fee.scholarshipAmount = fee.discountAmount;
        fee.discountAmount = 0;
      } else {
        // Otherwise set scholarship amount based on computed percentage
        fee.scholarshipAmount = computedAmount;
      }
      await fee.save();
    }

    // Note: Student fee summaries are calculated dynamically from invoices in queries

    res.status(201).json({
      success: true,
      message: "Scholarship offered successfully",
      data: scholarship,
    });
  } catch (error) {
    console.error("Error offering scholarship:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Revoke scholarship from a student
// @route   PUT /api/scholarships/revoke/:studentId
// @access  Private (Admin, SuperAdmin)
const revokeScholarship = async (req, res) => {
  try {
    const { studentId } = req.params;

    // Find student
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    // Check branch access
    if (!canPerformBranchOperation(req.user, student.branchId)) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. Cannot revoke scholarship for student in this branch",
      });
    }

    // Find and deactivate scholarship
    const scholarship = await Scholarship.findOneAndUpdate(
      { studentId: studentId, isActive: true },
      { isActive: false },
      { new: true }
    );

    if (!scholarship) {
      return res.status(404).json({
        success: false,
        message: "No active scholarship found for this student",
      });
    }

    // Update student record
    student.scholarshipPercentage = 0;
    student.scholarshipAssignedBy = null;
    student.scholarshipAssignedDate = null;
    student.scholarshipReason = null;
    await student.save();

    // Update existing unpaid fees for this student (remove scholarship)
    const unpaidFees = await Fee.find({
      studentId: studentId,
      status: { $in: ["unpaid", "partially_paid", "overdue"] },
    });

    for (const fee of unpaidFees) {
      fee.scholarshipAmount = 0;
      await fee.save();
    }

    // Note: Student fee summaries are calculated dynamically from invoices in queries

    res.json({
      success: true,
      message: "Scholarship revoked successfully",
      data: scholarship,
    });
  } catch (error) {
    console.error("Error revoking scholarship:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Get scholarships for a branch
// @route   GET /api/scholarships
// @access  Private (Admin, SuperAdmin)
const getScholarships = async (req, res) => {
  try {
    const { page = 1, limit = 10, studentId, isActive, branchId } = req.query;

    // Apply branch-based filtering
    const branchFilter = getBranchQueryFilter(req.user, branchId);
    const query = { ...branchFilter };

    if (studentId) query.studentId = studentId;
    if (isActive !== undefined) query.isActive = isActive === "true";

    const scholarships = await Scholarship.find(query)
      .populate("studentId", "studentId userId")
      .populate("assignedBy", "firstName lastName")
      .populate("studentId.userId", "firstName lastName")
      .sort({ assignedDate: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Scholarship.countDocuments(query);

    res.json({
      success: true,
      data: scholarships,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching scholarships:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Get scholarship for a specific student
// @route   GET /api/scholarships/student/:studentId
// @access  Private (Admin, SuperAdmin)
const getStudentScholarship = async (req, res) => {
  try {
    const { studentId } = req.params;

    // Find student
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    // Check branch access
    if (!canPerformBranchOperation(req.user, student.branchId)) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. Cannot view scholarship for student in this branch",
      });
    }

    const scholarship = await Scholarship.findOne({
      studentId: studentId,
      isActive: true,
    })
      .populate("assignedBy", "firstName lastName")
      .sort({ assignedDate: -1 });

    res.json({
      success: true,
      data: scholarship,
    });
  } catch (error) {
    console.error("Error fetching student scholarship:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

module.exports = {
  offerScholarship,
  revokeScholarship,
  getScholarships,
  getStudentScholarship,
};
