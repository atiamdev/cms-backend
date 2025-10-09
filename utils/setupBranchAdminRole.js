// utils/setupBranchAdminRole.js
const Role = require("../models/Role");
const Permission = require("../models/Permission");
const User = require("../models/User");

// Define Branch Admin permissions
const BRANCH_ADMIN_PERMISSIONS = [
  // Student Management
  {
    name: "students:create",
    resource: "students",
    action: "create",
    description: "Create new students",
    category: "Academic",
  },
  {
    name: "students:read",
    resource: "students",
    action: "read",
    description: "View students",
    category: "Academic",
  },
  {
    name: "students:update",
    resource: "students",
    action: "update",
    description: "Update student information",
    category: "Academic",
  },
  {
    name: "students:delete",
    resource: "students",
    action: "delete",
    description: "Delete students",
    category: "Academic",
  },

  // Teacher Management
  {
    name: "teachers:create",
    resource: "teachers",
    action: "create",
    description: "Create new teachers",
    category: "Academic",
  },
  {
    name: "teachers:read",
    resource: "teachers",
    action: "read",
    description: "View teachers",
    category: "Academic",
  },
  {
    name: "teachers:update",
    resource: "teachers",
    action: "update",
    description: "Update teacher information",
    category: "Academic",
  },
  {
    name: "teachers:delete",
    resource: "teachers",
    action: "delete",
    description: "Delete teachers",
    category: "Academic",
  },

  // Class Management
  {
    name: "classes:create",
    resource: "classes",
    action: "create",
    description: "Create new classes",
    category: "Academic",
  },
  {
    name: "classes:read",
    resource: "classes",
    action: "read",
    description: "View classes",
    category: "Academic",
  },
  {
    name: "classes:update",
    resource: "classes",
    action: "update",
    description: "Update class information",
    category: "Academic",
  },
  {
    name: "classes:delete",
    resource: "classes",
    action: "delete",
    description: "Delete classes",
    category: "Academic",
  },

  // Course Management
  {
    name: "courses:create",
    resource: "courses",
    action: "create",
    description: "Create new courses",
    category: "Academic",
  },
  {
    name: "courses:read",
    resource: "courses",
    action: "read",
    description: "View courses",
    category: "Academic",
  },
  {
    name: "courses:update",
    resource: "courses",
    action: "update",
    description: "Update course information",
    category: "Academic",
  },
  {
    name: "courses:delete",
    resource: "courses",
    action: "delete",
    description: "Delete courses",
    category: "Academic",
  },

  // Attendance Management
  {
    name: "attendance:create",
    resource: "attendance",
    action: "create",
    description: "Record attendance",
    category: "Academic",
  },
  {
    name: "attendance:read",
    resource: "attendance",
    action: "read",
    description: "View attendance records",
    category: "Academic",
  },
  {
    name: "attendance:update",
    resource: "attendance",
    action: "update",
    description: "Update attendance records",
    category: "Academic",
  },

  // Fee Management
  {
    name: "fees:create",
    resource: "fees",
    action: "create",
    description: "Create fee structures",
    category: "Financial",
  },
  {
    name: "fees:read",
    resource: "fees",
    action: "read",
    description: "View fees",
    category: "Financial",
  },
  {
    name: "fees:update",
    resource: "fees",
    action: "update",
    description: "Update fees",
    category: "Financial",
  },

  // Payment Management
  {
    name: "payments:create",
    resource: "payments",
    action: "create",
    description: "Record payments",
    category: "Financial",
  },
  {
    name: "payments:read",
    resource: "payments",
    action: "read",
    description: "View payments",
    category: "Financial",
  },
  {
    name: "payments:update",
    resource: "payments",
    action: "update",
    description: "Update payment records",
    category: "Financial",
  },

  // Expense Management (limited)
  {
    name: "expenses:create",
    resource: "expenses",
    action: "create",
    description: "Create expenses for branch",
    category: "Financial",
  },
  {
    name: "expenses:read",
    resource: "expenses",
    action: "read",
    description: "View branch expenses",
    category: "Financial",
  },
  {
    name: "expenses:update",
    resource: "expenses",
    action: "update",
    description: "Update expense records",
    category: "Financial",
  },

  // Reports (branch-specific)
  {
    name: "reports:view",
    resource: "reports",
    action: "view",
    description: "View branch reports",
    category: "Reports",
  },
  {
    name: "reports:export",
    resource: "reports",
    action: "export",
    description: "Export branch reports",
    category: "Reports",
  },

  // Communication
  {
    name: "communications:create",
    resource: "communications",
    action: "create",
    description: "Send communications",
    category: "Communication",
  },
  {
    name: "communications:read",
    resource: "communications",
    action: "read",
    description: "View communications",
    category: "Communication",
  },
];

/**
 * Create or update branch admin permissions
 */
async function createBranchAdminPermissions() {
  console.log("🔐 Creating Branch Admin permissions...");

  const createdPermissions = [];

  for (const permData of BRANCH_ADMIN_PERMISSIONS) {
    try {
      const permission = await Permission.findOneAndUpdate(
        { name: permData.name },
        {
          ...permData,
          isSystemPermission: true, // Mark as system permission
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        }
      );

      createdPermissions.push(permission);
      console.log(`  ✅ Permission: ${permission.name}`);
    } catch (error) {
      console.error(
        `  ❌ Error creating permission ${permData.name}:`,
        error.message
      );
    }
  }

  return createdPermissions;
}

/**
 * Create branch admin system role
 */
async function createBranchAdminRole() {
  console.log("👤 Creating Branch Admin role...");

  try {
    // First create the permissions
    const permissions = await createBranchAdminPermissions();
    const permissionIds = permissions.map((p) => p._id);

    // Find a superadmin user to be the creator
    const superadminUser = await User.findOne({
      roles: { $in: ["superadmin"] },
    });

    if (!superadminUser) {
      throw new Error("No superadmin user found to create branch admin role");
    }

    // Create or update the branch admin role
    const role = await Role.findOneAndUpdate(
      { name: "branchadmin" },
      {
        name: "branchadmin",
        displayName: "Branch Administrator",
        description:
          "Manages a specific branch - students, teachers, classes, attendance, and branch-specific operations",
        permissions: permissionIds,
        isSystemRole: true,
        isActive: true,
        color: "#059669", // Green color
        priority: 800, // Between admin (900) and teacher (700)
        branchId: null, // Global role template
        createdBy: superadminUser._id,
        updatedBy: superadminUser._id,
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );

    console.log(`  ✅ Branch Admin role created: ${role.displayName}`);
    console.log(`  📋 Permissions assigned: ${permissions.length}`);

    return role;
  } catch (error) {
    console.error("❌ Error creating Branch Admin role:", error.message);
    throw error;
  }
}

/**
 * Setup complete branch admin role and permissions
 */
async function setupBranchAdminRole() {
  try {
    console.log("\n🚀 Setting up Branch Admin role and permissions...\n");

    const role = await createBranchAdminRole();

    console.log("\n✅ Branch Admin setup completed successfully!");
    console.log(`📊 Role ID: ${role._id}`);
    console.log(`🎯 Permissions: ${role.permissions.length}`);

    return {
      success: true,
      role,
      message: "Branch Admin role and permissions created successfully",
    };
  } catch (error) {
    console.error("\n❌ Branch Admin setup failed:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

module.exports = {
  setupBranchAdminRole,
  createBranchAdminRole,
  createBranchAdminPermissions,
  BRANCH_ADMIN_PERMISSIONS,
};
