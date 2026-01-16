const mongoose = require("mongoose");

const academicTermSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Term name is required"],
      trim: true,
      maxlength: [100, "Term name cannot exceed 100 characters"],
    },
    code: {
      type: String,
      required: [true, "Term code is required"],
      trim: true,
      uppercase: true,
      unique: true,
      maxlength: [20, "Term code cannot exceed 20 characters"],
    },
    academicYear: {
      type: String,
      required: [true, "Academic year is required"],
      trim: true,
    },
    startDate: {
      type: Date,
      required: [true, "Start date is required"],
    },
    endDate: {
      type: Date,
      required: [true, "End date is required"],
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    isCurrent: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["upcoming", "active", "completed", "archived"],
      default: "upcoming",
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, "Description cannot exceed 500 characters"],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false, // Optional to allow migration from old data
    },
    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for performance
academicTermSchema.index({ code: 1 });
academicTermSchema.index({ academicYear: 1 });
academicTermSchema.index({ status: 1 });
academicTermSchema.index({ isActive: 1 });
academicTermSchema.index({ isCurrent: 1 });
academicTermSchema.index({ startDate: 1, endDate: 1 });

// Compound index for unique term per academic year
academicTermSchema.index({ code: 1, academicYear: 1 }, { unique: true });

// Virtual to check if term is ongoing
academicTermSchema.virtual("isOngoing").get(function () {
  const now = new Date();
  return this.startDate <= now && this.endDate >= now;
});

// Virtual for duration in days
academicTermSchema.virtual("durationDays").get(function () {
  const diffTime = Math.abs(this.endDate - this.startDate);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Pre-save middleware to update status based on dates
academicTermSchema.pre("save", function (next) {
  const now = new Date();

  if (this.startDate > now) {
    this.status = "upcoming";
  } else if (this.startDate <= now && this.endDate >= now) {
    this.status = "active";
  } else if (this.endDate < now && this.status !== "archived") {
    this.status = "completed";
  }

  next();
});

// Method to activate term (only one can be active at a time)
academicTermSchema.statics.activateTerm = async function (termId) {
  try {
    // Deactivate all terms
    await this.updateMany({}, { isActive: false });

    // Activate the specified term
    const term = await this.findByIdAndUpdate(
      termId,
      { isActive: true },
      { new: true }
    );

    return term;
  } catch (error) {
    throw error;
  }
};

// Method to set current term (only one can be current at a time)
academicTermSchema.statics.setCurrentTerm = async function (termId) {
  try {
    // Set all terms as not current
    await this.updateMany({}, { isCurrent: false });

    // Set the specified term as current
    const term = await this.findByIdAndUpdate(
      termId,
      { isCurrent: true },
      { new: true }
    );

    return term;
  } catch (error) {
    throw error;
  }
};

// Method to archive term
academicTermSchema.methods.archive = function () {
  this.status = "archived";
  this.isActive = false;
  this.isCurrent = false;
  return this.save();
};

// Method to get active term
academicTermSchema.statics.getActiveTerm = function () {
  return this.findOne({ isActive: true });
};

// Method to get current term
academicTermSchema.statics.getCurrentTerm = function () {
  return this.findOne({ isCurrent: true });
};

module.exports = mongoose.model("AcademicTerm", academicTermSchema);
