/**
 * Migration Script: Enable createInvoiceOnEnrollment for all courses
 *
 * This script updates all existing courses to have createInvoiceOnEnrollment = true
 * Run this once after updating the Course model default value
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Course = require("./models/Course");

async function enableInvoiceOnEnrollment() {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log("✓ Connected to MongoDB");

    // Find all courses where createInvoiceOnEnrollment is not set or is false
    const coursesToUpdate = await Course.find({
      $or: [
        { "feeStructure.createInvoiceOnEnrollment": { $exists: false } },
        { "feeStructure.createInvoiceOnEnrollment": false },
        { "feeStructure.createInvoiceOnEnrollment": null },
      ],
    });

    console.log(`\nFound ${coursesToUpdate.length} courses to update`);

    if (coursesToUpdate.length === 0) {
      console.log(
        "✓ All courses already have createInvoiceOnEnrollment enabled",
      );
      process.exit(0);
    }

    // Update each course
    let updated = 0;
    for (const course of coursesToUpdate) {
      try {
        if (!course.feeStructure) {
          course.feeStructure = {};
        }
        course.feeStructure.createInvoiceOnEnrollment = true;
        await course.save();
        console.log(`  ✓ Updated course: ${course.name} (${course.code})`);
        updated++;
      } catch (error) {
        console.error(
          `  ✗ Failed to update course ${course.name}:`,
          error.message,
        );
      }
    }

    console.log(
      `\n✓ Successfully updated ${updated} out of ${coursesToUpdate.length} courses`,
    );

    // Verify the changes
    const verifyCount = await Course.countDocuments({
      "feeStructure.createInvoiceOnEnrollment": true,
    });
    console.log(
      `✓ Verification: ${verifyCount} courses now have createInvoiceOnEnrollment enabled`,
    );

    process.exit(0);
  } catch (error) {
    console.error("✗ Migration failed:", error);
    process.exit(1);
  }
}

// Run the migration
enableInvoiceOnEnrollment();
