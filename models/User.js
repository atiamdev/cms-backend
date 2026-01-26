const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        "Please provide a valid email address",
      ],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters long"],
    },
    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
      maxlength: [50, "First name cannot exceed 50 characters"],
    },
    lastName: {
      type: String,
      required: [true, "Last name is required"],
      trim: true,
      maxlength: [50, "Last name cannot exceed 50 characters"],
    },
    roles: {
      type: [String],
      enum: [
        "superadmin",
        "admin",
        "branchadmin",
        "teacher",
        "student",
        "secretary",
      ],
      required: [true, "At least one role is required"],
      validate: {
        validator: function (roles) {
          return roles && roles.length > 0;
        },
        message: "User must have at least one role",
      },
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: function () {
        // branchId is required for all roles except superadmin
        return !this.roles.includes("superadmin");
      },
    },
    // Multiple branch assignment for admins (new field)
    branchIds: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Branch",
        },
      ],
      default: function () {
        // Initialize with branchId if it exists
        return this.branchId ? [this.branchId] : [];
      },
    },
    status: {
      type: String,
      enum: ["active", "inactive", "suspended", "pending"],
      default: "pending",
    },
    // Add status history tracking
    statusHistory: [
      {
        status: {
          type: String,
          enum: ["active", "inactive", "suspended", "pending"],
          required: true,
        },
        changedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        changedAt: {
          type: Date,
          default: Date.now,
        },
        reason: {
          type: String,
          trim: true,
        },
      },
    ],

    // Add role change history
    roleHistory: [
      {
        oldRoles: {
          type: [String],
          required: true,
        },
        newRoles: {
          type: [String],
          required: true,
        },
        changedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        changedAt: {
          type: Date,
          default: Date.now,
        },
        reason: {
          type: String,
          trim: true,
        },
      },
    ],

    // Add transfer history
    transferHistory: [
      {
        fromBranchId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Branch",
        },
        toBranchId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Branch",
          required: true,
        },
        transferredBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        transferredAt: {
          type: Date,
          default: Date.now,
        },
        reason: {
          type: String,
          trim: true,
        },
      },
    ],

    // ZKTeco Biometric Fields
    biometricId: {
      type: String,
      trim: true,
      sparse: true, // Allow multiple users without biometric ID
      index: true,
    },
    zktecoEnrollNumber: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
    },

    profileDetails: {
      // Common fields
      dateOfBirth: { type: Date },
      gender: {
        type: String,
        enum: ["male", "female", "other"],
      },
      phone: { type: String, trim: true },
      address: {
        street: { type: String, trim: true },
        city: { type: String, trim: true },
        state: { type: String, trim: true },
        zipCode: { type: String, trim: true },
        country: { type: String, trim: true, default: "Kenya" },
      },
      profilePicture: { type: String },

      // Student-specific fields
      studentId: { type: String, trim: true },
      admissionNumber: { type: String, trim: true }, // Maps to ZKTeco SSN field
      admissionDate: { type: Date },
      guardianName: { type: String, trim: true },
      guardianPhone: { type: String, trim: true },
      guardianEmail: { type: String, trim: true, lowercase: true },
      emergencyContact: {
        name: { type: String, trim: true },
        phone: { type: String, trim: true },
        relationship: { type: String, trim: true },
      },

      // WhatsApp notification preferences
      whatsappNotifications: {
        enabled: { type: Boolean, default: true },
        invoiceNotifications: { type: Boolean, default: true },
        attendanceReports: { type: Boolean, default: true },
      },

      // Teacher-specific fields
      employeeId: { type: String, trim: true },
      department: { type: String, trim: true },
      joiningDate: { type: Date },
      qualification: { type: String, trim: true },
      experience: { type: Number }, // in years
      subjects: [{ type: String, trim: true }],

      // Admin/Secretary-specific fields
      designation: { type: String, trim: true },
      permissions: [{ type: String, trim: true }],
      salaryDetails: {
        basicSalary: { type: Number },
        bankName: { type: String, trim: true },
        accountNumber: { type: String, trim: true },
        accountName: { type: String, trim: true },
        branchName: { type: String, trim: true },
        paymentMethod: { type: String, trim: true },
      },
    },
    lastLogin: {
      type: Date,
    },
    loginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: { type: String },
    passwordResetToken: { type: String },
    googleTokens: {
      access_token: { type: String },
      refresh_token: { type: String },
      expiry_date: { type: Number },
      token_type: { type: String },
      scope: { type: String },
    },
    googleProfile: {
      id: { type: String },
      email: { type: String },
      name: { type: String },
      picture: { type: String },
    },
    passwordResetExpires: { type: Date },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret.password;
        delete ret.passwordResetToken;
        delete ret.emailVerificationToken;
        return ret;
      },
    },
    toObject: { virtuals: true },
  },
);

// Indexes for performance
userSchema.index({ email: 1 });
userSchema.index({ branchId: 1 });
userSchema.index({ roles: 1 });
userSchema.index({ status: 1 });
userSchema.index({ "profileDetails.studentId": 1 });
userSchema.index({ "profileDetails.employeeId": 1 });

// Compound indexes
userSchema.index({ branchId: 1, roles: 1 });
userSchema.index({ branchId: 1, status: 1 });

// Virtual for full name
userSchema.virtual("fullName").get(function () {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual for account lock status
userSchema.virtual("isLocked").get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Pre-save middleware to fix address field structure
userSchema.pre("save", function (next) {
  // Fix address field if it's not properly structured
  if (
    typeof this.address === "string" ||
    this.address === null ||
    this.address === undefined
  ) {
    this.address = {};
  }
  next();
});

// Pre-save middleware to hash password
userSchema.pre("save", async function (next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified("password")) return next();

  try {
    // Hash password with cost of 12
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);

    // Update timestamp
    this.updatedAt = Date.now();

    next();
  } catch (error) {
    next(error);
  }
});

// Method to check password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Method to handle login attempts
userSchema.methods.incLoginAttempts = function () {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 },
    });
  }

  const updates = { $inc: { loginAttempts: 1 } };

  // Lock account after 5 failed attempts for 2 hours
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
  }

  return this.updateOne(updates);
};

// Method to reset login attempts
userSchema.methods.resetLoginAttempts = function () {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 },
  });
};

// Method to check if user has specific role
userSchema.methods.hasRole = function (role) {
  return this.roles.includes(role);
};

// Method to check if user has any of the specified roles
userSchema.methods.hasAnyRole = function (roles) {
  return roles.some((role) => this.roles.includes(role));
};

// Method to check if user belongs to branch (or is superadmin)
userSchema.methods.canAccessBranch = function (branchId) {
  if (this.hasRole("superadmin")) return true;
  // Check both branchId (legacy) and branchIds (new)
  if (this.branchId && this.branchId.toString() === branchId.toString()) {
    return true;
  }
  if (this.branchIds && this.branchIds.length > 0) {
    return this.branchIds.some((id) => id.toString() === branchId.toString());
  }
  return false;
};

// Method to add branch to admin
userSchema.methods.addBranch = function (branchId) {
  if (!this.branchIds) {
    this.branchIds = [];
  }
  if (!this.branchIds.some((id) => id.toString() === branchId.toString())) {
    this.branchIds.push(branchId);
    // Update primary branchId if not set
    if (!this.branchId) {
      this.branchId = branchId;
    }
  }
  return this.save();
};

// Method to remove branch from admin
userSchema.methods.removeBranch = function (branchId) {
  if (this.branchIds && this.branchIds.length > 0) {
    this.branchIds = this.branchIds.filter(
      (id) => id.toString() !== branchId.toString(),
    );
    // If removing primary branch, set new primary
    if (this.branchId && this.branchId.toString() === branchId.toString()) {
      this.branchId = this.branchIds.length > 0 ? this.branchIds[0] : null;
    }
  }
  return this.save();
};

// Method to generate and hash password reset token
userSchema.methods.getResetPasswordToken = function () {
  // Generate token
  const resetToken = require("crypto").randomBytes(20).toString("hex");

  // Hash token and set to resetPasswordToken field
  this.passwordResetToken = require("crypto")
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  // Set expire
  this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

  return resetToken;
};

// Static method to find users by branch
userSchema.statics.findByBranch = function (branchId, roles = null) {
  const query = {
    $or: [{ branchId }, { branchIds: branchId }],
  };
  if (roles) {
    query.roles = { $in: Array.isArray(roles) ? roles : [roles] };
  }
  return this.find(query);
};

// Static method to find active users
userSchema.statics.findActive = function (branchId = null) {
  const query = { status: "active" };
  if (branchId) {
    query.branchId = branchId;
  }
  return this.find(query);
};

module.exports = mongoose.model("User", userSchema);
