const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { validationResult } = require("express-validator");
const User = require("../models/User");
const Branch = require("../models/Branch");
const AuditLogger = require("../utils/auditLogger");

// Temporary state store for OAuth flows (in production, use Redis/database)
const oauthStates = new Map();

// Clean up expired states every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [state, data] of oauthStates.entries()) {
    if (now - data.timestamp > 10 * 60 * 1000) {
      // 10 minutes expiry
      oauthStates.delete(state);
    }
  }
}, 5 * 60 * 1000);

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || "24h",
  });
};

// Generate Refresh Token
const generateRefreshToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRE || "7d",
  });
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public (for first superadmin) / Admin (for others)
const register = async (req, res) => {
  console.log("🔥 REGISTER ENDPOINT CALLED");
  console.log("Request body:", JSON.stringify(req.body, null, 2));
  console.log("User authenticated:", !!req.user);
  if (req.user) {
    console.log("User roles:", req.user.roles);
  }
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log("❌ VALIDATION ERRORS:", errors.array());
      return res.status(400).json({
        success: false,
        message: "Validation errors",
        errors: errors.array(),
      });
    }
    console.log("✅ VALIDATION PASSED");

    const {
      email,
      password,
      firstName,
      lastName,
      roles,
      branchId,
      profileDetails,
      status: requestedStatus,
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User with this email already exists",
      });
    }

    // Check if this is the first user (make them superadmin)
    const userCount = await User.countDocuments();
    const isFirstUser = userCount === 0;

    let finalRoles = roles;
    let finalBranchId = branchId;
    let finalStatus = requestedStatus;

    if (isFirstUser) {
      // First user becomes superadmin and active
      finalRoles = ["superadmin"];
      finalBranchId = null;
      finalStatus = "active";
    } else {
      // For subsequent users, validate roles and branch
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required to create users",
        });
      }

      // Only superadmin and admin can create users
      if (!req.user.hasAnyRole(["superadmin", "admin", "secretary"])) {
        return res.status(403).json({
          success: false,
          message: "Insufficient privileges to create users",
        });
      }

      // Validate branch exists
      if (finalBranchId) {
        const branch = await Branch.findById(finalBranchId);
        if (!branch) {
          return res.status(400).json({
            success: false,
            message: "Invalid branch ID",
          });
        }

        // Non-superadmin users can only create users for their branch
        if (
          !req.user.hasRole("superadmin") &&
          req.user.branchId.toString() !== finalBranchId
        ) {
          return res.status(403).json({
            success: false,
            message: "Cannot create users for other branches",
          });
        }
      }

      // Validate roles
      const allowedRoles = ["admin", "teacher", "student", "secretary"];
      if (!req.user.hasRole("superadmin")) {
        // Only superadmin can create superadmin users
        if (finalRoles.includes("superadmin")) {
          return res.status(403).json({
            success: false,
            message: "Cannot create superadmin users",
          });
        }
      }

      // Ensure roles are valid
      const invalidRoles = finalRoles.filter(
        (role) => !allowedRoles.includes(role) && role !== "superadmin"
      );
      if (invalidRoles.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Invalid roles: ${invalidRoles.join(", ")}`,
        });
      }

      // All subsequent users start as pending and require email verification
      finalStatus = "pending";
    }

    // Create user
    console.log(`Creating user with finalStatus: ${finalStatus}`);
    const crypto = require("crypto");
    const verificationToken = isFirstUser
      ? undefined
      : crypto.randomBytes(32).toString("hex");
    const user = await User.create({
      email,
      password,
      firstName,
      lastName,
      roles: finalRoles,
      branchId: finalBranchId,
      profileDetails,
      ...(isFirstUser ? { status: "active" } : {}),
      emailVerified: isFirstUser ? true : false,
      emailVerificationToken: verificationToken,
    });
    console.log(`User created with status: ${user.status}`);

    if (isFirstUser) {
      // Send welcome email for first user
      console.log(
        `Sending welcome email to ${user.email} for user ${user.firstName} ${user.lastName}`
      );
      try {
        const { sendEmail, emailTemplates } = require("../utils/emailService");
        const loginUrl =
          process.env.CMS_FRONTEND_URL || "http://localhost:3000";

        console.log(`Login URL: ${loginUrl}`);
        await sendEmail({
          to: user.email,
          ...emailTemplates.welcome(
            `${user.firstName} ${user.lastName}`,
            loginUrl
          ),
        });
        console.log(`Welcome email sent successfully to ${user.email}`);
      } catch (emailError) {
        console.error("Welcome email sending failed:", emailError);
        // Don't fail registration if email fails
      }
    } else {
      // Send verification email for subsequent users
      console.log(
        `Sending verification email to ${user.email} for user ${user.firstName} ${user.lastName}`
      );
      try {
        const { sendEmail, emailTemplates } = require("../utils/emailService");
        const baseUrl = process.env.CMS_FRONTEND_URL || "http://localhost:3000";
        const verificationUrl = `${baseUrl}/verify-email?token=${verificationToken}`;

        console.log(`Verification URL: ${verificationUrl}`);
        await sendEmail({
          to: user.email,
          ...emailTemplates.emailVerification(
            `${user.firstName} ${user.lastName}`,
            verificationUrl
          ),
        });
        console.log(`Verification email sent successfully to ${user.email}`);
      } catch (emailError) {
        console.error("Verification email sending failed:", emailError);
        // Don't fail registration if email fails
      }
    }

    // Generate token
    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    res.status(201).json({
      success: true,
      message: isFirstUser
        ? "Superadmin account created successfully"
        : "User registered successfully. Please check your email to verify your account.",
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        roles: user.roles,
        branchId: user.branchId ? user.branchId.toString() : null,
        status: user.status,
        emailVerified: user.emailVerified,
        profileDetails: user.profileDetails,
      },
      token: isFirstUser ? token : undefined,
      refreshToken: isFirstUser ? refreshToken : undefined,
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during registration",
    });
  }
};

// @desc    Verify user email
// @route   GET /api/auth/verify-email
// @access  Public
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Verification token is required",
      });
    }

    // Find user by verification token
    const user = await User.findOne({ emailVerificationToken: token });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired verification token",
      });
    }

    // Check if already verified
    if (user.emailVerified) {
      return res.status(400).json({
        success: false,
        message: "Email already verified",
      });
    }

    // Update user
    user.status = "active";
    user.emailVerified = true;
    user.emailVerificationToken = undefined; // Clear token

    await user.save();

    // Send welcome email now that account is active
    try {
      const { sendEmail, emailTemplates } = require("../utils/emailService");
      const loginUrl = process.env.CMS_FRONTEND_URL || "http://localhost:3000";

      await sendEmail({
        to: user.email,
        ...emailTemplates.accountActivated(
          `${user.firstName} ${user.lastName}`,
          loginUrl
        ),
      });
      console.log(`Welcome email sent successfully to ${user.email}`);
    } catch (emailError) {
      console.error("Welcome email sending failed:", emailError);
      // Don't fail verification if email fails
    }

    res.json({
      success: true,
      message: "Email verified successfully. Your account is now active.",
    });
  } catch (error) {
    console.error("Email verification error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during email verification",
    });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation errors",
        errors: errors.array(),
      });
    }

    const { email, password } = req.body;

    // Find user with password field
    const user = await User.findOne({ email })
      .select("+password")
      .populate("branchId", "name");

    if (!user) {
      // Log failed login attempt
      await AuditLogger.logAuthenticationEvent(
        null,
        "USER_LOGIN_FAILED",
        req,
        false,
        "User not found"
      );

      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Check if account is locked
    if (user.isLocked) {
      // Log failed login attempt for locked account
      await AuditLogger.logAuthenticationEvent(
        user,
        "USER_LOGIN_FAILED",
        req,
        false,
        "Account is locked"
      );

      return res.status(423).json({
        success: false,
        message:
          "Account is temporarily locked due to failed login attempts. Please try again later.",
      });
    }

    // Check password
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      // Increment login attempts
      await user.incLoginAttempts();

      // Log failed login attempt
      await AuditLogger.logAuthenticationEvent(
        user,
        "USER_LOGIN_FAILED",
        req,
        false,
        "Invalid password"
      );

      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Check if email is verified
    if (!user.emailVerified) {
      // Log failed login attempt for unverified email
      await AuditLogger.logAuthenticationEvent(
        user,
        "USER_LOGIN_FAILED",
        req,
        false,
        "Email not verified"
      );

      return res.status(401).json({
        success: false,
        message: "Please verify your email before logging in.",
      });
    }

    // Check if account is active
    if (user.status !== "active") {
      // Log failed login attempt for inactive account
      await AuditLogger.logAuthenticationEvent(
        user,
        "USER_LOGIN_FAILED",
        req,
        false,
        "Account is not active"
      );

      return res.status(401).json({
        success: false,
        message: "Account is not active. Please contact administrator.",
      });
    }

    // Reset login attempts on successful login
    if (user.loginAttempts > 0) {
      await user.resetLoginAttempts();
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Log successful login
    await AuditLogger.logAuthenticationEvent(user, "USER_LOGIN", req, true);

    // Generate tokens
    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    res.json({
      success: true,
      message: "Login successful",
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        roles: user.roles,
        branchId: user.branchId ? user.branchId._id : null,
        branch: user.branchId
          ? {
              id: user.branchId._id,
              name: user.branchId.name,
            }
          : null,
        status: user.status,
        profileDetails: user.profileDetails,
        lastLogin: user.lastLogin,
      },
      token,
      refreshToken,
    });
  } catch (error) {
    console.error("Login error:", error);

    // Log system error during login
    await AuditLogger.log({
      user: req.body.email
        ? { _id: null, name: "Unknown", email: req.body.email }
        : null,
      action: "USER_LOGIN_FAILED",
      resourceType: "USER",
      description: "System error during login",
      req,
      success: false,
      errorMessage: error.message,
      severity: "HIGH",
      category: "AUTHENTICATION",
    }).catch(() => {});

    res.status(500).json({
      success: false,
      message: "Server error during login",
    });
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate(
      "branchId",
      "name configuration"
    );

    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        roles: user.roles,
        branchId: user.branchId ? user.branchId._id : null,
        branch: user.branchId
          ? {
              id: user.branchId._id,
              name: user.branchId.name,
              configuration: user.branchId.configuration,
            }
          : null,
        status: user.status,
        profileDetails: user.profileDetails,
        googleTokens: user.googleTokens,
        googleProfile: user.googleProfile,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Refresh access token
// @route   POST /api/auth/refresh
// @access  Public
const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: "Refresh token is required",
      });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    // Get user
    const user = await User.findById(decoded.id);

    if (!user || user.status !== "active") {
      return res.status(401).json({
        success: false,
        message: "Invalid refresh token",
      });
    }

    // Generate new access token
    const newToken = generateToken(user._id);

    res.json({
      success: true,
      token: newToken,
    });
  } catch (error) {
    console.error("Refresh token error:", error);
    res.status(401).json({
      success: false,
      message: "Invalid refresh token",
    });
  }
};

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
const logout = async (req, res) => {
  try {
    // In a stateless JWT setup, logout is handled client-side
    // You could implement token blacklisting here if needed

    res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during logout",
    });
  }
};

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
const changePassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation errors",
        errors: errors.array(),
      });
    }

    const { currentPassword, newPassword } = req.body;

    // Get user with password
    const user = await User.findById(req.user._id).select("+password");

    // Check current password
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during password change",
    });
  }
};

// @desc    Forgot password - Send reset email
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation errors",
        errors: errors.array(),
      });
    }

    const { email } = req.body;

    // Find user by email and check if active
    const user = await User.findOne({ email, status: "active" });
    if (!user) {
      // Don't reveal if email exists or not for security
      return res.json({
        success: true,
        message:
          "If an account with that email exists, a password reset link has been sent.",
      });
    }

    // Generate reset token
    const resetToken = user.getResetPasswordToken();
    await user.save({ validateBeforeSave: false });

    // Create reset URL
    const resetUrl = `${
      process.env.CMS_FRONTEND_URL || "http://localhost:3000"
    }/reset-password/${resetToken}`;

    // Send email
    const { sendEmail, emailTemplates } = require("../utils/emailService");

    try {
      await sendEmail({
        to: user.email,
        ...emailTemplates.passwordReset(
          resetUrl,
          `${user.firstName} ${user.lastName}`
        ),
      });

      res.json({
        success: true,
        message: "Password reset link sent to your email",
      });
    } catch (emailError) {
      // Reset the token if email fails
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save({ validateBeforeSave: false });

      console.error("Email sending failed:", emailError);
      return res.status(500).json({
        success: false,
        message: "Email could not be sent. Please try again later.",
      });
    }
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during password reset request",
    });
  }
};

// @desc    Reset password using token
// @route   PUT /api/auth/reset-password/:token
// @access  Public
const resetPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation errors",
        errors: errors.array(),
      });
    }

    const { token } = req.params;
    const { password } = req.body;

    // Hash the token to compare with stored hash
    const crypto = require("crypto");
    const resetPasswordToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    // Find user with valid token
    const user = await User.findOne({
      passwordResetToken: resetPasswordToken,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset token",
      });
    }

    // Set new password
    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    res.json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during password reset",
    });
  }
};

// @desc    Activate/Deactivate user
// @route   PUT /api/auth/users/:id/status
// @access  Private (SuperAdmin, Admin)
const updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    // Validate status
    const validStatuses = ["active", "inactive", "suspended", "pending"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    // Find the user to update
    const userToUpdate = await User.findById(id).populate("branchId", "name");

    if (!userToUpdate) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check permissions
    const currentUser = req.user;

    // Prevent superadmin status changes by non-superadmins
    if (
      userToUpdate.hasRole("superadmin") &&
      !currentUser.hasRole("superadmin")
    ) {
      return res.status(403).json({
        success: false,
        message: "Only superadmins can modify superadmin accounts",
      });
    }

    // Non-superadmin users can only modify users in their branch
    if (!currentUser.hasRole("superadmin")) {
      if (
        !userToUpdate.branchId ||
        userToUpdate.branchId._id.toString() !== currentUser.branchId.toString()
      ) {
        return res.status(403).json({
          success: false,
          message: "You can only modify users in your branch",
        });
      }
    }

    // Prevent users from deactivating themselves
    if (userToUpdate._id.toString() === currentUser._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot change your own account status",
      });
    }

    // Update user status
    userToUpdate.status = status;
    userToUpdate.updatedAt = new Date();

    // Add status change to user's history (if you want to track this)
    if (!userToUpdate.statusHistory) {
      userToUpdate.statusHistory = [];
    }

    userToUpdate.statusHistory.push({
      status,
      changedBy: currentUser._id,
      changedAt: new Date(),
      reason: reason || `Status changed to ${status}`,
    });

    await userToUpdate.save();

    // Remove sensitive data before sending response
    const userResponse = userToUpdate.toObject();
    delete userResponse.password;
    delete userResponse.passwordResetToken;
    delete userResponse.emailVerificationToken;

    res.json({
      success: true,
      message: `User status updated to ${status} successfully`,
      user: userResponse,
    });
  } catch (error) {
    console.error("Update user status error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating user status",
    });
  }
};

// @desc    Get all users (for admin management)
// @route   GET /api/auth/users
// @access  Private (SuperAdmin, Admin)
const getUsers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      role,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const currentUser = req.user;
    let query = {};

    // Non-superadmin users can only see users in their branch
    if (!currentUser.hasRole("superadmin")) {
      query.branchId = currentUser.branchId;
    }

    // Filter by status
    if (status) {
      query.status = status;
    }

    // Filter by role
    if (role) {
      query.roles = { $in: [role] };
    }

    // Build aggregation pipeline for search
    const pipeline = [
      { $match: query },
      {
        $lookup: {
          from: "branches",
          localField: "branchId",
          foreignField: "_id",
          as: "branchInfo",
        },
      },
    ];

    // Add search filter
    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { firstName: { $regex: search, $options: "i" } },
            { lastName: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
            { "branchInfo.name": { $regex: search, $options: "i" } },
          ],
        },
      });
    }

    // Add sorting
    const sortDirection = sortOrder === "desc" ? -1 : 1;
    pipeline.push({ $sort: { [sortBy]: sortDirection } });

    // Add pagination
    pipeline.push(
      { $skip: (page - 1) * parseInt(limit) },
      { $limit: parseInt(limit) }
    );

    // Remove sensitive fields
    pipeline.push({
      $project: {
        password: 0,
        passwordResetToken: 0,
        emailVerificationToken: 0,
        loginAttempts: 0,
        lockUntil: 0,
      },
    });

    // Execute aggregation
    const users = await User.aggregate(pipeline);

    // Get total count
    const totalCountPipeline = [...pipeline];
    totalCountPipeline.splice(-3); // Remove projection, skip and limit stages
    totalCountPipeline.push({ $count: "total" });

    const countResult = await User.aggregate(totalCountPipeline);
    const total = countResult.length > 0 ? countResult[0].total : 0;

    res.json({
      success: true,
      count: users.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      users,
    });
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching users",
    });
  }
};

// @desc    Get pending users (for activation)
// @route   GET /api/auth/users/pending
// @access  Private (SuperAdmin, Admin)
const getPendingUsers = async (req, res) => {
  try {
    const currentUser = req.user;
    let query = { status: "pending" };

    // Non-superadmin users can only see pending users in their branch
    if (!currentUser.hasRole("superadmin")) {
      query.branchId = currentUser.branchId;
    }

    const pendingUsers = await User.find(query)
      .populate("branchId", "name")
      .select("-password -passwordResetToken -emailVerificationToken")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: pendingUsers.length,
      users: pendingUsers,
    });
  } catch (error) {
    console.error("Get pending users error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching pending users",
    });
  }
};

// @desc    Bulk activate users
// @route   PUT /api/auth/users/bulk-activate
// @access  Private (SuperAdmin, Admin)
const bulkActivateUsers = async (req, res) => {
  try {
    const { userIds, reason = "Bulk activation" } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "User IDs array is required",
      });
    }

    const currentUser = req.user;
    let query = { _id: { $in: userIds } };

    // Non-superadmin users can only activate users in their branch
    if (!currentUser.hasRole("superadmin")) {
      query.branchId = currentUser.branchId;
    }

    const result = await User.updateMany(query, {
      $set: {
        status: "active",
        updatedAt: new Date(),
      },
      $push: {
        statusHistory: {
          status: "active",
          changedBy: currentUser._id,
          changedAt: new Date(),
          reason,
        },
      },
    });

    res.json({
      success: true,
      message: `${result.modifiedCount} users activated successfully`,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Bulk activate users error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while activating users",
    });
  }
};

// @desc    Get Google OAuth URL for connecting account
// @route   GET /api/auth/google/url
// @access  Private
const getGoogleAuthUrl = async (req, res) => {
  try {
    const { google } = require("googleapis");

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI ||
        `${
          process.env.BACKEND_URL || "http://localhost:5000"
        }/api/auth/google/callback`
    );

    const scopes = [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "openid",
    ];

    const crypto = require("crypto");
    const stateToken = crypto.randomBytes(32).toString("hex");

    // Store state mapping temporarily
    oauthStates.set(stateToken, {
      userId: req.user._id.toString(),
      timestamp: Date.now(),
      purpose: "google_connect",
    });

    const url = oauth2Client.generateAuthUrl({
      access_type: "offline", // Request refresh token
      prompt: "consent", // Force consent screen to get refresh token
      scope: scopes,
      state: stateToken, // Use secure state token instead of userId
    });

    res.json({
      success: true,
      authUrl: url,
    });
  } catch (error) {
    console.error("Get Google auth URL error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate Google auth URL",
      error: error.message,
    });
  }
};

// @desc    Handle Google OAuth callback
// @route   GET /api/auth/google/callback
// @access  Public (but handled by Google)
const connectGoogleAccount = async (req, res) => {
  try {
    const { code, state: stateToken } = req.query;

    // Validate state token
    const stateData = oauthStates.get(stateToken);
    if (!stateData || stateData.purpose !== "google_connect") {
      console.warn(`Invalid OAuth state token attempted: ${stateToken}`);
      return res.redirect(
        `${
          process.env.FRONTEND_URL || "http://localhost:3000"
        }/profile?google=error`
      );
    }

    // Check if state token has expired (10 minutes)
    if (Date.now() - stateData.timestamp > 10 * 60 * 1000) {
      oauthStates.delete(stateToken);
      console.warn(`Expired OAuth state token used: ${stateToken}`);
      return res.redirect(
        `${
          process.env.FRONTEND_URL || "http://localhost:3000"
        }/profile?google=error`
      );
    }

    const userId = stateData.userId;

    // Validate that user exists
    const existingUser = await User.findById(userId);
    if (!existingUser) {
      return res.redirect(
        `${
          process.env.FRONTEND_URL || "http://localhost:3000"
        }/profile?google=error`
      );
    }

    // Remove state token after use
    oauthStates.delete(stateToken);

    const { google } = require("googleapis");

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI ||
        `${
          process.env.BACKEND_URL || "http://localhost:5000"
        }/api/auth/google/callback`
    );

    const { tokens } = await oauth2Client.getToken(code);

    console.log("Tokens received:", {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiryDate: tokens.expiry_date,
      tokenType: tokens.token_type,
    });

    // Set credentials
    oauth2Client.setCredentials(tokens);

    // Try to refresh access token to ensure validity
    let finalTokens = tokens;
    try {
      await oauth2Client.refreshAccessToken();
      finalTokens = oauth2Client.credentials;
    } catch (refreshError) {
      console.warn(
        "Token refresh failed, using original tokens:",
        refreshError.message
      );
      finalTokens = tokens;
    }

    // Get user info
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();

    // Update user with Google tokens
    await User.findByIdAndUpdate(userId, {
      googleTokens: {
        access_token: finalTokens.access_token,
        refresh_token: finalTokens.refresh_token || tokens.refresh_token,
        expiry_date: finalTokens.expiry_date,
        token_type: finalTokens.token_type,
        scope: finalTokens.scope,
      },
      googleProfile: {
        id: userInfo.id,
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture,
      },
    });

    console.log(
      `Google account connected successfully for user: ${userId} (${userInfo.email})`
    );

    // Redirect to frontend with success
    res.redirect(
      `${
        process.env.FRONTEND_URL || "http://localhost:3000"
      }/profile?google=connected`
    );
  } catch (error) {
    console.error("Connect Google account error:", error);
    res.redirect(
      `${
        process.env.FRONTEND_URL || "http://localhost:3000"
      }/profile?google=error`
    );
  }
};

// @desc    Disconnect Google account
// @route   DELETE /api/auth/google/disconnect
// @access  Private
const disconnectGoogleAccount = async (req, res) => {
  try {
    const userId = req.user._id;

    await User.findByIdAndUpdate(userId, {
      $unset: {
        googleTokens: 1,
        googleProfile: 1,
      },
    });

    res.json({
      success: true,
      message: "Google account disconnected successfully",
    });
  } catch (error) {
    console.error("Disconnect Google account error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to disconnect Google account",
      error: error.message,
    });
  }
};

module.exports = {
  register,
  login,
  getMe,
  refreshToken,
  logout,
  changePassword,
  forgotPassword,
  resetPassword,
  updateUserStatus, // Add this
  getUsers, // Add this
  getPendingUsers, // Add this
  bulkActivateUsers, // Add this
  verifyEmail,
  connectGoogleAccount,
  getGoogleAuthUrl,
  disconnectGoogleAccount,
};
