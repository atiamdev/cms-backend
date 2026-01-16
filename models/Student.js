const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User reference is required"],
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: [true, "Branch reference is required"],
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: false, // Optional for backward compatibility
    },
    studentId: {
      type: String,
      required: [true, "Student ID is required"],
      trim: true,
      uppercase: true,
    },
    admissionNumber: {
      type: String,
      required: [true, "Admission number is required"],
      trim: true,
      uppercase: true,
    },
    studentType: {
      type: String,
      enum: ["regular", "ecourse"],
      default: "regular",
      required: true,
    },
    currentClassId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: false, // Make it optional during creation
    },
    courses: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Course",
      },
    ],
    // Track when each course was enrolled (with enrollment dates)
    courseEnrollments: [
      {
        courseId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Course",
          required: true,
        },
        enrolledAt: {
          type: Date,
          default: Date.now,
          required: true,
        },
        status: {
          type: String,
          enum: ["active", "completed", "dropped", "suspended"],
          default: "active",
        },
      },
    ],
    enrollmentDate: {
      type: Date,
      required: [true, "Enrollment date is required"],
      default: Date.now,
    },
    referralSource: {
      source: {
        type: String,
        enum: [
          "banner",
          "billboard",
          "flyers",
          "social_media",
          "friend",
          "family",
          "other",
        ],
        required: false,
      },
      otherDescription: {
        type: String,
        trim: true,
        required: function () {
          return this.source === "other";
        },
      },
    },
    academicStatus: {
      type: String,
      enum: [
        "active",
        "inactive",
        "suspended",
        "graduated",
        "transferred",
        "dropped",
      ],
      default: "active",
    },
    photoUrl: {
      type: String,
      trim: true,
    },
    statusHistory: [
      {
        oldStatus: {
          type: String,
          enum: [
            "active",
            "inactive",
            "suspended",
            "graduated",
            "transferred",
            "dropped",
          ],
        },
        newStatus: {
          type: String,
          enum: [
            "active",
            "inactive",
            "suspended",
            "graduated",
            "transferred",
            "dropped",
          ],
          required: true,
        },
        changedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        changedAt: {
          type: Date,
          default: Date.now,
        },
        reason: {
          type: String,
          trim: true,
        },
      },
    ],
    academicRecords: [
      {
        academicTermId: {
          type: mongoose.Schema.Types.ObjectId,
          required: true,
        },
        classId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Class",
        },
        subjects: [
          {
            subjectName: { type: String, required: true },
            subjectCode: { type: String },
            teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
            grades: [
              {
                examType: {
                  type: String,
                  enum: [
                    "quiz",
                    "test",
                    "midterm",
                    "final",
                    "assignment",
                    "project",
                  ],
                  required: true,
                },
                score: { type: Number, required: true, min: 0, max: 100 },
                maxScore: { type: Number, required: true, default: 100 },
                date: { type: Date, default: Date.now },
                remarks: { type: String },
              },
            ],
            overallGrade: { type: String },
            overallScore: { type: Number },
            position: { type: Number },
          },
        ],
        overallPosition: { type: Number },
        overallGPA: { type: Number },
        attendance: {
          totalDays: { type: Number, default: 0 },
          presentDays: { type: Number, default: 0 },
          absentDays: { type: Number, default: 0 },
          lateDays: { type: Number, default: 0 },
          attendancePercentage: { type: Number, default: 0 },
        },
        promoted: { type: Boolean, default: false },
        remarks: { type: String },
      },
    ],
    parentGuardianInfo: {
      father: {
        name: { type: String, trim: true },
        occupation: { type: String, trim: true },
        phone: { type: String, trim: true },
        email: { type: String, trim: true, lowercase: true },
        address: { type: String, trim: true },
      },
      mother: {
        name: { type: String, trim: true },
        occupation: { type: String, trim: true },
        phone: { type: String, trim: true },
        email: { type: String, trim: true, lowercase: true },
        address: { type: String, trim: true },
      },
      guardian: {
        name: { type: String, trim: true },
        relationship: { type: String, trim: true },
        occupation: { type: String, trim: true },
        phone: { type: String, trim: true },
        email: { type: String, trim: true, lowercase: true },
        address: { type: String, trim: true },
      },
      emergencyContact: {
        name: { type: String, trim: true },
        relationship: { type: String, trim: true },
        phone: {
          type: String,
          trim: true,
          required: function () {
            return this.studentType !== "ecourse";
          },
        },
        alternatePhone: { type: String, trim: true },
      },
    },
    medicalInfo: {
      bloodGroup: {
        type: String,
        enum: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"],
      },
      allergies: [{ type: String, trim: true }],
      medications: [{ type: String, trim: true }],
      medicalConditions: [{ type: String, trim: true }],
      doctorName: { type: String, trim: true },
      doctorPhone: { type: String, trim: true },
      hospitalPreference: { type: String, trim: true },
    },
    documents: [
      {
        name: { type: String, required: true, trim: true },
        type: {
          type: String,
          enum: [
            "birth_certificate",
            "previous_school_certificate",
            "medical_report",
            "photo",
            "other",
          ],
          required: true,
        },
        url: { type: String, required: true },
        uploadDate: { type: Date, default: Date.now },
        verified: { type: Boolean, default: false },
        required: {
          type: Boolean,
          default: function () {
            return this.type === "photo";
          },
        },
        capturedFromCamera: {
          type: Boolean,
          default: function () {
            return this.type === "photo";
          },
        },
      },
    ],
    disciplinaryRecords: [
      {
        date: { type: Date, required: true },
        type: {
          type: String,
          enum: [
            "warning",
            "detention",
            "suspension",
            "expulsion",
            "commendation",
          ],
          required: true,
        },
        description: { type: String, required: true },
        actionTaken: { type: String },
        reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        resolved: { type: Boolean, default: false },
        resolvedDate: { type: Date },
        remarks: { type: String },
      },
    ],
    specialNeeds: {
      hasSpecialNeeds: { type: Boolean, default: false },
      needsDescription: { type: String },
      accommodations: [{ type: String }],
      supportStaff: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    },
    fees: {
      totalFeeStructure: { type: Number, default: 0 },
      totalPaid: { type: Number, default: 0 },
      totalBalance: { type: Number, default: 0 },
      feeStatus: {
        type: String,
        enum: ["paid", "partial", "pending", "overdue"],
        default: "pending",
      },
      scholarshipApplied: { type: Boolean, default: false },
      scholarshipAmount: { type: Number, default: 0 },
      scholarshipType: { type: String },
      paymentHistory: [
        {
          amount: {
            type: Number,
            required: true,
          },
          paymentMethod: {
            type: String,
            enum: [
              "cash",
              "bank_transfer",
              "cheque",
              "mpesa",
              "equity",
              "equity-mpesa",
              "card",
              "online",
            ],
            required: true,
          },
          referenceNumber: {
            type: String,
            trim: true,
          },
          paymentDate: {
            type: Date,
            required: true,
            default: Date.now,
          },
          recordedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
          },
          notes: {
            type: String,
            trim: true,
          },
        },
      ],
      // Installment schedule for dynamic payments
      installmentPlan: {
        enabled: { type: Boolean, default: false },
        numberOfInstallments: { type: Number, default: 1 },
        frequency: {
          type: String,
          enum: ["weekly", "monthly", "quarterly"],
          default: "monthly",
        },
        schedule: [
          {
            installmentNumber: { type: Number, required: true },
            amount: { type: Number, required: true, min: 0 },
            dueDate: { type: Date, required: true },
            status: {
              type: String,
              enum: ["pending", "paid", "overdue"],
              default: "pending",
            },
          },
        ],
      },
    },
    scholarshipPercentage: {
      type: Number,
      default: 0,
      min: [0, "Scholarship percentage cannot be less than 0"],
      max: [100, "Scholarship percentage cannot be more than 100"],
    },
    scholarshipAssignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    scholarshipAssignedDate: {
      type: Date,
    },
    scholarshipReason: {
      type: String,
      trim: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for performance
studentSchema.index({ branchId: 1 });
studentSchema.index({ userId: 1, branchId: 1 }, { unique: true }); // Prevent duplicate student records for same user
studentSchema.index({ studentId: 1, branchId: 1 }, { unique: true });
studentSchema.index({ admissionNumber: 1, branchId: 1 }, { unique: true });
studentSchema.index({ currentClassId: 1 });
studentSchema.index({ academicStatus: 1 });
studentSchema.index({ enrollmentDate: 1 });

// Compound indexes
studentSchema.index({ branchId: 1, academicStatus: 1 });
studentSchema.index({ branchId: 1, currentClassId: 1 });

// Virtual for full student info
studentSchema.virtual("fullInfo", {
  ref: "User",
  localField: "userId",
  foreignField: "_id",
  justOne: true,
});

// Virtual for current class info
studentSchema.virtual("currentClass", {
  ref: "Class",
  localField: "currentClassId",
  foreignField: "_id",
  justOne: true,
});

// Virtual for branch info
studentSchema.virtual("branch", {
  ref: "Branch",
  localField: "branchId",
  foreignField: "_id",
  justOne: true,
});

// Virtual for current academic record
studentSchema.virtual("currentAcademicRecord").get(function () {
  if (this.academicRecords && this.academicRecords.length > 0) {
    return this.academicRecords[this.academicRecords.length - 1];
  }
  return null;
});

// Virtual for overall attendance percentage
studentSchema.virtual("overallAttendancePercentage").get(function () {
  if (this.academicRecords && this.academicRecords.length > 0) {
    const totalDays = this.academicRecords.reduce(
      (sum, record) => sum + (record.attendance?.totalDays || 0),
      0
    );
    const presentDays = this.academicRecords.reduce(
      (sum, record) => sum + (record.attendance?.presentDays || 0),
      0
    );

    return totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;
  }
  return 0;
});

// Virtual for age calculation
studentSchema.virtual("age").get(function () {
  if (
    this.fullInfo &&
    this.fullInfo.profileDetails &&
    this.fullInfo.profileDetails.dateOfBirth
  ) {
    const today = new Date();
    const birthDate = new Date(this.fullInfo.profileDetails.dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      age--;
    }

    return age;
  }
  return null;
});

// Pre-save middleware
studentSchema.pre("save", function (next) {
  this.updatedAt = Date.now();

  // Calculate fee balance
  this.fees.totalBalance =
    this.fees.totalFeeStructure -
    this.fees.totalPaid -
    this.fees.scholarshipAmount;

  // Update fee status
  if (this.fees.totalBalance <= 0) {
    this.fees.feeStatus = "paid";
  } else if (this.fees.totalPaid > 0) {
    this.fees.feeStatus = "partial";
  } else {
    this.fees.feeStatus = "pending";
  }

  next();
});

// Method to add academic record
studentSchema.methods.addAcademicRecord = function (academicTermId, classId) {
  const existingRecord = this.academicRecords.find(
    (record) => record.academicTermId.toString() === academicTermId.toString()
  );

  if (!existingRecord) {
    this.academicRecords.push({
      academicTermId,
      classId,
      subjects: [],
      attendance: {
        totalDays: 0,
        presentDays: 0,
        absentDays: 0,
        lateDays: 0,
        attendancePercentage: 0,
      },
    });
  }

  return this.save();
};

// Method to add grade
studentSchema.methods.addGrade = function (academicTermId, subjectName, grade) {
  const academicRecord = this.academicRecords.find(
    (record) => record.academicTermId.toString() === academicTermId.toString()
  );

  if (academicRecord) {
    let subject = academicRecord.subjects.find(
      (sub) => sub.subjectName === subjectName
    );

    if (!subject) {
      subject = {
        subjectName,
        subjectCode: grade.subjectCode || "",
        teacherId: grade.teacherId,
        grades: [],
      };
      academicRecord.subjects.push(subject);
    }

    subject.grades.push({
      examType: grade.examType,
      score: grade.score,
      maxScore: grade.maxScore || 100,
      date: grade.date || new Date(),
      remarks: grade.remarks || "",
    });

    // Calculate overall score for subject
    const totalScore = subject.grades.reduce(
      (sum, g) => sum + (g.score / g.maxScore) * 100,
      0
    );
    subject.overallScore = Math.round(totalScore / subject.grades.length);

    // Assign grade letter
    if (subject.overallScore >= 75) subject.overallGrade = "Distinction";
    else if (subject.overallScore >= 60) subject.overallGrade = "Credit";
    else if (subject.overallScore >= 40) subject.overallGrade = "Pass";
    else subject.overallGrade = "Fail";
  }

  return this.save();
};

// Method to update attendance
studentSchema.methods.updateAttendance = function (
  academicTermId,
  attendanceData
) {
  const academicRecord = this.academicRecords.find(
    (record) => record.academicTermId.toString() === academicTermId.toString()
  );

  if (academicRecord) {
    academicRecord.attendance = {
      ...academicRecord.attendance,
      ...attendanceData,
    };

    // Calculate attendance percentage
    if (academicRecord.attendance.totalDays > 0) {
      academicRecord.attendance.attendancePercentage = Math.round(
        (academicRecord.attendance.presentDays /
          academicRecord.attendance.totalDays) *
          100
      );
    }
  }

  return this.save();
};

// Method to assign student to a class
studentSchema.methods.assignToClass = async function (
  classId,
  academicTermId = null
) {
  this.currentClassId = classId;

  // If student has courses assigned, calculate fees from courses
  if (this.courses && this.courses.length > 0) {
    await this.calculateCourseFees();
  } else {
    // Fall back to class-based fees if no courses are assigned
    try {
      const Class = mongoose.model("Class");
      const classDoc = await Class.findById(classId);

      if (classDoc && classDoc.fees) {
        // Update student's fee structure based on class fees
        this.fees.totalFeeStructure =
          classDoc.fees.totalFee || classDoc.fees.tuitionFee || 0;

        // Recalculate balance
        this.fees.totalBalance =
          this.fees.totalFeeStructure -
          this.fees.totalPaid -
          this.fees.scholarshipAmount;

        // Update fee status
        if (this.fees.totalBalance <= 0) {
          this.fees.feeStatus = "paid";
        } else if (this.fees.totalPaid > 0) {
          this.fees.feeStatus = "partial";
        } else {
          this.fees.feeStatus = "pending";
        }
      }
    } catch (error) {
      console.error("Error updating fees during class assignment:", error);
    }
  }

  // If academic term is provided, also add an academic record
  if (academicTermId) {
    this.addAcademicRecord(academicTermId, classId);
  }

  return this.save();
};

// Method to assign courses to student
studentSchema.methods.assignCourses = async function (courseIds) {
  if (Array.isArray(courseIds)) {
    this.courses = courseIds;
  } else if (courseIds) {
    this.courses = [courseIds];
  } else {
    this.courses = [];
  }

  // Calculate total fee based on assigned courses
  await this.calculateCourseFees();

  // Note: Invoice generation is now handled in studentController.generateInitialInvoicesForStudent()
  // during student registration and studentController.updateStudent() during updates.
  // This prevents duplicate invoice creation and provides better control over the process.

  return this.save();
};

// Method to calculate total fees from assigned courses
studentSchema.methods.calculateCourseFees = async function () {
  if (!this.courses || this.courses.length === 0) {
    this.fees.totalFeeStructure = 0;
    this.fees.installmentPlan.enabled = false;
    return;
  }

  try {
    const Course = mongoose.model("Course");
    const courses = await Course.find({ _id: { $in: this.courses } });

    let totalFee = 0;
    let hasInstallments = false;
    let installmentPlan = null;

    courses.forEach((course) => {
      if (course.feeStructure) {
        // Calculate total from fee components
        if (
          course.feeStructure.components &&
          course.feeStructure.components.length > 0
        ) {
          const courseTotal = course.feeStructure.components.reduce(
            (sum, comp) => sum + comp.amount,
            0
          );
          totalFee += courseTotal;
        }

        // Check if course has installment plan
        if (
          course.feeStructure.installmentPlan &&
          course.feeStructure.installmentPlan.enabled
        ) {
          hasInstallments = true;
          // Use the first course's installment plan (assuming all courses have similar plans)
          if (!installmentPlan) {
            installmentPlan = course.feeStructure.installmentPlan;
          }
        }
      } else if (course.fees && course.fees.totalFee) {
        // Fallback to legacy fee structure
        totalFee += course.fees.totalFee;
      }
    });

    this.fees.totalFeeStructure = totalFee;

    // Handle installment plan
    if (hasInstallments && installmentPlan) {
      this.fees.installmentPlan.enabled = true;
      this.fees.installmentPlan.numberOfInstallments =
        installmentPlan.numberOfInstallments;
      this.fees.installmentPlan.frequency = installmentPlan.frequency;

      // Generate dynamic schedule based on enrollment date
      this.fees.installmentPlan.schedule = this.generateInstallmentSchedule(
        this.enrollmentDate || new Date(),
        installmentPlan.numberOfInstallments,
        totalFee,
        installmentPlan.frequency
      );
    } else {
      this.fees.installmentPlan.enabled = false;
      this.fees.installmentPlan.schedule = [];
    }

    // Recalculate balance
    this.fees.totalBalance =
      this.fees.totalFeeStructure -
      this.fees.totalPaid -
      this.fees.scholarshipAmount;

    // Update fee status
    if (this.fees.totalBalance <= 0) {
      this.fees.feeStatus = "paid";
    } else if (this.fees.totalPaid > 0) {
      this.fees.feeStatus = "partial";
    } else {
      this.fees.feeStatus = "pending";
    }
  } catch (error) {
    console.error("Error calculating course fees:", error);
  }
};

// Method to generate installment schedule based on enrollment date
studentSchema.methods.generateInstallmentSchedule = function (
  enrollmentDate,
  numberOfInstallments,
  totalAmount,
  frequency
) {
  const schedule = [];
  const installmentAmount =
    Math.round((totalAmount / numberOfInstallments) * 100) / 100; // Round to 2 decimal places
  let currentDate = new Date(enrollmentDate);

  for (let i = 1; i <= numberOfInstallments; i++) {
    // Calculate due date based on frequency
    let dueDate = new Date(currentDate);

    switch (frequency) {
      case "weekly":
        dueDate.setDate(dueDate.getDate() + (i - 1) * 7);
        break;
      case "monthly":
        dueDate.setMonth(dueDate.getMonth() + (i - 1));
        break;
      case "quarterly":
        dueDate.setMonth(dueDate.getMonth() + (i - 1) * 3);
        break;
      default:
        dueDate.setMonth(dueDate.getMonth() + (i - 1));
    }

    schedule.push({
      installmentNumber: i,
      amount:
        i === numberOfInstallments
          ? totalAmount - installmentAmount * (numberOfInstallments - 1) // Ensure last installment covers remainder
          : installmentAmount,
      dueDate: dueDate,
      status: "pending",
    });
  }

  return schedule;
};

// Method to remove student from current class
studentSchema.methods.removeFromClass = function () {
  this.currentClassId = undefined;
  return this.save();
};

// Static method to find students by branch
studentSchema.statics.findByBranch = function (branchId, options = {}) {
  const query = { branchId };

  if (options.status) {
    query.academicStatus = options.status;
  }

  if (options.classId) {
    query.currentClassId = options.classId;
  }

  return this.find(query)
    .populate("userId", "firstName lastName email profileDetails")
    .populate("currentClassId", "name")
    .populate("branchId", "name");
};

// Static method to get students count by status
studentSchema.statics.getCountByStatus = function (branchId) {
  return this.aggregate([
    { $match: { branchId: new mongoose.Types.ObjectId(branchId) } },
    { $group: { _id: "$academicStatus", count: { $sum: 1 } } },
  ]);
};

module.exports = mongoose.model("Student", studentSchema);
