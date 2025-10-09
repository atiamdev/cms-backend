const mongoose = require("mongoose");
const Exam = require("./models/Exam");

async function checkExams() {
  try {
    await mongoose.connect("mongodb://localhost:27017/atiamCMS");

    const exams = await Exam.find({}).select(
      "title teacherId weightage schedule"
    );
    console.log("Total exams:", exams.length);

    const invalidExams = exams.filter(
      (exam) =>
        !exam.teacherId ||
        exam.weightage === undefined ||
        exam.weightage === null ||
        !exam.schedule?.startTime
    );
    console.log("Invalid exams:", invalidExams.length);

    invalidExams.forEach((exam) => {
      console.log({
        id: exam._id,
        title: exam.title,
        teacherId: exam.teacherId,
        weightage: exam.weightage,
        schedule: exam.schedule,
      });
    });
  } catch (error) {
    console.error("Error:", error);
  } finally {
    process.exit(0);
  }
}

checkExams();
