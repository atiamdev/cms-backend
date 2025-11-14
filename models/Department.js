const mongoose = require("mongoose");

const departmentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Department name is required"],
      trim: true,
      maxlength: [100, "Department name cannot exceed 100 characters"],
      unique: true,
    },
    code: {
      type: String,
      required: [true, "Department code is required"],
      trim: true,
      uppercase: true,
      maxlength: [10, "Department code cannot exceed 10 characters"],
      unique: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, "Description cannot exceed 500 characters"],
    },
    headOfDepartment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false, // Optional - department can exist without a head initially
    },
    contactInfo: {
      phone: { type: String, trim: true },
      email: { type: String, trim: true, lowercase: true },
      office: { type: String, trim: true },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: [true, "Branch is required"],
    },
    establishedDate: {
      type: Date,
    },
    programs: [
      {
        type: String,
        trim: true,
      },
    ],
    whatsappGroupLink: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          // Basic URL validation for WhatsApp links
          return !v || /^https?:\/\/(chat\.whatsapp\.com|wa\.me)\/.+$/.test(v);
        },
        message: "WhatsApp group link must be a valid WhatsApp URL",
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for better query performance
departmentSchema.index({ branchId: 1, name: 1 });
departmentSchema.index({ code: 1 });
departmentSchema.index({ isActive: 1 });

// Virtual for student count
departmentSchema.virtual("studentCount", {
  ref: "Student",
  localField: "_id",
  foreignField: "departmentId",
  count: true,
});

// Virtual for course count
departmentSchema.virtual("courseCount", {
  ref: "Course",
  localField: "_id",
  foreignField: "departmentId",
  count: true,
});

// Virtual for staff count (teachers in this department)
departmentSchema.virtual("staffCount", {
  ref: "User",
  localField: "_id",
  foreignField: "departmentId",
  count: true,
});

// Pre-save middleware to ensure code is uppercase
departmentSchema.pre("save", function (next) {
  if (this.code) {
    this.code = this.code.toUpperCase();
  }
  next();
});

// Static method to find active departments
departmentSchema.statics.findActive = function () {
  return this.find({ isActive: true });
};

// Instance method to get department statistics
departmentSchema.methods.getStatistics = async function () {
  const [studentCount, courseCount, staffCount] = await Promise.all([
    mongoose.model("Student").countDocuments({ departmentId: this._id }),
    mongoose.model("Course").countDocuments({ departmentId: this._id }),
    mongoose.model("User").countDocuments({
      departmentId: this._id,
      roles: { $in: ["teacher", "hod"] },
    }),
  ]);

  return {
    studentCount,
    courseCount,
    staffCount,
    totalPrograms: this.programs?.length || 0,
  };
};

module.exports = mongoose.model("Department", departmentSchema);
