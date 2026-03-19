const mongoose = require("mongoose");
const SecretaryDailyChecklist = require("../models/SecretaryDailyChecklist");
const SecretaryWeeklyReport = require("../models/SecretaryWeeklyReport");

const NUMERIC_FIELDS = [
  "walkInInquiries",
  "registrationsCompleted",
  "deferredFollowUp",
  "referralWhatsapp",
  "referralTiktok",
  "referralFacebook",
  "referralFamilyFriend",
  "referralBillboard",
  "referralFlyers",
  "whatsappInquiriesReceived",
  "facebookInquiriesComments",
  "tiktokCommentsHandled",
  "jobApplicationEmails",
  "paymentsRecordedKes",
  "cashReceivedKes",
  "receiptsIssued",
  "pettyCashSpentKes",
  "remainingImprestBalanceKes",
];

const STRING_FIELDS = [
  "referralOther",
  "suppliesNotes",
  "issuesNotes",
  "frontOfficeNotes",
  "secretaryName",
  "signature",
];

const YES_NO_FIELDS = [
  "suppliesChecked",
  "issuesEscalated",
  "frontOfficeOrderly",
];

const WEEKLY_NUMERIC_FIELDS = [
  "totalWalkInInquiries",
  "totalRegistrations",
  "referralWhatsapp",
  "referralTiktok",
  "referralFacebook",
  "referralFamilyFriend",
  "referralBillboard",
  "referralFlyers",
  "whatsappInquiries",
  "facebookInquiries",
  "tiktokInquiries",
  "jobRelatedEmails",
  "totalPaymentsRecordedKes",
  "totalCashReceivedKes",
  "totalPettyCashUsedKes",
  "remainingImprestBalanceKes",
];

const WEEKLY_STRING_FIELDS = [
  "referralOther",
  "itemsNeededNextWeek",
  "challengesFaced",
  "systemDowntimeIncidents",
  "recommendations",
  "secretaryName",
  "signature",
];

const toNumber = (value) => {
  if (value === undefined || value === null || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeText = (value) => (value == null ? "" : String(value).trim());

const normalizeYesNo = (value) => {
  const normalized = normalizeText(value).toLowerCase();
  return normalized === "yes" || normalized === "no" ? normalized : "";
};

const normalizeSupplyStatus = (value) => {
  const normalized = normalizeText(value).toLowerCase();
  return ["ok", "low", "critical"].includes(normalized) ? normalized : "";
};

const normalizeChecklistDate = (value) => {
  const sourceDate = value ? new Date(value) : new Date();
  if (Number.isNaN(sourceDate.getTime())) return null;

  return new Date(
    Date.UTC(
      sourceDate.getUTCFullYear(),
      sourceDate.getUTCMonth(),
      sourceDate.getUTCDate(),
    ),
  );
};

const resolveBranchId = (req) => {
  return (
    req.branchId ||
    req.body.branchId ||
    req.query.branchId ||
    req.user?.branchId ||
    null
  );
};

// @desc    Create or update a secretary daily checklist entry
// @route   POST /api/secretary-reports/daily-checklists
// @access  Private (Secretary/Admin)
const saveDailyChecklist = async (req, res) => {
  try {
    const branchId = resolveBranchId(req);
    const secretaryUserId = req.user?._id || req.user?.id;

    if (!branchId) {
      return res.status(400).json({
        success: false,
        message: "Branch context is required to save checklist",
      });
    }

    if (!secretaryUserId) {
      return res.status(400).json({
        success: false,
        message: "User context is required to save checklist",
      });
    }

    const checklistDate = normalizeChecklistDate(req.body.date);
    if (!checklistDate) {
      return res.status(400).json({
        success: false,
        message: "Invalid checklist date",
      });
    }

    const payload = {
      branchId,
      secretaryUserId,
      date: checklistDate,
    };

    NUMERIC_FIELDS.forEach((field) => {
      payload[field] = toNumber(req.body[field]);
    });

    STRING_FIELDS.forEach((field) => {
      payload[field] = normalizeText(req.body[field]);
    });

    YES_NO_FIELDS.forEach((field) => {
      payload[field] = normalizeYesNo(req.body[field]);
    });

    const checklist = await SecretaryDailyChecklist.findOneAndUpdate(
      {
        branchId,
        secretaryUserId,
        date: checklistDate,
      },
      { $set: payload },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    );

    return res.json({
      success: true,
      message: "Daily checklist saved successfully",
      data: checklist,
    });
  } catch (error) {
    console.error("Save daily checklist error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while saving daily checklist",
    });
  }
};

// @desc    Get daily checklist history
// @route   GET /api/secretary-reports/daily-checklists
// @access  Private (Secretary/Admin)
const getDailyChecklists = async (req, res) => {
  try {
    const branchId = resolveBranchId(req);

    if (!branchId) {
      return res.status(400).json({
        success: false,
        message: "Branch context is required to fetch checklist history",
      });
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 20, 1),
      200,
    );
    const search = normalizeText(req.query.search);

    const filter = { branchId };

    if (search) {
      filter.secretaryName = { $regex: search, $options: "i" };
    }

    const startDate = normalizeChecklistDate(req.query.startDate);
    const endDate = normalizeChecklistDate(req.query.endDate);

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = startDate;
      if (endDate) {
        const endOfDay = new Date(endDate);
        endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);
        filter.date.$lt = endOfDay;
      }
    }

    const total = await SecretaryDailyChecklist.countDocuments(filter);

    const checklists = await SecretaryDailyChecklist.find(filter)
      .sort({ date: -1, updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return res.json({
      success: true,
      data: checklists,
      count: checklists.length,
      total,
      currentPage: page,
      totalPages: Math.max(Math.ceil(total / limit), 1),
      pagination: {
        currentPage: page,
        totalPages: Math.max(Math.ceil(total / limit), 1),
        totalItems: total,
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error("Get daily checklist history error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching checklist history",
    });
  }
};

// @desc    Get a single checklist entry by id
// @route   GET /api/secretary-reports/daily-checklists/:id
// @access  Private (Secretary/Admin)
const getDailyChecklistById = async (req, res) => {
  try {
    const branchId = resolveBranchId(req);
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid checklist id",
      });
    }

    const filter = { _id: id };
    if (branchId) filter.branchId = branchId;

    const checklist = await SecretaryDailyChecklist.findOne(filter).lean();

    if (!checklist) {
      return res.status(404).json({
        success: false,
        message: "Checklist entry not found",
      });
    }

    return res.json({
      success: true,
      data: checklist,
    });
  } catch (error) {
    console.error("Get checklist by id error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching checklist entry",
    });
  }
};

// @desc    Create or update a weekly secretary report entry
// @route   POST /api/secretary-reports/weekly-reports
// @access  Private (Secretary/Admin)
const saveWeeklyReport = async (req, res) => {
  try {
    const branchId = resolveBranchId(req);
    const secretaryUserId = req.user?._id || req.user?.id;

    if (!branchId) {
      return res.status(400).json({
        success: false,
        message: "Branch context is required to save weekly report",
      });
    }

    if (!secretaryUserId) {
      return res.status(400).json({
        success: false,
        message: "User context is required to save weekly report",
      });
    }

    const weekEnding = normalizeChecklistDate(req.body.weekEnding);
    if (!weekEnding) {
      return res.status(400).json({
        success: false,
        message: "Invalid week ending date",
      });
    }

    const payload = {
      branchId,
      secretaryUserId,
      weekEnding,
      suppliesStatus: normalizeSupplyStatus(req.body.suppliesStatus),
    };

    WEEKLY_NUMERIC_FIELDS.forEach((field) => {
      payload[field] = toNumber(req.body[field]);
    });

    WEEKLY_STRING_FIELDS.forEach((field) => {
      payload[field] = normalizeText(req.body[field]);
    });

    const weeklyReport = await SecretaryWeeklyReport.findOneAndUpdate(
      {
        branchId,
        secretaryUserId,
        weekEnding,
      },
      { $set: payload },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    );

    return res.json({
      success: true,
      message: "Weekly report saved successfully",
      data: weeklyReport,
    });
  } catch (error) {
    console.error("Save weekly report error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while saving weekly report",
    });
  }
};

// @desc    Get weekly report history
// @route   GET /api/secretary-reports/weekly-reports
// @access  Private (Secretary/Admin)
const getWeeklyReports = async (req, res) => {
  try {
    const branchId = resolveBranchId(req);

    if (!branchId) {
      return res.status(400).json({
        success: false,
        message: "Branch context is required to fetch weekly reports",
      });
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 20, 1),
      200,
    );
    const search = normalizeText(req.query.search);

    const filter = { branchId };

    if (search) {
      filter.secretaryName = { $regex: search, $options: "i" };
    }

    const startDate = normalizeChecklistDate(req.query.startDate);
    const endDate = normalizeChecklistDate(req.query.endDate);

    if (startDate || endDate) {
      filter.weekEnding = {};
      if (startDate) filter.weekEnding.$gte = startDate;
      if (endDate) {
        const endOfDay = new Date(endDate);
        endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);
        filter.weekEnding.$lt = endOfDay;
      }
    }

    const total = await SecretaryWeeklyReport.countDocuments(filter);

    const reports = await SecretaryWeeklyReport.find(filter)
      .sort({ weekEnding: -1, updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return res.json({
      success: true,
      data: reports,
      count: reports.length,
      total,
      currentPage: page,
      totalPages: Math.max(Math.ceil(total / limit), 1),
      pagination: {
        currentPage: page,
        totalPages: Math.max(Math.ceil(total / limit), 1),
        totalItems: total,
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error("Get weekly report history error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching weekly reports",
    });
  }
};

// @desc    Get a single weekly report entry by id
// @route   GET /api/secretary-reports/weekly-reports/:id
// @access  Private (Secretary/Admin)
const getWeeklyReportById = async (req, res) => {
  try {
    const branchId = resolveBranchId(req);
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid weekly report id",
      });
    }

    const filter = { _id: id };
    if (branchId) filter.branchId = branchId;

    const report = await SecretaryWeeklyReport.findOne(filter).lean();

    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Weekly report entry not found",
      });
    }

    return res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    console.error("Get weekly report by id error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching weekly report entry",
    });
  }
};

module.exports = {
  saveDailyChecklist,
  getDailyChecklists,
  getDailyChecklistById,
  saveWeeklyReport,
  getWeeklyReports,
  getWeeklyReportById,
};
