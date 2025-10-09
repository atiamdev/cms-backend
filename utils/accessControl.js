// utils/accessControl.js
/**
 * Utility functions for role and branch access control
 */

/**
 * Check if user has any of the specified roles
 * @param {Object} user - User object with roles array
 * @param {string|Array} roles - Role or array of roles to check
 * @returns {boolean} - True if user has any of the roles
 */
const hasRole = (user, roles) => {
  if (!user || !user.roles) return false;

  const rolesToCheck = Array.isArray(roles) ? roles : [roles];
  return rolesToCheck.some((role) => user.roles.includes(role));
};

/**
 * Check if user is superadmin
 * @param {Object} user - User object with roles array
 * @returns {boolean} - True if user is superadmin
 */
const isSuperAdmin = (user) => {
  return hasRole(user, "superadmin");
};

/**
 * Check if user is admin or superadmin
 * @param {Object} user - User object with roles array
 * @returns {boolean} - True if user is admin or superadmin
 */
const isAdmin = (user) => {
  return hasRole(user, ["admin", "superadmin"]);
};

/**
 * Check if user is branch admin
 * @param {Object} user - User object with roles array
 * @returns {boolean} - True if user is branch admin
 */
const isBranchAdmin = (user) => {
  return hasRole(user, "branchadmin");
};

/**
 * Check if user is admin, branch admin, or superadmin
 * @param {Object} user - User object with roles array
 * @returns {boolean} - True if user has admin-level privileges
 */
const hasAdminPrivileges = (user) => {
  return hasRole(user, ["admin", "branchadmin", "superadmin", "secretary"]);
};

/**
 * Check if user has access to a specific branch
 * Superadmin has access to all branches, others only to their own branch
 * @param {Object} user - User object with branchId and roles
 * @param {string} targetBranchId - Branch ID to check access for
 * @returns {boolean} - True if user has access to the branch
 */
const hasBranchAccess = (user, targetBranchId) => {
  if (!user) return false;

  // Superadmin has access to all branches
  if (isSuperAdmin(user)) return true;

  // Other users only have access to their own branch
  return (
    user.branchId && user.branchId.toString() === targetBranchId.toString()
  );
};

/**
 * Check if user can access resource based on role and branch
 * @param {Object} user - User object
 * @param {string|Array} requiredRoles - Required roles for access
 * @param {string} resourceBranchId - Branch ID of the resource (optional)
 * @returns {boolean} - True if user has access
 */
const canAccessResource = (user, requiredRoles, resourceBranchId = null) => {
  if (!hasRole(user, requiredRoles)) return false;

  if (resourceBranchId && !hasBranchAccess(user, resourceBranchId)) {
    return false;
  }

  return true;
};

/**
 * Check if user can modify another user
 * @param {Object} currentUser - Current user making the request
 * @param {Object} targetUser - User being modified
 * @returns {boolean} - True if current user can modify target user
 */
const canModifyUser = (currentUser, targetUser) => {
  // Superadmin can modify anyone
  if (isSuperAdmin(currentUser)) return true;

  // Admin can only modify users in their branch
  if (isAdmin(currentUser)) {
    return hasBranchAccess(currentUser, targetUser.branchId);
  }

  // Other users cannot modify other users
  return false;
};

/**
 * Get query filter for user's accessible branches
 * @param {Object} user - User object
 * @returns {Object} - MongoDB query filter for branches
 */
const getBranchFilter = (user) => {
  if (isSuperAdmin(user)) {
    return {}; // No filter - can access all branches
  }

  if (hasRole(user, "admin")) {
    return {}; // Admins can access all branches
  }

  if (hasRole(user, "secretary")) {
    return { recordedBy: user._id }; // Secretaries can only see expenses they created
  }

  return { branchId: user.branchId };
};

/**
 * Check if user can access student/teacher records
 * @param {Object} user - User object
 * @param {string} targetBranchId - Branch ID of the student/teacher
 * @returns {boolean} - True if user has access
 */
const canAccessStudentTeacherRecords = (user, targetBranchId) => {
  return canAccessResource(
    user,
    ["superadmin", "admin", "branchadmin", "secretary"],
    targetBranchId
  );
};

/**
 * Check if user is accessing their own record
 * @param {Object} user - Current user
 * @param {string} targetUserId - User ID being accessed
 * @returns {boolean} - True if accessing own record
 */
const isOwnRecord = (user, targetUserId) => {
  return user && user._id && user._id.toString() === targetUserId.toString();
};

/**
 * Check if user can access branch resource (students, teachers, etc.)
 * Branch admins can only access resources in their branch
 * @param {Object} user - User object
 * @param {string} resourceBranchId - Branch ID of the resource
 * @returns {boolean} - True if user has access
 */
const canAccessBranchResource = (user, resourceBranchId) => {
  if (!user) return false;

  // Superadmin has access to all branches
  if (isSuperAdmin(user)) return true;

  // Admin and branch admin need branch match
  if (hasAdminPrivileges(user)) {
    return hasBranchAccess(user, resourceBranchId);
  }

  // Teachers and students can access their own branch resources
  return hasBranchAccess(user, resourceBranchId);
};

/**
 * Get branch filter for database queries based on user access
 * @param {Object} user - User object
 * @param {string} requestedBranchId - Optional specific branch ID requested
 * @returns {Object} - MongoDB query filter
 */
const getBranchQueryFilter = (user, requestedBranchId = null) => {
  if (isSuperAdmin(user)) {
    // Superadmin can filter by specific branch or see all
    return requestedBranchId ? { branchId: requestedBranchId } : {};
  }

  // All other users are restricted to their branch
  return { branchId: user.branchId };
};

/**
 * Validate branch access for creation/update operations
 * @param {Object} user - User object
 * @param {string} targetBranchId - Branch ID for the operation
 * @returns {boolean} - True if user can perform operation in this branch
 */
const canPerformBranchOperation = (user, targetBranchId) => {
  if (!user || !targetBranchId) return false;

  // Superadmin can perform operations in any branch
  if (isSuperAdmin(user)) return true;

  // Admin, branch admin, and secretary can only operate in their branch
  if (hasAdminPrivileges(user) || hasRole(user, "secretary")) {
    return hasBranchAccess(user, targetBranchId);
  }

  return false;
};

/**
 * Get allowed roles for user management based on current user's role
 * @param {Object} user - Current user object
 * @returns {Array} - Array of roles the user can manage
 */
const getAllowedRolesForManagement = (user) => {
  if (isSuperAdmin(user)) {
    return [
      "superadmin",
      "admin",
      "branchadmin",
      "teacher",
      "student",
      "secretary",
    ];
  }

  if (isAdmin(user)) {
    return ["branchadmin", "teacher", "student", "secretary"];
  }

  if (isBranchAdmin(user)) {
    return ["teacher", "student", "secretary"];
  }

  return [];
};

/**
 * Check if user can access a specific expense
 * @param {Object} user - User object
 * @param {Object} expense - Expense object with branchId and recordedBy
 * @returns {boolean} - True if user has access
 */
const canAccessExpense = (user, expense) => {
  // Superadmin can access all expenses
  if (isSuperAdmin(user)) {
    return true;
  }

  // Admin can access all expenses
  if (hasRole(user, "admin")) {
    return true;
  }

  // Secretary can only access expenses they created
  if (hasRole(user, "secretary")) {
    return expense.recordedBy.toString() === user._id.toString();
  }

  // Branch admin can access expenses from their branch
  if (hasRole(user, "branchadmin")) {
    return expense.branchId.toString() === user.branchId.toString();
  }

  // Others can access expenses from their branch
  return expense.branchId.toString() === user.branchId.toString();
};

module.exports = {
  hasRole,
  isSuperAdmin,
  isAdmin,
  isBranchAdmin,
  hasAdminPrivileges,
  hasBranchAccess,
  canAccessResource,
  canModifyUser,
  getBranchFilter,
  canAccessExpense,
  canAccessStudentTeacherRecords,
  isOwnRecord,
  canAccessBranchResource,
  getBranchQueryFilter,
  canPerformBranchOperation,
  getAllowedRolesForManagement,
};
