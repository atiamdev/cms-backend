const { validationResult } = require("express-validator");
const mongoose = require("mongoose");
const Student = require("../models/Student");
const User = require("../models/User");
const Branch = require("../models/Branch");
const Class = require("../models/Class");
const Department = require("../models/Department");
const Course = require("../models/Course");
const CloudflareService = require("../services/cloudflareService");
const { generateId, generateAdmissionNumber } = require("../utils/helpers");
const {
  canAccessBranchResource,
  getBranchQueryFilter,
  canPerformBranchOperation,
  isSuperAdmin,
  hasAdminPrivileges,
} = require("../utils/accessControl");
const { fillReceiptTemplate } = require("../utils/receiptUtils");

/**
 * Helper function to generate initial invoices for a newly registered student
 * @param {String} studentId - Student's MongoDB ID
 * @param {Array} courseIds - Array of course IDs the student is enrolled in
 * @param {String} branchId - Branch ID
 * @param {String} userId - User ID who is registering the student
 * @param {Number} discountPercentage - Discount percentage to apply (0-100)
 */
async function generateInitialInvoicesForStudent(
  studentId,
  courseIds,
  branchId,
  userId,
  discountPercentage = 0,
) {
  try {
    const Fee = require("../models/Fee");

    // Fetch courses to check if they have createInvoiceOnEnrollment enabled
    const courses = await Course.find({
      _id: { $in: courseIds },
      "feeStructure.createInvoiceOnEnrollment": true,
    }).lean();

    if (!courses || courses.length === 0) {
      console.log("No courses with createInvoiceOnEnrollment enabled");
      return { created: 0, skipped: courseIds.length };
    }

    console.log(
      `Generating initial invoices for ${courses.length} courses with auto-invoice enabled`,
    );

    const createdInvoices = [];
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-12

    for (const course of courses) {
      const fs = course.feeStructure;
      if (!fs || !fs.components || fs.components.length === 0) {
        console.log(`Course ${course.name} has no fee components, skipping`);
        continue;
      }

      // Calculate total amount from fee components
      const totalAmount = fs.components.reduce(
        (sum, comp) => sum + (comp.amount || 0),
        0,
      );

      if (totalAmount <= 0) {
        console.log(`Course ${course.name} has zero fee amount, skipping`);
        continue;
      }

      // Determine billing frequency and period
      const frequency = fs.billingFrequency || "term";
      let periodLabel = "";

      switch (frequency) {
        case "weekly":
          periodLabel = `Week of ${now.toISOString().split("T")[0]}`;
          break;
        case "monthly":
          periodLabel = `${now.toLocaleString("default", {
            month: "long",
          })} ${currentYear}`;
          break;
        case "quarterly":
          const quarter = Math.floor((currentMonth - 1) / 3) + 1;
          periodLabel = `Q${quarter} ${currentYear}`;
          break;
        case "annual":
          periodLabel = `Academic Year ${currentYear}`;
          break;
        case "term":
        default:
          periodLabel = fs.academicTerm || "Term 1";
          break;
      }

      // Check if invoice already exists for this student and period
      // Note: The unique index is on feeStructureId+studentId+periodYear+periodMonth
      // Since feeStructureId is null for course-based invoices, we can only have ONE invoice
      // per student per period (regardless of how many courses they're enrolled in)
      const existingInvoice = await Fee.findOne({
        studentId: studentId,
        feeStructureId: null, // Match the null value in the unique index
        periodYear: currentYear,
        periodMonth: currentMonth,
        branchId: branchId,
      });

      if (existingInvoice) {
        console.log(
          `Invoice already exists for student ${studentId} for period ${currentYear}-${currentMonth} (existing invoice covers course: ${existingInvoice.courseId})`,
        );
        console.log(
          `Skipping invoice generation for course ${course.name}. Consider using consolidated monthly invoices instead.`,
        );
        continue;
      }

      // Determine academic year - use from fee structure or generate current academic year
      const academicYear =
        fs.academicYear || `${currentYear}/${currentYear + 1}`;

      // Calculate scholarship amount and get enrollment date (prefer student.scholarshipPercentage if present)
      let scholarshipAmount = 0;
      let appliedPct = 0;
      let studentEnrollmentDate = null;
      try {
        const Student = require("../models/Student");
        const studentDoc = await Student.findById(studentId).select(
          "scholarshipPercentage enrollmentDate",
        );
        appliedPct =
          studentDoc && studentDoc.scholarshipPercentage > 0
            ? studentDoc.scholarshipPercentage
            : discountPercentage > 0 && discountPercentage <= 100
              ? discountPercentage
              : 0;
        scholarshipAmount =
          appliedPct > 0 ? Math.round((totalAmount * appliedPct) / 100) : 0;
        studentEnrollmentDate = studentDoc?.enrollmentDate;
      } catch (err) {
        console.error("Error fetching student scholarship percentage:", err);
        appliedPct =
          discountPercentage > 0 && discountPercentage <= 100
            ? discountPercentage
            : 0;
        scholarshipAmount =
          appliedPct > 0 ? Math.round((totalAmount * appliedPct) / 100) : 0;
      }

      const amountAfterScholarship = totalAmount - scholarshipAmount;

      // Calculate due date based on student's enrollment date
      let dueDate;
      if (studentEnrollmentDate) {
        const enrollmentDay = new Date(studentEnrollmentDate).getDate();
        dueDate = new Date(currentYear, currentMonth - 1, enrollmentDay);
      } else {
        dueDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days from now as fallback
      }

      // Create invoice (scholarships reflected in scholarshipAmount; discountAmount reserved for manual invoice-level discounts)
      const invoice = new Fee({
        branchId: branchId,
        studentId: studentId,
        courseId: course._id,
        feeComponents: fs.components.map((comp) => ({
          name: comp.name,
          amount: comp.amount,
          isOptional: comp.isOptional || false,
          description: comp.description || "",
        })),
        totalAmountDue: totalAmount,
        discountAmount: 0,
        amountPaid: 0,
        balance: amountAfterScholarship,
        status: "unpaid",
        dueDate: dueDate,
        academicYear: academicYear,
        academicTermId: null, // Can be set if you have academic term logic
        invoiceNumber: `INV${currentYear}${currentMonth
          .toString()
          .padStart(2, "0")}${Date.now()}`,
        periodYear: currentYear,
        periodMonth: currentMonth,
        periodLabel: periodLabel,
        frequency: frequency,
        invoiceType: frequency, // Set invoiceType to match frequency
        scholarshipAmount: scholarshipAmount,
        notes:
          scholarshipAmount > 0
            ? `Initial invoice generated on student registration for ${course.name}. Scholarship of ${appliedPct}% (KSh ${scholarshipAmount}) applied.`
            : `Initial invoice generated on student registration for ${course.name}`,
        createdBy: userId,
      });

      await invoice.save();
      createdInvoices.push(invoice);
      console.log(
        `✅ Created invoice for student ${studentId}, course: ${course.name}, original: ${totalAmount}, scholarship: ${scholarshipAmount} (${appliedPct}%), final: ${amountAfterScholarship}`,
      );
    }

    return {
      created: createdInvoices.length,
      skipped: courseIds.length - createdInvoices.length,
      invoices: createdInvoices,
    };
  } catch (error) {
    console.error("Error generating initial invoices:", error);
    // Don't throw error - let student registration succeed even if invoice generation fails
    return { created: 0, skipped: courseIds.length, error: error.message };
  }
}

/**
 * Helper function to cancel/void unpaid invoices when courses are removed from a student
 * @param {String} studentId - Student's MongoDB ID
 * @param {Array} removedCourseIds - Array of course IDs that were removed
 */
async function cancelInvoicesForRemovedCourses(studentId, removedCourseIds) {
  try {
    const Fee = require("../models/Fee");

    // Find unpaid invoices for the removed courses
    const unpaidInvoices = await Fee.find({
      studentId: studentId,
      courseId: { $in: removedCourseIds },
      status: { $in: ["unpaid", "partially_paid"] },
    });

    if (unpaidInvoices.length === 0) {
      console.log("No unpaid invoices found for removed courses");
      return { cancelled: 0 };
    }

    console.log(
      `Found ${unpaidInvoices.length} unpaid invoices for removed courses`,
    );

    let cancelledCount = 0;

    for (const invoice of unpaidInvoices) {
      // If invoice has partial payment, we don't auto-cancel it - requires manual review
      if (invoice.amountPaid > 0) {
        console.log(
          `Invoice ${invoice.invoiceNumber} has partial payment (${invoice.amountPaid}), skipping auto-cancellation`,
        );
        // You could add a flag here to mark it for manual review
        invoice.notes =
          (invoice.notes || "") +
          `\n[ATTENTION] Course removed but invoice has partial payment. Requires manual review.`;
        await invoice.save();
        continue;
      }

      // Cancel fully unpaid invoices
      invoice.status = "cancelled";
      invoice.notes =
        (invoice.notes || "") +
        `\n[AUTO-CANCELLED] Course removed from student on ${
          new Date().toISOString().split("T")[0]
        }`;
      await invoice.save();
      cancelledCount++;
      console.log(
        `✅ Cancelled invoice ${invoice.invoiceNumber} for removed course`,
      );
    }

    return {
      cancelled: cancelledCount,
      requiresReview: unpaidInvoices.length - cancelledCount,
    };
  } catch (error) {
    console.error("Error cancelling invoices for removed courses:", error);
    return { cancelled: 0, error: error.message };
  }
}

// @desc    Create a new student
// @route   POST /api/students
// @access  Private (Admin, Secretary)
const createStudent = async (req, res) => {
  let createdUser = null;
  let existingUser = null;

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation errors",
        errors: errors.array(),
      });
    }

    // Branch access validation
    const targetBranchId = req.body.branchId || req.branchId;
    if (!canPerformBranchOperation(req.user, targetBranchId)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Cannot create students in this branch",
      });
    }

    const {
      // User data
      email,
      password,
      firstName,
      lastName,
      profileDetails,
      // Student specific data
      currentClassId,
      enrollmentDate,
      referralSource,
      photoUrl, // Add photo URL
      parentGuardianInfo,
      medicalInfo,
      specialNeeds,
      courses, // Add courses field
      discountPercentage, // Discount/Scholarship percentage during registration
      discountReason, // Optional reason for the discount
    } = req.body;

    // Check if user with email already exists
    existingUser = await User.findOne({ email });

    // If user exists, check if they already have a student record in THIS branch
    if (existingUser) {
      // CRITICAL: Check for existing student record with BOTH userId AND branchId
      // This prevents duplicate student creation in the same branch
      const existingStudent = await Student.findOne({
        userId: existingUser._id,
        branchId: req.branchId, // Must check in the same branch
      });

      if (existingStudent) {
        return res.status(400).json({
          success: false,
          message:
            "A student record for this user already exists in this branch",
          existingStudent: {
            studentId: existingStudent.studentId,
            admissionNumber: existingStudent.admissionNumber,
          },
        });
      }

      // Check if user belongs to the same branch
      if (existingUser.branchId.toString() !== req.branchId.toString()) {
        return res.status(400).json({
          success: false,
          message: "User with this email exists in a different branch",
        });
      }

      // Check if user has student role
      if (!existingUser.roles.includes("student")) {
        // Add student role to existing user
        existingUser.roles.push("student");
        await existingUser.save();
      }
    }

    // Get branch configuration for student ID generation
    const branch = await Branch.findById(req.branchId);
    if (!branch) {
      return res.status(404).json({
        success: false,
        message: "Branch not found",
      });
    }

    // Generate admission number
    let admissionNumber;
    try {
      admissionNumber = await generateAdmissionNumber(branch);
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }

    // Generate unique student ID with retry logic
    let studentId;
    let attempts = 0;
    const maxAttempts = 5;

    do {
      const studentIdPrefix = branch.configuration.studentIdPrefix || "STU";
      studentId = generateId(studentIdPrefix, 6);

      const existingStudent = await Student.findOne({
        studentId,
        branchId: req.branchId,
      });

      if (!existingStudent) {
        break; // Found unique ID
      }

      attempts++;
    } while (attempts < maxAttempts);

    if (attempts >= maxAttempts) {
      return res.status(500).json({
        success: false,
        message: "Unable to generate unique student ID. Please try again.",
      });
    }

    // Prepare profile details, handling address field
    let processedProfileDetails = { ...profileDetails };
    if (typeof processedProfileDetails.address === "string") {
      // If address is a string, assume it's the street address
      processedProfileDetails.address = {
        street: processedProfileDetails.address,
        city: "",
        state: "",
        zipCode: "",
        country: "Kenya",
      };
    }

    // Create user account first (if not exists)
    if (!existingUser) {
      const crypto = require("crypto");
      const verificationToken = crypto.randomBytes(32).toString("hex");

      createdUser = await User.create({
        email,
        password,
        firstName,
        lastName,
        roles: ["student"],
        branchId: req.branchId,
        profileDetails: {
          ...processedProfileDetails,
          studentId,
          ...(photoUrl !== undefined && { profilePicture: photoUrl }), // Add profile picture if photo was uploaded
        },
        emailVerified: false,
        emailVerificationToken: verificationToken,
      });

      // Send verification email instead of welcome email
      try {
        const { sendEmail, emailTemplates } = require("../utils/emailService");
        const baseUrl = process.env.CMS_FRONTEND_URL || "http://localhost:3000";
        const verificationUrl = `${baseUrl}/verify-email?token=${verificationToken}`;

        await sendEmail({
          to: createdUser.email,
          ...emailTemplates.emailVerification(
            `${createdUser.firstName} ${createdUser.lastName}`,
            verificationUrl,
          ),
        });
      } catch (emailError) {
        console.error("Student verification email sending failed:", emailError);
        // Don't fail registration if email fails
      }
    } else {
      // Use existing user and update profile details
      createdUser = existingUser;
      createdUser.profileDetails = {
        ...createdUser.profileDetails,
        ...processedProfileDetails,
        studentId,
        ...(photoUrl !== undefined && { profilePicture: photoUrl }), // Add profile picture if photo was uploaded
      };
      await createdUser.save();
    }

    // Final check: Ensure no student record exists for this user in this branch
    // This prevents race conditions where multiple requests might pass the initial check
    const finalCheck = await Student.findOne({
      userId: createdUser._id,
      branchId: req.branchId,
    });

    if (finalCheck) {
      return res.status(400).json({
        success: false,
        message:
          "A student record for this user was just created. Duplicate prevented.",
        existingStudent: {
          studentId: finalCheck.studentId,
          admissionNumber: finalCheck.admissionNumber,
        },
      });
    }

    // Create student record (without class assignment initially)
    const student = await Student.create({
      userId: createdUser._id,
      branchId: req.branchId,
      studentId,
      admissionNumber,
      // currentClassId will be set later when assigning to a class
      enrollmentDate: enrollmentDate || new Date(),
      referralSource,
      photoUrl: photoUrl, // Add photo URL from upload
      parentGuardianInfo,
      medicalInfo,
      specialNeeds,
    });

    // If a class was specified, assign the student to it
    if (currentClassId) {
      await student.assignToClass(currentClassId);
    }

    // If courses were specified, assign them to the student
    if (courses && Array.isArray(courses) && courses.length > 0) {
      await student.assignCourses(courses);

      // If discount/scholarship was specified at registration, create scholarship BEFORE generating invoices
      const appliedDiscount =
        discountPercentage || req.body.scholarshipPercentage || 0;
      if (appliedDiscount && appliedDiscount > 0 && appliedDiscount <= 100) {
        const Scholarship = require("../models/Scholarship");

        const existingScholarship = await Scholarship.findOne({
          studentId: student._id,
          isActive: true,
        });

        if (!existingScholarship) {
          const scholarship = new Scholarship({
            studentId: student._id,
            branchId: student.branchId,
            percentage: appliedDiscount,
            assignedBy: req.user._id,
            reason: discountReason || "Discount applied during registration",
          });
          await scholarship.save();

          // Update student record with scholarship
          student.scholarshipPercentage = appliedDiscount;
          student.scholarshipAssignedBy = req.user._id;
          student.scholarshipAssignedDate = new Date();
          student.scholarshipReason =
            discountReason || "Discount applied during registration";
          await student.save();
        }
      }

      // Generate invoices for courses that have createInvoiceOnEnrollment enabled
      // Scholarship/discount will be applied to invoices as scholarshipAmount
      await generateInitialInvoicesForStudent(
        student._id,
        courses,
        req.user.branchId,
        req.user._id,
        0, // rely on student.scholarshipPercentage instead of direct discount param
      );
    }

    // Scholarship is applied earlier before invoice generation (if provided during registration).

    // Populate student data
    await student.populate([
      { path: "userId", select: "firstName lastName email profileDetails" },
      { path: "currentClassId", select: "name" },
      { path: "branchId", select: "name" },
      { path: "courses", select: "name code" },
    ]);

    res.status(201).json({
      success: true,
      message:
        "Student created successfully. They will receive an email to verify their account.",
      student,
    });
  } catch (error) {
    console.error("Create student error:", error);

    // If student creation failed but user was created, clean up the user
    if (createdUser && !existingUser && error.name !== "ValidationError") {
      try {
        await User.findByIdAndDelete(createdUser._id);
      } catch (cleanupError) {
        console.error("Error cleaning up orphaned user:", cleanupError);
      }
    }

    if (error.code === 11000) {
      // Determine which field caused the duplicate key error
      let field = "email or student ID";
      let message = "A duplicate record was detected";

      if (error.keyPattern?.email) {
        field = "email";
        message = `A user with this ${field} already exists`;
      } else if (error.keyPattern?.studentId) {
        field = "student ID";
        message = `A student with this ${field} already exists in this branch`;
      } else if (error.keyPattern?.admissionNumber) {
        field = "admission number";
        message = `A student with this ${field} already exists in this branch`;
      } else if (error.keyPattern?.userId) {
        field = "user account";
        message =
          "This user already has a student record in this branch. Cannot create duplicate student.";
      }

      return res.status(400).json({
        success: false,
        message: message,
        error: {
          code: "DUPLICATE_ENTRY",
          field: field,
        },
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error during student creation",
    });
  }
};

// @desc    Get all students
// @route   GET /api/students
// @access  Private (Admin, Teacher, Secretary)
const getStudents = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      classId,
      courseId,
      departmentId,
      search,
      branchId, // Allow superadmin to filter by specific branch
      includeEcourse, // Allow fetching e-course students
    } = req.query;

    // Apply branch-based filtering
    const branchFilter = getBranchQueryFilter(req.user, branchId);
    const query = { ...branchFilter };

    // Handle e-course student filtering
    if (includeEcourse === "true") {
      query.studentType = "ecourse";
      // For e-course students, allow cross-branch access for admins
      if (!isSuperAdmin(req.user)) {
        delete query.branchId;
      }
    } else {
      // Exclude e-course students by default
      query.studentType = { $ne: "ecourse" };
    }

    // Filter by academic status
    if (status) {
      query.academicStatus = status;
    }

    // Filter by class
    if (classId) {
      query.currentClassId = classId;
    }

    // Filter by course enrollment
    if (courseId) {
      query.courses = { $in: [new mongoose.Types.ObjectId(courseId)] };
    }

    // Filter by department
    if (departmentId) {
      query.departmentId = new mongoose.Types.ObjectId(departmentId);
    }

    // Build aggregation pipeline for search
    const pipeline = [
      { $match: query },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "userInfo",
        },
      },
      { $unwind: "$userInfo" },
      {
        $lookup: {
          from: "classes",
          localField: "currentClassId",
          foreignField: "_id",
          as: "classInfo",
        },
      },
      {
        $lookup: {
          from: "courses",
          localField: "courses",
          foreignField: "_id",
          as: "coursesInfo",
        },
      },
      {
        $lookup: {
          from: "branches",
          localField: "branchId",
          foreignField: "_id",
          as: "branchInfo",
        },
      },
      {
        $lookup: {
          from: "departments",
          localField: "departmentId",
          foreignField: "_id",
          as: "departmentInfo",
        },
      },
      {
        $lookup: {
          from: "fees",
          localField: "_id",
          foreignField: "studentId",
          as: "invoices",
        },
      },
      {
        $addFields: {
          classInfo: { $arrayElemAt: ["$classInfo", 0] },
          branchInfo: { $arrayElemAt: ["$branchInfo", 0] },
          departmentInfo: { $arrayElemAt: ["$departmentInfo", 0] },
          // Calculate fees from invoices (new invoice-based system)
          fees: {
            totalFeeStructure: {
              $subtract: [
                {
                  $subtract: [
                    {
                      $sum: {
                        $map: {
                          input: "$invoices",
                          as: "invoice",
                          in: { $ifNull: ["$$invoice.totalAmountDue", 0] },
                        },
                      },
                    },
                    {
                      $sum: {
                        $map: {
                          input: "$invoices",
                          as: "invoice",
                          in: { $ifNull: ["$$invoice.discountAmount", 0] },
                        },
                      },
                    },
                  ],
                },
                {
                  $sum: {
                    $map: {
                      input: "$invoices",
                      as: "invoice",
                      in: { $ifNull: ["$$invoice.scholarshipAmount", 0] },
                    },
                  },
                },
              ],
            },
            totalPaid: {
              $sum: {
                $map: {
                  input: "$invoices",
                  as: "invoice",
                  in: { $ifNull: ["$$invoice.amountPaid", 0] },
                },
              },
            },
            totalBalance: {
              $subtract: [
                {
                  $subtract: [
                    {
                      $subtract: [
                        {
                          $sum: {
                            $map: {
                              input: "$invoices",
                              as: "invoice",
                              in: { $ifNull: ["$$invoice.totalAmountDue", 0] },
                            },
                          },
                        },
                        {
                          $sum: {
                            $map: {
                              input: "$invoices",
                              as: "invoice",
                              in: { $ifNull: ["$$invoice.discountAmount", 0] },
                            },
                          },
                        },
                      ],
                    },
                    {
                      $sum: {
                        $map: {
                          input: "$invoices",
                          as: "invoice",
                          in: { $ifNull: ["$$invoice.scholarshipAmount", 0] },
                        },
                      },
                    },
                  ],
                },
                {
                  $sum: {
                    $map: {
                      input: "$invoices",
                      as: "invoice",
                      in: { $ifNull: ["$$invoice.amountPaid", 0] },
                    },
                  },
                },
              ],
            },
            feeStatus: {
              $cond: {
                if: {
                  $eq: [
                    {
                      $subtract: [
                        {
                          $subtract: [
                            {
                              $subtract: [
                                {
                                  $sum: {
                                    $map: {
                                      input: "$invoices",
                                      as: "invoice",
                                      in: {
                                        $ifNull: [
                                          "$$invoice.totalAmountDue",
                                          0,
                                        ],
                                      },
                                    },
                                  },
                                },
                                {
                                  $sum: {
                                    $map: {
                                      input: "$invoices",
                                      as: "invoice",
                                      in: {
                                        $ifNull: [
                                          "$$invoice.discountAmount",
                                          0,
                                        ],
                                      },
                                    },
                                  },
                                },
                              ],
                            },
                            {
                              $sum: {
                                $map: {
                                  input: "$invoices",
                                  as: "invoice",
                                  in: {
                                    $ifNull: ["$$invoice.scholarshipAmount", 0],
                                  },
                                },
                              },
                            },
                          ],
                        },
                        {
                          $sum: {
                            $map: {
                              input: "$invoices",
                              as: "invoice",
                              in: { $ifNull: ["$$invoice.amountPaid", 0] },
                            },
                          },
                        },
                      ],
                    },
                    0,
                  ],
                },
                then: "paid",
                else: {
                  $cond: {
                    if: {
                      $gt: [
                        {
                          $sum: {
                            $map: {
                              input: "$invoices",
                              as: "invoice",
                              in: { $ifNull: ["$$invoice.amountPaid", 0] },
                            },
                          },
                        },
                        0,
                      ],
                    },
                    then: "partial",
                    else: "pending",
                  },
                },
              },
            },
            scholarshipApplied: { $gt: ["$scholarshipPercentage", 0] },
            scholarshipAmount: {
              $sum: {
                $map: {
                  input: "$invoices",
                  as: "invoice",
                  in: { $ifNull: ["$$invoice.scholarshipAmount", 0] },
                },
              },
            },
          },
        },
      },
    ];

    // Add search filter
    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { "userInfo.firstName": { $regex: search, $options: "i" } },
            { "userInfo.lastName": { $regex: search, $options: "i" } },
            { studentId: { $regex: search, $options: "i" } },
            { admissionNumber: { $regex: search, $options: "i" } },
            { "userInfo.email": { $regex: search, $options: "i" } },
          ],
        },
      });
    }

    // Default sorting by creation date (newest first)
    pipeline.push({ $sort: { createdAt: -1 } });

    // Add pagination
    pipeline.push(
      { $skip: (page - 1) * parseInt(limit) },
      { $limit: parseInt(limit) },
    );

    // Execute aggregation
    const students = await Student.aggregate(pipeline);

    // Get total count for pagination
    const totalCountPipeline = [...pipeline];
    totalCountPipeline.splice(-2); // Remove skip and limit stages
    totalCountPipeline.push({ $count: "total" });

    const countResult = await Student.aggregate(totalCountPipeline);
    const total = countResult.length > 0 ? countResult[0].total : 0;

    res.json({
      success: true,
      count: students.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      students,
    });
  } catch (error) {
    console.error("Get students error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching students",
    });
  }
};

// @desc    Get current student profile
// @route   GET /api/students/me
// @access  Private (Student only)
const getCurrentStudent = async (req, res) => {
  try {
    const userId = req.user.id;

    // Find student by userId with full aggregation pipeline
    const pipeline = [
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "userInfo",
        },
      },
      {
        $lookup: {
          from: "classes",
          localField: "currentClassId",
          foreignField: "_id",
          as: "classInfo",
        },
      },
      {
        $lookup: {
          from: "branches",
          localField: "branchId",
          foreignField: "_id",
          as: "branchInfo",
        },
      },
      {
        $lookup: {
          from: "courses",
          localField: "courses",
          foreignField: "_id",
          as: "coursesInfo",
        },
      },
      {
        $lookup: {
          from: "teachers",
          localField: "classInfo.schedule.periods.teacherId",
          foreignField: "_id",
          as: "scheduleTeachers",
        },
      },
      {
        $lookup: {
          from: "fees",
          localField: "_id",
          foreignField: "studentId",
          as: "invoices",
        },
      },
      {
        $addFields: {
          userInfo: { $arrayElemAt: ["$userInfo", 0] },
          classInfo: { $arrayElemAt: ["$classInfo", 0] },
          branchInfo: { $arrayElemAt: ["$branchInfo", 0] },
          // Calculate fees from invoices (new invoice-based system)
          calculatedScholarshipAmount: {
            $sum: {
              $map: {
                input: "$invoices",
                as: "invoice",
                in: { $ifNull: ["$$invoice.scholarshipAmount", 0] },
              },
            },
          },
          fees: {
            totalFeeStructure: {
              $sum: {
                $map: {
                  input: "$invoices",
                  as: "invoice",
                  in: { $ifNull: ["$$invoice.totalAmountDue", 0] },
                },
              },
            },
            totalPaid: {
              $sum: {
                $map: {
                  input: "$invoices",
                  as: "invoice",
                  in: { $ifNull: ["$$invoice.amountPaid", 0] },
                },
              },
            },
            totalBalance: {
              $subtract: [
                {
                  $subtract: [
                    {
                      $subtract: [
                        {
                          $sum: {
                            $map: {
                              input: "$invoices",
                              as: "invoice",
                              in: { $ifNull: ["$$invoice.totalAmountDue", 0] },
                            },
                          },
                        },
                        {
                          $sum: {
                            $map: {
                              input: "$invoices",
                              as: "invoice",
                              in: { $ifNull: ["$$invoice.discountAmount", 0] },
                            },
                          },
                        },
                      ],
                    },
                    {
                      $sum: {
                        $map: {
                          input: "$invoices",
                          as: "invoice",
                          in: { $ifNull: ["$$invoice.scholarshipAmount", 0] },
                        },
                      },
                    },
                  ],
                },
                {
                  $sum: {
                    $map: {
                      input: "$invoices",
                      as: "invoice",
                      in: { $ifNull: ["$$invoice.amountPaid", 0] },
                    },
                  },
                },
              ],
            },
            feeStatus: {
              $cond: {
                if: {
                  $eq: [
                    {
                      $subtract: [
                        {
                          $subtract: [
                            {
                              $subtract: [
                                {
                                  $sum: {
                                    $map: {
                                      input: "$invoices",
                                      as: "invoice",
                                      in: {
                                        $ifNull: [
                                          "$$invoice.totalAmountDue",
                                          0,
                                        ],
                                      },
                                    },
                                  },
                                },
                                {
                                  $sum: {
                                    $map: {
                                      input: "$invoices",
                                      as: "invoice",
                                      in: {
                                        $ifNull: [
                                          "$$invoice.discountAmount",
                                          0,
                                        ],
                                      },
                                    },
                                  },
                                },
                              ],
                            },
                            {
                              $sum: {
                                $map: {
                                  input: "$invoices",
                                  as: "invoice",
                                  in: {
                                    $ifNull: ["$$invoice.scholarshipAmount", 0],
                                  },
                                },
                              },
                            },
                          ],
                        },
                        {
                          $sum: {
                            $map: {
                              input: "$invoices",
                              as: "invoice",
                              in: { $ifNull: ["$$invoice.amountPaid", 0] },
                            },
                          },
                        },
                      ],
                    },
                    0,
                  ],
                },
                then: "paid",
                else: {
                  $cond: {
                    if: {
                      $gt: [
                        {
                          $sum: {
                            $map: {
                              input: "$invoices",
                              as: "invoice",
                              in: { $ifNull: ["$$invoice.amountPaid", 0] },
                            },
                          },
                        },
                        0,
                      ],
                    },
                    then: "partial",
                    else: "pending",
                  },
                },
              },
            },
            scholarshipApplied: { $gt: ["$scholarshipPercentage", 0] },
            scholarshipAmount: {
              $sum: {
                $map: {
                  input: "$invoices",
                  as: "invoice",
                  in: { $ifNull: ["$$invoice.scholarshipAmount", 0] },
                },
              },
            },
          },
          schedule: {
            $ifNull: ["$classInfo.schedule", null],
          },
        },
      },
      {
        $project: {
          userInfo: {
            firstName: "$userInfo.firstName",
            lastName: "$userInfo.lastName",
            email: "$userInfo.email",
            profileDetails: "$userInfo.profileDetails",
          },
          studentId: 1,
          admissionNumber: 1,
          studentType: 1,
          currentClassId: 1,
          courses: 1,
          enrollmentDate: 1,
          academicStatus: 1,
          academicRecords: 1,
          parentGuardianInfo: 1,
          photoUrl: 1,
          isActive: 1,
          classInfo: 1,
          branchInfo: 1,
          coursesInfo: 1,
          schedule: 1,
          scheduleTeachers: 1,
          fees: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    ];

    const result = await Student.aggregate(pipeline);

    if (!result || result.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    res.json({
      success: true,
      student: result[0],
    });
  } catch (error) {
    console.error("Get current student error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching student profile",
    });
  }
};

// @desc    Get single student
// @route   GET /api/students/:id
// @access  Private (Admin, Teacher, Secretary, Student - own record)
const getStudent = async (req, res) => {
  try {
    const { id } = req.params;

    // First, try to find the student with branch restriction
    let student = await Student.findOne({
      _id: id,
      branchId: req.branchId,
    }).populate([
      { path: "userId", select: "firstName lastName email profileDetails" },
      { path: "currentClassId", select: "name capacity" },
      { path: "branchId", select: "name configuration" },
      {
        path: "academicRecords.subjects.teacherId",
        select: "firstName lastName",
      },
    ]);

    // If not found and user has admin privileges, try to find e-course student across branches
    if (
      !student &&
      (req.user.hasRole("admin") || req.user.hasRole("superadmin"))
    ) {
      student = await Student.findOne({
        _id: id,
        studentType: "ecourse",
      }).populate([
        { path: "userId", select: "firstName lastName email profileDetails" },
        { path: "currentClassId", select: "name capacity" },
        { path: "branchId", select: "name configuration" },
        {
          path: "academicRecords.subjects.teacherId",
          select: "firstName lastName",
        },
      ]);
    }

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    // Manually populate courses since they may be stored as strings
    let courses = [];
    if (student.courses && student.courses.length > 0) {
      const Course = require("../models/Course");
      const mongoose = require("mongoose");
      const courseIds = student.courses.map((id) =>
        typeof id === "string" ? mongoose.Types.ObjectId(id) : id,
      );

      console.log("Looking for course IDs:", courseIds);
      courses = await Course.find({ _id: { $in: courseIds } });
      console.log("Found courses:", courses.length);
      courses.forEach((c) => {
        console.log(`Course: ${c._id}, Name: ${c.name}, Code: ${c.code}`);
      });
    }

    // If courses found, populate enrollment progress
    if (courses.length > 0) {
      const Enrollment = require("../models/elearning/Enrollment");
      const enrollments = await Enrollment.find({
        studentId: student._id,
        courseId: { $in: courses.map((c) => c._id) },
      }).select("courseId progress status");

      // Add progress to each course and store in a separate variable
      var enrichedCourses = courses.map((course) => {
        const enrollment = enrollments.find(
          (e) => e.courseId.toString() === course._id.toString(),
        );
        const mappedCourse = {
          _id: course._id,
          name: course.name,
          description: course.description,
          progress: enrollment ? enrollment.progress : 0,
          enrollmentStatus: enrollment ? enrollment.status : "not_enrolled",
        };
        console.log("Mapped course:", mappedCourse);
        return mappedCourse;
      });
    } else {
      var enrichedCourses = [];
    }

    // Check if user can access this student record
    if (req.user.hasRole("student")) {
      if (student.userId._id.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "Access denied. You can only view your own record",
        });
      }
    }

    // Convert to plain object and replace courses with enriched version
    const studentObj = student.toObject();
    studentObj.courses = enrichedCourses;

    console.log(
      "Final studentObj.courses:",
      JSON.stringify(studentObj.courses, null, 2),
    );

    res.json({
      success: true,
      student: studentObj,
    });
  } catch (error) {
    console.error("Get student error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching student",
    });
  }
};

// @desc    Update student
// @route   PUT /api/students/:id
// @access  Private (Admin, Secretary)
const updateStudent = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation errors",
        errors: errors.array(),
      });
    }

    const { id } = req.params;
    const updateData = { ...req.body };
    const { courses, photoUrl } = req.body; // Extract courses and photoUrl before removing them
    delete updateData.userId; // Prevent updating user reference
    delete updateData.branchId; // Prevent updating branch reference
    delete updateData.studentId; // Prevent updating student ID
    delete updateData.courses; // Handle courses separately
    delete updateData.photoUrl; // Handle photo URL separately

    // First get the current student to track status changes
    const currentStudent = await Student.findOne({
      _id: id,
      branchId: req.branchId,
    });
    if (!currentStudent) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    const oldStatus = currentStudent.academicStatus;
    const newStatus = updateData.academicStatus;

    const student = await Student.findOneAndUpdate(
      { _id: id, branchId: req.branchId },
      {
        ...updateData,
        ...(photoUrl !== undefined && { photoUrl }),
        updatedAt: Date.now(),
      },
      { new: true, runValidators: true },
    ).populate([
      { path: "userId", select: "firstName lastName email profileDetails" },
      { path: "currentClassId", select: "name" },
      { path: "branchId", select: "name" },
      { path: "courses", select: "name code" },
    ]);

    // Handle course assignments if provided
    if (courses !== undefined) {
      // Track old courses before updating
      const oldCourseIds = currentStudent.courses.map((c) => c.toString());

      if (Array.isArray(courses)) {
        await student.assignCourses(courses);

        // Find newly added courses (courses that weren't in oldCourseIds)
        const newCourseIds = courses.filter(
          (courseId) => !oldCourseIds.includes(courseId.toString()),
        );

        // Find removed courses (courses that were in oldCourseIds but not in new courses)
        const removedCourseIds = oldCourseIds.filter(
          (courseId) => !courses.includes(courseId),
        );

        // Generate invoices for newly added courses
        if (newCourseIds.length > 0) {
          console.log(
            `Generating invoices for ${newCourseIds.length} newly added courses`,
          );
          // Pass existing student discount/scholarship percentage to new invoices
          await generateInitialInvoicesForStudent(
            student._id,
            newCourseIds,
            req.branchId,
            req.user._id,
            currentStudent.scholarshipPercentage || 0,
          );
        }

        // Handle removed courses - cancel unpaid invoices for removed courses
        if (removedCourseIds.length > 0) {
          console.log(`Handling ${removedCourseIds.length} removed courses`);
          await cancelInvoicesForRemovedCourses(student._id, removedCourseIds);
        }
      } else {
        await student.assignCourses([]);
      }
      // Re-populate after course assignment
      await student.populate({ path: "courses", select: "name code" });
    }

    // Track status changes if academicStatus was updated
    if (newStatus && oldStatus !== newStatus) {
      if (!student.statusHistory) {
        student.statusHistory = [];
      }

      student.statusHistory.push({
        oldStatus,
        newStatus,
        changedBy: req.user._id,
        changedAt: new Date(),
        reason: `Status changed from ${oldStatus} to ${newStatus} via edit form`,
      });

      await student.save();
    }

    // Update user profile if provided
    if (
      req.body.profileDetails ||
      req.body.firstName ||
      req.body.lastName ||
      req.body.email ||
      photoUrl !== undefined
    ) {
      const userUpdateData = {};

      if (req.body.firstName) userUpdateData.firstName = req.body.firstName;
      if (req.body.lastName) userUpdateData.lastName = req.body.lastName;
      if (req.body.email) userUpdateData.email = req.body.email;

      if (req.body.profileDetails || photoUrl !== undefined) {
        userUpdateData.profileDetails = {
          ...student.userId.profileDetails,
          ...req.body.profileDetails,
          ...(photoUrl !== undefined && { profilePicture: photoUrl }), // Update profile picture if photo URL provided
        };
      }

      userUpdateData.updatedAt = Date.now();

      await User.findByIdAndUpdate(student.userId._id, userUpdateData);
    }

    res.json({
      success: true,
      message: "Student updated successfully",
      student,
    });
  } catch (error) {
    console.error("Update student error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during student update",
    });
  }
};

// @desc    Delete student
// @route   DELETE /api/students/:id
// @access  Private (Admin only)
const deleteStudent = async (req, res) => {
  try {
    const { id } = req.params;

    const student = await Student.findOne({ _id: id, branchId: req.branchId });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    // Remove student from all classes where they are enrolled
    await Class.updateMany(
      { branchId: req.branchId, "students.studentId": id },
      { $pull: { students: { studentId: id } } },
    );

    // Delete student photo from Cloudflare if it exists
    if (student.photoUrl) {
      try {
        await CloudflareService.deleteFile(student.photoUrl);
      } catch (photoError) {
        console.error("Error deleting student photo:", photoError);
        // Don't fail the entire deletion if photo deletion fails
      }
    }

    // Delete user account as well
    await User.findByIdAndDelete(student.userId);

    // Delete student record
    await Student.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "Student deleted successfully",
    });
  } catch (error) {
    console.error("Delete student error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during student deletion",
    });
  }
};

// @desc    Add academic record to student
// @route   POST /api/students/:id/academic-records
// @access  Private (Admin, Teacher, Secretary)
const addAcademicRecord = async (req, res) => {
  try {
    const { id } = req.params;
    const { academicTermId, classId } = req.body;

    const student = await Student.findOne({ _id: id, branchId: req.branchId });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    await student.addAcademicRecord(academicTermId, classId);

    res.json({
      success: true,
      message: "Academic record added successfully",
      student,
    });
  } catch (error) {
    console.error("Add academic record error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while adding academic record",
    });
  }
};

// @desc    Add grade to student
// @route   POST /api/students/:id/grades
// @access  Private (Admin, Teacher)
const addGrade = async (req, res) => {
  try {
    const { id } = req.params;
    const { academicTermId, subjectName, examType, score, maxScore, remarks } =
      req.body;

    const student = await Student.findOne({ _id: id, branchId: req.branchId });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    await student.addGrade(academicTermId, subjectName, {
      examType,
      score,
      maxScore,
      remarks,
      teacherId: req.user._id,
    });

    res.json({
      success: true,
      message: "Grade added successfully",
      student,
    });
  } catch (error) {
    console.error("Add grade error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while adding grade",
    });
  }
};

// @desc    Update student attendance
// @route   PUT /api/students/:id/attendance
// @access  Private (Admin, Teacher, Secretary)
const updateAttendance = async (req, res) => {
  try {
    const { id } = req.params;
    const { academicTermId, attendanceData } = req.body;

    const student = await Student.findOne({ _id: id, branchId: req.branchId });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    await student.updateAttendance(academicTermId, attendanceData);

    res.json({
      success: true,
      message: "Attendance updated successfully",
      student,
    });
  } catch (error) {
    console.error("Update attendance error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating attendance",
    });
  }
};

// @desc    Get students by class
// @route   GET /api/students/class/:classId
// @access  Private (Admin, Teacher, Secretary)
const getStudentsByClass = async (req, res) => {
  try {
    const { classId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const students = await Student.findByBranch(req.branchId, {
      classId,
      status: "active",
    })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ "userInfo.firstName": 1 });

    const total = await Student.countDocuments({
      branchId: req.branchId,
      currentClassId: classId,
      academicStatus: "active",
    });

    res.json({
      success: true,
      count: students.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      students,
    });
  } catch (error) {
    console.error("Get students by class error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching students by class",
    });
  }
};

// @desc    Get student statistics
// @route   GET /api/students/statistics
// @access  Private (Admin, Secretary)
const getStudentStatistics = async (req, res) => {
  try {
    // Parse optional date filters from query params
    const { startDate, endDate } = req.query;
    const hasDateFilter = startDate && endDate;

    // If date filter provided, parse and use those dates
    const filterStartDate = hasDateFilter ? new Date(startDate) : null;
    const filterEndDate = hasDateFilter ? new Date(endDate) : null;

    // Set end date to end of day for inclusive filtering
    if (filterEndDate) {
      filterEndDate.setHours(23, 59, 59, 999);
    }

    // Calculate date ranges for default statistics
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
      23,
      59,
      59,
      999,
    );
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

    // Use filter dates or defaults for statistics queries
    const statsStartDate = hasDateFilter ? filterStartDate : startOfMonth;
    const statsEndDate = hasDateFilter ? filterEndDate : endOfMonth;

    const branchObjectId = new mongoose.Types.ObjectId(req.branchId);

    // Build base query for date-filtered queries
    const dateFilterQuery = hasDateFilter
      ? { enrollmentDate: { $gte: filterStartDate, $lte: filterEndDate } }
      : {};

    const [
      totalStudents,
      activeStudents,
      newEnrollmentsThisMonth,
      newEnrollmentsLastMonth,
      newEnrollmentsThisYear,
      statusCounts,
      classCounts,
      departmentCounts,
      genderCounts,
      droppedThisYear,
      graduatedThisYear,
      studentsThreeMonthsAgo,
      monthlyEnrollmentTrend,
      referralSourceCounts,
      // Date-filtered counts
      filteredTotalStudents,
      filteredActiveStudents,
      filteredNewEnrollments,
    ] = await Promise.all([
      // Total students (all time)
      Student.countDocuments({ branchId: branchObjectId }),

      // Active students (all time)
      Student.countDocuments({
        branchId: branchObjectId,
        academicStatus: "active",
      }),

      // New enrollments this month
      Student.countDocuments({
        branchId: branchObjectId,
        enrollmentDate: { $gte: startOfMonth, $lte: endOfMonth },
      }),

      // New enrollments last month (for comparison)
      Student.countDocuments({
        branchId: branchObjectId,
        enrollmentDate: { $gte: startOfLastMonth, $lte: endOfLastMonth },
      }),

      // New enrollments this year
      Student.countDocuments({
        branchId: branchObjectId,
        enrollmentDate: { $gte: startOfYear },
      }),

      // Status breakdown (current status of all students - no date filter)
      Student.aggregate([
        {
          $match: {
            branchId: branchObjectId,
          },
        },
        { $group: { _id: "$academicStatus", count: { $sum: 1 } } },
      ]),

      // Students by class (current class distribution)
      Student.aggregate([
        {
          $match: {
            branchId: branchObjectId,
          },
        },
        { $group: { _id: "$currentClassId", count: { $sum: 1 } } },
        {
          $lookup: {
            from: "classes",
            localField: "_id",
            foreignField: "_id",
            as: "classInfo",
          },
        },
        { $unwind: { path: "$classInfo", preserveNullAndEmptyArrays: true } },
        { $sort: { count: -1 } },
      ]),

      // Students by department (current department distribution)
      Student.aggregate([
        {
          $match: {
            branchId: branchObjectId,
          },
        },
        { $group: { _id: "$departmentId", count: { $sum: 1 } } },
        {
          $lookup: {
            from: "departments",
            localField: "_id",
            foreignField: "_id",
            as: "departmentInfo",
          },
        },
        {
          $unwind: {
            path: "$departmentInfo",
            preserveNullAndEmptyArrays: true,
          },
        },
        { $sort: { count: -1 } },
      ]),

      // Gender distribution (from User model via lookup) - current students only
      Student.aggregate([
        {
          $match: {
            branchId: branchObjectId,
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "_id",
            as: "userInfo",
          },
        },
        { $unwind: { path: "$userInfo", preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: "$userInfo.profileDetails.gender",
            count: { $sum: 1 },
          },
        },
      ]),

      // Dropped/withdrawn in date range (or this year if no filter)
      Student.countDocuments({
        branchId: branchObjectId,
        academicStatus: { $in: ["dropped", "transferred"] },
        "statusHistory.changedAt": hasDateFilter
          ? { $gte: filterStartDate, $lte: filterEndDate }
          : { $gte: startOfYear },
      }),

      // Graduated in date range (or this year if no filter)
      Student.countDocuments({
        branchId: branchObjectId,
        academicStatus: "graduated",
        "statusHistory.changedAt": hasDateFilter
          ? { $gte: filterStartDate, $lte: filterEndDate }
          : { $gte: startOfYear },
      }),

      // Students enrolled 3 months ago (for retention calculation)
      Student.countDocuments({
        branchId: branchObjectId,
        enrollmentDate: { $lte: threeMonthsAgo },
      }),

      // Monthly enrollment trend (uses date filter range or last 6 months)
      Student.aggregate([
        {
          $match: {
            branchId: branchObjectId,
            enrollmentDate: hasDateFilter
              ? { $gte: filterStartDate, $lte: filterEndDate }
              : { $gte: new Date(now.getFullYear(), now.getMonth() - 5, 1) },
          },
        },
        {
          $group: {
            _id: {
              year: { $year: "$enrollmentDate" },
              month: { $month: "$enrollmentDate" },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ]),

      // Referral source breakdown (with date filter if provided)
      Student.aggregate([
        {
          $match: {
            branchId: branchObjectId,
            ...(hasDateFilter && {
              enrollmentDate: { $gte: filterStartDate, $lte: filterEndDate },
            }),
          },
        },
        { $group: { _id: "$referralSource.source", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      // Date-filtered total students (enrolled within date range)
      hasDateFilter
        ? Student.countDocuments({
            branchId: branchObjectId,
            enrollmentDate: { $gte: filterStartDate, $lte: filterEndDate },
          })
        : Promise.resolve(null),

      // Date-filtered active students (enrolled within date range and currently active)
      hasDateFilter
        ? Student.countDocuments({
            branchId: branchObjectId,
            enrollmentDate: { $gte: filterStartDate, $lte: filterEndDate },
            academicStatus: "active",
          })
        : Promise.resolve(null),

      // Date-filtered new enrollments (same as above for consistency)
      hasDateFilter
        ? Student.countDocuments({
            branchId: branchObjectId,
            enrollmentDate: { $gte: filterStartDate, $lte: filterEndDate },
          })
        : Promise.resolve(null),
    ]);

    // Calculate derived metrics
    const inactiveStudents = totalStudents - activeStudents;
    const enrollmentGrowth =
      newEnrollmentsLastMonth > 0
        ? ((newEnrollmentsThisMonth - newEnrollmentsLastMonth) /
            newEnrollmentsLastMonth) *
          100
        : newEnrollmentsThisMonth > 0
          ? 100
          : 0;

    // Retention rate: % of students from 3+ months ago still active
    const stillActiveFromThreeMonthsAgo = await Student.countDocuments({
      branchId: req.branchId,
      enrollmentDate: { $lte: threeMonthsAgo },
      academicStatus: "active",
    });
    const retentionRate =
      studentsThreeMonthsAgo > 0
        ? (stillActiveFromThreeMonthsAgo / studentsThreeMonthsAgo) * 100
        : 100;

    // Dropout/withdrawal rate this year
    const dropoutRate =
      totalStudents > 0 ? (droppedThisYear / totalStudents) * 100 : 0;

    // Process gender distribution
    const genderDistribution = {
      male: 0,
      female: 0,
      other: 0,
      unspecified: 0,
    };
    genderCounts.forEach((item) => {
      const gender = item._id?.toLowerCase() || "unspecified";
      if (gender === "male") genderDistribution.male = item.count;
      else if (gender === "female") genderDistribution.female = item.count;
      else if (gender) genderDistribution.other += item.count;
      else genderDistribution.unspecified = item.count;
    });

    // Process referral source distribution
    const referralSourceBreakdown = {};
    referralSourceCounts.forEach((item) => {
      const source = item._id || "unspecified";
      referralSourceBreakdown[source] = item.count;
    });

    // Process status counts
    const statusBreakdown = {
      active: 0,
      inactive: 0,
      suspended: 0,
      graduated: 0,
      transferred: 0,
      dropped: 0,
    };
    statusCounts.forEach((item) => {
      if (item._id && statusBreakdown.hasOwnProperty(item._id)) {
        statusBreakdown[item._id] = item.count;
      }
    });

    // Format monthly trend for chart
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const formattedTrend = monthlyEnrollmentTrend.map((item) => ({
      month: monthNames[item._id.month - 1],
      year: item._id.year,
      enrollments: item.count,
    }));

    res.json({
      success: true,
      statistics: {
        // Primary metrics (all-time)
        totalStudents,
        activeStudents,
        inactiveStudents,

        // Enrollment metrics
        newEnrollmentsThisMonth,
        newEnrollmentsLastMonth,
        newEnrollmentsThisYear,
        enrollmentGrowth: Math.round(enrollmentGrowth * 10) / 10,

        // Retention and dropout
        retentionRate: Math.round(retentionRate * 10) / 10,
        dropoutRate: Math.round(dropoutRate * 10) / 10,
        droppedThisYear,
        graduatedThisYear,

        // Status breakdown (respects date filter if provided)
        statusBreakdown,

        // Gender distribution (respects date filter if provided)
        genderDistribution,
        genderRatio:
          genderDistribution.male > 0 || genderDistribution.female > 0
            ? `${genderDistribution.male}:${genderDistribution.female}`
            : "N/A",

        // Referral source breakdown (respects date filter if provided)
        referralSourceBreakdown,

        // Distribution by class (respects date filter if provided)
        classCounts: classCounts.map((item) => ({
          classId: item._id,
          className: item.classInfo?.name || "Unassigned",
          count: item.count,
        })),

        // Distribution by department (respects date filter if provided)
        departmentCounts: departmentCounts.map((item) => ({
          departmentId: item._id,
          departmentName: item.departmentInfo?.name || "Unassigned",
          count: item.count,
        })),

        // Monthly trend (respects date filter if provided)
        enrollmentTrend: formattedTrend,

        // Date-filtered statistics (when filter is applied)
        ...(hasDateFilter && {
          filtered: {
            totalStudents: filteredTotalStudents,
            activeStudents: filteredActiveStudents,
            newEnrollments: filteredNewEnrollments,
            inactiveStudents: filteredTotalStudents - filteredActiveStudents,
            dateRange: {
              startDate: filterStartDate.toISOString(),
              endDate: filterEndDate.toISOString(),
            },
          },
        }),
      },
    });
  } catch (error) {
    console.error("Get student statistics error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching student statistics",
    });
  }
};

// @desc    Get students with fee status changes since a date
// @route   GET /api/students/fee-status-changes
// @access  Private (Admin, Secretary)
const getStudentsFeeStatusChanges = async (req, res) => {
  try {
    const { branchId, since } = req.query;

    if (!branchId) {
      return res.status(400).json({
        success: false,
        message: "Branch ID is required",
      });
    }

    const sinceDate = since
      ? new Date(since)
      : new Date(Date.now() - 24 * 60 * 60 * 1000);

    const students = await Student.find({
      branchId: branchId,
      "fees.updatedAt": { $gte: sinceDate },
    }).select("studentId firstName lastName fees");

    res.json({
      success: true,
      data: students.map((student) => ({
        studentId: student.studentId,
        firstName: student.firstName,
        lastName: student.lastName,
        feeStatus: student.fees?.feeStatus,
        updatedAt: student.fees?.updatedAt,
      })),
    });
  } catch (error) {
    console.error("Get students fee status changes error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching fee status changes",
    });
  }
};

// @desc    Clean up orphaned user records (users without corresponding student records)
// @route   POST /api/students/cleanup-orphaned-users
// @access  Private (Admin only)
const cleanupOrphanedUsers = async (req, res) => {
  try {
    // Find all users with student role in this branch
    const studentUsers = await User.find({
      branchId: req.branchId,
      roles: "student",
    });

    const orphanedUsers = [];

    // Check each user to see if they have a corresponding student record
    for (const user of studentUsers) {
      const student = await Student.findOne({ userId: user._id });
      if (!student) {
        orphanedUsers.push(user);
      }
    }

    // Remove orphaned users
    if (orphanedUsers.length > 0) {
      const userIds = orphanedUsers.map((user) => user._id);
      await User.deleteMany({ _id: { $in: userIds } });
    }

    res.json({
      success: true,
      message: `Cleaned up ${orphanedUsers.length} orphaned user records`,
      cleanedUsers: orphanedUsers.map((user) => ({
        id: user._id,
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
      })),
    });
  } catch (error) {
    console.error("Cleanup orphaned users error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during cleanup",
    });
  }
};

// @desc    Assign student to a class
// @route   POST /api/students/:id/assign-class
// @access  Private (Admin, Secretary)
const assignStudentToClass = async (req, res) => {
  try {
    const { id } = req.params;
    const { classId, academicTermId } = req.body;

    const student = await Student.findOne({ _id: id, branchId: req.branchId });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    // Verify the class exists and belongs to the same branch
    const Class = require("../models/Class");
    const classExists = await Class.findOne({
      _id: classId,
      branchId: req.branchId,
    });

    if (!classExists) {
      return res.status(404).json({
        success: false,
        message: "Class not found or doesn't belong to this branch",
      });
    }

    await student.assignToClass(classId, academicTermId);

    await student.populate([
      { path: "userId", select: "firstName lastName email profileDetails" },
      { path: "currentClassId", select: "name section" },
      { path: "branchId", select: "name" },
    ]);

    res.json({
      success: true,
      message: "Student assigned to class successfully",
      student,
    });
  } catch (error) {
    console.error("Assign student to class error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while assigning student to class",
    });
  }
};

// @desc    Remove student from current class
// @route   DELETE /api/students/:id/remove-from-class
// @access  Private (Admin, Secretary)
const removeStudentFromClass = async (req, res) => {
  try {
    const { id } = req.params;

    const student = await Student.findOne({ _id: id, branchId: req.branchId });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    if (!student.currentClassId) {
      return res.status(400).json({
        success: false,
        message: "Student is not currently assigned to any class",
      });
    }

    await student.removeFromClass();

    await student.populate([
      { path: "userId", select: "firstName lastName email profileDetails" },
      { path: "branchId", select: "name" },
    ]);

    res.json({
      success: true,
      message: "Student removed from class successfully",
      student,
    });
  } catch (error) {
    console.error("Remove student from class error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while removing student from class",
    });
  }
};

// @desc    Record payment for student
// @route   POST /api/students/:id/payment
// @access  Private (Admin, Secretary)
const recordStudentPayment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation errors",
        errors: errors.array(),
      });
    }

    const { id: studentId } = req.params;
    let { amount, paymentMethod, referenceNumber, notes } = req.body;

    // Generate reference number if not provided
    if (!referenceNumber || referenceNumber.trim() === "") {
      const date = new Date();
      const year = date.getFullYear().toString().slice(-2);
      const month = (date.getMonth() + 1).toString().padStart(2, "0");
      const day = date.getDate().toString().padStart(2, "0");
      const timestamp = Date.now().toString().slice(-6);
      referenceNumber = `PAY${year}${month}${day}${timestamp}`;
    }

    // Find the student and verify branch access
    const student = await Student.findOne({
      _id: studentId,
      branchId: req.user.branchId,
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    // Validate payment amount
    const currentBalance = student.fees?.totalBalance || 0;
    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Payment amount must be greater than 0",
      });
    }

    if (amount > currentBalance) {
      return res.status(400).json({
        success: false,
        message: "Payment amount cannot exceed outstanding balance",
      });
    }

    // Update student fee information
    const currentTotalPaid = student.fees?.totalPaid || 0;
    const newTotalPaid = currentTotalPaid + amount;
    const newBalance = currentBalance - amount;

    let newFeeStatus = "pending";
    if (newBalance === 0) {
      newFeeStatus = "paid";
    } else if (newTotalPaid > 0) {
      newFeeStatus = "partial";
    }

    // Update the student's fee information
    const updatedStudent = await Student.findByIdAndUpdate(
      studentId,
      {
        $set: {
          "fees.totalPaid": newTotalPaid,
          "fees.totalBalance": newBalance,
          "fees.feeStatus": newFeeStatus,
        },
        $push: {
          "fees.paymentHistory": {
            amount,
            paymentMethod,
            referenceNumber,
            paymentDate: new Date(),
            recordedBy: req.user._id,
            notes,
          },
        },
      },
      { new: true, runValidators: true },
    ).populate("userId", "firstName lastName email phone");

    res.status(200).json({
      success: true,
      message: "Payment recorded successfully",
      data: {
        student: updatedStudent,
        payment: {
          amount,
          paymentMethod,
          referenceNumber,
          paymentDate: new Date(),
          newBalance,
          newTotalPaid,
        },
      },
    });
  } catch (error) {
    console.error("Record student payment error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Get payment history for student
// @route   GET /api/students/:id/payments
// @access  Private (Admin, Secretary)
const getStudentPaymentHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const Fee = require("../models/Fee");
    const Payment = require("../models/Payment");

    // Find student with payment history (use branchId from middleware)
    const student = await Student.findOne({
      _id: id,
      branchId: req.branchId,
    })
      .populate([
        { path: "userId", select: "firstName lastName email profileDetails" },
        { path: "currentClassId", select: "name capacity" },
        { path: "branchId", select: "name configuration" },
      ])
      .select(
        "studentId userId currentClassId branchId enrollmentDate createdAt admissionNumber",
      );

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found or access denied",
      });
    }

    // Fetch all invoices for this student with fee structure populated
    const invoices = await Fee.find({
      studentId: student._id,
      branchId: req.branchId,
    })
      .populate("feeStructureId")
      .sort({ dueDate: 1 });

    // Fetch all payments for this student
    const payments = await Payment.find({
      studentId: student._id,
      branchId: req.branchId,
      status: { $in: ["completed", "verified"] },
    }).sort({ paymentDate: -1 });

    // Calculate credit balance (payments with feeId: null are credits)
    const creditPayments = await Payment.find({
      studentId: student._id,
      branchId: req.branchId,
      feeId: null, // Credits don't have specific fee/invoice
      status: { $in: ["completed", "verified"] },
    });
    const creditBalance = creditPayments.reduce(
      (sum, payment) => sum + payment.amount,
      0,
    );

    // Calculate fee summary from invoices accounting for discounts and scholarships
    const totalFeeStructure = invoices.reduce((sum, inv) => {
      return (
        sum +
        ((inv.totalAmountDue || 0) -
          (inv.discountAmount || 0) -
          (inv.scholarshipAmount || 0))
      );
    }, 0);
    const totalPaid = invoices.reduce(
      (sum, inv) => sum + (inv.amountPaid || 0),
      0,
    );
    const totalBalance = invoices.reduce((sum, inv) => {
      const expectedAmount =
        (inv.totalAmountDue || 0) -
        (inv.discountAmount || 0) -
        (inv.scholarshipAmount || 0);
      return sum + (expectedAmount - (inv.amountPaid || 0));
    }, 0);
    const totalScholarshipAmount = invoices.reduce((sum, inv) => {
      return sum + (inv.scholarshipAmount || 0);
    }, 0);

    let feeStatus = "unpaid";
    if (totalBalance === 0 && totalFeeStructure > 0) {
      feeStatus = "paid";
    } else if (totalPaid > 0 && totalBalance > 0) {
      feeStatus = "partial";
    }

    // Format invoices for display using totalAmountDue (correct field)
    const formattedInvoices = invoices.map((invoice) => {
      return {
        _id: invoice._id,
        type: invoice.invoiceType || invoice.type,
        dueDate: invoice.dueDate,
        createdAt: invoice.createdAt,
        periodMonth: invoice.periodMonth,
        periodYear: invoice.periodYear,
        periodLabel: invoice.periodLabel,
        totalAmount: invoice.totalAmountDue || 0,
        discountAmount: invoice.discountAmount || 0,
        scholarshipAmount: invoice.scholarshipAmount || 0,
        amountPaid: invoice.amountPaid || 0,
        status: invoice.status,
        invoiceNumber: invoice.invoiceNumber,
        period: invoice.period,
      };
    });

    // Format payment history with invoice applications
    const paymentHistory = payments.map((payment) => ({
      _id: payment._id,
      amount: payment.amount,
      paymentMethod: payment.paymentMethod,
      referenceNumber: payment.receiptNumber,
      paymentDate: payment.paymentDate,
      notes: payment.notes,
      status: payment.status,
      invoicesPaid: payment.appliedToInvoices || [],
    }));

    const feeSummary = {
      totalFeeStructure,
      totalPaid,
      totalBalance,
      creditBalance: creditBalance,
      feeStatus,
      scholarshipAmount: totalScholarshipAmount,
      lastPaymentDate: payments.length > 0 ? payments[0].paymentDate : null,
      totalPayments: payments.length,
      totalInvoices: invoices.length,
    };

    res.json({
      success: true,
      data: {
        student: {
          _id: student._id,
          studentId: student.admissionNumber,
          userInfo: student.userId,
          class: student.currentClassId,
          branch: student.branchId,
          enrollmentDate: student.enrollmentDate || student.createdAt,
        },
        feeSummary,
        invoices: formattedInvoices,
        paymentHistory,
      },
    });
  } catch (error) {
    console.error("Get student payment history error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching payment history",
      error: error.message,
    });
  }
};

// @desc    Generate receipt for student payment history entry
// @route   GET /api/students/:id/payment-receipt/:reference
// @access  Private (Admin, Secretary, Student)
const generateStudentPaymentReceipt = async (req, res) => {
  try {
    const { id, reference } = req.params;

    // Find student with payment history
    const student = await Student.findOne({
      _id: id,
      branchId: req.branchId,
    }).populate([
      { path: "userId", select: "firstName lastName email phone" },
      { path: "currentClassId", select: "name" },
      { path: "branchId", select: "name address phone email configuration" },
    ]);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found or access denied",
      });
    }

    // Check if user can access this receipt
    if (
      req.user.roles.includes("student") &&
      student.userId._id.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only download your own receipts",
      });
    }

    // Find the payment in history by reference number
    const paymentEntry = student.fees?.paymentHistory?.find(
      (payment) => payment.referenceNumber === reference,
    );

    if (!paymentEntry) {
      return res.status(404).json({
        success: false,
        message: "Payment record not found",
      });
    }

    // Generate a basic receipt URL (for now, we'll return a simple JSON receipt)
    // In a real implementation, you'd generate a PDF and store/serve it
    const receiptData = {
      receiptNumber: paymentEntry.referenceNumber,
      studentName: `${student.userId.firstName} ${student.userId.lastName}`,
      studentId: student.studentId,
      amount: paymentEntry.amount,
      paymentDate: paymentEntry.paymentDate,
      paymentMethod: paymentEntry.paymentMethod,
      notes: paymentEntry.notes,
      branchName: student.branchId.name,
    };

    res.json({
      success: true,
      data: {
        receiptUrl: `/api/students/${id}/payment-receipt/${reference}/download`,
        receipt: receiptData,
      },
    });
  } catch (error) {
    console.error("Generate student payment receipt error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate receipt",
    });
  }
};

// @desc    Download receipt PDF for student payment history entry
// @route   GET /api/students/:id/payment-receipt/:reference/download
// @access  Private (Admin, Secretary, Student)
const downloadStudentPaymentReceipt = async (req, res) => {
  try {
    const { id, reference } = req.params;
    const { amount, paymentDate } = req.query;

    // For students, find their own record regardless of branch filtering
    let query = { _id: id };
    if (!req.user.roles.includes("student")) {
      // For non-students, apply branch filtering
      query.branchId = req.branchId;
    }

    // Find student with payment history
    const student = await Student.findOne(query).populate([
      { path: "userId", select: "firstName lastName email phone" },
      { path: "currentClassId", select: "name" },
      { path: "branchId", select: "name address phone email configuration" },
    ]);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found or access denied",
      });
    }

    // Check if user can access this receipt
    if (
      req.user.roles.includes("student") &&
      student.userId._id.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only download your own receipts",
      });
    }

    // Find the payment in history by reference number
    // Find the payment in history
    let paymentEntry;

    if (reference && reference.trim() !== "" && reference !== "unknown") {
      // Search by reference number if provided and not "unknown"
      paymentEntry = student.fees?.paymentHistory?.find(
        (payment) => payment.referenceNumber === reference,
      );
    } else if (req.query.amount && req.query.paymentDate) {
      // Search by amount and payment date if reference is empty or "unknown"
      paymentEntry = student.fees?.paymentHistory?.find(
        (payment) =>
          payment.amount === parseFloat(req.query.amount) &&
          new Date(payment.paymentDate).getTime() ===
            new Date(req.query.paymentDate).getTime(),
      );
    }

    if (!paymentEntry) {
      return res.status(404).json({
        success: false,
        message: "Payment record not found",
      });
    }

    // Prepare receipt data
    const studentName = student.userId
      ? `${student.userId.firstName || "Unknown"} ${
          student.userId.lastName || "Student"
        }`
      : "Unknown Student";

    const receiptData = {
      studentName,
      receiptNumber: paymentEntry.referenceNumber,
      paymentDate: paymentEntry.paymentDate,
      admissionNumber: student.admissionNumber || student.studentId,
      course: student.currentClassId?.name || "N/A",
      amount: paymentEntry.amount,
      paymentMethod: paymentEntry.paymentMethod || "N/A",
      receivedBy: "Admin",
    };

    // Generate PDF using the fillable template
    const pdfBytes = await fillReceiptTemplate(receiptData);

    // Set response headers for PDF download
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Receipt-${
        paymentEntry.referenceNumber || "UNKNOWN"
      }.pdf"`,
    );
    res.setHeader("Content-Length", pdfBytes.length);

    // Send the PDF
    res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error("Download student payment receipt error:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({
      success: false,
      message: "Failed to download receipt",
      error: error.message,
    });
  }
};

// @desc    Get course materials for enrolled student
// @route   GET /api/students/courses/:courseId/materials
// @access  Private (Student)
const getStudentCourseMaterials = async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.id;

    // Find student by userId
    const student = await Student.findOne({ userId }).populate("courses");
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    // Check if student is enrolled in this course
    const isEnrolled = student.courses.some(
      (course) => course._id.toString() === courseId,
    );
    if (!isEnrolled) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You are not enrolled in this course",
      });
    }

    // Get the course with modules and materials
    const course = await Course.findById(courseId).select(
      "name code resources.modules resources.materials",
    );
    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Handle backward compatibility: organize materials by modules
    const modules = course.resources?.modules || [];
    const legacyMaterials = course.resources?.materials || [];

    // If there are legacy materials and no modules, create a default module
    let organizedModules = [...modules];
    if (legacyMaterials.length > 0 && modules.length === 0) {
      organizedModules = [
        {
          _id: "default",
          name: "General",
          description: "Default module for existing materials",
          order: 0,
          materials: legacyMaterials,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
    }

    res.json({
      success: true,
      course: {
        id: course._id,
        name: course.name,
        code: course.code,
        modules: organizedModules,
      },
      modules: organizedModules, // Also include for compatibility
      materials: legacyMaterials, // Keep for backward compatibility
    });
  } catch (error) {
    console.error("Get student course materials error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching course materials",
    });
  }
};

const getStudentWhatsappGroups = async (req, res) => {
  try {
    // Get current student
    const student = await Student.findOne({ userId: req.user._id })
      .populate("departmentId", "name code whatsappGroupLink")
      .populate("courses", "name code level whatsappGroupLink");

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    const whatsappGroups = [];

    // Add department WhatsApp group if exists
    if (student.departmentId && student.departmentId.whatsappGroupLink) {
      whatsappGroups.push({
        type: "department",
        name: student.departmentId.name,
        code: student.departmentId.code,
        link: student.departmentId.whatsappGroupLink,
      });
    }

    // Add course WhatsApp groups if they exist
    if (student.courses && student.courses.length > 0) {
      student.courses.forEach((course) => {
        if (course.whatsappGroupLink) {
          whatsappGroups.push({
            type: "course",
            name: course.name,
            code: course.code,
            level: course.level,
            link: course.whatsappGroupLink,
          });
        }
      });
    }

    res.json({
      success: true,
      data: whatsappGroups,
    });
  } catch (error) {
    console.error("Get student WhatsApp groups error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch WhatsApp group links",
      error: error.message,
    });
  }
};

// @desc    Suspend a student
// @route   PATCH /api/students/:id/suspend
// @access  Private (Admin, Secretary)
const suspendStudent = async (req, res) => {
  try {
    const { id } = req.params;

    const student = await Student.findOne({ _id: id });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    // Check if student is already suspended
    if (student.academicStatus === "suspended") {
      return res.status(400).json({
        success: false,
        message: "Student is already suspended",
      });
    }

    // Update student status to suspended
    student.academicStatus = "suspended";
    student.statusHistory.push({
      oldStatus: student.academicStatus,
      newStatus: "suspended",
      changedBy: req.user._id,
      changeReason: req.body.reason || "Suspended by admin",
      changedAt: new Date(),
    });

    await student.save();

    res.json({
      success: true,
      message: "Student suspended successfully",
      data: student,
    });
  } catch (error) {
    console.error("Suspend student error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during student suspension",
    });
  }
};

// @desc    Get students for sync (BioTime/external systems)
// @route   GET /api/students/sync
// @access  Private (Admin, SuperAdmin only)
const getStudentsForSync = async (req, res) => {
  try {
    const {
      branchId,
      limit = 1000,
      page = 1,
      includeEcourse = "true",
      includePastDueOnly = "true",
    } = req.query;

    console.log(`[Sync Endpoint] Request params:`, {
      branchId,
      limit,
      page,
      includeEcourse,
      includePastDueOnly,
    });

    // Build query - only filter by branchId if provided
    const query = {};
    if (branchId) {
      // Validate branchId is a valid ObjectId
      if (!mongoose.Types.ObjectId.isValid(branchId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid branchId format",
        });
      }
      // Let Mongoose handle the ObjectId casting
      query.branchId = branchId;
    }

    // Only exclude e-course students if explicitly requested
    if (includeEcourse === "false") {
      query.studentType = { $ne: "ecourse" };
    }

    console.log(`[Sync Endpoint] Query filter:`, JSON.stringify(query));

    // Convert branchId to ObjectId for aggregation pipeline if it exists
    const aggregationQuery = { ...query };
    if (aggregationQuery.branchId) {
      aggregationQuery.branchId = new mongoose.Types.ObjectId(branchId);
    }

    // Get today's date for comparison (as a Date object that can be used in aggregation)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    console.log(`[Sync Endpoint] Today's date for comparison:`, today);

    // Debug: Check if there are any invoices in the database
    const Fee = require("../models/Fee");
    const totalInvoices = await Fee.countDocuments({
      branchId: query.branchId,
    });
    const pastDueInvoices = await Fee.countDocuments({
      branchId: query.branchId,
      dueDate: { $lt: today },
      balance: { $gt: 0 },
    });
    console.log(
      `[Sync Endpoint] Total invoices in branch: ${totalInvoices}, Past due with balance: ${pastDueInvoices}`,
    );

    // Simple aggregation without complex fee calculations for sync
    const pipeline = [
      { $match: aggregationQuery },
      {
        $lookup: {
          from: "fees",
          localField: "_id",
          foreignField: "studentId",
          as: "invoices",
        },
      },
      {
        $addFields: {
          // Check if student has any past due invoices (using balance field, not balanceDue)
          hasPastDueInvoices: {
            $gt: [
              {
                $size: {
                  $filter: {
                    input: "$invoices",
                    as: "invoice",
                    cond: {
                      $and: [
                        { $lt: ["$$invoice.dueDate", today] },
                        { $gt: ["$$invoice.balance", 0] },
                      ],
                    },
                  },
                },
              },
              0,
            ],
          },
          totalInvoices: { $size: "$invoices" },
        },
      },
      // Filter for students with past due invoices if requested
      ...(includePastDueOnly === "true"
        ? [
            {
              $match: {
                hasPastDueInvoices: true,
              },
            },
          ]
        : []),
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "userInfo",
        },
      },
      { $unwind: { path: "$userInfo", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "departments",
          localField: "departmentId",
          foreignField: "_id",
          as: "departmentInfo",
        },
      },
      {
        $addFields: {
          departmentInfo: { $arrayElemAt: ["$departmentInfo", 0] },
          // Simple fee status - calculate total balance across all invoices
          totalBalance: {
            $sum: {
              $map: {
                input: "$invoices",
                as: "invoice",
                in: { $ifNull: ["$$invoice.balance", 0] },
              },
            },
          },
          feeStatus: {
            $cond: {
              if: {
                $eq: [
                  {
                    $sum: {
                      $map: {
                        input: "$invoices",
                        as: "invoice",
                        in: { $ifNull: ["$$invoice.balance", 0] },
                      },
                    },
                  },
                  0,
                ],
              },
              then: "paid",
              else: "pending",
            },
          },
        },
      },
      {
        $project: {
          _id: 1,
          studentId: 1,
          admissionNumber: 1,
          academicStatus: 1,
          branchId: 1,
          departmentId: "$departmentInfo._id",
          firstName: "$userInfo.firstName",
          lastName: "$userInfo.lastName",
          email: "$userInfo.email",
          mobile: "$userInfo.phone",
          fees: {
            feeStatus: "$feeStatus",
          },
          createdAt: 1,
        },
      },
      { $sort: { createdAt: -1 } },
      { $skip: (parseInt(page) - 1) * parseInt(limit) },
      { $limit: parseInt(limit) },
    ];

    const students = await Student.aggregate(pipeline);

    // Get total count
    const total = await Student.countDocuments(query);

    console.log(
      `[Sync Endpoint] Aggregation returned ${students.length} students, countDocuments returned ${total} total`,
    );

    // Debug: If past due only is enabled and we got 0 results, check the data
    if (includePastDueOnly === "true" && students.length === 0) {
      console.log(
        "[Sync Endpoint] No students with past due invoices found. Running diagnostics...",
      );

      // Check students with any invoices
      const studentsWithInvoices = await Student.aggregate([
        { $match: aggregationQuery },
        {
          $lookup: {
            from: "fees",
            localField: "_id",
            foreignField: "studentId",
            as: "invoices",
          },
        },
        {
          $match: {
            invoices: { $ne: [] },
          },
        },
        { $limit: 5 },
        {
          $project: {
            studentId: 1,
            invoiceCount: { $size: "$invoices" },
            invoices: {
              $map: {
                input: { $slice: ["$invoices", 3] },
                as: "inv",
                in: {
                  dueDate: "$$inv.dueDate",
                  balance: "$$inv.balance",
                  status: "$$inv.status",
                },
              },
            },
          },
        },
      ]);
      console.log(
        "[Sync Endpoint] Sample students with invoices:",
        JSON.stringify(studentsWithInvoices, null, 2),
      );
    }

    // Debug: check if students exist without filters
    if (total === 0 && branchId) {
      const allStudentsInBranch = await Student.countDocuments({ branchId });
      const allStudents = await Student.countDocuments({});
      console.log(
        `[Sync Endpoint] Debug: Total students in branch=${allStudentsInBranch}, Total in DB=${allStudents}`,
      );

      // Check studentType distribution
      const byType = await Student.aggregate([
        { $match: { branchId } },
        { $group: { _id: "$studentType", count: { $sum: 1 } } },
      ]);
      console.log(`[Sync Endpoint] Student type distribution:`, byType);
    }

    res.json({
      success: true,
      count: students.length,
      total,
      students,
    });
  } catch (error) {
    console.error("Get students for sync error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching students for sync",
      error: error.message,
    });
  }
};

module.exports = {
  createStudent,
  getStudents,
  getCurrentStudent,
  getStudent,
  updateStudent,
  deleteStudent,
  addAcademicRecord,
  addGrade,
  updateAttendance,
  getStudentsByClass,
  getStudentStatistics,
  cleanupOrphanedUsers,
  assignStudentToClass,
  removeStudentFromClass,
  recordStudentPayment,
  getStudentPaymentHistory,
  generateStudentPaymentReceipt,
  downloadStudentPaymentReceipt,
  getStudentCourseMaterials,
  getStudentWhatsappGroups,
  suspendStudent,
  getStudentsFeeStatusChanges,
  getStudentsForSync,
  // Exported for tests and external usage
  generateInitialInvoicesForStudent,
};
