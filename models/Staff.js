const mongoose = require("mongoose");

const staffSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Staff name is required"],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    position: {
      type: String,
      required: [true, "Position is required"],
      trim: true,
      maxlength: [100, "Position cannot exceed 100 characters"],
    },
    bio: {
      type: String,
      required: [true, "Bio is required"],
      trim: true,
      maxlength: [500, "Bio cannot exceed 500 characters"],
    },
    image: {
      url: {
        type: String,
        trim: true,
      },
      alt: {
        type: String,
        trim: true,
        maxlength: [100, "Alt text cannot exceed 100 characters"],
      },
    },
    department: {
      type: String,
      trim: true,
      maxlength: [100, "Department cannot exceed 100 characters"],
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        "Please provide a valid email address",
      ],
    },
    phone: {
      type: String,
      trim: true,
      maxlength: [20, "Phone number cannot exceed 20 characters"],
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    displayOrder: {
      type: Number,
      default: 0,
      min: 0,
    },
    socialLinks: {
      linkedin: {
        type: String,
        trim: true,
      },
      twitter: {
        type: String,
        trim: true,
      },
      facebook: {
        type: String,
        trim: true,
      },
    },
    qualifications: [
      {
        type: String,
        trim: true,
        maxlength: [200, "Qualification cannot exceed 200 characters"],
      },
    ],
    experience: {
      type: Number,
      min: 0,
      max: 50,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for performance
staffSchema.index({ status: 1 });
staffSchema.index({ displayOrder: 1 });
staffSchema.index({ department: 1 });
staffSchema.index({ status: 1, displayOrder: 1 });

// Virtual for full name (same as name for now, but could be extended)
staffSchema.virtual("fullName").get(function () {
  return this.name;
});

// Virtual for checking if staff is active
staffSchema.virtual("isActive").get(function () {
  return this.status === "active";
});

// Static method to get active staff ordered by display order
staffSchema.statics.getActive = function () {
  return this.find({ status: "active" }).sort({
    displayOrder: 1,
    createdAt: -1,
  });
};

// Static method to get staff by department
staffSchema.statics.getByDepartment = function (department) {
  return this.find({
    status: "active",
    department: new RegExp(department, "i"),
  }).sort({ displayOrder: 1 });
};

module.exports = mongoose.model("Staff", staffSchema);
