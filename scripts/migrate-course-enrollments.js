const mongoose = require("mongoose");
const Student = require("../models/Student");
const Course = require("../models/Course");

/**
 * Migrate existing courses array to courseEnrollments with dates
 * For existing students, use their enrollmentDate as the course enrollment date
 */

async function migrateCourseEnrollments({ dryRun = true, studentId = null } = {}) {
  const query = {};
  if (studentId) query._id = studentId;

  const students = await Student.find(query).populate("courses", "courseName");

  console.log(`\n📊 Found ${students.length} student(s) to process\n`);

  let migrated = 0;
  let skipped = 0;
  let errors = [];

  for (const student of students) {
    try {
      // Skip if already has courseEnrollments populated
      if (student.courseEnrollments && student.courseEnrollments.length > 0) {
        console.log(`⏭️  ${student.userId?.firstName || "Student"} ${student.userId?.lastName || ""} - Already has courseEnrollments`);
        skipped++;
        continue;
      }

      // Skip if no courses
      if (!student.courses || student.courses.length === 0) {
        console.log(`⏭️  ${student.userId?.firstName || "Student"} ${student.userId?.lastName || ""} - No courses`);
        skipped++;
        continue;
      }

      console.log(`\n👤 ${student.userId?.firstName || "Student"} ${student.userId?.lastName || ""}`);
      console.log(`   Enrollment Date: ${student.enrollmentDate?.toLocaleDateString() || "Unknown"}`);
      console.log(`   Courses: ${student.courses.length}`);

      if (dryRun) {
        console.log(`   [DRY RUN] Would create ${student.courses.length} courseEnrollments`);
        student.courses.forEach((course) => {
          console.log(`     - ${course.courseName || course._id} (enrolled: ${student.enrollmentDate?.toLocaleDateString() || "Unknown"})`);
        });
        migrated++;
        continue;
      }

      // Create courseEnrollments array
      const courseEnrollments = student.courses.map((course) => ({
        courseId: course._id,
        enrolledAt: student.enrollmentDate || new Date(),
        status: "active",
      }));

      // Update student
      student.courseEnrollments = courseEnrollments;
      await student.save();

      console.log(`   ✅ Migrated ${courseEnrollments.length} course enrollments`);
      migrated++;
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
      errors.push({
        studentId: student._id,
        error: error.message,
      });
    }
  }

  return {
    total: students.length,
    migrated,
    skipped,
    errors,
  };
}

// CLI entry point
if (require.main === module) {
  (async () => {
    require("dotenv").config();

    const minimist = require("minimist");
    const argv = minimist(process.argv.slice(2), {
      string: ["studentId"],
      boolean: ["dryRun", "execute", "help"],
      alias: { s: "studentId", d: "dryRun", e: "execute", h: "help" },
      default: { dryRun: true },
    });

    if (argv.help) {
      console.log(`
📝 Migrate Course Enrollments Script

Usage: node migrate-course-enrollments.js [options]

Migrates existing student.courses array to student.courseEnrollments
with enrollment dates. Uses student's enrollmentDate for all courses
as a default (until course-specific enrollment dates are tracked).

Options:
  --execute, -e       Execute migration (default is dry run)
  --dryRun, -d        Preview without making changes (default)
  --studentId, -s     Migrate specific student only
  --help, -h          Show this help message

Examples:
  # Preview migration for all students
  node migrate-course-enrollments.js

  # Execute migration for all students
  node migrate-course-enrollments.js --execute

  # Preview for specific student
  node migrate-course-enrollments.js --studentId=STUDENT_ID

  # Execute for specific student
  node migrate-course-enrollments.js --execute --studentId=STUDENT_ID
      `);
      process.exit(0);
    }

    const dryRun = !argv.execute;
    const { studentId } = argv;

    try {
      await mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
      console.log("✅ Connected to MongoDB");

      if (dryRun) {
        console.log("\n🔍 DRY RUN MODE - No changes will be made\n");
      }

      const results = await migrateCourseEnrollments({ dryRun, studentId });

      console.log("\n" + "=".repeat(60));
      console.log("📊 MIGRATION SUMMARY");
      console.log("=".repeat(60));
      console.log(`Total students: ${results.total}`);
      console.log(`Migrated: ${results.migrated}`);
      console.log(`Skipped: ${results.skipped}`);
      if (results.errors.length > 0) {
        console.log(`Errors: ${results.errors.length}`);
        console.log("\nErrors:");
        results.errors.forEach((err) => {
          console.log(`  - Student ${err.studentId}: ${err.error}`);
        });
      }
      console.log("=".repeat(60));

      await mongoose.connection.close();
      console.log("\n✅ Done!\n");
      process.exit(0);
    } catch (err) {
      console.error("\n❌ Script failed:", err);
      await mongoose.connection.close();
      process.exit(1);
    }
  })();
}

module.exports = { migrateCourseEnrollments };
