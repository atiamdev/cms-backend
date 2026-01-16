const Fee = require("../models/Fee");
const Student = require("../models/Student");
const { getBranchQueryFilter } = require("../utils/accessControl");

/**
 * Get student fee summaries with monthly aggregation
 * @route GET /api/fees/student-summaries
 * @access Private (Admin, Secretary)
 */
const getStudentFeeSummaries = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      studentId,
      status,
      branchId,
      periodYear,
      periodMonth,
      viewType = "monthly", // "monthly" or "total"
    } = req.query;

    // Apply branch-based filtering
    const branchFilter = getBranchQueryFilter(req.user, branchId);
    
    // Build fee query
    const feeQuery = { 
      ...branchFilter,
      invoiceType: { $in: ["monthly", "weekly", "quarterly", "annual", "term"] }
    };
    
    if (studentId) feeQuery.studentId = studentId;
    if (status) feeQuery.status = status;
    if (periodYear) feeQuery.periodYear = parseInt(periodYear);
    if (periodMonth) feeQuery.periodMonth = parseInt(periodMonth);

    // Get active students
    const studentQuery = { ...branchFilter, academicStatus: "active" };
    if (studentId) studentQuery._id = studentId;

    const students = await Student.find(studentQuery)
      .populate("userId", "firstName lastName email")
      .sort({ studentId: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const totalStudents = await Student.countDocuments(studentQuery);

    // Get fees for these students
    const studentIds = students.map(s => s._id);
    const fees = await Fee.find({
      studentId: { $in: studentIds },
      ...feeQuery
    });

    // Aggregate fees per student
    const studentSummaries = students.map(student => {
      const studentFees = fees.filter(f => 
        f.studentId.toString() === student._id.toString()
      );

      let expectedAmount = 0;
      let paidAmount = 0;
      let balance = 0;
      let invoiceCount = 0;

      if (viewType === "monthly" && periodYear && periodMonth) {
        // Monthly view - only current month
        const monthlyFees = studentFees.filter(
          f => f.periodYear === parseInt(periodYear) && 
               f.periodMonth === parseInt(periodMonth)
        );
        
        expectedAmount = monthlyFees.reduce((sum, f) => sum + (f.totalAmountDue || 0), 0);
        paidAmount = monthlyFees.reduce((sum, f) => sum + (f.amountPaid || 0), 0);
        balance = monthlyFees.reduce((sum, f) => sum + (f.balance || 0), 0);
        invoiceCount = monthlyFees.length;
      } else {
        // Total view - all invoices since registration
        expectedAmount = studentFees.reduce((sum, f) => sum + (f.totalAmountDue || 0), 0);
        paidAmount = studentFees.reduce((sum, f) => sum + (f.amountPaid || 0), 0);
        balance = studentFees.reduce((sum, f) => sum + (f.balance || 0), 0);
        invoiceCount = studentFees.length;
      }

      // Determine status
      let feeStatus = "paid";
      if (balance > 0) {
        feeStatus = expectedAmount - paidAmount === balance ? "unpaid" : "partial";
      }
      if (invoiceCount === 0) {
        feeStatus = "none";
      }

      return {
        _id: student._id,
        studentId: student.studentId || "N/A",
        studentNumber: student.studentNumber || student.studentId,
        studentName: student.userId 
          ? `${student.userId.firstName} ${student.userId.lastName}`
          : `${student.firstName || ""} ${student.lastName || ""}`.trim() || "Unknown",
        email: student.userId?.email || student.email,
        expectedAmount,
        paidAmount,
        balance,
        status: feeStatus,
        invoiceCount,
        enrollmentDate: student.enrollmentDate,
      };
    });

    // Filter by status if specified
    const filteredSummaries = status 
      ? studentSummaries.filter(s => s.status === status)
      : studentSummaries;

    res.json({
      success: true,
      data: filteredSummaries,
      filters: {
        viewType,
        periodYear: periodYear ? parseInt(periodYear) : null,
        periodMonth: periodMonth ? parseInt(periodMonth) : null,
        status: status || null,
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalStudents / limit),
        totalItems: totalStudents,
        hasNextPage: page < Math.ceil(totalStudents / limit),
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Get student fee summaries error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

module.exports = { getStudentFeeSummaries };
