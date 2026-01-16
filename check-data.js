const mongoose = require("mongoose");
const Student = require("./models/Student");
const QuizAttempt = require("./models/elearning/QuizAttempt");

async function checkData() {
  try {
    await mongoose.connect("mongodb://localhost:27017/atiamCMS");

    const students = await Student.find({}, "_id userId");
    console.log(
      "Students:",
      students.map((s) => ({ id: s._id, userId: s.userId }))
    );

    const attempts = await QuizAttempt.find({}, "studentId submittedAt").limit(
      5
    );
    console.log(
      "Sample attempts:",
      attempts.map((a) => ({
        id: a._id,
        studentId: a.studentId,
        submitted: !!a.submittedAt,
      }))
    );
  } catch (error) {
    console.error("Error:", error);
  } finally {
    process.exit(0);
  }
}

checkData();
