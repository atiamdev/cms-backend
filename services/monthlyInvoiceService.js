const Student = require("../models/Student");
const Fee = require("../models/Fee");
const Course = require("../models/Course");
const mongoose = require("mongoose");
const { notifyStudentsOfInvoices } = require("./invoiceNotificationService");
const { applyCreditToNewInvoice } = require("./paymentReconciliationService");

// Helper: compute periodStart based on frequency and target date
function getPeriodStart(frequency, date) {
  const d = new Date(date);
  switch (frequency) {
    case "weekly": {
      // ISO week start (Monday)
      const day = d.getDay();
      const diff = (day === 0 ? -6 : 1) - day; // adjust so Monday is day 1
      const monday = new Date(d);
      monday.setDate(d.getDate() + diff);
      monday.setHours(0, 0, 0, 0);
      return monday;
    }
    case "monthly": {
      return new Date(d.getFullYear(), d.getMonth(), 1);
    }
    case "quarterly": {
      const quarter = Math.floor(d.getMonth() / 3);
      return new Date(d.getFullYear(), quarter * 3, 1);
    }
    case "annual": {
      return new Date(d.getFullYear(), 0, 1);
    }
    default:
      return new Date(d.getFullYear(), d.getMonth(), 1);
  }
}

/**
 * Generate periodic invoices for fee structures of a given frequency
 * Options: { periodYear, periodMonth, branchId, studentId, initiatedBy, consolidate }
 * consolidate: If true, creates one invoice per student for all their courses
 * studentId: If provided, only generate invoices for this specific student
 */
async function generateMonthlyInvoices({
  periodYear,
  periodMonth,
  branchId,
  studentId,
  initiatedBy,
  consolidate = true,
} = {}) {
  // Course-based monthly invoice generator
  const createdFees = [];
  const skipped = [];
  const notifications = [];

  // Find courses with monthly billing enabled
  const courseQuery = {
    "feeStructure.billingFrequency": "monthly",
    "feeStructure.isActive": { $ne: false },
  };
  if (branchId) courseQuery.branchId = branchId;

  const courses = await Course.find(courseQuery).lean();

  if (!courses || courses.length === 0) {
    console.log("No courses with monthly billing found");
    return {
      created: 0,
      skipped: 0,
      notificationsPending: 0,
      details: { created: [], skipped: [] },
    };
  }

  console.log(`Found ${courses.length} courses with monthly billing`);

  if (consolidate) {
    // Consolidation mode: Group by student and create one invoice per student
    const studentInvoiceMap = new Map(); // studentId -> invoice data

    // Check for students who already have invoices for this period
    // For consolidated invoices: feeStructureId is null, so we need to query specifically for that
    const periodStartDate = new Date(periodYear, periodMonth - 1, 1);

    const existingInvoiceQuery = {
      periodStart: periodStartDate,
      feeStructureId: null, // Consolidated invoices have null feeStructureId
    };

    // Only filter by branchId if explicitly provided
    if (branchId) {
      existingInvoiceQuery.branchId = branchId;
    }

    const existingInvoices =
      await Fee.find(existingInvoiceQuery).select("studentId");

    const studentsWithInvoices = new Set(
      existingInvoices.map((e) => String(e.studentId)),
    );

    console.log(
      `Found ${existingInvoices.length} existing invoices for ${periodYear}-${String(periodMonth).padStart(2, "0")}`,
    );
    console.log(
      `${studentsWithInvoices.size} students already have invoices for this period`,
    );

    for (const course of courses) {
      const fs = course.feeStructure;
      if (!fs) continue;

      // Find eligible students enrolled in this course
      const studentQuery = {
        "courseEnrollments.courseId": course._id,
        "courseEnrollments.status": "active",
        branchId: course.branchId,
        academicStatus: { $in: ["active", "inactive"] },
      };

      // Filter by specific student if provided
      if (studentId) {
        studentQuery._id = studentId;
      }

      const students = await Student.find(studentQuery).select(
        "_id branchId enrollmentDate scholarshipPercentage",
      );

      if (!students || students.length === 0) continue;

      for (const stu of students) {
        const studentKey = String(stu._id);

        // Skip if student already has ANY invoice for this period
        if (studentsWithInvoices.has(studentKey)) {
          skipped.push({
            courseId: course._id,
            studentId: stu._id,
            reason: "has_invoice",
          });
          continue;
        }

        const amount =
          fs.perPeriodAmount !== undefined && fs.perPeriodAmount !== null
            ? fs.perPeriodAmount
            : fs.components?.reduce((s, c) => s + (c.amount || 0), 0) ||
              fs.totalAmount ||
              0;

        // Add to consolidated invoice
        if (!studentInvoiceMap.has(studentKey)) {
          // Calculate due date based on student's enrollment date
          let dueDate = null;
          if (stu.enrollmentDate) {
            const enrollmentDay = new Date(stu.enrollmentDate).getDate();
            dueDate = new Date(periodYear, periodMonth - 1, enrollmentDay);
          } else {
            dueDate = new Date(periodYear, periodMonth - 1, 10);
          }

          studentInvoiceMap.set(studentKey, {
            branchId: stu.branchId,
            studentId: stu._id,
            scholarshipPercentage: Number(stu.scholarshipPercentage) || 0,
            courses: [],
            feeComponents: [],
            totalAmountDue: 0,
            dueDate,
            academicYear:
              fs.academicYear || new Date().getFullYear().toString(),
          });
        }

        const invoiceData = studentInvoiceMap.get(studentKey);
        invoiceData.courses.push(course._id);
        invoiceData.feeComponents.push(
          ...(fs.components || fs.feeComponents || []),
        );
        invoiceData.totalAmountDue += amount;
      }
    }

    // Create consolidated invoices
    const invoicesToCreate = [];
    for (const [studentId, data] of studentInvoiceMap) {
      // Calculate scholarship amount if student has active scholarship
      const scholarshipAmount =
        data.scholarshipPercentage > 0
          ? Math.round((data.totalAmountDue * data.scholarshipPercentage) / 100)
          : 0;

      invoicesToCreate.push({
        branchId: data.branchId,
        studentId: data.studentId,
        courseId: data.courses[0], // Primary course
        feeStructureId: null, // No separate fee structure
        consolidatedFeeStructures: [], // Not applicable for course-based
        academicYear: data.academicYear,
        academicTermId: null,
        feeComponents: data.feeComponents,
        totalAmountDue: data.totalAmountDue,
        discountAmount: 0,
        scholarshipAmount: scholarshipAmount,
        dueDate: data.dueDate,
        isInstallmentPlan: false,
        installmentSchedule: [],
        createdBy: initiatedBy || null,
        invoiceType: "monthly",
        periodYear: periodYear,
        periodMonth: periodMonth,
        periodStart: new Date(periodYear, periodMonth - 1, 1),
        isConsolidated: true,
        metadata: {
          consolidatedCourseCount: data.courses.length,
          courseIds: data.courses,
        },
      });
    }

    console.log(
      `Preparing to create ${invoicesToCreate.length} consolidated invoices`,
    );

    if (invoicesToCreate.length > 0) {
      try {
        const result = await Fee.insertMany(invoicesToCreate, {
          ordered: false,
        });
        createdFees.push(...result);

        // Auto-apply credit to new invoices
        for (const fee of result) {
          try {
            await applyCreditToNewInvoice(fee.studentId, fee._id);
          } catch (creditErr) {
            console.error(
              `Error applying credit to invoice ${fee._id}:`,
              creditErr.message,
            );
            // Continue processing other invoices even if credit application fails
          }
        }

        // Prepare notifications
        const monthName = new Date(
          periodYear,
          periodMonth - 1,
        ).toLocaleDateString("en-US", { month: "long", year: "numeric" });
        for (const fee of result) {
          notifications.push({
            studentId: fee.studentId,
            feeId: fee._id,
            amount: fee.totalAmountDue,
            dueDate: fee.dueDate,
            period: monthName,
            branchId: fee.branchId,
          });
        }
      } catch (err) {
        // Handle duplicate key errors gracefully
        if (err.code === 11000 && err.insertedDocs) {
          const duplicateCount =
            invoicesToCreate.length - err.insertedDocs.length;
          console.log(
            `⚠️  Duplicate invoices detected: ${duplicateCount} already exist, ${err.insertedDocs.length} created successfully`,
          );
          createdFees.push(...err.insertedDocs);

          // Auto-apply credit to successfully inserted invoices
          for (const fee of err.insertedDocs) {
            try {
              await applyCreditToNewInvoice(fee.studentId, fee._id);
            } catch (creditErr) {
              console.error(
                `Error applying credit to invoice ${fee._id}:`,
                creditErr.message,
              );
            }
          }

          // Add notifications for successful inserts
          const monthName = new Date(
            periodYear,
            periodMonth - 1,
          ).toLocaleDateString("en-US", { month: "long", year: "numeric" });
          for (const fee of err.insertedDocs) {
            notifications.push({
              studentId: fee.studentId,
              feeId: fee._id,
              amount: fee.totalAmountDue,
              dueDate: fee.dueDate,
              period: monthName,
              branchId: fee.branchId,
            });
          }
        } else {
          // Non-duplicate error - log and partially process if possible
          console.error("Error inserting consolidated invoices:", err.message);
          if (err.insertedDocs) {
            console.log(
              `Partial success: ${err.insertedDocs.length} invoices created despite error`,
            );
            createdFees.push(...err.insertedDocs);
          }
        }
      }
    }
  } else {
    // Non-consolidated mode: One invoice per course enrollment
    for (const course of courses) {
      const fs = course.feeStructure;
      if (!fs) continue;

      // Find eligible students enrolled in this course
      const studentQuery = {
        "courseEnrollments.courseId": course._id,
        "courseEnrollments.status": "active",
        branchId: course.branchId,
        academicStatus: { $in: ["active", "inactive"] },
      };

      // Filter by specific student if provided
      if (studentId) {
        studentQuery._id = studentId;
      }

      const students = await Student.find(studentQuery).select(
        "_id branchId scholarshipPercentage enrollmentDate",
      );

      if (!students || students.length === 0) continue;

      // Get existing invoices for this course and period
      const existingInvoices = await Fee.find({
        courseId: course._id,
        periodYear: periodYear,
        periodMonth: periodMonth,
      }).select("studentId");

      const existingSet = new Set(
        existingInvoices.map((e) => String(e.studentId)),
      );

      // Build invoices for students who don't have one yet
      const invoicesToCreate = [];
      for (const stu of students) {
        if (existingSet.has(String(stu._id))) {
          skipped.push({ courseId: course._id, studentId: stu._id });
          continue;
        }

        const amount =
          fs.perPeriodAmount !== undefined && fs.perPeriodAmount !== null
            ? fs.perPeriodAmount
            : fs.components?.reduce((s, c) => s + (c.amount || 0), 0) ||
              fs.totalAmount ||
              0;

        // Calculate due date based on student's enrollment date
        let dueDate = null;
        if (stu.enrollmentDate) {
          const enrollmentDay = new Date(stu.enrollmentDate).getDate();
          dueDate = new Date(periodYear, periodMonth - 1, enrollmentDay);
        } else {
          dueDate = new Date(periodYear, periodMonth - 1, 10);
        }

        // Calculate scholarship amount if student has active scholarship
        const scholarshipPercentage = Number(stu.scholarshipPercentage) || 0;
        const scholarshipAmount =
          scholarshipPercentage > 0
            ? Math.round((amount * scholarshipPercentage) / 100)
            : 0;

        invoicesToCreate.push({
          branchId: stu.branchId,
          studentId: stu._id,
          courseId: course._id,
          feeStructureId: null,
          academicYear: fs.academicYear || new Date().getFullYear().toString(),
          academicTermId: null,
          feeComponents: fs.components || fs.feeComponents || [],
          totalAmountDue: amount,
          discountAmount: 0,
          scholarshipAmount: scholarshipAmount,
          dueDate: dueDate,
          isInstallmentPlan: false,
          installmentSchedule: [],
          createdBy: initiatedBy || null,
          invoiceType: "monthly",
          periodYear: periodYear,
          periodMonth: periodMonth,
          periodStart: new Date(periodYear, periodMonth - 1, 1),
        });
      }

      if (invoicesToCreate.length > 0) {
        try {
          const result = await Fee.insertMany(invoicesToCreate, {
            ordered: false,
          });
          createdFees.push(...result);

          // Prepare notifications
          const monthName = new Date(
            periodYear,
            periodMonth - 1,
          ).toLocaleDateString("en-US", { month: "long", year: "numeric" });
          for (const fee of result) {
            notifications.push({
              studentId: fee.studentId,
              feeId: fee._id,
              amount: fee.totalAmountDue,
              dueDate: fee.dueDate,
              period: monthName,
              branchId: fee.branchId,
            });
          }
        } catch (err) {
          // Handle duplicate key errors gracefully
          if (err.code === 11000 && err.insertedDocs) {
            const duplicateCount =
              invoicesToCreate.length - err.insertedDocs.length;
            console.log(
              `⚠️  Course ${course._id}: ${duplicateCount} duplicate(s) skipped, ${err.insertedDocs.length} created`,
            );
            createdFees.push(...err.insertedDocs);

            // Add notifications for successful inserts
            const monthName = new Date(
              periodYear,
              periodMonth - 1,
            ).toLocaleDateString("en-US", { month: "long", year: "numeric" });
            for (const fee of err.insertedDocs) {
              notifications.push({
                studentId: fee.studentId,
                feeId: fee._id,
                amount: fee.totalAmountDue,
                dueDate: fee.dueDate,
                period: monthName,
                branchId: fee.branchId,
              });
            }
          } else {
            // Non-duplicate error
            console.error(
              "Error inserting invoices for course",
              course._id,
              err.message,
            );
            if (err.insertedDocs) {
              createdFees.push(...err.insertedDocs);
            }
          }
        }
      }
    }
  }

  // Send notifications
  let notificationsSent = 0;
  if (notifications.length > 0) {
    try {
      const result = await notifyStudentsOfInvoices(notifications);
      notificationsSent = result.successful;
      console.log(
        `Notifications sent: ${result.successful}/${result.total} successful`,
      );
    } catch (err) {
      console.error("Error sending invoice notifications:", err);
    }
  }

  return {
    created: createdFees.length,
    skipped: skipped.length,
    notificationsSent,
    details: { created: createdFees, skipped },
  };
}

/**
 * Generate invoices for arbitrary frequency on a given date
 */
async function generateInvoicesForFrequency({
  frequency,
  date = new Date(),
  branchId,
  initiatedBy,
} = {}) {
  const createdFees = [];
  const skipped = [];
  const notifications = [];

  // Find courses with specified billing frequency
  const courseQuery = {
    "feeStructure.billingFrequency": frequency,
    "feeStructure.isActive": { $ne: false },
  };
  if (branchId) courseQuery.branchId = branchId;

  const courses = await Course.find(courseQuery).lean();
  const periodStart = getPeriodStart(frequency, date);

  if (!courses || courses.length === 0) {
    console.log(`No courses with ${frequency} billing found`);
    return {
      created: 0,
      skipped: 0,
      notificationsPending: 0,
      details: { created: [], skipped: [] },
    };
  }

  for (const course of courses) {
    const fs = course.feeStructure;
    if (!fs) continue;

    // Find eligible students enrolled in this course
    const studentQuery = {
      "courseEnrollments.courseId": course._id,
      "courseEnrollments.status": "active",
      branchId: course.branchId,
      academicStatus: { $in: ["active", "inactive"] },
    };

    // Note: generateInvoicesForFrequency doesn't support studentId filtering yet

    const students = await Student.find(studentQuery).select(
      "_id branchId scholarshipPercentage",
    );

    if (!students || students.length === 0) continue;

    // Existing invoices for this course and periodStart
    const existingInvoices = await Fee.find({
      courseId: course._id,
      periodStart,
    }).select("studentId");
    const existingSet = new Set(
      existingInvoices.map((e) => String(e.studentId)),
    );

    const invoicesToCreate = [];

    for (const stu of students) {
      if (existingSet.has(String(stu._id))) {
        skipped.push({ courseId: course._id, studentId: stu._id });
        continue;
      }

      const amount =
        fs.perPeriodAmount !== undefined && fs.perPeriodAmount !== null
          ? fs.perPeriodAmount
          : fs.components?.reduce((s, c) => s + (c.amount || 0), 0) ||
            fs.totalAmount ||
            0;

      // Compute dueDate default
      let dueDate = null;
      if (fs.dueDate) {
        const day = new Date(fs.dueDate).getDate();
        dueDate = new Date(
          periodStart.getFullYear(),
          periodStart.getMonth(),
          day,
        );
      } else {
        dueDate = new Date(periodStart);
        dueDate.setDate(dueDate.getDate() + 10);
      }

      // Calculate scholarship amount if student has active scholarship
      const scholarshipAmount =
        stu.scholarshipPercentage > 0
          ? Math.round((amount * stu.scholarshipPercentage) / 100)
          : 0;

      invoicesToCreate.push({
        branchId: stu.branchId,
        studentId: stu._id,
        courseId: course._id,
        feeStructureId: null,
        academicYear: fs.academicYear || new Date().getFullYear().toString(),
        academicTermId: null,
        feeComponents: fs.components || fs.feeComponents || [],
        totalAmountDue: amount,
        discountAmount: 0,
        scholarshipAmount: scholarshipAmount,
        dueDate,
        isInstallmentPlan: false,
        installmentSchedule: [],
        createdBy: initiatedBy || null,
        invoiceType: frequency,
        periodStart,
      });
    }

    if (invoicesToCreate.length > 0) {
      try {
        const result = await Fee.insertMany(invoicesToCreate, {
          ordered: false,
        });
        createdFees.push(...result);

        // Prepare notifications
        const periodName = periodStart.toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        });
        for (const fee of result) {
          notifications.push({
            studentId: fee.studentId,
            feeId: fee._id,
            amount: fee.totalAmountDue,
            dueDate: fee.dueDate,
            period: periodName,
            branchId: fee.branchId,
          });
        }
      } catch (err) {
        // Handle duplicate key errors gracefully
        if (err.code === 11000 && err.insertedDocs) {
          const duplicateCount =
            invoicesToCreate.length - err.insertedDocs.length;
          console.log(
            `⚠️  ${frequency} invoices: ${duplicateCount} duplicate(s) skipped, ${err.insertedDocs.length} created`,
          );
          createdFees.push(...err.insertedDocs);

          const periodName = periodStart.toLocaleDateString("en-US", {
            month: "long",
            year: "numeric",
          });
          for (const fee of err.insertedDocs) {
            notifications.push({
              studentId: fee.studentId,
              feeId: fee._id,
              amount: fee.totalAmountDue,
              dueDate: fee.dueDate,
              period: periodName,
              branchId: fee.branchId,
            });
          }
        } else {
          // Non-duplicate error
          console.error(
            "Error inserting invoices for course",
            course._id,
            err.message,
          );
          if (err.insertedDocs) {
            createdFees.push(...err.insertedDocs);
          }
        }
      }
    }
  }

  // Send notifications
  let notificationsSent = 0;
  if (notifications.length > 0) {
    try {
      const result = await notifyStudentsOfInvoices(notifications);
      notificationsSent = result.successful;
      console.log(
        `${frequency} invoice notifications: ${result.successful}/${result.total} successful`,
      );
    } catch (err) {
      console.error("Error sending invoice notifications:", err);
    }
  }

  return {
    created: createdFees.length,
    skipped: skipped.length,
    notificationsSent,
    details: { created: createdFees, skipped },
  };
}

/**
 * Create an invoice for a student/course enrollment based on the course's embedded feeStructure
 */
async function createInvoiceForEnrollment({
  studentId,
  course,
  date = new Date(),
  initiatedBy = null,
} = {}) {
  if (!course || !course.feeStructure)
    return { created: 0, reason: "no_fee_structure" };

  const fs = course.feeStructure;
  if (!fs.billingFrequency || fs.billingFrequency === "term")
    return { created: 0, reason: "not_periodic" };
  if (!fs.createInvoiceOnEnrollment)
    return { created: 0, reason: "not_configured" };

  // Get student scholarship info and enrollment date
  const student = await Student.findById(studentId).select(
    "scholarshipPercentage enrollmentDate",
  );
  const scholarshipPercentage = student?.scholarshipPercentage || 0;
  const enrollmentDate = student?.enrollmentDate;

  const frequency = fs.billingFrequency;
  const periodStart = getPeriodStart(frequency, date);

  // Determine amount
  const amount =
    fs.perPeriodAmount !== undefined && fs.perPeriodAmount !== null
      ? fs.perPeriodAmount
      : fs.components?.reduce((s, c) => s + (c.amount || 0), 0) ||
        fs.totalAmount ||
        0;

  // Compute dueDate based on student's enrollment date
  let dueDate = null;
  if (enrollmentDate) {
    // Use day of month from student's enrollment date
    const enrollmentDay = new Date(enrollmentDate).getDate();
    dueDate = new Date(
      periodStart.getFullYear(),
      periodStart.getMonth(),
      enrollmentDay,
    );
  } else {
    // Fallback to default rules per frequency if no enrollment date
    switch (frequency) {
      case "weekly":
        dueDate = new Date(periodStart);
        dueDate.setDate(dueDate.getDate() + 7); // 1 week
        break;
      case "monthly":
      case "quarterly":
        dueDate = new Date(periodStart);
        dueDate.setDate(dueDate.getDate() + 10);
        break;
      case "annual":
        dueDate = new Date(periodStart);
        dueDate.setDate(dueDate.getDate() + 30);
        break;
      default:
        dueDate = new Date(periodStart);
        dueDate.setDate(dueDate.getDate() + 10);
    }
  }

  // Idempotency check: existing invoice for student+course+periodStart
  const existing = await Fee.findOne({
    studentId,
    courseId: course._id,
    periodStart,
  });
  if (existing) return { created: 0, reason: "exists" };

  // Calculate scholarship amount if student has active scholarship
  const scholarshipAmount =
    scholarshipPercentage > 0
      ? Math.round((amount * scholarshipPercentage) / 100)
      : 0;

  const feeDoc = new Fee({
    branchId: course.branchId || null,
    studentId,
    courseId: course._id,
    feeStructureId: null,
    academicYear: fs.academicYear || null,
    academicTermId: null, // Course-based invoices don't require term
    feeComponents: fs.components || [],
    totalAmountDue: amount,
    discountAmount: 0,
    scholarshipAmount: scholarshipAmount,
    dueDate,
    isInstallmentPlan: false,
    installmentSchedule: [],
    createdBy: initiatedBy,
    invoiceType: frequency,
    periodStart,
  });

  await feeDoc.save();

  // Send notification
  const periodName = periodStart.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  notifyStudentsOfInvoices([
    {
      studentId,
      feeId: feeDoc._id,
      amount,
      dueDate,
      period: periodName,
      branchId: course.branchId,
    },
  ]).catch((err) =>
    console.error("Error sending enrollment invoice notification:", err),
  );

  return { created: 1, feeId: feeDoc._id };
}

module.exports = {
  generateMonthlyInvoices,
  generateInvoicesForFrequency,
  createInvoiceForEnrollment,
};
