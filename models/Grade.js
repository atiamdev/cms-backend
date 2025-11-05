const mongoose = require("mongoose");

const gradeSchema = new mongoose.Schema(
  {
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: [true, "Branch reference is required"],
    },
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Exam",
      required: [true, "Exam reference is required"],
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: [true, "Student reference is required"],
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: [true, "Course reference is required"],
    },
    // Marks obtained
    marks: {
      type: Number,
      required: [true, "Marks is required"],
      min: 0,
    },
    // Maximum marks for this exam (denormalized for easy calculation)
    maxMarks: {
      type: Number,
      required: [true, "Maximum marks is required"],
      min: 1,
    },
    // Percentage score
    percentage: {
      type: Number,
      min: 0,
      max: 100,
    },
    // Grade letter based on percentage
    grade: {
      type: String,
      enum: ["A", "B", "C", "D", "F"],
      required: [true, "Grade is required"],
    },
    // Remarks/comments
    remarks: {
      type: String,
      trim: true,
    },
    // For online exams - reference to quiz attempt
    quizAttemptId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "QuizAttempt",
    },
    // Status
    status: {
      type: String,
      enum: ["pending", "submitted", "published"],
      default: "submitted",
    },
    // Submitted by (teacher ID for manual entry, system for auto-grading)
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
gradeSchema.index({ examId: 1, studentId: 1 }, { unique: true });
gradeSchema.index({ studentId: 1, courseId: 1 });
gradeSchema.index({ courseId: 1 });

// Pre-save middleware to calculate percentage and grade
gradeSchema.pre("save", function (next) {
  // Calculate percentage
  this.percentage = (this.marks / this.maxMarks) * 100;

  // Determine grade based on percentage
  if (this.percentage >= 75) {
    this.grade = "Distinction";
  } else if (this.percentage >= 60) {
    this.grade = "Credit";
  } else if (this.percentage >= 40) {
    this.grade = "Pass";
  } else {
    this.grade = "Fail";
  }

  next();
});

// Virtual for GPA points (optional - for future use)
gradeSchema.virtual("gpaPoints").get(function () {
  switch (this.grade) {
    case "A":
      return 4.0;
    case "B":
      return 3.0;
    case "C":
      return 2.0;
    case "D":
      return 1.0;
    case "F":
      return 0.0;
    default:
      return 0.0;
  }
});

// Static method to get grades for a student in a course
gradeSchema.statics.getStudentGradesForCourse = function (studentId, courseId) {
  return this.find({ studentId, courseId })
    .populate("examId", "title type schedule weightage")
    .sort({ "examId.schedule.date": 1 });
};

// Indexes
gradeSchema.index({ examId: 1, studentId: 1 }, { unique: true });
gradeSchema.index({ studentId: 1, courseId: 1 });
gradeSchema.index({ courseId: 1 });

// Virtual for GPA points (optional - for future use)
gradeSchema.virtual("gpaPoints").get(function () {
  switch (this.grade) {
    case "A":
      return 4.0;
    case "B":
      return 3.0;
    case "C":
      return 2.0;
    case "D":
      return 1.0;
    case "F":
      return 0.0;
    default:
      return 0.0;
  }
});

// Static method to get grades for a student in a course
gradeSchema.statics.getStudentGradesForCourse = function (studentId, courseId) {
  return this.find({ studentId, courseId })
    .populate("examId", "title type schedule weightage")
    .sort({ "examId.schedule.date": 1 });
};

// Static method to get all grades for an exam
gradeSchema.statics.getExamGrades = function (examId) {
  return this.find({ examId })
    .populate({
      path: "studentId",
      select: "admissionNumber userId",
      populate: {
        path: "userId",
        select: "firstName lastName",
        model: "User",
      },
    })
    .sort({ "studentId.admissionNumber": 1 });
};

// Static method to calculate overall course grade for a student
gradeSchema.statics.calculateOverallGrade = async function (
  studentId,
  courseId
) {
  const grades = await this.find({ studentId, courseId }).populate(
    "examId",
    "weightage"
  );

  if (grades.length === 0) {
    return null;
  }

  let totalWeightedScore = 0;
  let totalWeightage = 0;

  grades.forEach((grade) => {
    const weightage = grade.examId.weightage || 0;
    totalWeightedScore += (grade.percentage * weightage) / 100;
    totalWeightage += weightage;
  });

  if (totalWeightage === 0) {
    return null;
  }

  const overallPercentage = (totalWeightedScore / totalWeightage) * 100;

  let overallGrade;
  if (overallPercentage >= 70) {
    overallGrade = "A";
  } else if (overallPercentage >= 60) {
    overallGrade = "B";
  } else if (overallPercentage >= 50) {
    overallGrade = "C";
  } else if (overallPercentage >= 40) {
    overallGrade = "D";
  } else {
    overallGrade = "F";
  }

  return {
    overallPercentage: Math.round(overallPercentage * 100) / 100,
    overallGrade,
    examCount: grades.length,
  };
};

module.exports = mongoose.model("Grade", gradeSchema);

// Static method to calculate overall course grade for a student
gradeSchema.statics.calculateOverallGrade = async function (
  studentId,
  courseId
) {
  const grades = await this.find({ studentId, courseId }).populate(
    "examId",
    "weightage"
  );

  if (grades.length === 0) {
    return null;
  }

  let totalWeightedScore = 0;
  let totalWeightage = 0;

  grades.forEach((grade) => {
    const weightage = grade.examId.weightage || 0;
    totalWeightedScore += (grade.percentage * weightage) / 100;
    totalWeightage += weightage;
  });

  if (totalWeightage === 0) {
    return null;
  }

  const overallPercentage = (totalWeightedScore / totalWeightage) * 100;

  let overallGrade;
  if (overallPercentage >= 70) {
    overallGrade = "A";
  } else if (overallPercentage >= 60) {
    overallGrade = "B";
  } else if (overallPercentage >= 50) {
    overallGrade = "C";
  } else if (overallPercentage >= 40) {
    overallGrade = "D";
  } else {
    overallGrade = "F";
  }

  return {
    overallPercentage: Math.round(overallPercentage * 100) / 100,
    overallGrade,
    examCount: grades.length,
  };
};

module.exports = mongoose.model("Grade", gradeSchema);
