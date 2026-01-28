const mongoose = require("mongoose");

const equityAPILogSchema = new mongoose.Schema(
  {
    endpoint: {
      type: String,
      required: true,
      trim: true,
    },
    method: {
      type: String,
      enum: ["GET", "POST", "PUT", "DELETE", "PATCH"],
      required: true,
    },
    requestBody: {
      type: mongoose.Schema.Types.Mixed,
    },
    responseBody: {
      type: mongoose.Schema.Types.Mixed,
    },
    responseCode: {
      type: Number,
      required: true,
    },
    ipAddress: {
      type: String,
      trim: true,
    },
    processingTime: {
      type: Number, // in milliseconds
      required: true,
    },
    errorMessage: {
      type: String,
      trim: true,
    },
    userAgent: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
  },
);

// Index for efficient querying
equityAPILogSchema.index({ createdAt: -1 });
equityAPILogSchema.index({ endpoint: 1, createdAt: -1 });
equityAPILogSchema.index({ responseCode: 1 });

// Method to get daily statistics
equityAPILogSchema.statics.getDailyStats = async function (date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const stats = await this.aggregate([
    {
      $match: {
        createdAt: { $gte: startOfDay, $lte: endOfDay },
      },
    },
    {
      $group: {
        _id: {
          endpoint: "$endpoint",
          responseCode: "$responseCode",
        },
        count: { $sum: 1 },
        avgProcessingTime: { $avg: "$processingTime" },
        maxProcessingTime: { $max: "$processingTime" },
      },
    },
    {
      $sort: { count: -1 },
    },
  ]);

  return stats;
};

// Method to get error logs
equityAPILogSchema.statics.getErrors = async function (hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  return await this.find({
    createdAt: { $gte: since },
    responseCode: { $gte: 400 },
  })
    .sort({ createdAt: -1 })
    .limit(100);
};

const EquityAPILog = mongoose.model("EquityAPILog", equityAPILogSchema);

module.exports = EquityAPILog;
