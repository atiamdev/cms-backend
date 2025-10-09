const mongoose = require("mongoose");

const examSchema = new mongoose.Schema(
  {
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: [true, "Branch reference is required"],
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: [true, "Course reference is required"],
    },
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
      required: [true, "Teacher reference is required"],
    },
    title: {
      type: String,
      required: [true, "Exam title is required"],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      enum: ["physical", "online"],
      required: [true, "Exam type is required"],
    },
    // For online exams - reference to quiz
    quizId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Quiz",
      required: function () {
        return this.type === "online";
      },
    },
    // Schedule information
    schedule: {
      date: {
        type: Date,
        required: [true, "Exam date is required"],
      },
      startTime: {
        type: String, // HH:MM format
        required: [true, "Start time is required"],
      },
      endTime: {
        type: String, // HH:MM format
        required: [true, "End time is required"],
      },
      duration: {
        type: Number, // in minutes
        required: [true, "Duration is required"],
        min: 1,
      },
    },
    // Venue for physical exams
    venue: {
      type: String,
      required: function () {
        return this.type === "physical";
      },
    },
    // Maximum marks for the exam
    maxMarks: {
      type: Number,
      required: [true, "Maximum marks is required"],
      min: 1,
    },
    // Weightage of this exam in overall course grade (percentage)
    weightage: {
      type: Number,
      required: [true, "Exam weightage is required"],
      min: 0,
      max: 100,
    },
    status: {
      type: String,
      enum: ["scheduled", "ongoing", "completed", "cancelled"],
      default: "scheduled",
    },
    instructions: {
      type: String,
      trim: true,
    },
    // For physical exams - deadline for grade submission
    gradeSubmissionDeadline: {
      type: Date,
      required: function () {
        return this.type === "physical";
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
examSchema.index({ courseId: 1, "schedule.date": 1 });
examSchema.index({ teacherId: 1 });
examSchema.index({ branchId: 1 });

// Virtual for checking if exam is active
examSchema.virtual("isActive").get(function () {
  const now = new Date();
  const examDate = new Date(this.schedule?.date);
  const startTime = this.schedule?.startTime;
  const endTime = this.schedule?.endTime;

  if (!startTime || !endTime) {
    return false; // Cannot determine if active without time info
  }

  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);

  const startDateTime = new Date(examDate);
  startDateTime.setHours(startHour, startMinute, 0, 0);

  const endDateTime = new Date(examDate);
  endDateTime.setHours(endHour, endMinute, 0, 0);

  return now >= startDateTime && now <= endDateTime;
});

// Static method to get exams for a course
examSchema.statics.getExamsForCourse = function (courseId) {
  return this.find({ courseId }).populate("teacherId", "name").sort({
    "schedule.date": 1,
  });
};

// Static method to get exams for a teacher
examSchema.statics.getExamsForTeacher = function (teacherId) {
  return this.find({ teacherId }).populate("courseId", "name code").sort({
    "schedule.date": -1,
  });
};

module.exports = mongoose.model("Exam", examSchema);
