const mongoose = require("mongoose");

const teacherSchema = new mongoose.Schema(
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
    employeeId: {
      type: String,
      required: [true, "Employee ID is required"],
      trim: true,
      uppercase: true,
    },
    joiningDate: {
      type: Date,
      required: [true, "Joining date is required"],
      default: Date.now,
    },
    employmentStatus: {
      type: String,
      enum: [
        "active",
        "inactive",
        "terminated",
        "resigned",
        "retired",
        "on_leave",
      ],
      default: "active",
    },
    employmentType: {
      type: String,
      enum: ["full_time", "part_time", "contract", "substitute"],
      default: "full_time",
    },
    department: {
      type: String,
      required: [true, "Department is required"],
      trim: true,
    },
    designation: {
      type: String,
      required: [true, "Designation is required"],
      trim: true,
    },
    qualification: {
      education: [
        {
          degree: { type: String, required: true, trim: true },
          institution: { type: String, required: true, trim: true },
          year: { type: Number, required: true },
          grade: { type: String, trim: true },
          major: { type: String, trim: true },
        },
      ],
      certifications: [
        {
          name: { type: String, required: true, trim: true },
          issuingOrganization: { type: String, required: true, trim: true },
          issueDate: { type: Date, required: true },
          expiryDate: { type: Date },
          certificateUrl: { type: String },
        },
      ],
      experience: {
        totalYears: { type: Number, default: 0 },
        previousPositions: {
          type: [
            {
              position: { type: String, trim: true },
              institution: { type: String, trim: true },
              startDate: { type: Date },
              endDate: { type: Date },
              responsibilities: [{ type: String, trim: true }],
              reasonForLeaving: { type: String, trim: true },
            },
          ],
          default: undefined, // or `[]` if you prefer an empty array by default
        },
      },
    },
    subjects: [
      {
        courseId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Course",
          required: true,
        },
        level: {
          type: String,
          enum: ["primary", "secondary", "senior_secondary", "all"],
          default: "all",
        },
        isPrimary: { type: Boolean, default: false }, // Main subject
        yearsTeaching: { type: Number, default: 0 },
      },
    ],
    classes: [
      {
        classId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Class",
          required: true,
        },
        courses: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Course",
          },
        ], // Courses taught in this class
        isClassTeacher: { type: Boolean, default: false },
        academicTermId: { type: mongoose.Schema.Types.ObjectId },
        startDate: { type: Date, default: Date.now },
        endDate: { type: Date },
      },
    ],
    schedule: {
      workingDays: [
        {
          type: String,
          enum: [
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
            "sunday",
          ],
        },
      ],
      workingHours: {
        start: { type: String }, // e.g., "08:00"
        end: { type: String }, // e.g., "16:00"
      },
      timetable: [
        {
          day: {
            type: String,
            enum: [
              "monday",
              "tuesday",
              "wednesday",
              "thursday",
              "friday",
              "saturday",
              "sunday",
            ],
            required: true,
          },
          periods: [
            {
              startTime: { type: String, required: true },
              endTime: { type: String, required: true },
              subject: { type: String, required: true },
              classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class" },
              room: { type: String },
            },
          ],
        },
      ],
    },
    performance: {
      studentFeedback: [
        {
          academicTermId: { type: mongoose.Schema.Types.ObjectId },
          averageRating: { type: Number, min: 1, max: 5 },
          totalFeedbacks: { type: Number, default: 0 },
          comments: [{ type: String }],
        },
      ],
      appraisals: [
        {
          date: { type: Date, required: true },
          appraisedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          rating: { type: Number, min: 1, max: 5 },
          strengths: [{ type: String }],
          improvements: [{ type: String }],
          goals: [{ type: String }],
          comments: { type: String },
        },
      ],
      achievements: [
        {
          title: { type: String, required: true },
          description: { type: String },
          date: { type: Date, required: true },
          category: {
            type: String,
            enum: [
              "academic",
              "research",
              "professional_development",
              "student_mentoring",
              "other",
            ],
          },
        },
      ],
    },
    attendance: {
      totalWorkingDays: { type: Number, default: 0 },
      daysPresent: { type: Number, default: 0 },
      daysAbsent: { type: Number, default: 0 },
      daysLate: { type: Number, default: 0 },
      attendancePercentage: { type: Number, default: 0 },
      lastUpdated: { type: Date, default: Date.now },
    },
    salary: {
      basicSalary: { type: Number, required: true, default: 0 },
      allowances: [
        {
          name: { type: String, required: true },
          amount: { type: Number, required: true },
          isPercentage: { type: Boolean, default: false },
        },
      ],
      deductions: [
        {
          name: { type: String, required: true },
          amount: { type: Number, required: true },
          isPercentage: { type: Boolean, default: false },
        },
      ],
      grossSalary: { type: Number, default: 0 },
      netSalary: { type: Number, default: 0 },
      paymentSchedule: {
        type: String,
        enum: ["monthly", "bi_weekly", "weekly"],
        default: "monthly",
      },
    },
    leaveRecords: [
      {
        type: {
          type: String,
          enum: [
            "annual",
            "sick",
            "maternity",
            "paternity",
            "emergency",
            "unpaid",
          ],
          required: true,
        },
        startDate: { type: Date, required: true },
        endDate: { type: Date, required: true },
        totalDays: { type: Number, required: true },
        reason: { type: String, required: true },
        status: {
          type: String,
          enum: ["pending", "approved", "rejected"],
          default: "pending",
        },
        approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        appliedDate: { type: Date, default: Date.now },
        approvalDate: { type: Date },
        remarks: { type: String },
      },
    ],
    documents: [
      {
        name: { type: String, required: true, trim: true },
        type: {
          type: String,
          enum: ["resume", "degree_certificate", "id_proof", "photo", "other"],
          required: true,
        },
        url: { type: String, required: true },
        uploadDate: { type: Date, default: Date.now },
        verified: { type: Boolean, default: false },
      },
    ],
    emergencyContact: {
      name: { type: String, required: true, trim: true },
      relationship: { type: String, required: true, trim: true },
      phone: { type: String, required: true, trim: true },
      alternatePhone: { type: String, trim: true },
      address: { type: String, trim: true },
    },
    bankDetails: {
      accountHolderName: { type: String, trim: true },
      accountNumber: { type: String, trim: true },
      bankName: { type: String, trim: true },
      branchName: { type: String, trim: true },
      ifscCode: { type: String, trim: true },
      accountType: {
        type: String,
        enum: ["savings", "current"],
        default: "savings",
      },
    },
    disciplinaryRecords: [
      {
        date: { type: Date, required: true },
        type: {
          type: String,
          enum: [
            "warning",
            "reprimand",
            "suspension",
            "termination",
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
    notifications: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: true },
      inApp: { type: Boolean, default: true },
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
teacherSchema.index({ branchId: 1 });
teacherSchema.index({ userId: 1 });
teacherSchema.index({ employeeId: 1, branchId: 1 }, { unique: true });
teacherSchema.index({ department: 1 });
teacherSchema.index({ employmentStatus: 1 });
teacherSchema.index({ "subjects.courseId": 1 });

// Compound indexes
teacherSchema.index({ branchId: 1, employmentStatus: 1 });
teacherSchema.index({ branchId: 1, department: 1 });

// Virtual for full teacher info
teacherSchema.virtual("fullInfo", {
  ref: "User",
  localField: "userId",
  foreignField: "_id",
  justOne: true,
});

// Virtual for branch info
teacherSchema.virtual("branch", {
  ref: "Branch",
  localField: "branchId",
  foreignField: "_id",
  justOne: true,
});

// Virtual for assigned classes info
teacherSchema.virtual("assignedClasses", {
  ref: "Class",
  localField: "classes.classId",
  foreignField: "_id",
});

// Virtual for years of experience
teacherSchema.virtual("totalExperience").get(function () {
  const joiningDate = new Date(this.joiningDate);
  const today = new Date();
  const yearsInCurrentJob =
    (today - joiningDate) / (1000 * 60 * 60 * 24 * 365.25);

  return (
    Math.round(
      (this.qualification.experience.totalYears + yearsInCurrentJob) * 10
    ) / 10
  );
});

// Virtual for current classes (active)
teacherSchema.virtual("currentClasses").get(function () {
  const today = new Date();
  return (this.classes || []).filter(
    (cls) => !cls.endDate || cls.endDate > today
  );
});

// Virtual for workload (number of current classes)
teacherSchema.virtual("workload").get(function () {
  return this.currentClasses.length;
});

// Virtual for userInfo (maps populated userId to userInfo for frontend compatibility)
teacherSchema.virtual("userInfo").get(function () {
  return this.userId;
});

// Pre-save middleware
teacherSchema.pre("save", function (next) {
  this.updatedAt = Date.now();

  // Calculate gross salary
  let grossSalary = this.salary.basicSalary;

  // Add allowances
  (this.salary.allowances || []).forEach((allowance) => {
    if (allowance.isPercentage) {
      grossSalary += (this.salary.basicSalary * allowance.amount) / 100;
    } else {
      grossSalary += allowance.amount;
    }
  });

  this.salary.grossSalary = grossSalary;

  // Calculate net salary (subtract deductions)
  let netSalary = grossSalary;

  (this.salary.deductions || []).forEach((deduction) => {
    if (deduction.isPercentage) {
      netSalary -= (grossSalary * deduction.amount) / 100;
    } else {
      netSalary -= deduction.amount;
    }
  });

  this.salary.netSalary = Math.max(0, netSalary);

  // Calculate attendance percentage
  if (this.attendance.totalWorkingDays > 0) {
    this.attendance.attendancePercentage = Math.round(
      (this.attendance.daysPresent / this.attendance.totalWorkingDays) * 100
    );
  }

  next();
});

// Method to assign class
teacherSchema.methods.assignClass = function (
  classId,
  courses,
  isClassTeacher = false,
  academicTermId
) {
  const existingAssignment = this.classes.find(
    (cls) =>
      cls.classId.toString() === classId.toString() &&
      (!cls.endDate || cls.endDate > new Date()) &&
      (!academicTermId ||
        cls.academicTermId?.toString() === academicTermId.toString())
  );

  const courseArray = Array.isArray(courses) ? courses : [courses];

  if (!existingAssignment) {
    this.classes.push({
      classId,
      courses: courseArray,
      isClassTeacher,
      academicTermId,
      startDate: new Date(),
    });
  } else {
    // Append new courses to existing assignment if they don't already exist
    courseArray.forEach((courseId) => {
      if (!existingAssignment.courses.includes(courseId)) {
        existingAssignment.courses.push(courseId);
      }
    });
    // Update class teacher status if specified
    if (isClassTeacher !== undefined) {
      existingAssignment.isClassTeacher = isClassTeacher;
    }
  }

  return this.save();
};

// Method to remove class assignment
teacherSchema.methods.removeClassAssignment = function (
  classId,
  academicTermId
) {
  const assignment = this.classes.find(
    (cls) =>
      cls.classId.toString() === classId.toString() &&
      (!academicTermId ||
        cls.academicTermId?.toString() === academicTermId.toString())
  );

  if (assignment) {
    assignment.endDate = new Date();
  }

  return this.save();
};

// Method to remove specific course from class assignment
teacherSchema.methods.removeCourseFromClass = function (
  classId,
  courseId,
  academicTermId
) {
  const assignment = this.classes.find(
    (cls) =>
      cls.classId.toString() === classId.toString() &&
      (!cls.endDate || cls.endDate > new Date()) &&
      (!academicTermId ||
        cls.academicTermId?.toString() === academicTermId.toString())
  );

  if (assignment) {
    // Remove the specific course from the courses array
    assignment.courses = assignment.courses.filter(
      (course) => course.toString() !== courseId.toString()
    );

    // If no courses left, mark the assignment as ended
    if (assignment.courses.length === 0) {
      assignment.endDate = new Date();
    }
  }

  return this.save();
};

// Method to add performance appraisal
teacherSchema.methods.addAppraisal = function (appraisalData) {
  this.performance.appraisals.push({
    date: appraisalData.date || new Date(),
    appraisedBy: appraisalData.appraisedBy,
    rating: appraisalData.rating,
    strengths: appraisalData.strengths || [],
    improvements: appraisalData.improvements || [],
    goals: appraisalData.goals || [],
    comments: appraisalData.comments || "",
  });

  return this.save();
};

// Method to apply for leave
teacherSchema.methods.applyLeave = function (leaveData) {
  const startDate = new Date(leaveData.startDate);
  const endDate = new Date(leaveData.endDate);
  const totalDays =
    Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

  this.leaveRecords.push({
    type: leaveData.type,
    startDate,
    endDate,
    totalDays,
    reason: leaveData.reason,
    status: "pending",
  });

  return this.save();
};

// Method to approve/reject leave
teacherSchema.methods.updateLeaveStatus = function (
  leaveId,
  status,
  approvedBy,
  remarks
) {
  const leaveRecord = this.leaveRecords.id(leaveId);

  if (leaveRecord) {
    leaveRecord.status = status;
    leaveRecord.approvedBy = approvedBy;
    leaveRecord.approvalDate = new Date();
    leaveRecord.remarks = remarks || "";
  }

  return this.save();
};

// Method to update attendance
teacherSchema.methods.updateAttendance = function (attendanceData) {
  this.attendance = {
    ...this.attendance,
    ...attendanceData,
    lastUpdated: new Date(),
  };

  return this.save();
};

// Static method to find teachers by branch
teacherSchema.statics.findByBranch = function (branchId, options = {}) {
  const query = { branchId };

  if (options.status) {
    query.employmentStatus = options.status;
  }

  if (options.department) {
    query.department = options.department;
  }

  if (options.course) {
    query["subjects.courseId"] = options.course;
  }

  return this.find(query)
    .populate("userId", "firstName lastName email profileDetails")
    .populate("branchId", "name")
    .populate("classes.classId", "name");
};

// Static method to get teachers count by department
teacherSchema.statics.getCountByDepartment = function (branchId) {
  return this.aggregate([
    { $match: { branchId: new mongoose.Types.ObjectId(branchId) } },
    { $group: { _id: "$department", count: { $sum: 1 } } },
  ]);
};

// Static method to get teachers count by status
teacherSchema.statics.getCountByStatus = function (branchId) {
  return this.aggregate([
    { $match: { branchId: new mongoose.Types.ObjectId(branchId) } },
    { $group: { _id: "$employmentStatus", count: { $sum: 1 } } },
  ]);
};

module.exports = mongoose.model("Teacher", teacherSchema);
