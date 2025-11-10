const Fee = require("../models/Fee");
const FeeStructure = require("../models/FeeStructure");
const Payment = require("../models/Payment");
const Student = require("../models/Student");
const User = require("../models/User");
const Notice = require("../models/Notice");
const Class = require("../models/Class");
const { validationResult } = require("express-validator");
const {
  canAccessBranchResource,
  getBranchQueryFilter,
  canPerformBranchOperation,
  isSuperAdmin,
  hasAdminPrivileges,
} = require("../utils/accessControl");

// @desc    Get all fee structures for a branch
// @route   GET /api/fees/structures
// @access  Private (Admin, Secretary)
const getFeeStructures = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      classId,
      academicYear,
      academicTerm,
      isActive,
      branchId, // Allow superadmin to filter by specific branch
    } = req.query;

    // Apply branch-based filtering
    const branchFilter = getBranchQueryFilter(req.user, branchId);
    const query = { ...branchFilter };

    if (classId) query.classId = classId;
    if (academicYear) query.academicYear = academicYear;
    if (academicTerm) query.academicTerm = academicTerm;
    if (isActive !== undefined) query.isActive = isActive === "true";

    const feeStructures = await FeeStructure.find(query)
      .populate("classId", "name")
      .populate("createdBy", "firstName lastName")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await FeeStructure.countDocuments(query);

    res.json({
      success: true,
      data: feeStructures,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Get fee structures error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Create fee structure
// @route   POST /api/fees/structures
// @access  Private (Admin)
const createFeeStructure = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    const {
      classId,
      academicYear,
      academicTerm,
      feeComponents,
      totalAmount, // Accept totalAmount from frontend
      dueDate,
      allowInstallments,
      installmentSchedule,
      lateFeeAmount,
      lateFeeGracePeriod,
    } = req.body;

    // Check if fee structure already exists for this class, year, and term
    const existingStructure = await FeeStructure.findOne({
      branchId: req.user.branchId,
      classId,
      academicYear,
      academicTerm,
      isActive: true,
    });

    if (existingStructure) {
      return res.status(400).json({
        success: false,
        message:
          "Fee structure already exists for this class, academic year, and term",
      });
    }

    const feeStructure = new FeeStructure({
      branchId: req.user.branchId,
      classId,
      academicYear,
      academicTerm,
      feeComponents,
      totalAmount:
        totalAmount ||
        feeComponents.reduce((sum, comp) => sum + comp.amount, 0), // Use provided totalAmount or calculate
      dueDate,
      allowInstallments,
      installmentSchedule: allowInstallments ? installmentSchedule : [],
      lateFeeAmount,
      lateFeeGracePeriod,
      createdBy: req.user._id,
    });

    await feeStructure.save();

    await feeStructure.populate("classId", "name");
    await feeStructure.populate("createdBy", "firstName lastName");

    res.status(201).json({
      success: true,
      message: "Fee structure created successfully",
      data: feeStructure,
    });
  } catch (error) {
    console.error("Create fee structure error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Assign fees to students based on fee structure
// @route   POST /api/fees/assign
// @access  Private (Admin, Secretary)
const assignFeesToStudents = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    const {
      feeStructureId,
      studentIds,
      applyDiscount,
      discountAmount,
      discountReason,
    } = req.body;

    // Get fee structure
    const feeStructure = await FeeStructure.findOne({
      _id: feeStructureId,
      branchId: req.user.branchId,
      isActive: true,
    });

    if (!feeStructure) {
      return res.status(404).json({
        success: false,
        message: "Fee structure not found",
      });
    }

    // Validate students belong to the branch and class
    const students = await Student.find({
      _id: { $in: studentIds },
      branchId: req.user.branchId,
      currentClassId: feeStructure.classId,
      academicStatus: "active",
    });

    if (students.length !== studentIds.length) {
      return res.status(400).json({
        success: false,
        message: "Some students not found or not eligible for fee assignment",
      });
    }

    const assignedFees = [];
    const assignmentErrors = [];

    for (const student of students) {
      try {
        // Check if fee already assigned for this student, year, and term
        const existingFee = await Fee.findOne({
          studentId: student._id,
          academicYear: feeStructure.academicYear,
          academicTerm: feeStructure.academicTerm,
          branchId: req.user.branchId,
        });

        if (existingFee) {
          assignmentErrors.push({
            studentId: student._id,
            message: `Fee already assigned for ${student.studentId}`,
          });
          continue;
        }

        const fee = new Fee({
          branchId: req.user.branchId,
          studentId: student._id,
          feeStructureId: feeStructure._id,
          academicYear: feeStructure.academicYear,
          academicTerm: feeStructure.academicTerm,
          feeComponents: feeStructure.feeComponents,
          totalAmountDue: feeStructure.totalAmount,
          discountAmount: applyDiscount ? discountAmount || 0 : 0,
          discountReason: applyDiscount ? discountReason : "",
          dueDate: feeStructure.dueDate,
          isInstallmentPlan: feeStructure.allowInstallments,
          installmentSchedule: feeStructure.allowInstallments
            ? feeStructure.installmentSchedule
            : [],
          createdBy: req.user._id,
        });

        await fee.save();
        assignedFees.push(fee);
      } catch (error) {
        assignmentErrors.push({
          studentId: student._id,
          message: error.message,
        });
      }
    }

    res.status(201).json({
      success: true,
      message: `Fees assigned to ${assignedFees.length} students`,
      data: {
        assignedCount: assignedFees.length,
        errorCount: assignmentErrors.length,
        assignedFees,
        errors: assignmentErrors,
      },
    });
  } catch (error) {
    console.error("Assign fees error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Get student fees
// @route   GET /api/fees/student/:studentId
// @access  Private (Admin, Secretary, Teacher, Student - own fees only)
const getStudentFees = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { academicYear, academicTerm, status } = req.query;

    // Authorization check
    if (
      req.user.roles.includes("student") &&
      req.user.studentProfile?.toString() !== studentId
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only view your own fees",
      });
    }

    const query = {
      studentId,
      branchId: req.user.branchId,
    };

    if (academicYear) query.academicYear = academicYear;
    if (academicTerm) query.academicTerm = academicTerm;
    if (status) query.status = status;

    const fees = await Fee.find(query)
      .populate("studentId", "studentId userId")
      .populate("studentId.userId", "firstName lastName email")
      .populate("feeStructureId", "academicYear academicTerm")
      .sort({ createdAt: -1 });

    // Get payment history for these fees
    const feeIds = fees.map((fee) => fee._id);
    const payments = await Payment.find({
      feeId: { $in: feeIds },
      status: "completed",
    }).sort({ paymentDate: -1 });

    // Group payments by feeId
    const paymentsByFee = payments.reduce((acc, payment) => {
      if (!acc[payment.feeId]) acc[payment.feeId] = [];
      acc[payment.feeId].push(payment);
      return acc;
    }, {});

    // Add payments to each fee
    const feesWithPayments = fees.map((fee) => ({
      ...fee.toObject(),
      payments: paymentsByFee[fee._id] || [],
    }));

    res.json({
      success: true,
      data: feesWithPayments,
    });
  } catch (error) {
    console.error("Get student fees error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Get outstanding fees report
// @route   GET /api/fees/outstanding
// @access  Private (Admin, Secretary)
const getOutstandingFeesReport = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      classId,
      academicYear,
      academicTerm,
      minBalance,
    } = req.query;

    const query = {
      branchId: req.user.branchId,
      status: { $in: ["unpaid", "partially_paid", "overdue"] },
      balance: { $gt: 0 },
    };

    if (classId) {
      // Get students in the specified class
      const studentsInClass = await Student.find({
        currentClassId: classId,
        branchId: req.user.branchId,
      }).select("_id");

      query.studentId = { $in: studentsInClass.map((s) => s._id) };
    }

    if (academicYear) query.academicYear = academicYear;
    if (academicTerm) query.academicTerm = academicTerm;
    if (minBalance) query.balance = { $gte: parseFloat(minBalance) };

    const outstandingFees = await Fee.find(query)
      .populate({
        path: "studentId",
        select: "studentId userId currentClassId",
        populate: [
          {
            path: "userId",
            select: "firstName lastName email phone",
          },
          {
            path: "currentClassId",
            select: "name",
          },
        ],
      })
      .sort({ dueDate: 1, balance: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Fee.countDocuments(query);

    // Calculate summary statistics
    const summaryStats = await Fee.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalOutstanding: { $sum: "$balance" },
          totalOverdue: {
            $sum: {
              $cond: [{ $eq: ["$status", "overdue"] }, "$balance", 0],
            },
          },
          count: { $sum: 1 },
          overdueCount: {
            $sum: {
              $cond: [{ $eq: ["$status", "overdue"] }, 1, 0],
            },
          },
        },
      },
    ]);

    res.json({
      success: true,
      data: outstandingFees,
      summary: summaryStats[0] || {
        totalOutstanding: 0,
        totalOverdue: 0,
        count: 0,
        overdueCount: 0,
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Get outstanding fees error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Update fee (apply discount, late fee, etc.)
// @route   PUT /api/fees/:feeId
// @access  Private (Admin, Secretary)
const updateFee = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    const { feeId } = req.params;
    const { discountAmount, discountReason, lateFeeApplied, notes, dueDate } =
      req.body;

    const fee = await Fee.findOne({
      _id: feeId,
      branchId: req.user.branchId,
    });

    if (!fee) {
      return res.status(404).json({
        success: false,
        message: "Fee record not found",
      });
    }

    // Update fee details
    if (discountAmount !== undefined) {
      fee.discountAmount = discountAmount;
      fee.discountReason = discountReason || "";
    }

    if (lateFeeApplied !== undefined) {
      fee.lateFeeApplied = lateFeeApplied;
    }

    if (notes !== undefined) {
      fee.notes = notes;
    }

    if (dueDate !== undefined) {
      fee.dueDate = new Date(dueDate);
    }

    fee.lastModifiedBy = req.user._id;

    await fee.save();

    await fee.populate("studentId", "studentId userId");
    await fee.populate("studentId.userId", "firstName lastName");

    res.json({
      success: true,
      message: "Fee updated successfully",
      data: fee,
    });
  } catch (error) {
    console.error("Update fee error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Get student fee summaries for branch admin
// @route   GET /api/fees/branch/students
// @access  Private (Branch Admin, Admin, Secretary)
const getBranchStudentFeeSummaries = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      classId,
      academicYear,
      sortBy = "name",
      sortOrder = "asc",
      balanceFilter = "all",
    } = req.query;
    const branchId = req.user.branchId;

    // Build student query
    const studentQuery = {
      branchId,
      roles: { $in: ["student"] },
    };

    if (search) {
      studentQuery.$or = [
        { "profileDetails.firstName": new RegExp(search, "i") },
        { "profileDetails.lastName": new RegExp(search, "i") },
        { "profileDetails.studentId": new RegExp(search, "i") },
      ];
    }

    // Get students with pagination
    const students = await User.find(studentQuery)
      .select("firstName lastName email profileDetails")
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ "profileDetails.firstName": 1, "profileDetails.lastName": 1 });

    const totalStudents = await User.countDocuments(studentQuery);

    // Get fee summaries for each student
    const studentSummaries = await Promise.all(
      students.map(async (student) => {
        // Find the student profile
        const studentProfile = await Student.findOne({
          userId: student._id,
        }).populate("currentClassId", "name");

        if (!studentProfile) {
          return {
            student: {
              _id: student._id,
              firstName: student.firstName,
              lastName: student.lastName,
              email: student.email,
              studentId: student.profileDetails?.studentId,
              class: null,
            },
            feeSummary: {
              totalExpected: 0,
              totalPaid: 0,
              balance: 0,
              feesCount: 0,
            },
          };
        }

        const studentId = studentProfile._id;

        // Use the fees data from the Student document instead of Fee collection
        const totalExpected = studentProfile.fees?.totalFeeStructure || 0;
        const totalPaid = studentProfile.fees?.totalPaid || 0;
        const balance = studentProfile.fees?.totalBalance || 0;

        return {
          student: {
            _id: student._id,
            firstName: student.firstName,
            lastName: student.lastName,
            email: student.email,
            studentId: student.profileDetails?.studentId,
            class: studentProfile.currentClassId,
          },
          feeSummary: {
            totalExpected,
            totalPaid,
            balance,
            feesCount: studentProfile.courses?.length || 0, // Number of courses = number of fees
          },
        };
      })
    );

    // Filter results based on balanceFilter
    let filteredSummaries = studentSummaries;
    if (balanceFilter !== "all") {
      filteredSummaries = studentSummaries.filter((item) => {
        switch (balanceFilter) {
          case "outstanding":
            return item.feeSummary.balance > 0;
          case "paid":
            return (
              item.feeSummary.balance <= 0 && item.feeSummary.totalPaid > 0
            );
          case "overpaid":
            return item.feeSummary.balance < 0;
          default:
            return true;
        }
      });
    }

    // Sort the results based on sortBy and sortOrder
    filteredSummaries.sort((a, b) => {
      let aValue, bValue;

      switch (sortBy) {
        case "balance":
          aValue = a.feeSummary.balance;
          bValue = b.feeSummary.balance;
          break;
        case "paid":
          aValue = a.feeSummary.totalPaid;
          bValue = b.feeSummary.totalPaid;
          break;
        case "expected":
          aValue = a.feeSummary.totalExpected;
          bValue = b.feeSummary.totalExpected;
          break;
        case "name":
        default:
          aValue = `${a.student.firstName} ${a.student.lastName}`.toLowerCase();
          bValue = `${b.student.firstName} ${b.student.lastName}`.toLowerCase();
          break;
      }

      if (sortOrder === "desc") {
        return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
      } else {
        return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      }
    });

    res.json({
      success: true,
      data: filteredSummaries,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(filteredSummaries.length / limit),
        totalItems: filteredSummaries.length,
        hasNext: page * limit < totalStudents,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error("Get branch student fee summaries error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// Send fee reminders to students
const sendFeeReminders = async (req, res) => {
  try {
    const { studentIds } = req.body;

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Student IDs are required",
      });
    }

    const branchId = req.user.branchId;

    // Get student details for personalized messages
    const students = await User.find({
      _id: { $in: studentIds },
      branchId,
      roles: { $in: ["student"] },
    }).select("firstName lastName email profileDetails");

    if (students.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No valid students found",
      });
    }

    // Get fee information for each student
    const remindersSent = [];

    for (const student of students) {
      try {
        // Get student profile
        const studentProfile = await Student.findOne({ userId: student._id });

        if (!studentProfile) continue;

        const totalFee = studentProfile.fees?.totalFeeStructure || 0;
        const totalPaid = studentProfile.fees?.totalPaid || 0;
        const balance = studentProfile.fees?.totalBalance || 0;

        // Create personalized notice
        const notice = new Notice({
          title: "Fee Payment Reminder",
          content: `Dear ${student.firstName} ${
            student.lastName
          },\n\nThis is a reminder that you have an outstanding fee balance of KES ${Math.abs(
            balance
          ).toLocaleString()}.\n\nTotal Fees: KES ${totalFee.toLocaleString()}\nAmount Paid: KES ${totalPaid.toLocaleString()}\nOutstanding Balance: KES ${Math.abs(
            balance
          ).toLocaleString()}\n\nPlease make the payment at your earliest convenience to avoid any disruptions to your studies.\n\nThank you,\n${
            req.user.firstName
          } ${req.user.lastName}\nFee Administrator`,
          type: "fee_reminder",
          priority: "high",
          targetAudience: null, // Personal notices don't have a general audience
          specificRecipients: [student._id], // Target specific student only
          branchId,
          author: {
            userId: req.user.id,
            name: `${req.user.firstName} ${req.user.lastName}`,
            role: req.user.roles[0],
          },
          publishDate: new Date(),
          isActive: true,
        });

        await notice.save();
        remindersSent.push({
          studentId: student._id,
          studentName: `${student.firstName} ${student.lastName}`,
          balance: balance,
        });
      } catch (error) {
        console.error(
          `Error sending reminder to student ${student._id}:`,
          error
        );
      }
    }

    res.json({
      success: true,
      message: `Fee reminders sent to ${remindersSent.length} student(s)`,
      data: {
        remindersSent,
        totalRequested: studentIds.length,
        totalSent: remindersSent.length,
      },
    });
  } catch (error) {
    console.error("Send fee reminders error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while sending reminders",
      error: error.message,
    });
  }
};

module.exports = {
  getFeeStructures,
  createFeeStructure,
  assignFeesToStudents,
  getStudentFees,
  getOutstandingFeesReport,
  updateFee,
  getBranchStudentFeeSummaries,
  sendFeeReminders,
};
