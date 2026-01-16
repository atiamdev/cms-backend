/**
 * Generate Mock Attendance Data
 * 
 * This script generates random attendance records for students
 * to help visualize the attendance system.
 */

const mongoose = require("mongoose");
const Student = require("./models/Student");
const User = require("./models/User");
const Attendance = require("./models/Attendance");
const Branch = require("./models/Branch");
require("dotenv").config();

// Configuration
const CONFIG = {
  // How many days back to generate attendance
  DAYS_BACK: 30,
  
  // Attendance probability (% chance student attends)
  ATTENDANCE_RATE: 0.75, // 75% attendance rate
  
  // Late arrival probability (% of attended days that are late)
  LATE_RATE: 0.15, // 15% of present students arrive late
  
  // School hours
  SCHOOL_START_HOUR: 8,
  SCHOOL_START_MINUTE: 0,
  SCHOOL_END_HOUR: 15,
  SCHOOL_END_MINUTE: 30,
  
  // Late threshold (minutes after school start)
  LATE_THRESHOLD_MINUTES: 15,
};

/**
 * Generate a random time within a range
 */
function randomTime(baseHour, baseMinute, varianceMinutes) {
  const totalMinutes = baseHour * 60 + baseMinute + (Math.random() * varianceMinutes * 2 - varianceMinutes);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.floor(totalMinutes % 60);
  return { hours, minutes };
}

/**
 * Check if a date is a weekend
 */
function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6; // Sunday or Saturday
}

/**
 * Generate attendance for a single student on a specific date
 */
async function generateAttendanceRecord(student, user, date, branch) {
  // Skip weekends
  if (isWeekend(date)) {
    return null;
  }

  // Random chance of attendance
  const willAttend = Math.random() < CONFIG.ATTENDANCE_RATE;
  
  if (!willAttend) {
    return null; // No record = absent
  }

  // Determine if student will be late
  const isLate = Math.random() < CONFIG.LATE_RATE;
  
  // Generate clock in time
  let clockInTime;
  if (isLate) {
    // Late arrival: 15-60 minutes after school starts
    const lateMinutes = CONFIG.LATE_THRESHOLD_MINUTES + Math.floor(Math.random() * 45);
    clockInTime = randomTime(
      CONFIG.SCHOOL_START_HOUR,
      CONFIG.SCHOOL_START_MINUTE + lateMinutes,
      10 // Small variance
    );
  } else {
    // On time: 0-15 minutes before to 10 minutes after start
    clockInTime = randomTime(
      CONFIG.SCHOOL_START_HOUR,
      CONFIG.SCHOOL_START_MINUTE,
      15
    );
  }

  // Generate clock out time (with some variance)
  const clockOutTime = randomTime(
    CONFIG.SCHOOL_END_HOUR,
    CONFIG.SCHOOL_END_MINUTE,
    30 // 30 minute variance
  );

  // Create date objects
  const attendanceDate = new Date(date);
  attendanceDate.setHours(0, 0, 0, 0);

  const clockIn = new Date(date);
  clockIn.setHours(clockInTime.hours, clockInTime.minutes, 0, 0);

  const clockOut = new Date(date);
  clockOut.setHours(clockOutTime.hours, clockOutTime.minutes, 0, 0);

  // Calculate hours
  const totalHours = (clockOut - clockIn) / (1000 * 60 * 60);

  // Determine status
  const schoolStart = new Date(date);
  schoolStart.setHours(CONFIG.SCHOOL_START_HOUR, CONFIG.SCHOOL_START_MINUTE, 0, 0);
  const minutesLate = (clockIn - schoolStart) / (1000 * 60);
  const status = minutesLate > CONFIG.LATE_THRESHOLD_MINUTES ? "late" : "present";

  // Check if record already exists
  const existingRecord = await Attendance.findOne({
    userId: user._id,
    date: attendanceDate,
  });

  if (existingRecord) {
    console.log(`  ⏭️  Skipped: Record already exists for ${user.firstName} on ${date.toISOString().split('T')[0]}`);
    return null;
  }

  // Create attendance record
  const attendanceRecord = new Attendance({
    branchId: branch._id,
    userId: user._id,
    userType: "student",
    studentId: student._id,
    classId: student.currentClassId,
    date: attendanceDate,
    clockInTime: clockIn,
    clockOutTime: clockOut,
    totalHours: totalHours,
    status: status,
    attendanceType: "biometric",
    deviceId: "MOCK_DEVICE_001",
    deviceName: "Mock ZKTeco Device",
    isLate: status === "late",
    notes: "Generated mock data for testing",
  });

  return attendanceRecord;
}

/**
 * Main function to generate mock attendance
 */
async function generateMockAttendance() {
  try {
    console.log("🔗 Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB\n");

    // Get all branches
    const branches = await Branch.find({});
    console.log(`📍 Found ${branches.length} branch(es)\n`);

    let totalGenerated = 0;
    let totalSkipped = 0;

    for (const branch of branches) {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`📍 Processing Branch: ${branch.name}`);
      console.log("=".repeat(60));

      // Get all active students in this branch
      const students = await Student.find({
        branchId: branch._id,
        academicStatus: { $in: ["active", "enrolled"] },
      }).populate("userId");

      if (students.length === 0) {
        console.log("⚠️  No active students found in this branch\n");
        continue;
      }

      console.log(`👥 Found ${students.length} active student(s)\n`);

      // Generate attendance for the past N days
      const today = new Date();
      const records = [];

      for (let i = 0; i < CONFIG.DAYS_BACK; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);

        console.log(`\n📅 Generating attendance for ${date.toISOString().split('T')[0]}...`);

        let dayGenerated = 0;
        let daySkipped = 0;

        for (const student of students) {
          if (!student.userId) {
            console.log(`  ⚠️  Student ${student.studentId} has no linked user, skipping`);
            continue;
          }

          const record = await generateAttendanceRecord(
            student,
            student.userId,
            date,
            branch
          );

          if (record) {
            records.push(record);
            dayGenerated++;
          } else {
            daySkipped++;
          }
        }

        console.log(`  ✅ Generated: ${dayGenerated} | Skipped: ${daySkipped}`);
      }

      // Bulk insert all records
      if (records.length > 0) {
        console.log(`\n💾 Saving ${records.length} attendance records to database...`);
        const saved = await Attendance.insertMany(records, { ordered: false });
        totalGenerated += saved.length;
        console.log(`✅ Successfully saved ${saved.length} records`);
      } else {
        console.log(`\nℹ️  No new records to save for ${branch.name}`);
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("📊 SUMMARY");
    console.log("=".repeat(60));
    console.log(`✅ Total records generated: ${totalGenerated}`);
    console.log(`⏭️  Total records skipped: ${totalSkipped}`);
    console.log(`📍 Branches processed: ${branches.length}`);
    console.log("\n✨ Mock attendance generation complete!\n");

  } catch (error) {
    console.error("\n❌ Error generating mock attendance:", error);
    if (error.code === 11000) {
      console.log("ℹ️  Note: Some records already existed (duplicate key error)");
    }
  } finally {
    await mongoose.connection.close();
    console.log("🔌 Database connection closed");
  }
}

// Run the script
generateMockAttendance();
