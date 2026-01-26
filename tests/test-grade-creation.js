const mongoose = require("mongoose");
const QuizAttempt = require("./mo        exam = await Exam.create({
          title: quiz.title,
          courseId: quiz.courseId,
          branchId: quiz.branchId || student.branchId,
          type: 'online',
          quizId: quiz._id,
          maxMarks: maxMarks,
          schedule: {
            date: new Date(),
            startTime: '00:00',
            endTime: '23:59',
            duration: quiz.timeLimit || 60,
          },
          status: 'completed',
          createdBy: quiz.createdBy,
          weightage: 100, // Required field
          teacherId: quiz.createdBy, // Required field
        });uizAttempt");
const Exam = require("../models/Exam");
const Grade = require("../models/Grade");
const Student = require("../models/Student");
const Quiz = require("../models/elearning/Quiz");

async function createGradesForExistingAttempts() {
  try {
    await mongoose.connect("mongodb://localhost:27017/atiamCMS", {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log("Creating grades for existing quiz attempts...");

    // Get all submitted attempts that don't have grades yet
    const attempts = await QuizAttempt.find({
      submittedAt: { $exists: true },
      // Check if grade doesn't exist by joining with grades
    }).populate("quizId");

    console.log(`Found ${attempts.length} submitted quiz attempts`);

    let gradesCreated = 0;

    for (const attempt of attempts) {
      try {
        // Get student - the attempt.studentId might be userId, not studentId
        let student = await Student.findById(attempt.studentId);

        // If not found by _id, try finding by userId
        if (!student) {
          student = await Student.findOne({ userId: attempt.studentId });
        }

        if (!student) {
          console.log(
            `Student not found for attempt ${attempt._id} (tried both studentId and userId)`
          );
          continue;
        }

        // Get quiz data
        let quiz = attempt.quizId;
        if (
          typeof quiz === "string" ||
          quiz instanceof mongoose.Types.ObjectId
        ) {
          quiz = await Quiz.findById(attempt.quizId);
        }

        if (!quiz) {
          console.log(`Quiz not found for attempt ${attempt._id}`);
          continue;
        }

        // Check if exam exists
        let exam = await Exam.findOne({
          quizId: quiz._id,
          type: "online",
          status: { $in: ["scheduled", "ongoing", "completed"] },
        });

        // If no exam exists, create virtual exam
        if (!exam) {
          const maxMarks =
            quiz.questions?.reduce((total, q) => total + (q.points || 1), 0) ||
            attempt.totalPossible ||
            10;

          exam = await Exam.create({
            title: quiz.title,
            courseId: quiz.courseId,
            branchId: quiz.branchId || student.branchId,
            type: "online",
            quizId: quiz._id,
            maxMarks: maxMarks,
            schedule: {
              date: new Date(),
              startTime: "00:00",
              endTime: "23:59",
              duration: quiz.timeLimit || 60,
            },
            status: "completed",
            createdBy: quiz.createdBy,
            weightage: 100, // Required field
            teacherId: quiz.createdBy, // Required field
          });

          console.log(`Created virtual exam for quiz: ${quiz.title}`);
        }

        // Check if grade already exists
        const existingGrade = await Grade.findOne({
          examId: exam._id,
          studentId: student._id, // Use actual student._id
        });

        if (!existingGrade) {
          const gradeData = {
            branchId: exam.branchId,
            examId: exam._id,
            studentId: student._id, // Use actual student._id
            courseId: exam.courseId,
            marks: attempt.totalScore,
            maxMarks: exam.maxMarks,
            percentage: attempt.percentageScore,
            grade:
              attempt.percentageScore >= 80
                ? "Distinction"
                : attempt.percentageScore >= 70
                ? "Credit"
                : attempt.percentageScore >= 60
                ? "Pass"
                : "Fail",
            quizAttemptId: attempt._id,
            submittedBy: null,
          };

          await Grade.create(gradeData);
          gradesCreated++;
          console.log(
            `Created grade for attempt ${attempt._id}: ${attempt.totalScore}/${exam.maxMarks} (${attempt.percentageScore}%)`
          );
        } else {
          console.log(`Grade already exists for attempt ${attempt._id}`);
        }
      } catch (error) {
        console.error(
          `Error processing attempt ${attempt._id}:`,
          error.message
        );
      }
    }

    console.log(`\nCompleted! Created ${gradesCreated} grades.`);
  } catch (error) {
    console.error("Error in script:", error);
  } finally {
    process.exit(0);
  }
}

createGradesForExistingAttempts();
