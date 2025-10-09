// cms-backend/controllers/securityRolesController.js
const Permission = require("../models/Permission");
const Role = require("../models/Role");
const SecurityPolicy = require("../models/SecurityPolicy");
const UserRoleAssignment = require("../models/UserRoleAssignment");
const User = require("../models/User");
const AuditLogger = require("../utils/auditLogger");

// Initialize default permissions and roles
const initializeDefaultData = async () => {
  try {
    // Check if permissions already exist
    const permissionCount = await Permission.countDocuments();
    if (permissionCount === 0) {
      // Create default permissions
      const defaultPermissions = [
        // Academic permissions
        {
          name: "students.create",
          resource: "students",
          action: "create",
          description: "Create new students",
          category: "Academic",
          isSystemPermission: true,
        },
        {
          name: "students.read",
          resource: "students",
          action: "read",
          description: "View student information",
          category: "Academic",
          isSystemPermission: true,
        },
        {
          name: "students.update",
          resource: "students",
          action: "update",
          description: "Update student information",
          category: "Academic",
          isSystemPermission: true,
        },
        {
          name: "students.delete",
          resource: "students",
          action: "delete",
          description: "Delete students",
          category: "Academic",
          isSystemPermission: true,
        },
        {
          name: "students.export",
          resource: "students",
          action: "export",
          description: "Export student data",
          category: "Academic",
          isSystemPermission: true,
        },

        {
          name: "teachers.create",
          resource: "teachers",
          action: "create",
          description: "Create new teachers",
          category: "Academic",
          isSystemPermission: true,
        },
        {
          name: "teachers.read",
          resource: "teachers",
          action: "read",
          description: "View teacher information",
          category: "Academic",
          isSystemPermission: true,
        },
        {
          name: "teachers.update",
          resource: "teachers",
          action: "update",
          description: "Update teacher information",
          category: "Academic",
          isSystemPermission: true,
        },
        {
          name: "teachers.delete",
          resource: "teachers",
          action: "delete",
          description: "Delete teachers",
          category: "Academic",
          isSystemPermission: true,
        },

        {
          name: "classes.create",
          resource: "classes",
          action: "create",
          description: "Create new classes",
          category: "Academic",
          isSystemPermission: true,
        },
        {
          name: "classes.read",
          resource: "classes",
          action: "read",
          description: "View class information",
          category: "Academic",
          isSystemPermission: true,
        },
        {
          name: "classes.update",
          resource: "classes",
          action: "update",
          description: "Update class information",
          category: "Academic",
          isSystemPermission: true,
        },
        {
          name: "classes.delete",
          resource: "classes",
          action: "delete",
          description: "Delete classes",
          category: "Academic",
          isSystemPermission: true,
        },

        {
          name: "courses.create",
          resource: "courses",
          action: "create",
          description: "Create new courses",
          category: "Academic",
          isSystemPermission: true,
        },
        {
          name: "courses.read",
          resource: "courses",
          action: "read",
          description: "View course information",
          category: "Academic",
          isSystemPermission: true,
        },
        {
          name: "courses.update",
          resource: "courses",
          action: "update",
          description: "Update course information",
          category: "Academic",
          isSystemPermission: true,
        },
        {
          name: "courses.delete",
          resource: "courses",
          action: "delete",
          description: "Delete courses",
          category: "Academic",
          isSystemPermission: true,
        },

        {
          name: "attendance.create",
          resource: "attendance",
          action: "create",
          description: "Mark attendance",
          category: "Academic",
          isSystemPermission: true,
        },
        {
          name: "attendance.read",
          resource: "attendance",
          action: "read",
          description: "View attendance records",
          category: "Academic",
          isSystemPermission: true,
        },
        {
          name: "attendance.update",
          resource: "attendance",
          action: "update",
          description: "Update attendance records",
          category: "Academic",
          isSystemPermission: true,
        },

        // Financial permissions
        {
          name: "fees.create",
          resource: "fees",
          action: "create",
          description: "Create fee structures",
          category: "Financial",
          isSystemPermission: true,
        },
        {
          name: "fees.read",
          resource: "fees",
          action: "read",
          description: "View fee information",
          category: "Financial",
          isSystemPermission: true,
        },
        {
          name: "fees.update",
          resource: "fees",
          action: "update",
          description: "Update fee structures",
          category: "Financial",
          isSystemPermission: true,
        },
        {
          name: "fees.delete",
          resource: "fees",
          action: "delete",
          description: "Delete fee structures",
          category: "Financial",
          isSystemPermission: true,
        },

        {
          name: "expenses.create",
          resource: "expenses",
          action: "create",
          description: "Create expense records",
          category: "Financial",
          isSystemPermission: true,
        },
        {
          name: "expenses.read",
          resource: "expenses",
          action: "read",
          description: "View expense records",
          category: "Financial",
          isSystemPermission: true,
        },
        {
          name: "expenses.update",
          resource: "expenses",
          action: "update",
          description: "Update expense records",
          category: "Financial",
          isSystemPermission: true,
        },
        {
          name: "expenses.delete",
          resource: "expenses",
          action: "delete",
          description: "Delete expense records",
          category: "Financial",
          isSystemPermission: true,
        },

        {
          name: "payments.create",
          resource: "payments",
          action: "create",
          description: "Process payments",
          category: "Financial",
          isSystemPermission: true,
        },
        {
          name: "payments.read",
          resource: "payments",
          action: "read",
          description: "View payment records",
          category: "Financial",
          isSystemPermission: true,
        },
        {
          name: "payments.update",
          resource: "payments",
          action: "update",
          description: "Update payment records",
          category: "Financial",
          isSystemPermission: true,
        },

        // Administrative permissions
        {
          name: "users.create",
          resource: "users",
          action: "create",
          description: "Create new users",
          category: "Administrative",
          isSystemPermission: true,
        },
        {
          name: "users.read",
          resource: "users",
          action: "read",
          description: "View user information",
          category: "Administrative",
          isSystemPermission: true,
        },
        {
          name: "users.update",
          resource: "users",
          action: "update",
          description: "Update user information",
          category: "Administrative",
          isSystemPermission: true,
        },
        {
          name: "users.delete",
          resource: "users",
          action: "delete",
          description: "Delete users",
          category: "Administrative",
          isSystemPermission: true,
        },

        {
          name: "branches.create",
          resource: "branches",
          action: "create",
          description: "Create new branches",
          category: "Administrative",
          isSystemPermission: true,
        },
        {
          name: "branches.read",
          resource: "branches",
          action: "read",
          description: "View branch information",
          category: "Administrative",
          isSystemPermission: true,
        },
        {
          name: "branches.update",
          resource: "branches",
          action: "update",
          description: "Update branch information",
          category: "Administrative",
          isSystemPermission: true,
        },
        {
          name: "branches.delete",
          resource: "branches",
          action: "delete",
          description: "Delete branches",
          category: "Administrative",
          isSystemPermission: true,
        },

        // System permissions
        {
          name: "system.settings",
          resource: "system",
          action: "manage",
          description: "Manage system settings",
          category: "System",
          isSystemPermission: true,
        },
        {
          name: "system.security",
          resource: "system",
          action: "manage",
          description: "Manage security settings",
          category: "System",
          isSystemPermission: true,
        },
        {
          name: "system.audit",
          resource: "system",
          action: "view",
          description: "View audit logs",
          category: "System",
          isSystemPermission: true,
        },
        {
          name: "system.backup",
          resource: "system",
          action: "manage",
          description: "Manage system backups",
          category: "System",
          isSystemPermission: true,
        },

        // Reports permissions
        {
          name: "reports.financial",
          resource: "reports",
          action: "view",
          description: "View financial reports",
          category: "Reports",
          isSystemPermission: true,
        },
        {
          name: "reports.academic",
          resource: "reports",
          action: "view",
          description: "View academic reports",
          category: "Reports",
          isSystemPermission: true,
        },
        {
          name: "reports.attendance",
          resource: "reports",
          action: "view",
          description: "View attendance reports",
          category: "Reports",
          isSystemPermission: true,
        },
        {
          name: "reports.export",
          resource: "reports",
          action: "export",
          description: "Export reports",
          category: "Reports",
          isSystemPermission: true,
        },

        // Communication permissions
        {
          name: "communication.send",
          resource: "communication",
          action: "create",
          description: "Send communications",
          category: "Communication",
          isSystemPermission: true,
        },
        {
          name: "communication.read",
          resource: "communication",
          action: "read",
          description: "View communications",
          category: "Communication",
          isSystemPermission: true,
        },
        {
          name: "communication.manage",
          resource: "communication",
          action: "manage",
          description: "Manage communication settings",
          category: "Communication",
          isSystemPermission: true,
        },
      ];

      await Permission.insertMany(defaultPermissions);
      console.log("Default permissions created");
    }

    // Create default roles if they don't exist
    const roleCount = await Role.countDocuments();
    if (roleCount === 0) {
      // Get all permissions for role assignment
      const allPermissions = await Permission.find();
      const permissionIds = allPermissions.map((p) => p._id);

      // Get specific permission sets for different roles
      const academicPermissions = allPermissions
        .filter((p) => p.category === "Academic")
        .map((p) => p._id);
      const financialPermissions = allPermissions
        .filter((p) => p.category === "Financial")
        .map((p) => p._id);
      const adminPermissions = allPermissions
        .filter((p) =>
          ["Academic", "Financial", "Administrative"].includes(p.category)
        )
        .map((p) => p._id);
      const secretaryPermissions = allPermissions
        .filter(
          (p) =>
            p.category === "Financial" ||
            (p.category === "Academic" &&
              ["read", "create", "update"].includes(p.action))
        )
        .map((p) => p._id);

      // Find a superadmin user to assign as creator
      const superAdminUser = await require("../models/User").findOne({
        roles: "superadmin",
      });
      const creatorId = superAdminUser ? superAdminUser._id : null;

      if (creatorId) {
        const defaultRoles = [
          {
            name: "superadmin",
            displayName: "Super Administrator",
            description: "Full system access with all permissions",
            permissions: permissionIds,
            isSystemRole: true,
            isActive: true,
            color: "#DC2626", // Red
            priority: 100,
            createdBy: creatorId,
          },
          {
            name: "admin",
            displayName: "Administrator",
            description:
              "Administrative access to academic and financial modules",
            permissions: adminPermissions,
            isSystemRole: true,
            isActive: true,
            color: "#2563EB", // Blue
            priority: 80,
            createdBy: creatorId,
          },
          {
            name: "teacher",
            displayName: "Teacher",
            description: "Access to academic modules and student management",
            permissions: academicPermissions,
            isSystemRole: true,
            isActive: true,
            color: "#059669", // Green
            priority: 60,
            createdBy: creatorId,
          },
          {
            name: "secretary",
            displayName: "Secretary",
            description:
              "Access to financial management and basic academic functions",
            permissions: secretaryPermissions,
            isSystemRole: true,
            isActive: true,
            color: "#7C3AED", // Purple
            priority: 50,
            createdBy: creatorId,
          },
          {
            name: "student",
            displayName: "Student",
            description: "Limited access to view own academic records",
            permissions: allPermissions
              .filter(
                (p) =>
                  p.action === "read" &&
                  ["students", "courses", "attendance"].includes(p.resource)
              )
              .map((p) => p._id),
            isSystemRole: true,
            isActive: true,
            color: "#EA580C", // Orange
            priority: 20,
            createdBy: creatorId,
          },
        ];

        await Role.insertMany(defaultRoles);
        console.log("Default roles created");
      }
    }

    // Initialize security policy if it doesn't exist
    const securityPolicy = await SecurityPolicy.findById("security-policy");
    if (!securityPolicy) {
      await SecurityPolicy.create({});
      console.log("Default security policy created");
    }
  } catch (error) {
    console.error("Error initializing default data:", error);
  }
};

// Get all security and roles data
const getSecurityRoles = async (req, res) => {
  try {
    await initializeDefaultData(); // Ensure default data exists

    const [roles, permissions, securityPolicy, userRoleAssignments] =
      await Promise.all([
        Role.find()
          .populate("permissions")
          .populate("createdBy", "name email")
          .sort({ priority: -1 }),
        Permission.find().sort({ category: 1, name: 1 }),
        SecurityPolicy.findById("security-policy"),
        UserRoleAssignment.find({ isActive: true })
          .populate("userId", "name email")
          .populate("roleId", "name displayName")
          .populate("assignedBy", "name email"),
      ]);

    res.json({
      success: true,
      data: {
        roles,
        permissions,
        securityPolicy,
        userRoleAssignments,
      },
    });
  } catch (error) {
    console.error("Error fetching security roles:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch security roles data",
      error: error.message,
    });
  }
};

// Create a new role
const createRole = async (req, res) => {
  try {
    const { name, displayName, description, permissions, color, priority } =
      req.body;

    // Check if role name already exists
    const existingRole = await Role.findOne({
      name: name.toLowerCase().trim(),
      branchId: req.user.branchId || null,
    });

    if (existingRole) {
      return res.status(400).json({
        success: false,
        message: "Role with this name already exists",
      });
    }

    // Validate permissions exist
    const validPermissions = await Permission.find({
      _id: { $in: permissions },
    });
    if (validPermissions.length !== permissions.length) {
      return res.status(400).json({
        success: false,
        message: "Some permissions are invalid",
      });
    }

    const role = new Role({
      name: name.toLowerCase().trim(),
      displayName: displayName.trim(),
      description: description.trim(),
      permissions,
      color: color || "#3B82F6",
      priority: priority || 0,
      branchId: req.user.branchId || null,
      createdBy: req.user.id,
    });

    await role.save();
    await role.populate("permissions");

    // Log the role creation
    await AuditLogger.logRoleAction(req.user, "ROLE_CREATED", role, req, null, {
      name: role.name,
      displayName: role.displayName,
      description: role.description,
      permissions: role.permissions.map((p) => p.name),
      color: role.color,
      priority: role.priority,
    });

    res.status(201).json({
      success: true,
      data: role,
      message: "Role created successfully",
    });
  } catch (error) {
    console.error("Error creating role:", error);

    // Log failed role creation
    await AuditLogger.logRoleAction(
      req.user,
      "ROLE_CREATED",
      { _id: null, displayName: req.body.displayName || req.body.name },
      req,
      null,
      null
    ).catch(() => {}); // Ignore audit log errors

    res.status(500).json({
      success: false,
      message: "Failed to create role",
      error: error.message,
    });
  }
};

// Update a role
const updateRole = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const role = await Role.findById(id).populate("permissions");
    if (!role) {
      return res.status(404).json({
        success: false,
        message: "Role not found",
      });
    }

    // Prevent updating system roles
    if (role.isSystemRole && !req.user.roles.includes("superadmin")) {
      return res.status(403).json({
        success: false,
        message: "Cannot modify system roles",
      });
    }

    // If updating permissions, validate them
    if (updates.permissions) {
      const validPermissions = await Permission.find({
        _id: { $in: updates.permissions },
      });
      if (validPermissions.length !== updates.permissions.length) {
        return res.status(400).json({
          success: false,
          message: "Some permissions are invalid",
        });
      }
    }

    // Store old values for audit log
    const oldValues = {
      name: role.name,
      displayName: role.displayName,
      description: role.description,
      permissions: role.permissions.map((p) => p.name),
      color: role.color,
      priority: role.priority,
      isActive: role.isActive,
    };

    // Update role
    Object.assign(role, updates);
    role.updatedBy = req.user.id;
    await role.save();
    await role.populate("permissions");

    // Store new values for audit log
    const newValues = {
      name: role.name,
      displayName: role.displayName,
      description: role.description,
      permissions: role.permissions.map((p) => p.name),
      color: role.color,
      priority: role.priority,
      isActive: role.isActive,
    };

    // Log the role update
    await AuditLogger.logRoleAction(
      req.user,
      "ROLE_UPDATED",
      role,
      req,
      oldValues,
      newValues
    );

    res.json({
      success: true,
      data: role,
      message: "Role updated successfully",
    });
  } catch (error) {
    console.error("Error updating role:", error);

    // Log failed role update
    await AuditLogger.log({
      user: req.user,
      action: "ROLE_UPDATED",
      resourceType: "ROLE",
      resourceId: req.params.id,
      description: `Failed to update role ${req.params.id}`,
      req,
      success: false,
      errorMessage: error.message,
      severity: "MEDIUM",
      category: "AUTHORIZATION",
    }).catch(() => {});

    res.status(500).json({
      success: false,
      message: "Failed to update role",
      error: error.message,
    });
  }
};

// Delete a role
const deleteRole = async (req, res) => {
  try {
    const { id } = req.params;

    const role = await Role.findById(id).populate("permissions");
    if (!role) {
      return res.status(404).json({
        success: false,
        message: "Role not found",
      });
    }

    // Prevent deleting system roles
    if (role.isSystemRole) {
      return res.status(403).json({
        success: false,
        message: "Cannot delete system roles",
      });
    }

    // Check if role is assigned to any users
    const assignmentCount = await UserRoleAssignment.countDocuments({
      roleId: id,
      isActive: true,
    });

    if (assignmentCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete role. It is assigned to ${assignmentCount} user(s)`,
      });
    }

    // Store role data for audit log before deletion
    const roleData = {
      name: role.name,
      displayName: role.displayName,
      description: role.description,
      permissions: role.permissions.map((p) => p.name),
      assignmentCount,
    };

    await Role.findByIdAndDelete(id);

    // Log the role deletion
    await AuditLogger.logRoleAction(
      req.user,
      "ROLE_DELETED",
      { _id: id, displayName: role.displayName, name: role.name },
      req,
      roleData,
      null
    );

    res.json({
      success: true,
      message: "Role deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting role:", error);

    // Log failed role deletion
    await AuditLogger.log({
      user: req.user,
      action: "ROLE_DELETED",
      resourceType: "ROLE",
      resourceId: req.params.id,
      description: `Failed to delete role ${req.params.id}`,
      req,
      success: false,
      errorMessage: error.message,
      severity: "HIGH",
      category: "AUTHORIZATION",
    }).catch(() => {});

    res.status(500).json({
      success: false,
      message: "Failed to delete role",
      error: error.message,
    });
  }
};

// Assign roles to user
const assignRolesToUser = async (req, res) => {
  try {
    const { userId, roleIds, branchId, validFrom, validUntil, reason } =
      req.body;

    // Validate user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Validate roles exist
    const roles = await Role.find({ _id: { $in: roleIds }, isActive: true });
    if (roles.length !== roleIds.length) {
      return res.status(400).json({
        success: false,
        message: "Some roles are invalid or inactive",
      });
    }

    // Get existing assignments for audit log
    const existingAssignments = await UserRoleAssignment.find({
      userId,
      isActive: true,
    }).populate("roleId", "name displayName");

    // Remove existing active assignments for this user
    await UserRoleAssignment.updateMany(
      { userId, isActive: true },
      {
        isActive: false,
        revokedBy: req.user.id,
        revokedAt: new Date(),
        revokeReason: "Role reassignment",
      }
    );

    // Create new assignments
    const assignments = roleIds.map((roleId) => ({
      userId,
      roleId,
      branchId: branchId || null,
      assignedBy: req.user.id,
      validFrom: validFrom ? new Date(validFrom) : new Date(),
      validUntil: validUntil ? new Date(validUntil) : null,
      reason: reason || "",
    }));

    const createdAssignments = await UserRoleAssignment.insertMany(assignments);

    // Populate the created assignments
    const populatedAssignments = await UserRoleAssignment.find({
      _id: { $in: createdAssignments.map((a) => a._id) },
    })
      .populate("userId", "name email")
      .populate("roleId", "name displayName")
      .populate("assignedBy", "name email");

    // Log the role assignment
    await AuditLogger.logUserRoleAssignment(
      req.user,
      "ROLE_ASSIGNED",
      user,
      roles,
      req
    );

    res.json({
      success: true,
      data: populatedAssignments,
      message: "Roles assigned successfully",
    });
  } catch (error) {
    console.error("Error assigning roles:", error);

    // Log failed role assignment
    await AuditLogger.log({
      user: req.user,
      action: "ROLE_ASSIGNED",
      resourceType: "USER_ROLE_ASSIGNMENT",
      targetUser: { _id: req.body.userId, name: "Unknown User" },
      description: `Failed to assign roles to user ${req.body.userId}`,
      req,
      success: false,
      errorMessage: error.message,
      severity: "HIGH",
      category: "AUTHORIZATION",
    }).catch(() => {});

    res.status(500).json({
      success: false,
      message: "Failed to assign roles",
      error: error.message,
    });
  }
};

// Revoke role from user
const revokeUserRole = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { reason } = req.body;

    const assignment = await UserRoleAssignment.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Role assignment not found",
      });
    }

    assignment.isActive = false;
    assignment.revokedBy = req.user.id;
    assignment.revokedAt = new Date();
    assignment.revokeReason = reason || "";

    await assignment.save();

    res.json({
      success: true,
      message: "Role revoked successfully",
    });
  } catch (error) {
    console.error("Error revoking role:", error);
    res.status(500).json({
      success: false,
      message: "Failed to revoke role",
      error: error.message,
    });
  }
};

// Update security policy
const updateSecurityPolicy = async (req, res) => {
  try {
    const updates = req.body;

    // Get current policy for audit log
    const currentPolicy = await SecurityPolicy.findById("security-policy");

    const securityPolicy = await SecurityPolicy.findByIdAndUpdate(
      "security-policy",
      { $set: updates },
      { new: true, upsert: true }
    );

    // Log the security policy update
    await AuditLogger.logSecurityPolicyChange(
      req.user,
      currentPolicy?.toObject() || {},
      securityPolicy.toObject(),
      req
    );

    res.json({
      success: true,
      data: securityPolicy,
      message: "Security policy updated successfully",
    });
  } catch (error) {
    console.error("Error updating security policy:", error);

    // Log failed security policy update
    await AuditLogger.log({
      user: req.user,
      action: "SECURITY_POLICY_UPDATED",
      resourceType: "SECURITY_POLICY",
      description: "Failed to update security policy",
      req,
      success: false,
      errorMessage: error.message,
      severity: "CRITICAL",
      category: "SECURITY",
    }).catch(() => {});

    res.status(500).json({
      success: false,
      message: "Failed to update security policy",
      error: error.message,
    });
  }
};

// Get user permissions (for checking access)
const getUserPermissions = async (req, res) => {
  try {
    const { userId } = req.params;

    // Get active role assignments for user
    const assignments = await UserRoleAssignment.find({
      userId,
      isActive: true,
      $or: [{ validUntil: null }, { validUntil: { $gte: new Date() } }],
    }).populate({
      path: "roleId",
      populate: {
        path: "permissions",
        model: "Permission",
      },
    });

    // Collect all permissions from all roles
    const permissions = new Set();
    assignments.forEach((assignment) => {
      if (assignment.roleId && assignment.roleId.permissions) {
        assignment.roleId.permissions.forEach((permission) => {
          permissions.add(permission.name);
        });
      }
    });

    res.json({
      success: true,
      data: {
        userId,
        permissions: Array.from(permissions),
        roles: assignments.map((a) => ({
          roleId: a.roleId._id,
          roleName: a.roleId.name,
          displayName: a.roleId.displayName,
          branchId: a.branchId,
          validFrom: a.validFrom,
          validUntil: a.validUntil,
        })),
      },
    });
  } catch (error) {
    console.error("Error getting user permissions:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get user permissions",
      error: error.message,
    });
  }
};

module.exports = {
  getSecurityRoles,
  createRole,
  updateRole,
  deleteRole,
  assignRolesToUser,
  revokeUserRole,
  updateSecurityPolicy,
  getUserPermissions,
  initializeDefaultData,
};
