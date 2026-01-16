const mongoose = require("mongoose");
require("dotenv").config();

/**
 * Update courses to add monthly billing fee structure
 */

async function updateCoursePricing({ dryRun = false } = {}) {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to database\n");

    const Course = require("../models/Course");

    // Find all courses that need pricing
    const courses = await Course.find({
      $or: [
        { "feeStructure.perPeriodAmount": { $exists: false } },
        { "feeStructure.perPeriodAmount": null },
        { "feeStructure.perPeriodAmount": 0 }
      ]
    }).select('courseName courseCode feeStructure');

    console.log(`Found ${courses.length} courses without proper monthly pricing\n`);

    if (courses.length === 0) {
      console.log("✅ All courses already have pricing configured!");
      await mongoose.connection.close();
      return;
    }

    console.log("Courses that need pricing:\n");
    courses.forEach((course, idx) => {
      console.log(`${idx + 1}. ${course.courseName} (${course.courseCode || 'No code'})`);
      console.log(`   Current billing: ${course.feeStructure?.billingFrequency || 'Not set'}`);
      console.log(`   Current amount: ${course.feeStructure?.perPeriodAmount || 0} KES`);
      console.log();
    });

    console.log("=".repeat(70));
    console.log("RECOMMENDED ACTION:");
    console.log("=".repeat(70));
    console.log("Update each course individually through the admin panel, OR");
    console.log("Modify this script to set default pricing for all courses.\n");

    console.log("Example: Set all courses to 5000 KES/month:");
    console.log("  Uncomment the UPDATE section below and run with --execute\n");

    // UNCOMMENT THIS SECTION TO AUTO-UPDATE ALL COURSES
    // WARNING: This sets the SAME price for ALL courses
    /*
    if (!dryRun) {
      const DEFAULT_MONTHLY_FEE = 5000;
      
      for (const course of courses) {
        await Course.findByIdAndUpdate(course._id, {
          $set: {
            'feeStructure.billingFrequency': 'monthly',
            'feeStructure.perPeriodAmount': DEFAULT_MONTHLY_FEE,
            'feeStructure.components': [
              {
                name: 'Tuition Fee',
                amount: DEFAULT_MONTHLY_FEE,
                category: 'tuition',
                description: 'Monthly tuition fee',
                isOptional: false
              }
            ]
          }
        });
        console.log(`✅ Updated ${course.courseName} → ${DEFAULT_MONTHLY_FEE} KES/month`);
      }
      
      console.log(`\n✅ Updated ${courses.length} courses`);
    }
    */

    await mongoose.connection.close();

  } catch (err) {
    console.error("Error:", err);
    throw err;
  }
}

// CLI
if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    const dryRun = !args.includes("--execute");

    if (args.includes("--help")) {
      console.log(`
Update Course Pricing Script

Usage:
  node update-course-pricing.js [--execute]

Options:
  --execute    Actually update courses (default is dry-run)
  --help       Show this help

This script identifies courses without monthly pricing.
To set prices, either:
  1. Update courses individually via admin panel (recommended)
  2. Modify the script to set default pricing for all courses
      `);
      process.exit(0);
    }

    console.log("=".repeat(70));
    console.log("UPDATE COURSE PRICING");
    console.log("=".repeat(70));
    console.log(`Mode: ${dryRun ? "PREVIEW" : "EXECUTE"}\n`);

    await updateCoursePricing({ dryRun });
    process.exit(0);
  })();
}

module.exports = { updateCoursePricing };
