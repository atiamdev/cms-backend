/**
 * Student Inactivity Service
 *
 * This service automatically marks students as inactive if they haven't
 * attended school for 2 weeks (10 school days - Monday to Friday).
 *
 * It runs as a scheduled job and does NOT interfere with the existing
 * ZKTeco attendance tracking system.
 */

const mongoose = require("mongoose");
const Student = require("../models/Student");
const Attendance = require("../models/Attendance");
const Branch = require("../models/Branch");
const User = require("../models/User");
const Notice = require("../models/Notice");

// Configuration
const CONFIG = {
  // Number of consecutive school days absence to trigger inactive status
  ABSENCE_THRESHOLD_DAYS: 10, // 2 weeks of school days (Mon-Fri)

  // Only check students with these statuses
  ACTIVE_STATUSES: ["active"],

  // The status to change to when student is marked inactive
  INACTIVE_STATUS: "inactive",

  // Reason to log in status history
  INACTIVITY_REASON:
    "Automatically marked inactive due to 2 weeks of absence (no attendance records)",

  // System user ID for automated changes (will be created/found on first run)
  SYSTEM_USER_EMAIL: "system@cms.internal",
};

/**
 * Get or create a system user for automated status changes
 */
const getSystemUser = async (branchId) => {
  let systemUser = await User.findOne({ email: CONFIG.SYSTEM_USER_EMAIL });

  if (!systemUser) {
    // Create a system user for automated operations
    systemUser = await User.create({
      email: CONFIG.SYSTEM_USER_EMAIL,
      password: require("crypto").randomBytes(32).toString("hex"),
      firstName: "System",
      lastName: "Automated",
      roles: ["admin"],
      branchId: branchId,
      emailVerified: true,
      status: "active", // Changed from isActive to status
    });
    console.log("✅ Created system user for automated operations");
  }

  return systemUser;
};

/**
 * Calculate the date that is N school days ago
 * School days are Monday (1) to Friday (5)
 */
const getDateNSchoolDaysAgo = (n) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let daysToSubtract = 0;
  let schoolDaysCounted = 0;

  while (schoolDaysCounted < n) {
    daysToSubtract++;
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() - daysToSubtract);

    const dayOfWeek = checkDate.getDay();
    // Monday = 1, Friday = 5 (school days)
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      schoolDaysCounted++;
    }
  }

  const resultDate = new Date(today);
  resultDate.setDate(today.getDate() - daysToSubtract);
  return resultDate;
};

/**
 * Check if a student has any attendance record since the given date
 */
const hasAttendanceSince = async (studentId, userId, sinceDate) => {
  const count = await Attendance.countDocuments({
    $or: [{ studentId: studentId }, { userId: userId }],
    date: { $gte: sinceDate },
    status: { $in: ["present", "late", "half_day"] }, // Any form of presence
  });

  return count > 0;
};

/**
 * Get the last attendance date for a student
 */
const getLastAttendanceDate = async (studentId, userId) => {
  const lastAttendance = await Attendance.findOne({
    $or: [{ studentId: studentId }, { userId: userId }],
    status: { $in: ["present", "late", "half_day"] },
  })
    .sort({ date: -1 })
    .select("date")
    .lean();

  return lastAttendance?.date || null;
};

/**
 * Mark a student as inactive due to prolonged absence
 */
const markStudentInactive = async (student, systemUser, lastAttendanceDate) => {
  const oldStatus = student.academicStatus;

  // Update student status
  student.academicStatus = CONFIG.INACTIVE_STATUS;

  // Add to status history
  student.statusHistory.push({
    oldStatus: oldStatus,
    newStatus: CONFIG.INACTIVE_STATUS,
    changedBy: systemUser._id,
    changedAt: new Date(),
    reason: `${CONFIG.INACTIVITY_REASON}. Last attendance: ${
      lastAttendanceDate
        ? lastAttendanceDate.toLocaleDateString()
        : "No attendance records found"
    }`,
  });

  await student.save();

  return {
    studentId: student.studentId,
    admissionNumber: student.admissionNumber,
    oldStatus,
    newStatus: CONFIG.INACTIVE_STATUS,
    lastAttendance: lastAttendanceDate,
  };
};

/**
 * Process all active students in a branch and mark inactive ones
 */
const processStudentsForBranch = async (branchId, systemUser) => {
  const results = {
    branchId,
    totalChecked: 0,
    markedInactive: 0,
    students: [],
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  console.log(
    `📅 Checking students with ${CONFIG.ABSENCE_THRESHOLD_DAYS}+ school days absence since last present date`,
  );

  // Find all active students in this branch
  const activeStudents = await Student.find({
    branchId: branchId,
    academicStatus: { $in: CONFIG.ACTIVE_STATUSES },
  }).select(
    "_id userId studentId admissionNumber academicStatus statusHistory",
  );

  results.totalChecked = activeStudents.length;
  console.log(`👥 Found ${activeStudents.length} active students to check`);

  for (const student of activeStudents) {
    try {
      // Get the last date the student was present
      const lastAttendanceDate = await getLastAttendanceDate(
        student._id,
        student.userId,
      );

      // If no attendance record, check if student is newly enrolled
      if (!lastAttendanceDate) {
        // Could mark as inactive if they've never attended
        // For now, we'll skip students with no attendance history
        console.log(
          `ℹ️  Skipping ${student.studentId} - No attendance history`,
        );
        continue;
      }

      // Count school days (Mon-Fri) from last attendance to today
      const schoolDaysSinceLastAttendance = countSchoolDaysBetween(
        lastAttendanceDate,
        today,
      );

      // If absent for 10+ school days, mark inactive
      if (schoolDaysSinceLastAttendance >= CONFIG.ABSENCE_THRESHOLD_DAYS) {
        const result = await markStudentInactive(
          student,
          systemUser,
          lastAttendanceDate,
        );
        results.students.push(result);
        results.markedInactive++;

        console.log(
          `⚠️  Marked inactive: ${student.studentId} (${
            student.admissionNumber
          }) - Last attendance: ${lastAttendanceDate.toLocaleDateString()} (${schoolDaysSinceLastAttendance} school days ago)`,
        );
      }
    } catch (error) {
      console.error(
        `❌ Error processing student ${student.studentId}:`,
        error.message,
      );
    }
  }

  return results;
};

/**
 * Main function to check and mark inactive students across all branches
 */
const checkAndMarkInactiveStudents = async () => {
  console.log("\n" + "=".repeat(60));
  console.log("🔍 STUDENT INACTIVITY CHECK");
  console.log(`📅 Running at: ${new Date().toLocaleString()}`);
  console.log("=".repeat(60) + "\n");

  const startTime = Date.now();
  const allResults = [];

  try {
    // Get all branches
    const branches = await Branch.find({ status: "active" }).select("_id name");

    if (branches.length === 0) {
      console.log("⚠️  No active branches found");
      return {
        success: true,
        results: [],
        summary: { totalChecked: 0, totalMarkedInactive: 0, duration: "0s" },
      };
    }

    console.log(`🏢 Processing ${branches.length} active branch(es)\n`);

    for (const branch of branches) {
      console.log(`\n📍 Branch: ${branch.name}`);
      console.log("-".repeat(40));

      // Get or create system user for this branch
      const systemUser = await getSystemUser(branch._id);

      // Process students for this branch
      const branchResults = await processStudentsForBranch(
        branch._id,
        systemUser,
      );
      branchResults.branchName = branch.name;
      allResults.push(branchResults);

      console.log(
        `✅ Checked: ${branchResults.totalChecked}, Marked inactive: ${branchResults.markedInactive}`,
      );
    }

    // Summary
    const totalChecked = allResults.reduce((sum, r) => sum + r.totalChecked, 0);
    const totalMarkedInactive = allResults.reduce(
      (sum, r) => sum + r.markedInactive,
      0,
    );
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log("\n" + "=".repeat(60));
    console.log("📊 SUMMARY");
    console.log("=".repeat(60));
    console.log(`Total students checked: ${totalChecked}`);
    console.log(`Total marked inactive: ${totalMarkedInactive}`);
    console.log(`Duration: ${duration}s`);
    console.log("=".repeat(60) + "\n");

    return {
      success: true,
      summary: {
        totalChecked,
        totalMarkedInactive,
        duration: `${duration}s`,
      },
      results: allResults,
    };
  } catch (error) {
    console.error("❌ Error in inactivity check:", error);

    // Calculate summary even if there's an error
    const totalChecked = allResults.reduce((sum, r) => sum + r.totalChecked, 0);
    const totalMarkedInactive = allResults.reduce(
      (sum, r) => sum + r.markedInactive,
      0,
    );
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    return {
      success: false,
      error: error.message,
      summary: {
        totalChecked,
        totalMarkedInactive,
        duration: `${duration}s`,
      },
      results: allResults,
    };
  }
};

/**
 * Get students who are at risk of becoming inactive
 * (absent for 5-9 school days from their last present date)
 */
const getStudentsAtRisk = async (branchId) => {
  const halfThreshold = Math.floor(CONFIG.ABSENCE_THRESHOLD_DAYS / 2); // 5 days
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const activeStudents = await Student.find({
    branchId: branchId,
    academicStatus: { $in: CONFIG.ACTIVE_STATUSES },
  })
    .populate("userId", "firstName lastName email")
    .select("_id userId studentId admissionNumber")
    .lean();

  const atRiskStudents = [];

  for (const student of activeStudents) {
    // Get the last date the student was present
    const lastAttendance = await getLastAttendanceDate(
      student._id,
      student.userId,
    );

    if (lastAttendance) {
      // Count school days since last attendance
      const daysAbsent = countSchoolDaysBetween(lastAttendance, today);

      // At risk if absent for 5-9 school days
      if (
        daysAbsent >= halfThreshold &&
        daysAbsent < CONFIG.ABSENCE_THRESHOLD_DAYS
      ) {
        atRiskStudents.push({
          ...student,
          lastAttendance,
          daysAbsent,
        });
      }
    }
  }

  return atRiskStudents;
};

/**
 * Count school days between two dates (excluding weekends)
 * @param {Date} fromDate - Start date
 * @param {Date} toDate - End date
 * @returns {number} Number of school days (Mon-Fri) between dates
 */
const countSchoolDaysBetween = (fromDate, toDate) => {
  if (!fromDate || !toDate) return 0;

  const start = new Date(fromDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(toDate);
  end.setHours(0, 0, 0, 0);

  // If dates are the same, return 0
  if (start >= end) return 0;

  let schoolDays = 0;
  const checkDate = new Date(start);

  // Count school days from the day AFTER last attendance
  checkDate.setDate(checkDate.getDate() + 1);

  while (checkDate <= end) {
    const dayOfWeek = checkDate.getDay();
    // Monday = 1, Friday = 5 (school days)
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      schoolDays++;
    }
    checkDate.setDate(checkDate.getDate() + 1);
  }

  return schoolDays;
};

/**
 * Count school days since a given date (legacy function - kept for backward compatibility)
 */
const countSchoolDaysSince = async (date) => {
  if (!date) return CONFIG.ABSENCE_THRESHOLD_DAYS;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return countSchoolDaysBetween(date, today);
};

/**
 * Manually reactivate a student (when they return to school)
 * This is called automatically when a student checks in after being marked inactive
 */
const reactivateStudent = async (
  studentId,
  userId,
  reason = "Student returned to school",
) => {
  const student = await Student.findById(studentId);

  if (!student) {
    throw new Error("Student not found");
  }

  if (student.academicStatus === "active") {
    return { alreadyActive: true, student };
  }

  const oldStatus = student.academicStatus;
  student.academicStatus = "active";

  student.statusHistory.push({
    oldStatus: oldStatus,
    newStatus: "active",
    changedBy: userId,
    changedAt: new Date(),
    reason: reason,
  });

  await student.save();

  console.log(
    `✅ Auto-reactivated student: ${
      student.studentId || student.admissionNumber
    } (was: ${oldStatus})`,
  );

  return {
    reactivated: true,
    student,
    oldStatus,
    newStatus: "active",
  };
};

/**
 * Check if a student should be auto-reactivated when they clock in
 * This is called from the attendance sync to auto-reactivate inactive students
 * who show up for school again
 */
const checkAndAutoReactivate = async (studentObjectId, clerkUserId = null) => {
  try {
    const student = await Student.findById(studentObjectId);

    if (!student) {
      return { success: false, reason: "Student not found" };
    }

    // Only reactivate if currently inactive (not suspended, dropped, etc.)
    if (student.academicStatus !== "inactive") {
      return {
        success: true,
        alreadyActive: student.academicStatus === "active",
      };
    }

    // Get system user or use provided user for the status change
    let changedBy = clerkUserId;
    if (!changedBy) {
      const systemUser = await getSystemUser(student.branchId);
      changedBy = systemUser._id;
    }

    const result = await reactivateStudent(
      studentObjectId,
      changedBy,
      "Automatically reactivated - student attended school (biometric check-in)",
    );

    return {
      success: true,
      reactivated: true,
      ...result,
    };
  } catch (error) {
    console.error("Auto-reactivate error:", error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Send notification to a single at-risk student
 * @param {Object} student - Student object with userId populated
 * @param {number} daysAbsent - Number of school days absent
 * @param {ObjectId} branchId - Branch ID
 * @returns {Object} Result of notification creation
 */
const sendAtRiskNotificationToStudent = async (
  student,
  daysAbsent,
  branchId,
) => {
  try {
    if (!student.userId || !student.userId._id) {
      return { success: false, error: "Student has no associated user" };
    }

    const daysRemaining = CONFIG.ABSENCE_THRESHOLD_DAYS - daysAbsent;
    const studentName = `${student.userId.firstName} ${student.userId.lastName}`;

    const notice = await Notice.create({
      title: "⚠️ Attendance Warning - Risk of Deactivation",
      content: `Dear ${studentName},\n\nYou have been absent from school for ${daysAbsent} school days. If you do not attend school within the next ${daysRemaining} school days, your student account will be automatically marked as inactive.\n\nPlease return to school as soon as possible or contact the administration if you have any issues.\n\nThank you.`,
      type: "urgent",
      priority: "high",
      targetAudience: "students",
      specificRecipients: [student.userId._id],
      branchId: branchId,
      author: {
        userId: student.userId._id,
        name: "System - Attendance Monitor",
      },
      isActive: true,
      publishDate: new Date(),
      expiryDate: new Date(Date.now() + daysRemaining * 24 * 60 * 60 * 1000), // Expires when they would be deactivated
      metadata: {
        notificationType: "inactivity_warning",
        studentId: student._id,
        daysAbsent,
        daysRemaining,
        threshold: CONFIG.ABSENCE_THRESHOLD_DAYS,
      },
    });

    console.log(
      `📧 Sent at-risk notification to: ${studentName} (${daysAbsent} days absent)`,
    );
    return { success: true, notice, studentName };
  } catch (error) {
    console.error(
      `Failed to send notification to student ${student._id}:`,
      error.message,
    );
    return { success: false, error: error.message };
  }
};

/**
 * Send notifications to all at-risk students in a branch
 * @param {ObjectId} branchId - Branch ID to check
 * @returns {Object} Summary of notifications sent
 */
const sendAtRiskNotifications = async (branchId) => {
  console.log("\n" + "=".repeat(60));
  console.log("📧 SENDING AT-RISK NOTIFICATIONS");
  console.log(`📅 Running at: ${new Date().toLocaleString()}`);
  console.log("=".repeat(60) + "\n");

  const results = {
    success: true,
    totalAtRisk: 0,
    notificationsSent: 0,
    notificationsFailed: 0,
    students: [],
  };

  try {
    // Get at-risk students
    const atRiskStudents = await getStudentsAtRisk(branchId);
    results.totalAtRisk = atRiskStudents.length;

    if (atRiskStudents.length === 0) {
      console.log("✅ No at-risk students found - no notifications needed");
      return results;
    }

    console.log(`📋 Found ${atRiskStudents.length} at-risk students\n`);

    // Send notification to each at-risk student
    for (const student of atRiskStudents) {
      const notificationResult = await sendAtRiskNotificationToStudent(
        student,
        student.daysAbsent,
        branchId,
      );

      if (notificationResult.success) {
        results.notificationsSent++;
        results.students.push({
          studentId: student.studentId || student.admissionNumber,
          name: notificationResult.studentName,
          daysAbsent: student.daysAbsent,
          status: "notified",
        });
      } else {
        results.notificationsFailed++;
        results.students.push({
          studentId: student.studentId || student.admissionNumber,
          error: notificationResult.error,
          status: "failed",
        });
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("📊 NOTIFICATION SUMMARY");
    console.log("=".repeat(60));
    console.log(`Total at-risk students: ${results.totalAtRisk}`);
    console.log(`Notifications sent: ${results.notificationsSent}`);
    console.log(`Notifications failed: ${results.notificationsFailed}`);
    console.log("=".repeat(60) + "\n");

    return results;
  } catch (error) {
    console.error("❌ Error sending at-risk notifications:", error);
    results.success = false;
    results.error = error.message;
    return results;
  }
};

/**
 * Send notifications to all at-risk students across all branches
 * @returns {Object} Summary of notifications sent
 */
const sendAtRiskNotificationsAllBranches = async () => {
  console.log("\n" + "=".repeat(60));
  console.log("📧 SENDING AT-RISK NOTIFICATIONS (ALL BRANCHES)");
  console.log(`📅 Running at: ${new Date().toLocaleString()}`);
  console.log("=".repeat(60) + "\n");

  const allResults = {
    success: true,
    branches: [],
    totalNotificationsSent: 0,
    totalNotificationsFailed: 0,
  };

  try {
    const branches = await Branch.find({ status: "active" }).select("_id name");

    if (branches.length === 0) {
      console.log("⚠️ No active branches found");
      return allResults;
    }

    console.log(`🏢 Processing ${branches.length} branch(es)\n`);

    for (const branch of branches) {
      console.log(`\n📍 Branch: ${branch.name}`);
      console.log("-".repeat(40));

      const branchResults = await sendAtRiskNotifications(branch._id);
      branchResults.branchName = branch.name;
      branchResults.branchId = branch._id;

      allResults.branches.push(branchResults);
      allResults.totalNotificationsSent += branchResults.notificationsSent;
      allResults.totalNotificationsFailed += branchResults.notificationsFailed;
    }

    console.log("\n" + "=".repeat(60));
    console.log("📊 FINAL SUMMARY (ALL BRANCHES)");
    (countSchoolDaysBetween, console.log("=".repeat(60)));
    console.log(
      `Total notifications sent: ${allResults.totalNotificationsSent}`,
    );
    console.log(
      `Total notifications failed: ${allResults.totalNotificationsFailed}`,
    );
    console.log("=".repeat(60) + "\n");

    return allResults;
  } catch (error) {
    console.error("❌ Error in all-branches notification:", error);
    allResults.success = false;
    allResults.error = error.message;
    return allResults;
  }
};

module.exports = {
  checkAndMarkInactiveStudents,
  getStudentsAtRisk,
  reactivateStudent,
  checkAndAutoReactivate,
  getLastAttendanceDate,
  sendAtRiskNotifications,
  sendAtRiskNotificationsAllBranches,
  CONFIG,
};
