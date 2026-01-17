const mongoose = require("mongoose");
const minimist = require("minimist");
const Student = require("../models/Student");
const User = require("../models/User");
const Course = require("../models/Course");
const Fee = require("../models/Fee");
const {
  generateMonthlyInvoices,
} = require("../services/monthlyInvoiceService");

/**
 * Generate invoices for each student from their course enrollment dates to now
 * Each course is invoiced separately based on when it was enrolled
 */

/**
 * Get month/year from a date
 */
function getMonthYear(date) {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1, // 1-12
  };
}

/**
 * Get all months from start date to end date (inclusive)
 */
function monthsBetween(startDate, endDate) {
  const months = [];
  const current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

  while (current <= end) {
    months.push({
      periodYear: current.getFullYear(),
      periodMonth: current.getMonth() + 1,
    });
    current.setMonth(current.getMonth() + 1);
  }

  return months;
}

/**
 * Get course enrollment date from courseEnrollments array
 */
function getCourseEnrollmentDate(student, courseId) {
  if (!student.courseEnrollments || student.courseEnrollments.length === 0) {
    // Fallback to student enrollment date if no courseEnrollments
    return student.enrollmentDate || student.createdAt;
  }

  const enrollment = student.courseEnrollments.find(
    (e) => String(e.courseId) === String(courseId)
  );

  return enrollment
    ? enrollment.enrolledAt
    : student.enrollmentDate || student.createdAt;
}

async function generateStudentInvoices({
  branchId,
  studentId,
  dryRun = false,
  consolidate = true,
  force = false,
} = {}) {
  const now = new Date();
  const results = {
    totalStudents: 0,
    studentsProcessed: 0,
    studentsSkipped: 0,
    totalInvoicesCreated: 0,
    totalInvoicesSkipped: 0,
    errors: [],
    details: [],
  };

  // Build query
  const query = { academicStatus: { $in: ["active", "inactive"] } };
  if (branchId) query.branchId = branchId;
  if (studentId) query._id = studentId;

  // Get all active students
  const students = await Student.find(query)
    .populate("userId", "firstName lastName email")
    .populate("courses", "name feeStructure");

  results.totalStudents = students.length;

  console.log(`\n📊 Found ${students.length} student(s)\n`);

  for (const student of students) {
    try {
      // Check if student has any courses with periodic billing
      const coursesWithBilling = student.courses?.filter(
        (c) =>
          c.feeStructure &&
          c.feeStructure.billingFrequency &&
          ["weekly", "monthly", "quarterly", "annual"].includes(
            c.feeStructure.billingFrequency
          )
      );

      if (!coursesWithBilling || coursesWithBilling.length === 0) {
        console.log(
          `⏭️  ${student.userId?.firstName} ${student.userId?.lastName} - No courses with periodic billing, skipping`
        );
        results.studentsSkipped++;
        continue;
      }

      console.log(
        `\n👤 ${student.userId?.firstName} ${student.userId?.lastName}`
      );
      console.log(`   Courses with billing: ${coursesWithBilling.length}`);

      // Group periods by month to consolidate invoices later
      const periodsToInvoice = new Map(); // Map<"YYYY-MM", Set<courseId>>

      // For each course, calculate its invoice periods
      for (const course of coursesWithBilling) {
        const courseEnrollmentDate = getCourseEnrollmentDate(
          student,
          course._id
        );

        console.log(
          `   - ${
            course.name
          }: enrolled ${courseEnrollmentDate.toLocaleDateString()}`
        );

        // Get months from this course's enrollment to now
        const courseMonths = monthsBetween(courseEnrollmentDate, now);

        // Add to periods map
        for (const month of courseMonths) {
          const key = `${month.periodYear}-${String(month.periodMonth).padStart(
            2,
            "0"
          )}`;
          if (!periodsToInvoice.has(key)) {
            periodsToInvoice.set(key, {
              periodYear: month.periodYear,
              periodMonth: month.periodMonth,
              courses: new Set(),
            });
          }
          periodsToInvoice.get(key).courses.add(String(course._id));
        }
      }

      console.log(
        `   Total unique periods to invoice: ${periodsToInvoice.size}`
      );

      let studentInvoicesCreated = 0;
      let studentInvoicesSkipped = 0;

      if (dryRun) {
        console.log("   [DRY RUN] Would generate invoices for these periods:");
        Array.from(periodsToInvoice.keys())
          .sort()
          .forEach((key) => {
            const period = periodsToInvoice.get(key);
            console.log(`     - ${key} (${period.courses.size} course(s))`);
          });
        results.studentsProcessed++;
        continue;
      }

      // Generate invoices for each period
      for (const [key, period] of periodsToInvoice) {
        // Check if invoice already exists
        const existingInvoice = await Fee.findOne({
          studentId: student._id,
          periodYear: period.periodYear,
          periodMonth: period.periodMonth,
          invoiceType: "monthly",
          status: { $ne: "waived" },
        });

        if (existingInvoice && !force) {
          studentInvoicesSkipped++;
          continue;
        }

        if (existingInvoice && force) {
          console.log(
            `     ⚠️  ${key} - Invoice exists, recreating due to --force`
          );
        }

        // Generate invoice for this period
        const result = await generateMonthlyInvoices({
          periodYear: period.periodYear,
          periodMonth: period.periodMonth,
          branchId: student.branchId,
          studentId: student._id, // Only generate for this student
          initiatedBy: null,
          consolidate,
        });

        studentInvoicesCreated += result.created || 0;
        studentInvoicesSkipped += result.skipped || 0;
      }

      console.log(`   ✅ Created: ${studentInvoicesCreated} invoices`);
      if (studentInvoicesSkipped > 0) {
        console.log(
          `   ⏭️  Skipped: ${studentInvoicesSkipped} (already exist)`
        );
      }

      results.studentsProcessed++;
      results.totalInvoicesCreated += studentInvoicesCreated;
      results.totalInvoicesSkipped += studentInvoicesSkipped;

      results.details.push({
        studentId: student._id,
        studentName: `${student.userId?.firstName} ${student.userId?.lastName}`,
        coursesWithBilling: coursesWithBilling.length,
        periodsProcessed: periodsToInvoice.size,
        invoicesCreated: studentInvoicesCreated,
        invoicesSkipped: studentInvoicesSkipped,
      });
    } catch (error) {
      console.error(
        `❌ Error processing student ${student._id}:`,
        error.message
      );
      results.errors.push({
        studentId: student._id,
        error: error.message,
      });
    }
  }

  return results;
}

// CLI entry point
if (require.main === module) {
  (async () => {
    require("dotenv").config();

    const argv = minimist(process.argv.slice(2), {
      string: ["branchId", "studentId"],
      boolean: ["dryRun", "force", "consolidate", "help"],
      alias: {
        b: "branchId",
        s: "studentId",
        d: "dryRun",
        f: "force",
        h: "help",
      },
      default: { consolidate: true },
    });

    if (argv.help) {
      console.log(`
📝 Generate Student Invoices Script

Usage: node generate-student-invoices.js [options]

This script generates invoices for each student based on COURSE-SPECIFIC 
enrollment dates. Each course is invoiced from the date it was enrolled, 
not from student registration date.

Example:
- Student registered Oct 2025 with Course A
- Student added Course B in Dec 2025
- Result: Course A invoiced from Oct, Course B invoiced from Dec onwards

Options:
  --branchId, -b      Filter by branch ID (optional)
  --studentId, -s     Process only specific student (optional)
  --dryRun, -d        Preview without creating invoices
  --force, -f         Recreate invoices even if they exist
  --consolidate       Enable invoice consolidation (default: true)
  --help, -h          Show this help message

Examples:
  # Preview invoices for all students
  node generate-student-invoices.js --dryRun

  # Generate invoices for all students in a branch
  node generate-student-invoices.js --branchId=688a1618d2efc2d48aad4cc7

  # Generate invoices for specific student
  node generate-student-invoices.js --studentId=6966452e41d3a0b2e8187a87

  # Regenerate all invoices (even if they exist)
  node generate-student-invoices.js --force

  # Dry run for specific student
  node generate-student-invoices.js --studentId=6966452e41d3a0b2e8187a87 --dryRun

Features:
  ✅ Invoices each course from its specific enrollment date
  ✅ Respects individual course enrollment history
  ✅ Works for both active and inactive students
  ✅ Skips students without periodic billing courses
  ✅ Consolidates multiple courses into one invoice per period
  ✅ Checks for existing invoices to avoid duplicates
  ✅ Detailed progress reporting per course

Note: If courseEnrollments data is missing, falls back to student enrollment date
      Run migrate-course-enrollments.js first to populate course-specific dates
      `);
      process.exit(0);
    }

    const { branchId, studentId, dryRun, force, consolidate } = argv;

    try {
      await mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
      console.log("✅ Connected to MongoDB");

      if (dryRun) {
        console.log("\n🔍 DRY RUN MODE - No invoices will be created\n");
      }

      console.log(`📋 Configuration:`);
      console.log(`   Consolidation: ${consolidate ? "ENABLED" : "DISABLED"}`);
      console.log(`   Force recreate: ${force ? "YES" : "NO"}`);
      if (branchId) console.log(`   Branch filter: ${branchId}`);
      if (studentId) console.log(`   Student filter: ${studentId}`);

      const startTime = Date.now();
      const results = await generateStudentInvoices({
        branchId,
        studentId,
        dryRun,
        consolidate,
        force,
      });
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log("\n" + "=".repeat(60));
      console.log("📊 GENERATION SUMMARY");
      console.log("=".repeat(60));
      console.log(`Total students found: ${results.totalStudents}`);
      console.log(`Students processed: ${results.studentsProcessed}`);
      console.log(`Students skipped: ${results.studentsSkipped}`);
      console.log(`Total invoices created: ${results.totalInvoicesCreated}`);
      console.log(`Total invoices skipped: ${results.totalInvoicesSkipped}`);
      if (results.errors.length > 0) {
        console.log(`Errors: ${results.errors.length}`);
        console.log("\nErrors:");
        results.errors.forEach((err) => {
          console.log(`  - Student ${err.studentId}: ${err.error}`);
        });
      }
      console.log(`Duration: ${duration}s`);
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

module.exports = { generateStudentInvoices, monthsBetween, getMonthYear };
