const Fee = require("../models/Fee");
const Payment = require("../models/Payment");
const Student = require("../models/Student");
const Class = require("../models/Class");
const { isSuperAdmin } = require("../utils/accessControl");
const {
  generateBranchFeeStats,
  generateStudentFeeSummary,
} = require("../utils/feeHelpers");

// Helper function to get branch filter based on user role
const getBranchFilter = (user) => {
  return isSuperAdmin(user) ? {} : { branchId: user.branchId };
};

// @desc    Get fee collection dashboard
// @route   GET /api/fees/reports/dashboard
// @access  Private (Admin, Secretary)
const getFeeDashboard = async (req, res) => {
  try {
    const branchFilter = getBranchFilter(req.user);
    const branchId = req.user.branchId; // Keep for generateBranchFeeStats if it needs direct branchId
    const { dateRange } = req.query;

    let startDate, endDate;
    if (dateRange) {
      const [start, end] = dateRange.split(",");
      startDate = start;
      endDate = end;
    }

    // Get branch statistics
    const stats = await generateBranchFeeStats(branchId, {
      startDate,
      endDate,
    });

    // Get recent payments
    const recentPayments = await Payment.find({
      ...branchFilter,
      status: "completed",
    })
      .populate("studentId", "studentId userId")
      .populate("studentId.userId", "firstName lastName")
      .sort({ paymentDate: -1 })
      .limit(10);

    // Get top overdue students
    const overdueStudents = await Fee.find({
      branchId,
      status: "overdue",
      balance: { $gt: 0 },
    })
      .populate("studentId", "studentId userId currentClassId")
      .populate("studentId.userId", "firstName lastName")
      .populate("studentId.currentClassId", "name")
      .sort({ balance: -1 })
      .limit(10);

    // Get fee collection by month for the current year
    const currentYear = new Date().getFullYear();
    const monthlyCollection = await Payment.aggregate([
      {
        $match: {
          branchId: req.user.branchId,
          status: "completed",
          paymentDate: {
            $gte: new Date(currentYear, 0, 1),
            $lt: new Date(currentYear + 1, 0, 1),
          },
        },
      },
      {
        $group: {
          _id: { $month: "$paymentDate" },
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    // Format monthly data
    const monthlyData = Array.from({ length: 12 }, (_, i) => {
      const monthData = monthlyCollection.find((item) => item._id === i + 1);
      return {
        month: new Date(2024, i).toLocaleString("default", { month: "short" }),
        amount: monthData ? monthData.totalAmount : 0,
        count: monthData ? monthData.count : 0,
      };
    });

    res.json({
      success: true,
      data: {
        statistics: stats,
        recentPayments,
        overdueStudents,
        monthlyCollection: monthlyData,
      },
    });
  } catch (error) {
    console.error("Get fee dashboard error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Get fee collection report by class
// @route   GET /api/fees/reports/by-class
// @access  Private (Admin, Secretary)
const getFeeReportByClass = async (req, res) => {
  try {
    const { academicYear, academicTerm, page = 1, limit = 10 } = req.query;

    const query = { ...getBranchFilter(req.user) };
    if (academicYear) query.academicYear = academicYear;
    if (academicTerm) query.academicTerm = academicTerm;

    // Get fee collection by class
    const classReport = await Fee.aggregate([
      { $match: query },
      {
        $lookup: {
          from: "students",
          localField: "studentId",
          foreignField: "_id",
          as: "student",
        },
      },
      { $unwind: "$student" },
      {
        $lookup: {
          from: "classes",
          localField: "student.currentClassId",
          foreignField: "_id",
          as: "class",
        },
      },
      { $unwind: "$class" },
      {
        $group: {
          _id: "$student.currentClassId",
          className: { $first: "$class.name" },
          totalStudents: { $addToSet: "$studentId" },
          totalFees: { $sum: "$totalAmountDue" },
          totalPaid: { $sum: "$amountPaid" },
          totalBalance: { $sum: "$balance" },
          totalOverdue: {
            $sum: { $cond: [{ $eq: ["$status", "overdue"] }, "$balance", 0] },
          },
          paidCount: {
            $sum: { $cond: [{ $eq: ["$status", "paid"] }, 1, 0] },
          },
          overdueCount: {
            $sum: { $cond: [{ $eq: ["$status", "overdue"] }, 1, 0] },
          },
        },
      },
      {
        $addFields: {
          totalStudents: { $size: "$totalStudents" },
          collectionRate: {
            $multiply: [{ $divide: ["$totalPaid", "$totalFees"] }, 100],
          },
        },
      },
      { $sort: { className: 1 } },
      { $skip: (page - 1) * limit },
      { $limit: parseInt(limit) },
    ]);

    // Get total count for pagination
    const totalCount = await Fee.aggregate([
      { $match: query },
      {
        $lookup: {
          from: "students",
          localField: "studentId",
          foreignField: "_id",
          as: "student",
        },
      },
      { $unwind: "$student" },
      {
        $group: {
          _id: "$student.currentClassId",
        },
      },
      { $count: "total" },
    ]);

    const total = totalCount[0]?.total || 0;

    res.json({
      success: true,
      data: classReport,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Get fee report by class error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Get payment method analysis
// @route   GET /api/fees/reports/payment-methods
// @access  Private (Admin, Secretary)
const getPaymentMethodAnalysis = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const query = {
      ...getBranchFilter(req.user),
      status: "completed",
    };

    if (startDate || endDate) {
      query.paymentDate = {};
      if (startDate) query.paymentDate.$gte = new Date(startDate);
      if (endDate) query.paymentDate.$lte = new Date(endDate);
    }

    // Payment method breakdown
    const methodAnalysis = await Payment.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$paymentMethod",
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 },
          avgAmount: { $avg: "$amount" },
        },
      },
      {
        $addFields: {
          method: {
            $switch: {
              branches: [
                { case: { $eq: ["$_id", "mpesa"] }, then: "M-Pesa" },
                { case: { $eq: ["$_id", "cash"] }, then: "Cash" },
                {
                  case: { $eq: ["$_id", "bank_transfer"] },
                  then: "Bank Transfer",
                },
                { case: { $eq: ["$_id", "cheque"] }, then: "Cheque" },
                { case: { $eq: ["$_id", "card"] }, then: "Card" },
              ],
              default: "Other",
            },
          },
        },
      },
      { $sort: { totalAmount: -1 } },
    ]);

    // Calculate percentages
    const totalAmount = methodAnalysis.reduce(
      (sum, item) => sum + item.totalAmount,
      0
    );
    const analysisWithPercentages = methodAnalysis.map((item) => ({
      ...item,
      percentage:
        totalAmount > 0
          ? ((item.totalAmount / totalAmount) * 100).toFixed(2)
          : 0,
    }));

    // Daily payment trends for the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dailyTrends = await Payment.aggregate([
      {
        $match: {
          ...getBranchFilter(req.user),
          status: "completed",
          paymentDate: { $gte: thirtyDaysAgo },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$paymentDate" },
            month: { $month: "$paymentDate" },
            day: { $dayOfMonth: "$paymentDate" },
          },
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
    ]);

    res.json({
      success: true,
      data: {
        methodAnalysis: analysisWithPercentages,
        dailyTrends,
        summary: {
          totalAmount,
          totalTransactions: methodAnalysis.reduce(
            (sum, item) => sum + item.count,
            0
          ),
        },
      },
    });
  } catch (error) {
    console.error("Get payment method analysis error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Get defaulters report
// @route   GET /api/fees/reports/defaulters
// @access  Private (Admin, Secretary)
const getDefaultersReport = async (req, res) => {
  try {
    const {
      classId,
      academicYear,
      academicTerm,
      minBalance = 0,
      daysOverdue = 0,
      page = 1,
      limit = 10,
    } = req.query;

    const query = {
      ...getBranchFilter(req.user),
      status: { $in: ["overdue", "partially_paid"] },
      balance: { $gt: parseFloat(minBalance) },
    };

    if (academicYear) query.academicYear = academicYear;
    if (academicTerm) query.academicTerm = academicTerm;

    // Add days overdue filter
    if (daysOverdue > 0) {
      const dateThreshold = new Date();
      dateThreshold.setDate(dateThreshold.getDate() - parseInt(daysOverdue));
      query.dueDate = { $lt: dateThreshold };
    }

    let pipeline = [
      { $match: query },
      {
        $lookup: {
          from: "students",
          localField: "studentId",
          foreignField: "_id",
          as: "student",
        },
      },
      { $unwind: "$student" },
      {
        $lookup: {
          from: "users",
          localField: "student.userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $lookup: {
          from: "classes",
          localField: "student.currentClassId",
          foreignField: "_id",
          as: "class",
        },
      },
      { $unwind: "$class" },
    ];

    // Filter by class if specified
    if (classId) {
      pipeline.push({
        $match: { "student.currentClassId": mongoose.Types.ObjectId(classId) },
      });
    }

    pipeline.push(
      {
        $addFields: {
          daysOverdue: {
            $ceil: {
              $divide: [{ $subtract: [new Date(), "$dueDate"] }, 86400000],
            },
          },
        },
      },
      {
        $project: {
          studentId: "$student.studentId",
          studentName: {
            $concat: ["$user.firstName", " ", "$user.lastName"],
          },
          className: "$class.name",
          academicYear: 1,
          academicTerm: 1,
          totalAmountDue: 1,
          amountPaid: 1,
          balance: 1,
          dueDate: 1,
          daysOverdue: 1,
          status: 1,
          contactInfo: {
            email: "$user.email",
            phone: "$user.phone",
          },
        },
      },
      { $sort: { balance: -1, daysOverdue: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: parseInt(limit) }
    );

    const defaulters = await Fee.aggregate(pipeline);

    // Get total count
    const totalPipeline = [
      { $match: query },
      {
        $lookup: {
          from: "students",
          localField: "studentId",
          foreignField: "_id",
          as: "student",
        },
      },
      { $unwind: "$student" },
    ];

    if (classId) {
      totalPipeline.push({
        $match: { "student.currentClassId": mongoose.Types.ObjectId(classId) },
      });
    }

    totalPipeline.push({ $count: "total" });

    const totalResult = await Fee.aggregate(totalPipeline);
    const total = totalResult[0]?.total || 0;

    // Get summary statistics
    const summaryPipeline = [
      { $match: query },
      {
        $group: {
          _id: null,
          totalDefaulters: { $sum: 1 },
          totalOutstanding: { $sum: "$balance" },
          avgOutstanding: { $avg: "$balance" },
          maxOutstanding: { $max: "$balance" },
        },
      },
    ];

    const summary = await Fee.aggregate(summaryPipeline);

    res.json({
      success: true,
      data: defaulters,
      summary: summary[0] || {
        totalDefaulters: 0,
        totalOutstanding: 0,
        avgOutstanding: 0,
        maxOutstanding: 0,
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
    console.error("Get defaulters report error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Export fee reports to Excel
// @route   GET /api/fees/reports/export
// @access  Private (Admin, Secretary)
const exportFeeReport = async (req, res) => {
  try {
    const { type, format = "excel", ...filters } = req.query;

    let data = [];
    let filename = "";

    switch (type) {
      case "outstanding":
        // Get outstanding fees data
        const outstanding = await Fee.find({
          ...getBranchFilter(req.user),
          status: { $in: ["unpaid", "partially_paid", "overdue"] },
          balance: { $gt: 0 },
        })
          .populate("studentId", "studentId userId currentClassId")
          .populate("studentId.userId", "firstName lastName email")
          .populate("studentId.currentClassId", "name")
          .sort({ balance: -1 });

        data = outstanding.map((fee) => ({
          StudentID: fee.studentId.studentId,
          StudentName: `${fee.studentId.userId.firstName} ${fee.studentId.userId.lastName}`,
          Class: fee.studentId.currentClassId?.name || "N/A",
          AcademicYear: fee.academicYear,
          AcademicTerm: fee.academicTerm,
          TotalDue: fee.totalAmountDue,
          AmountPaid: fee.amountPaid,
          Balance: fee.balance,
          Status: fee.status,
          DueDate: fee.dueDate.toISOString().split("T")[0],
        }));

        filename = `Outstanding_Fees_${new Date().toISOString().split("T")[0]}`;
        break;

      case "payments":
        // Get payments data
        const payments = await Payment.find({
          ...getBranchFilter(req.user),
          status: "completed",
        })
          .populate("studentId", "studentId userId")
          .populate("studentId.userId", "firstName lastName")
          .sort({ paymentDate: -1 });

        data = payments.map((payment) => ({
          ReceiptNumber: payment.receiptNumber,
          StudentID: payment.studentId.studentId,
          StudentName: `${payment.studentId.userId.firstName} ${payment.studentId.userId.lastName}`,
          Amount: payment.amount,
          PaymentMethod: payment.paymentMethod,
          PaymentDate: payment.paymentDate.toISOString().split("T")[0],
          Status: payment.status,
          TransactionID:
            payment.mpesaDetails?.transactionId ||
            payment.manualPaymentDetails?.referenceNumber ||
            "",
        }));

        filename = `Payments_Report_${new Date().toISOString().split("T")[0]}`;
        break;

      default:
        return res.status(400).json({
          success: false,
          message: "Invalid report type",
        });
    }

    if (format === "excel") {
      const ExcelJS = require("exceljs");
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Report");

      if (data.length > 0) {
        // Add headers
        const headers = Object.keys(data[0]);
        worksheet.addRow(headers);

        // Add data
        data.forEach((row) => {
          worksheet.addRow(Object.values(row));
        });

        // Style headers
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFE6E6FA" },
        };
      }

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}.xlsx"`
      );

      await workbook.xlsx.write(res);
    } else {
      // CSV format
      const fields = data.length > 0 ? Object.keys(data[0]) : [];
      const { Parser } = require("json2csv");
      const json2csvParser = new Parser({ fields });
      const csv = json2csvParser.parse(data);

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}.csv"`
      );
      res.send(csv);
    }
  } catch (error) {
    console.error("Export fee report error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export report",
      error: error.message,
    });
  }
};

module.exports = {
  getFeeDashboard,
  getFeeReportByClass,
  getPaymentMethodAnalysis,
  getDefaultersReport,
  exportFeeReport,
};
