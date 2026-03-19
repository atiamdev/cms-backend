const mongoose = require("mongoose");

const secretaryDailyChecklistSchema = new mongoose.Schema(
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
    date: {
      type: Date,
      required: true,
      index: true,
    },

    // Daily client and admissions
    walkInInquiries: { type: Number, default: 0 },
    registrationsCompleted: { type: Number, default: 0 },
    deferredFollowUp: { type: Number, default: 0 },
    referralWhatsapp: { type: Number, default: 0 },
    referralTiktok: { type: Number, default: 0 },
    referralFacebook: { type: Number, default: 0 },
    referralFamilyFriend: { type: Number, default: 0 },
    referralBillboard: { type: Number, default: 0 },
    referralFlyers: { type: Number, default: 0 },
    referralOther: { type: String, trim: true, default: "" },

    // Daily communication
    whatsappInquiriesReceived: { type: Number, default: 0 },
    facebookInquiriesComments: { type: Number, default: 0 },
    tiktokCommentsHandled: { type: Number, default: 0 },
    jobApplicationEmails: { type: Number, default: 0 },

    // Daily finance
    paymentsRecordedKes: { type: Number, default: 0 },
    cashReceivedKes: { type: Number, default: 0 },
    receiptsIssued: { type: Number, default: 0 },
    pettyCashSpentKes: { type: Number, default: 0 },
    remainingImprestBalanceKes: { type: Number, default: 0 },

    // Daily operations
    suppliesChecked: {
      type: String,
      enum: ["", "yes", "no"],
      default: "",
    },
    suppliesNotes: { type: String, trim: true, default: "" },
    issuesEscalated: {
      type: String,
      enum: ["", "yes", "no"],
      default: "",
    },
    issuesNotes: { type: String, trim: true, default: "" },
    frontOfficeOrderly: {
      type: String,
      enum: ["", "yes", "no"],
      default: "",
    },
    frontOfficeNotes: { type: String, trim: true, default: "" },

    // Sign-off
    secretaryName: { type: String, trim: true, default: "" },
    signature: { type: String, trim: true, default: "" },
  },
  {
    timestamps: true,
  },
);

secretaryDailyChecklistSchema.index(
  { branchId: 1, secretaryUserId: 1, date: 1 },
  { unique: true },
);

module.exports = mongoose.model(
  "SecretaryDailyChecklist",
  secretaryDailyChecklistSchema,
);
