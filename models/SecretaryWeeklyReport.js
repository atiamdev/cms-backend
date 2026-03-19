const mongoose = require("mongoose");

const secretaryWeeklyReportSchema = new mongoose.Schema(
  {
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
      index: true,
    },
    secretaryUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    weekEnding: {
      type: Date,
      required: true,
      index: true,
    },

    // Weekly client numbers
    totalWalkInInquiries: { type: Number, default: 0 },
    totalRegistrations: { type: Number, default: 0 },

    // Referral sources
    referralWhatsapp: { type: Number, default: 0 },
    referralTiktok: { type: Number, default: 0 },
    referralFacebook: { type: Number, default: 0 },
    referralFamilyFriend: { type: Number, default: 0 },
    referralBillboard: { type: Number, default: 0 },
    referralFlyers: { type: Number, default: 0 },
    referralOther: { type: String, trim: true, default: "" },

    // Communication summary
    whatsappInquiries: { type: Number, default: 0 },
    facebookInquiries: { type: Number, default: 0 },
    tiktokInquiries: { type: Number, default: 0 },
    jobRelatedEmails: { type: Number, default: 0 },

    // Financial summary
    totalPaymentsRecordedKes: { type: Number, default: 0 },
    totalCashReceivedKes: { type: Number, default: 0 },
    totalPettyCashUsedKes: { type: Number, default: 0 },
    remainingImprestBalanceKes: { type: Number, default: 0 },

    // Supplies and operations
    suppliesStatus: {
      type: String,
      enum: ["", "ok", "low", "critical"],
      default: "",
    },
    itemsNeededNextWeek: { type: String, trim: true, default: "" },

    // Issues and observations
    challengesFaced: { type: String, trim: true, default: "" },
    systemDowntimeIncidents: { type: String, trim: true, default: "" },
    recommendations: { type: String, trim: true, default: "" },

    // Declaration
    secretaryName: { type: String, trim: true, default: "" },
    signature: { type: String, trim: true, default: "" },
  },
  {
    timestamps: true,
  },
);

secretaryWeeklyReportSchema.index(
  { branchId: 1, secretaryUserId: 1, weekEnding: 1 },
  { unique: true },
);

module.exports = mongoose.model(
  "SecretaryWeeklyReport",
  secretaryWeeklyReportSchema,
);
