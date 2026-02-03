const Fee = require("../models/Fee");
const FeeStructure = require("../models/FeeStructure");
const Payment = require("../models/Payment");
const Student = require("../models/Student");
const User = require("../models/User");
const Notice = require("../models/Notice");
const Class = require("../models/Class");
const Course = require("../models/Course");
const { validationResult } = require("express-validator");
const {
  canAccessBranchResource,
  getBranchQueryFilter,
  canPerformBranchOperation,
  isSuperAdmin,
  hasAdminPrivileges,
} = require("../utils/accessControl");

const {
  generateMonthlyInvoices,
} = require("../services/monthlyInvoiceService");

// WhatsApp Integration Service
const WhatsAppIntegrationService = require("../services/whatsappIntegrationService");

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
      academicTermId,
      isActive,
      branchId, // Allow superadmin to filter by specific branch
    } = req.query;

    // Apply branch-based filtering
    const branchFilter = getBranchQueryFilter(req.user, branchId);
    const query = { ...branchFilter };

    if (classId) query.classId = classId;
    if (academicYear) query.academicYear = academicYear;
    if (academicTermId) query.academicTermId = academicTermId;
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

// @desc    Get all fees for a branch
// @route   GET /api/fees
// @access  Private (Admin, Secretary)
const getFees = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      studentId,
      status,
      branchId, // Allow superadmin to filter by specific branch
    } = req.query;

    // Apply branch-based filtering
    const branchFilter = getBranchQueryFilter(req.user, branchId);
    const query = { ...branchFilter };

    if (studentId) query.studentId = studentId;
    if (status) query.status = status;

    const fees = await Fee.find(query)
      .populate("studentId", "studentId userId")
      .populate("userId", "firstName lastName")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Fee.countDocuments(query);

    // Format the response to match what the frontend expects
    const formattedFees = fees.map((fee) => {
      // Recalculate balance to ensure it includes scholarship deductions
      const effectiveBalance =
        fee.totalAmountDue -
        fee.amountPaid -
        fee.discountAmount -
        fee.scholarshipAmount +
        fee.lateFeeApplied;
      // Effective amount due after scholarship
      const effectiveDueAmount = fee.totalAmountDue - fee.scholarshipAmount;

      return {
        _id: fee._id,
        studentId: fee.studentId?.studentId || "N/A",
        studentName: fee.studentId?.userId
          ? `${fee.studentId.userId.firstName} ${fee.studentId.userId.lastName}`
          : "Unknown Student",
        dueAmount: effectiveDueAmount, // Show effective amount due after scholarship
        paidAmount: fee.amountPaid,
        balanceAmount: effectiveBalance,
        status: fee.status,
        academicYear: fee.academicYear,
        academicTermId: fee.academicTermId,
        scholarshipAmount: fee.scholarshipAmount,
        originalDueAmount: fee.totalAmountDue, // Keep original for reference
      };
    });

    res.json({
      success: true,
      data: formattedFees,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Get fees error:", error);
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
      academicTermId,
      feeComponents,
      totalAmount, // Accept totalAmount from frontend
      dueDate,
      allowInstallments,
      installmentSchedule,
      lateFeeAmount,
      lateFeeGracePeriod,
      billingFrequency, // 'term' or 'monthly'
      perPeriodAmount,
    } = req.body;

    // Check if fee structure already exists for this class, year, and term
    const existingStructure = await FeeStructure.findOne({
      branchId: req.user.branchId,
      classId,
      academicYear,
      academicTermId,
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
      academicTermId,
      feeComponents,
      totalAmount:
        totalAmount ||
        feeComponents.reduce((sum, comp) => sum + comp.amount, 0), // Use provided totalAmount or calculate
      dueDate,
      allowInstallments,
      installmentSchedule: allowInstallments ? installmentSchedule : [],
      lateFeeAmount,
      lateFeeGracePeriod,
      billingFrequency: billingFrequency || "term",
      perPeriodAmount: perPeriodAmount !== undefined ? perPeriodAmount : null,
      createInvoiceOnEnrollment: req.body.createInvoiceOnEnrollment || false,
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
          academicTermId: feeStructure.academicTermId,
          branchId: req.user.branchId,
        });

        if (existingFee) {
          assignmentErrors.push({
            studentId: student._id,
            message: `Fee already assigned for ${student.studentId}`,
          });
          continue;
        }

        const totalAmountDue = feeStructure.totalAmount;
        const scholarshipAmount =
          student.scholarshipPercentage > 0
            ? Math.round((totalAmountDue * student.scholarshipPercentage) / 100)
            : 0;

        const fee = new Fee({
          branchId: req.user.branchId,
          studentId: student._id,
          feeStructureId: feeStructure._id,
          academicYear: feeStructure.academicYear,
          academicTermId: feeStructure.academicTermId,
          feeComponents: feeStructure.feeComponents,
          totalAmountDue: totalAmountDue,
          discountAmount: applyDiscount ? discountAmount || 0 : 0,
          discountReason: applyDiscount ? discountReason : "",
          scholarshipAmount: scholarshipAmount,
          dueDate: feeStructure.dueDate,
          isInstallmentPlan: feeStructure.allowInstallments,
          installmentSchedule: feeStructure.allowInstallments
            ? feeStructure.installmentSchedule
            : [],
          createdBy: req.user._id,
        });

        await fee.save();
        assignedFees.push(fee);

        // Send WhatsApp invoice notification
        try {
          const whatsappService = new WhatsAppIntegrationService();
          await whatsappService.notifyInvoiceGenerated(fee._id);
        } catch (whatsappError) {
          console.error(
            "WhatsApp invoice notification failed (non-blocking):",
            whatsappError,
          );
        }

        // Send push notification for new fee assignment
        try {
          const populatedStudent = await Student.findById(student._id).populate(
            "userId",
          );
          if (populatedStudent && populatedStudent.userId) {
            const pushController = require("./pushController");
            const {
              storeNotificationAsNotice,
            } = require("../utils/notificationStorage");
            const moment = require("moment-timezone");
            const dueDate = moment(fee.dueDate).format("MMM D, YYYY");

            const payload = {
              title: "New Fee Assignment",
              body: `Fee of KES ${fee.totalAmountDue.toLocaleString()} is due by ${dueDate}`,
              icon: "/logo.png",
              tag: `fee-assigned-${fee._id}`,
              type: "fee-assigned",
              feeId: fee._id.toString(),
              amount: fee.totalAmountDue,
              dueDate: fee.dueDate,
              url: "/student/fees",
            };

            // Store as notice
            await storeNotificationAsNotice({
              userIds: [populatedStudent.userId._id],
              title: payload.title,
              content: payload.body,
              type: "fee_reminder",
              priority: "high",
              branchId: populatedStudent.branchId,
              targetAudience: "students",
            });

            await pushController.sendNotification(
              [populatedStudent.userId._id],
              payload,
            );
            console.log(
              `[Fee] Sent assignment notification to student ${populatedStudent.userId._id}`,
            );
          }
        } catch (notifError) {
          console.error(
            "[Fee] Error sending assignment notification:",
            notifError,
          );
        }
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

// @desc    Generate monthly invoices for 'monthly' fee structures (manual trigger)
// @route   POST /api/fees/generate-monthly
// @access  Private (Admin, Secretary)
const generateMonthlyInvoicesRoute = async (req, res) => {
  try {
    const { year, month, branchId } = req.body || {};

    const now = new Date();
    const periodYear = year ? parseInt(year) : now.getFullYear();
    const periodMonth = month ? parseInt(month) : now.getMonth() + 1; // 1-12

    const result = await generateMonthlyInvoices({
      periodYear,
      periodMonth,
      branchId,
      initiatedBy: req.user._id,
    });

    res.json({
      success: true,
      message: `Generated invoices for ${periodYear}-${String(
        periodMonth,
      ).padStart(2, "0")}`,
      data: result,
    });
  } catch (error) {
    console.error("Generate monthly invoices error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

// @desc    Manual invoice generation for super admin (enhanced with multiple options)
// @route   POST /api/fees/admin/generate-invoices
// @access  Private (SuperAdmin only)
const manualInvoiceGeneration = async (req, res) => {
  try {
    const {
      year,
      month,
      branchId,
      frequency = "monthly",
      consolidate = true,
      studentId,
    } = req.body;

    // Validate frequency
    const validFrequencies = ["weekly", "monthly", "quarterly", "annual"];
    if (!validFrequencies.includes(frequency)) {
      return res.status(400).json({
        success: false,
        message: `Invalid frequency. Must be one of: ${validFrequencies.join(", ")}`,
      });
    }

    const now = new Date();
    const periodYear = year ? parseInt(year) : now.getFullYear();
    const periodMonth = month ? parseInt(month) : now.getMonth() + 1;

    console.log("=".repeat(70));
    console.log("MANUAL INVOICE GENERATION");
    console.log("=".repeat(70));
    console.log(
      `Initiated by: ${req.user.firstName} ${req.user.lastName} (${req.user.roles.join(", ")})`,
    );
    console.log(
      `Period: ${periodYear}-${String(periodMonth).padStart(2, "0")}`,
    );
    console.log(`Frequency: ${frequency}`);
    console.log(`Consolidation: ${consolidate ? "ENABLED" : "DISABLED"}`);
    console.log(`Branch: ${branchId || "All branches"}`);
    console.log(`Student filter: ${studentId || "All students"}`);
    console.log("=".repeat(70));

    // Use the appropriate invoice generation service
    let result;

    // For superadmin, allow generating for all branches if branchId not specified
    const effectiveBranchId =
      branchId ||
      (req.user.roles.includes("superadmin") ? null : req.user.branchId);

    if (frequency === "monthly") {
      result = await generateMonthlyInvoices({
        periodYear,
        periodMonth,
        branchId: effectiveBranchId,
        studentId,
        initiatedBy: req.user._id,
        consolidate,
      });
    } else {
      // For other frequencies, use generateInvoicesForFrequency
      const {
        generateInvoicesForFrequency,
      } = require("../services/monthlyInvoiceService");
      const date = new Date(periodYear, periodMonth - 1, 1);

      result = await generateInvoicesForFrequency({
        frequency,
        date,
        branchId: effectiveBranchId,
        initiatedBy: req.user._id,
      });
    }

    // Format response with detailed information
    const monthName = new Date(periodYear, periodMonth - 1).toLocaleDateString(
      "en-US",
      {
        month: "long",
        year: "numeric",
      },
    );

    console.log("\n" + "=".repeat(70));
    console.log("GENERATION COMPLETE");
    console.log("=".repeat(70));
    console.log(`Created: ${result.created || 0} invoice(s)`);
    console.log(`Skipped: ${result.skipped || 0} invoice(s)`);
    console.log(`Notifications pending: ${result.notificationsPending || 0}`);
    console.log("=".repeat(70) + "\n");

    res.json({
      success: true,
      message: `Successfully generated ${result.created || 0} invoice(s) for ${monthName}`,
      data: {
        period: {
          year: periodYear,
          month: periodMonth,
          monthName: monthName,
          frequency,
        },
        statistics: {
          invoicesCreated: result.created || 0,
          invoicesSkipped: result.skipped || 0,
          notificationsPending: result.notificationsPending || 0,
          totalProcessed: (result.created || 0) + (result.skipped || 0),
        },
        configuration: {
          consolidation: consolidate,
          branchFilter: branchId || "All branches",
          studentFilter: studentId || "All students",
        },
        initiatedBy: {
          userId: req.user._id,
          name: `${req.user.firstName} ${req.user.lastName}`,
          role: req.user.roles[0],
        },
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Manual invoice generation error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate invoices",
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
    const { academicYear, academicTermId, status } = req.query;

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
    if (academicTermId) query.academicTermId = academicTermId;
    if (status) query.status = status;

    const fees = await Fee.find(query)
      .populate("studentId", "studentId userId")
      .populate("studentId.userId", "firstName lastName email")
      .populate("feeStructureId", "academicYear academicTermId")
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
      academicTermId,
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
    if (academicTermId) query.academicTermId = academicTermId;
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
      viewType, // "monthly" or "total"
      view, // alias for viewType
      periodYear,
      periodMonth,
      year, // alias for periodYear
      month, // alias for periodMonth
    } = req.query;
    const branchId = req.user.branchId;

    // Support both parameter naming conventions
    const actualViewType = viewType || view || "total";
    const actualYear = periodYear || year;
    const actualMonth = periodMonth || month;

    // Build student query
    const studentQuery = {
      branchId,
      roles: { $in: ["student"] },
    };

    if (search) {
      studentQuery.$or = [
        { firstName: new RegExp(search, "i") },
        { lastName: new RegExp(search, "i") },
        { "profileDetails.firstName": new RegExp(search, "i") },
        { "profileDetails.lastName": new RegExp(search, "i") },
        { "profileDetails.studentId": new RegExp(search, "i") },
      ];
    }

    // Get all students matching search (limit to reasonable number for performance)
    const maxStudents = 10000; // Limit to prevent performance issues
    const allStudents = await User.find(studentQuery)
      .select("firstName lastName email profileDetails")
      .limit(maxStudents)
      .sort({ "profileDetails.firstName": 1, "profileDetails.lastName": 1 });

    const totalStudents = await User.countDocuments(studentQuery);
    const actualTotal = Math.min(totalStudents, maxStudents);

    // Get fee summaries for each student
    const allStudentSummaries = await Promise.all(
      allStudents.map(async (student) => {
        // Find the student profile
        const studentProfile = await Student.findOne({
          userId: student._id,
        }).populate("currentClassId", "name");

        if (!studentProfile) {
          return {
            student: {
              _id: student._id,
              userId: student._id,
              studentId: student.profileDetails?.studentId,
              admissionNumber: student.profileDetails?.studentId,
              photoUrl: student.profileDetails?.profilePicture,
              userInfo: {
                _id: student._id,
                firstName:
                  student.firstName || student.profileDetails?.firstName,
                lastName: student.lastName || student.profileDetails?.lastName,
                email: student.email,
                profileDetails: {
                  profilePicture: student.profileDetails?.profilePicture,
                  firstName:
                    student.firstName || student.profileDetails?.firstName,
                  lastName:
                    student.lastName || student.profileDetails?.lastName,
                },
              },
              class: null,
            },
            expected: 0,
            paid: 0,
            balance: 0,
            feesCount: 0,
          };
        }

        const studentId = studentProfile._id;

        // Calculate expected amount and paid amount
        // Expected: From invoices (totalAmountDue - discounts - scholarships = what student should pay)
        // Paid: From invoices (amountPaid - tracks what was actually applied to that invoice)
        let totalExpected = 0;
        let totalPaid = 0;

        if (actualViewType === "monthly" && actualYear && actualMonth) {
          // Monthly view: Get invoices for specific month
          const monthFees = await Fee.find({
            studentId,
            invoiceType: "monthly",
            periodYear: parseInt(actualYear),
            periodMonth: parseInt(actualMonth),
          });

          // Sum up expected amounts (after discounts/scholarships) and paid amounts
          totalExpected = monthFees.reduce(
            (sum, fee) =>
              sum +
              ((fee.totalAmountDue || 0) -
                (fee.discountAmount || 0) -
                (fee.scholarshipAmount || 0)),
            0,
          );
          totalPaid = monthFees.reduce(
            (sum, fee) => sum + (fee.amountPaid || 0),
            0,
          );
        } else {
          // Total view: Get ALL invoices for this student
          const allFees = await Fee.find({
            studentId,
            invoiceType: "monthly",
          });

          // Sum up all expected amounts (after discounts/scholarships) and paid amounts across all invoices
          totalExpected = allFees.reduce(
            (sum, fee) =>
              sum +
              ((fee.totalAmountDue || 0) -
                (fee.discountAmount || 0) -
                (fee.scholarshipAmount || 0)),
            0,
          );
          totalPaid = allFees.reduce(
            (sum, fee) => sum + (fee.amountPaid || 0),
            0,
          );
        }

        // Note: Scholarships are already applied in the invoice generation
        // The totalAmountDue in invoices already reflects scholarship discounts
        const effectiveBalance = totalExpected - totalPaid;

        return {
          student: {
            _id: studentProfile._id,
            userId: student._id,
            studentId:
              student.profileDetails?.studentId || studentProfile.studentId,
            admissionNumber: studentProfile.admissionNumber,
            photoUrl: student.profileDetails?.profilePicture,
            userInfo: {
              _id: student._id,
              firstName: student.firstName || student.profileDetails?.firstName,
              lastName: student.lastName || student.profileDetails?.lastName,
              email: student.email,
              profileDetails: {
                profilePicture: student.profileDetails?.profilePicture,
                firstName:
                  student.firstName || student.profileDetails?.firstName,
                lastName: student.lastName || student.profileDetails?.lastName,
              },
            },
            class: studentProfile.currentClassId,
            currentClassId: studentProfile.currentClassId,
          },
          expected: totalExpected,
          paid: totalPaid,
          balance: effectiveBalance,
          feesCount: studentProfile.courses?.length || 0,
        };
      }),
    );

    // Filter results based on balanceFilter
    let filteredSummaries = allStudentSummaries;
    if (balanceFilter !== "all") {
      filteredSummaries = allStudentSummaries.filter((item) => {
        switch (balanceFilter) {
          case "outstanding":
            return item.balance > 0;
          case "paid":
            return item.balance <= 0 && item.paid > 0;
          case "overpaid":
            return item.balance < 0;
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
          aValue = a.balance;
          bValue = b.balance;
          break;
        case "paid":
          aValue = a.paid;
          bValue = b.paid;
          break;
        case "expected":
          aValue = a.expected;
          bValue = b.expected;
          break;
        case "name":
        default:
          aValue = `${a.student.userInfo?.firstName || ""} ${
            a.student.userInfo?.lastName || ""
          }`.toLowerCase();
          bValue = `${b.student.userInfo?.firstName || ""} ${
            b.student.userInfo?.lastName || ""
          }`.toLowerCase();
          break;
      }

      if (sortOrder === "desc") {
        return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
      } else {
        return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      }
    });

    // Apply pagination after filtering and sorting
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedSummaries = filteredSummaries.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: paginatedSummaries,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(filteredSummaries.length / limit),
        totalItems: filteredSummaries.length,
        hasNext: endIndex < filteredSummaries.length,
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
            balance,
          ).toLocaleString()}.\n\nTotal Fees: KES ${totalFee.toLocaleString()}\nAmount Paid: KES ${totalPaid.toLocaleString()}\nOutstanding Balance: KES ${Math.abs(
            balance,
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
          error,
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
  getFees,
  createFeeStructure,
  assignFeesToStudents,
  getStudentFees,
  getOutstandingFeesReport,
  updateFee,
  getBranchStudentFeeSummaries,
  sendFeeReminders,
  generateMonthlyInvoicesRoute,
  manualInvoiceGeneration,
};
