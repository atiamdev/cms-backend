const mongoose = require("mongoose");
const Grade = require("../models/Grade");
const Student = require("../models/Student");
const Course = require("../models/Course");

async function testGradesEndpoint() {
  try {
    await mongoose.connect("mongodb://localhost:27017/atiamCMS");

    // Get a student and course to test with
    const student = await Student.findOne({});
    const course = await Course.findOne({});

    if (!student || !course) {
      console.log("No student or course found");
      return;
    }

    console.log(
      "Testing with student:",
      student._id,
      "and course:",
      course._id,
    );

    // Test the static method directly
    const grades = await Grade.getStudentGradesForCourse(
      student._id,
      course._id,
    );
    console.log("Grades found:", grades.length);

    // Test overall grade calculation
    const overallGrade = await Grade.calculateOverallGrade(
      student._id,
      course._id,
    );
    console.log("Overall grade:", overallGrade);

    console.log("Test completed successfully!");
  } catch (error) {
    console.error("Error in test:", error);
  } finally {
    process.exit(0);
  }
}

testGradesEndpoint();
