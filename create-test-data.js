const mongoose = require("mongoose");
const {
  ECourse,
  Enrollment,
  Rating,
  Student,
  User,
  Branch,
} = require("../models/elearning");
const UserModel = require("../models/User");

async function createTestData() {
  try {
    await mongoose.connect("mongodb://localhost:27017/cms", {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log("Connected to database");

    // Get or create a test branch
    let branch = await Branch.findOne();
    if (!branch) {
      branch = await Branch.create({
        name: "Test Branch",
        code: "TEST001",
        address: "Test Address",
        phone: "1234567890",
        email: "test@branch.com",
      });
      console.log("Created test branch");
    }

    // Get or create a test user
    let user = await UserModel.findOne({ email: "teststudent@example.com" });
    if (!user) {
      user = await UserModel.create({
        firstName: "Test",
        lastName: "Student",
        email: "teststudent@example.com",
        password: "$2a$10$hashedpassword", // dummy hash
        role: "student",
        branchId: branch._id,
      });
      console.log("Created test user");
    }

    // Get or create a test student
    let student = await Student.findOne({ userId: user._id });
    if (!student) {
      student = await Student.create({
        userId: user._id,
        branchId: branch._id,
        enrollmentNumber: "TEST001",
        dateOfBirth: new Date("2000-01-01"),
        gender: "male",
        phone: "1234567890",
        address: "Test Address",
      });
      console.log("Created test student");
    }

    // Create test courses
    const courses = [
      {
        title: "Introduction to JavaScript",
        description: "Learn the basics of JavaScript programming",
        instructor: "John Doe",
        duration: 40,
        price: 99.99,
        level: "beginner",
        category: "programming",
        branchId: branch._id,
        status: "published",
        tags: ["javascript", "programming", "web development"],
      },
      {
        title: "Advanced React Development",
        description: "Master advanced React concepts and patterns",
        instructor: "Jane Smith",
        duration: 60,
        price: 149.99,
        level: "advanced",
        category: "programming",
        branchId: branch._id,
        status: "published",
        tags: ["react", "javascript", "frontend"],
      },
      {
        title: "Python for Data Science",
        description: "Learn Python programming for data analysis",
        instructor: "Bob Johnson",
        duration: 50,
        price: 129.99,
        level: "intermediate",
        category: "data science",
        branchId: branch._id,
        status: "published",
        tags: ["python", "data science", "machine learning"],
      },
    ];

    const createdCourses = [];
    for (const courseData of courses) {
      let course = await ECourse.findOne({ title: courseData.title });
      if (!course) {
        course = await ECourse.create(courseData);
        console.log(`Created course: ${course.title}`);
      }
      createdCourses.push(course);
    }

    // Create enrollments
    for (const course of createdCourses) {
      let enrollment = await Enrollment.findOne({
        studentId: student._id,
        courseId: course._id,
      });

      if (!enrollment) {
        enrollment = await Enrollment.create({
          studentId: student._id,
          courseId: course._id,
          branchId: branch._id,
          status: "active",
          enrollmentType: "self",
        });
        console.log(`Created enrollment for: ${course.title}`);
      }
    }

    // Create ratings
    const ratings = [
      {
        courseId: createdCourses[0]._id,
        userId: user._id,
        rating: 5,
        review: "Excellent course! Very comprehensive and well-structured.",
        isVerified: true,
      },
      {
        courseId: createdCourses[0]._id,
        userId: user._id, // Same user rating again to test update
        rating: 4,
        review: "Great course, but could use more practical examples.",
        isVerified: true,
      },
      {
        courseId: createdCourses[1]._id,
        userId: user._id,
        rating: 5,
        review: "Advanced topics covered perfectly. Highly recommended!",
        isVerified: true,
      },
      {
        courseId: createdCourses[2]._id,
        userId: user._id,
        rating: 4,
        review: "Good introduction to data science with Python.",
        isVerified: true,
      },
    ];

    for (const ratingData of ratings) {
      // Check if rating already exists
      let existingRating = await Rating.findOne({
        courseId: ratingData.courseId,
        userId: ratingData.userId,
      });

      if (existingRating) {
        existingRating.rating = ratingData.rating;
        existingRating.review = ratingData.review;
        existingRating.isVerified = ratingData.isVerified;
        await existingRating.save();
        console.log(
          `Updated rating for course: ${await ECourse.findById(
            ratingData.courseId
          ).then((c) => c.title)}`
        );
      } else {
        await Rating.create(ratingData);
        console.log(
          `Created rating for course: ${await ECourse.findById(
            ratingData.courseId
          ).then((c) => c.title)}`
        );
      }
    }

    console.log("\n=== TEST DATA CREATION COMPLETE ===");
    console.log("You can now test the rating system in the frontend.");

    await mongoose.disconnect();
  } catch (error) {
    console.error("Error creating test data:", error);
  }
}

createTestData();
