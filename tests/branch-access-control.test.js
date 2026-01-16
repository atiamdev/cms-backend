// tests/branch-access-control.test.js
/**
 * Test script to verify branch-based access control implementation
 * This tests the access control utilities and middleware
 */

require("dotenv").config();
const mongoose = require("mongoose");
const {
  canAccessBranchResource,
  getBranchQueryFilter,
  canPerformBranchOperation,
  getAllowedRolesForManagement,
  isSuperAdmin,
  isBranchAdmin,
  hasAdminPrivileges,
} = require("../utils/accessControl");

// Mock users for testing
const mockUsers = {
  superadmin: {
    _id: "60d5ecb54b4c6f001f5e8b01",
    email: "superadmin@test.com",
    roles: ["superadmin"],
    branchId: null,
  },
  admin: {
    _id: "60d5ecb54b4c6f001f5e8b02",
    email: "admin@test.com",
    roles: ["admin"],
    branchId: "60d5ecb54b4c6f001f5e8a01",
  },
  branchadmin: {
    _id: "60d5ecb54b4c6f001f5e8b03",
    email: "branchadmin@test.com",
    roles: ["branchadmin"],
    branchId: "60d5ecb54b4c6f001f5e8a01",
  },
  branchadmin2: {
    _id: "60d5ecb54b4c6f001f5e8b04",
    email: "branchadmin2@test.com",
    roles: ["branchadmin"],
    branchId: "60d5ecb54b4c6f001f5e8a02", // Different branch
  },
  teacher: {
    _id: "60d5ecb54b4c6f001f5e8b05",
    email: "teacher@test.com",
    roles: ["teacher"],
    branchId: "60d5ecb54b4c6f001f5e8a01",
  },
};

const branchIds = {
  branch1: "60d5ecb54b4c6f001f5e8a01",
  branch2: "60d5ecb54b4c6f001f5e8a02",
};

async function runTests() {
  console.log("🧪 Running Branch Access Control Tests\n");

  // Test 1: Role Detection
  console.log("=== Test 1: Role Detection ===");
  console.log(
    `Superadmin detection:`,
    isSuperAdmin(mockUsers.superadmin) === true ? "✅" : "❌"
  );
  console.log(
    `Branch admin detection:`,
    isBranchAdmin(mockUsers.branchadmin) === true ? "✅" : "❌"
  );
  console.log(
    `Has admin privileges (branchadmin):`,
    hasAdminPrivileges(mockUsers.branchadmin) === true ? "✅" : "❌"
  );
  console.log(
    `Teacher has admin privileges:`,
    hasAdminPrivileges(mockUsers.teacher) === false ? "✅" : "❌"
  );

  // Test 2: Branch Resource Access
  console.log("\n=== Test 2: Branch Resource Access ===");

  // Superadmin should access any branch
  console.log(
    `Superadmin can access branch1:`,
    canAccessBranchResource(mockUsers.superadmin, branchIds.branch1) === true
      ? "✅"
      : "❌"
  );
  console.log(
    `Superadmin can access branch2:`,
    canAccessBranchResource(mockUsers.superadmin, branchIds.branch2) === true
      ? "✅"
      : "❌"
  );

  // Branch admin should only access own branch
  console.log(
    `Branch admin can access own branch:`,
    canAccessBranchResource(mockUsers.branchadmin, branchIds.branch1) === true
      ? "✅"
      : "❌"
  );
  console.log(
    `Branch admin cannot access other branch:`,
    canAccessBranchResource(mockUsers.branchadmin, branchIds.branch2) === false
      ? "✅"
      : "❌"
  );

  // Test 3: Branch Operations
  console.log("\n=== Test 3: Branch Operations ===");

  // Branch admin should be able to perform operations in own branch
  console.log(
    `Branch admin can operate in own branch:`,
    canPerformBranchOperation(mockUsers.branchadmin, branchIds.branch1) === true
      ? "✅"
      : "❌"
  );
  console.log(
    `Branch admin cannot operate in other branch:`,
    canPerformBranchOperation(mockUsers.branchadmin, branchIds.branch2) ===
      false
      ? "✅"
      : "❌"
  );

  // Teacher should not be able to perform admin operations
  console.log(
    `Teacher cannot perform branch operations:`,
    canPerformBranchOperation(mockUsers.teacher, branchIds.branch1) === false
      ? "✅"
      : "❌"
  );

  // Test 4: Query Filters
  console.log("\n=== Test 4: Query Filters ===");

  // Superadmin gets no filter (can see all)
  const superadminFilter = getBranchQueryFilter(mockUsers.superadmin);
  console.log(
    `Superadmin filter is empty:`,
    Object.keys(superadminFilter).length === 0 ? "✅" : "❌"
  );

  // Branch admin gets branch-specific filter
  const branchadminFilter = getBranchQueryFilter(mockUsers.branchadmin);
  console.log(
    `Branch admin filter includes branchId:`,
    branchadminFilter.branchId === branchIds.branch1 ? "✅" : "❌"
  );

  // Branch admin with specific branch request
  const specificBranchFilter = getBranchQueryFilter(
    mockUsers.superadmin,
    branchIds.branch1
  );
  console.log(
    `Superadmin specific branch filter:`,
    specificBranchFilter.branchId === branchIds.branch1 ? "✅" : "❌"
  );

  // Test 5: Role Management Permissions
  console.log("\n=== Test 5: Role Management Permissions ===");

  const superadminRoles = getAllowedRolesForManagement(mockUsers.superadmin);
  const branchadminRoles = getAllowedRolesForManagement(mockUsers.branchadmin);
  const teacherRoles = getAllowedRolesForManagement(mockUsers.teacher);

  console.log(
    `Superadmin can manage all roles:`,
    superadminRoles.includes("superadmin") &&
      superadminRoles.includes("branchadmin")
      ? "✅"
      : "❌"
  );
  console.log(
    `Branch admin can manage teachers:`,
    branchadminRoles.includes("teacher") && !branchadminRoles.includes("admin")
      ? "✅"
      : "❌"
  );
  console.log(
    `Teacher cannot manage users:`,
    teacherRoles.length === 0 ? "✅" : "❌"
  );

  // Test 6: Cross-Branch Access Prevention
  console.log("\n=== Test 6: Cross-Branch Access Prevention ===");

  console.log(
    `Branch admin 1 cannot access branch 2 resources:`,
    canAccessBranchResource(mockUsers.branchadmin, branchIds.branch2) === false
      ? "✅"
      : "❌"
  );
  console.log(
    `Branch admin 2 cannot access branch 1 resources:`,
    canAccessBranchResource(mockUsers.branchadmin2, branchIds.branch1) === false
      ? "✅"
      : "❌"
  );

  console.log("\n🎉 Branch Access Control Tests Completed!");
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { runTests };
