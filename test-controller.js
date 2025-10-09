const mongoose = require("mongoose");
const Grade = require("./models/Grade");
const Student = require("./models/Student");
const Course = require("./models/Course");

async function testControllerMethod() {
  try {
    await mongoose.connect("mongodb://localhost:27017/atiamCMS");

    // Get a student
    const student = await Student.findOne({});
    if (!student) {
      console.log("No student found");
      return;
    }

    // Get courses the student is enrolled in
    const courseIds = student.courses || [];
    console.log("Student courses:", courseIds);

    if (courseIds.length === 0) {
      console.log("Student has no courses");
      return;
    }

    // Test the controller logic for the first course
    const courseId = courseIds[0];
    console.log("Testing course:", courseId);

    // Verify student is enrolled
    const isEnrolled = courseIds.some(
      (course) => course.toString() === courseId.toString()
    );
    console.log("Student enrolled:", isEnrolled);

    // Get grades
    const grades = await Grade.getStudentGradesForCourse(student._id, courseId);
    console.log("Grades retrieved:", grades.length);

    // Calculate overall grade
    const overallGrade = await Grade.calculateOverallGrade(
      student._id,
      courseId
    );
    console.log("Overall grade:", overallGrade);

    // Get course info
    const course = await Course.findById(courseId).select("name code");
    console.log("Course info:", course);

    console.log("Controller method test completed successfully!");
  } catch (error) {
    console.error("Error in controller test:", error);
  } finally {
    process.exit(0);
  }
}

testControllerMethod();
