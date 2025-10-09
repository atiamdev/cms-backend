const mongoose = require("mongoose");

const classSchema = new mongoose.Schema(
  {
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: [true, "Branch reference is required"],
    },
    name: {
      type: String,
      required: [true, "Class name is required"],
      trim: true,
      maxlength: [100, "Class name cannot exceed 100 characters"],
    },
    grade: {
      type: String,
      required: [true, "Grade is required"],
      trim: true,
    },
    section: {
      type: String,
      trim: true,
      default: "A",
    },
    academicTermId: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, "Academic term reference is required"],
    },
    classTeacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
    },
    subjects: [
      {
        subjectName: { type: String, required: true, trim: true },
        subjectCode: { type: String, trim: true },
        courseId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Course",
          required: true,
        },
        assignedTeacherIds: [
          { type: mongoose.Schema.Types.ObjectId, ref: "Teacher" },
        ],
        weeklyHours: { type: Number, default: 1 },
        totalHours: { type: Number, default: 40 },
      },
    ],
    students: {
      type: [
        {
          studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
          enrollmentDate: { type: Date, default: Date.now },
          status: {
            type: String,
            enum: ["active", "transferred", "dropped"],
            default: "active",
          },
        },
      ],
      default: [], // Ensure students array is always initialized
    },
    capacity: {
      type: Number,
      required: [true, "Class capacity is required"],
      min: [1, "Capacity must be at least 1"],
      max: [100, "Capacity cannot exceed 100"],
      default: 30,
    },
    room: {
      number: { type: String, trim: true },
      building: { type: String, trim: true },
      floor: { type: Number },
      capacity: { type: Number },
    },
    schedule: {
      startTime: { type: String }, // e.g., "08:00"
      endTime: { type: String }, // e.g., "16:00"
      days: [
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
      periods: [
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
          },
          startTime: { type: String, required: true },
          endTime: { type: String, required: true },
          subjectName: { type: String, required: true },
          teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "Teacher" },
          room: { type: String },
        },
      ],
    },
    fees: {
      tuitionFee: { type: Number, default: 0 },
      additionalFees: [
        {
          name: { type: String, required: true },
          amount: { type: Number, required: true },
          isOptional: { type: Boolean, default: false },
        },
      ],
      totalFee: { type: Number, default: 0 },
    },
    status: {
      type: String,
      enum: ["active", "inactive", "completed"],
      default: "active",
    },
    requirements: {
      minimumAge: { type: Number },
      maximumAge: { type: Number },
      previousGrade: { type: String },
      specialRequirements: [{ type: String }],
    },
    description: { type: String, trim: true },
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
classSchema.index({ branchId: 1 });
classSchema.index({ academicTermId: 1 });
classSchema.index({ classTeacherId: 1 });
classSchema.index({ grade: 1 });
classSchema.index({ status: 1 });

// Compound indexes
classSchema.index({ branchId: 1, academicTermId: 1 });
classSchema.index({ branchId: 1, status: 1 });
classSchema.index({ branchId: 1, grade: 1 });

// Virtual for full class name
classSchema.virtual("fullName").get(function () {
  return this.section ? `${this.name} - ${this.section}` : this.name;
});

// Virtual for current enrollment count
classSchema.virtual("currentEnrollment").get(function () {
  return this.students && Array.isArray(this.students)
    ? this.students.filter((student) => student.status === "active").length
    : 0;
});

// Virtual for available seats
classSchema.virtual("availableSeats").get(function () {
  return this.capacity - this.currentEnrollment;
});

// Virtual for is full
classSchema.virtual("isFull").get(function () {
  return this.currentEnrollment >= this.capacity;
});

// Virtual for class teacher info
classSchema.virtual("classTeacher", {
  ref: "Teacher",
  localField: "classTeacherId",
  foreignField: "_id",
  justOne: true,
});

// Virtual for branch info
classSchema.virtual("branch", {
  ref: "Branch",
  localField: "branchId",
  foreignField: "_id",
  justOne: true,
});

// Virtual for active students
classSchema.virtual("activeStudents").get(function () {
  return this.students && Array.isArray(this.students)
    ? this.students.filter((student) => student.status === "active")
    : [];
});

// Pre-save middleware
classSchema.pre("save", function (next) {
  this.updatedAt = Date.now();

  // Calculate total fee
  this.fees.totalFee =
    this.fees.tuitionFee +
    this.fees.additionalFees.reduce((sum, fee) => sum + fee.amount, 0);

  next();
});

// Method to add student to class
classSchema.methods.addStudent = function (studentId) {
  // Initialize students array if it doesn't exist
  if (!this.students) {
    this.students = [];
  }

  // Check if student is already in class
  const existingStudent = this.students.find(
    (student) =>
      student.studentId.toString() === studentId.toString() &&
      student.status === "active"
  );

  if (existingStudent) {
    throw new Error("Student is already enrolled in this class");
  }

  // Check capacity
  if (this.isFull) {
    throw new Error("Class is at full capacity");
  }

  this.students.push({
    studentId,
    enrollmentDate: new Date(),
    status: "active",
  });

  return this.save();
};

// Method to remove student from class
classSchema.methods.removeStudent = function (
  studentId,
  reason = "transferred"
) {
  // Return early if no students array
  if (!this.students || !Array.isArray(this.students)) {
    return this.save();
  }

  const student = this.students.find(
    (student) =>
      student.studentId.toString() === studentId.toString() &&
      student.status === "active"
  );

  if (student) {
    student.status = reason;
  }

  return this.save();
};

// Method to add subject
classSchema.methods.addSubject = function (subjectData) {
  const existingSubject = this.subjects.find(
    (subject) =>
      subject.subjectName.toLowerCase() ===
      subjectData.subjectName.toLowerCase()
  );

  if (existingSubject) {
    throw new Error("Subject already exists in this class");
  }

  this.subjects.push(subjectData);
  return this.save();
};

// Method to assign teacher to subject
classSchema.methods.assignTeacherToSubject = function (subjectName, teacherId) {
  const subject = this.subjects.find(
    (sub) => sub.subjectName.toLowerCase() === subjectName.toLowerCase()
  );

  if (!subject) {
    throw new Error("Subject not found in this class");
  }

  if (!subject.assignedTeacherIds.includes(teacherId)) {
    subject.assignedTeacherIds.push(teacherId);
  }

  return this.save();
};

// Method to set class teacher
classSchema.methods.setClassTeacher = function (teacherId) {
  this.classTeacherId = teacherId;
  return this.save();
};

// Method to add period to schedule
classSchema.methods.addPeriod = function (periodData) {
  this.schedule.periods.push(periodData);
  return this.save();
};

// Method to update period in schedule
classSchema.methods.updatePeriod = function (periodIndex, periodData) {
  if (periodIndex >= 0 && periodIndex < this.schedule.periods.length) {
    this.schedule.periods[periodIndex] = periodData;
    return this.save();
  }
  throw new Error("Invalid period index");
};

// Method to delete period from schedule
classSchema.methods.deletePeriod = function (periodIndex) {
  if (periodIndex >= 0 && periodIndex < this.schedule.periods.length) {
    this.schedule.periods.splice(periodIndex, 1);
    return this.save();
  }
  throw new Error("Invalid period index");
};

// Static method to find classes by branch
classSchema.statics.findByBranch = function (branchId, options = {}) {
  const query = { branchId };

  if (options.status) {
    query.status = options.status;
  }

  if (options.academicTermId) {
    query.academicTermId = options.academicTermId;
  }

  if (options.grade) {
    query.grade = options.grade;
  }

  return this.find(query)
    .populate("classTeacherId", "userId employeeId")
    .populate("branchId", "name")
    .populate("students.studentId", "userId studentId");
};

// Static method to get class statistics
classSchema.statics.getStatistics = function (branchId) {
  return this.aggregate([
    { $match: { branchId: new mongoose.Types.ObjectId(branchId) } },
    {
      $group: {
        _id: null,
        totalClasses: { $sum: 1 },
        activeClasses: {
          $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] },
        },
        totalCapacity: { $sum: "$capacity" },
        totalEnrolled: {
          $sum: {
            $size: {
              $filter: {
                input: { $ifNull: ["$students", []] },
                cond: { $eq: ["$$this.status", "active"] },
              },
            },
          },
        },
      },
    },
  ]);
};

module.exports = mongoose.model("Class", classSchema);
