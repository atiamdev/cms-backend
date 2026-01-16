const mongoose = require("mongoose");
require("dotenv").config();

/**
 * Test script to verify invoice consolidation works with multiple courses
 */
async function testConsolidation() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to database\n");

    const Student = require("../models/Student");
    const Course = require("../models/Course");
    const Fee = require("../models/Fee");

    // Find a student with multiple courses
    const students = await Student.find({ 
      academicStatus: "active",
      $expr: { $gt: [{ $size: "$courses" }, 1] }
    }).limit(5);

    console.log(`Found ${students.length} students with multiple courses\n`);

    for (const student of students) {
      console.log(`\nStudent: ${student.firstName} ${student.lastName} (${student.studentNumber})`);
      console.log(`Enrolled in ${student.courses.length} courses`);

      // Check courses
      const courses = await Course.find({ 
        _id: { $in: student.courses },
        "feeStructure.billingFrequency": { $exists: true }
      }).select('courseName feeStructure.billingFrequency feeStructure.perPeriodAmount');

      console.log("\nCourses with billing:");
      for (const course of courses) {
        console.log(`  - ${course.courseName}`);
        console.log(`    Frequency: ${course.feeStructure?.billingFrequency || 'N/A'}`);
        console.log(`    Amount: ${course.feeStructure?.perPeriodAmount || 'N/A'}`);
      }

      // Check existing invoices
      const invoices = await Fee.find({
        studentId: student._id,
        invoiceType: { $in: ['monthly', 'weekly', 'quarterly', 'annual'] }
      }).sort({ createdAt: -1 }).limit(3);

      console.log(`\nExisting invoices: ${invoices.length}`);
      for (const invoice of invoices) {
        console.log(`  - ${invoice.invoiceType} ${invoice.periodYear}-${invoice.periodMonth}`);
        console.log(`    Amount: ${invoice.totalAmountDue}`);
        console.log(`    Consolidated: ${invoice.isConsolidated}`);
        if (invoice.isConsolidated && invoice.metadata?.courseIds) {
          console.log(`    Course count: ${invoice.metadata.courseIds.length}`);
        }
      }
    }

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("CONSOLIDATION TEST SUMMARY");
    console.log("=".repeat(60));

    const consolidatedInvoices = await Fee.countDocuments({ isConsolidated: true });
    const totalInvoices = await Fee.countDocuments({ 
      invoiceType: { $in: ['monthly', 'weekly', 'quarterly', 'annual'] }
    });

    console.log(`Total periodic invoices: ${totalInvoices}`);
    console.log(`Consolidated invoices: ${consolidatedInvoices}`);
    console.log(`Single-course invoices: ${totalInvoices - consolidatedInvoices}`);

    if (consolidatedInvoices > 0) {
      const avgCourses = await Fee.aggregate([
        { $match: { isConsolidated: true } },
        { $group: { 
          _id: null, 
          avgCourses: { $avg: "$metadata.consolidatedCourseCount" },
          maxCourses: { $max: "$metadata.consolidatedCourseCount" }
        }}
      ]);
      
      if (avgCourses.length > 0) {
        console.log(`Average courses per consolidated invoice: ${avgCourses[0].avgCourses.toFixed(2)}`);
        console.log(`Max courses in single invoice: ${avgCourses[0].maxCourses}`);
      }
    }

    await mongoose.connection.close();
    console.log("\nTest complete.");
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

if (require.main === module) {
  testConsolidation();
}

module.exports = { testConsolidation };
