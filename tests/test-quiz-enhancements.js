const axios = require("axios");
const moment = require("moment-timezone");
const mongoose = require("mongoose");
const Course = require("../models/Course");
const Branch = require("../models/Branch");
require("dotenv").config();

// Test configuration
const BASE_URL = "http://localhost:5000/api";
const TEST_CONFIG = {
  // You'll need to replace these with actual values
  authToken: "YOUR_AUTH_TOKEN_HERE",
  courseId: "YOUR_COURSE_ID_HERE",
  branchId: "YOUR_BRANCH_ID_HERE",
};

// Create sample courses with materials
async function createSampleCourses() {
  try {
    console.log("🔄 Connecting to database...");
    await mongoose.connect(
      process.env.MONGO_URI || "mongodb://localhost:27017/atiam-cms-dev",
    );

    // Get first branch
    const branch = await Branch.findOne();
    if (!branch) {
      console.log("❌ No branch found. Please create a branch first.");
      return;
    }

    console.log("📚 Creating sample courses with materials...");

    const sampleCourses = [
      {
        branchId: branch._id,
        code: "CS101",
        name: "Introduction to Computer Science",
        description: "Basic concepts of computer science and programming",
        category: "core",
        level: "Begginner",
        credits: 3,
        resources: {
          materials: [
            {
              title: "Course Syllabus",
              description: "Complete course syllabus and learning objectives",
              type: "document",
              fileUrl: "https://example.com/cs101-syllabus.pdf",
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            {
              title: "Programming Basics Video",
              description: "Introduction video to programming concepts",
              type: "video",
              fileUrl: "https://example.com/cs101-intro-video.mp4",
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            {
              title: "Getting Started Guide",
              description:
                "Step-by-step guide to set up your development environment",
              type: "text",
              content:
                "Welcome to CS101! This guide will help you set up your development environment...\n\n1. Install Node.js\n2. Install VS Code\n3. Create your first 'Hello World' program",
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        },
      },
      {
        branchId: branch._id,
        code: "MATH201",
        name: "Calculus I",
        description:
          "Fundamental concepts of differential and integral calculus",
        category: "core",
        level: "Intermediate",
        credits: 4,
        resources: {
          materials: [
            {
              title: "Calculus Textbook",
              description: "Complete calculus textbook with exercises",
              type: "document",
              fileUrl: "https://example.com/calculus-textbook.pdf",
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            {
              title: "Derivative Rules Summary",
              description: "Quick reference guide for derivative rules",
              type: "document",
              fileUrl: "https://example.com/derivative-rules.pdf",
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        },
      },
    ];

    for (const courseData of sampleCourses) {
      const course = new Course(courseData);
      await course.save();
      console.log(`✅ Created course: ${course.name} (${course.code})`);
    }

    console.log("🎉 Sample courses created successfully!");
    console.log("📖 You can now test the student course materials feature.");

    await mongoose.disconnect();
  } catch (error) {
    console.error("❌ Error creating sample courses:", error);
  }
}

// Run if called directly
if (require.main === module) {
  createSampleCourses();
}

module.exports = { createSampleCourses };

class QuizEnhancementTester {
  constructor(config) {
    this.baseURL = BASE_URL;
    this.headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.authToken}`,
    };
    this.courseId = config.courseId;
    this.testResults = [];
  }

  log(message, status = "INFO") {
    const timestamp = moment().format("YYYY-MM-DD HH:mm:ss");
    console.log(`[${timestamp}] [${status}] ${message}`);
    this.testResults.push({ timestamp, status, message });
  }

  async runAllTests() {
    this.log("🚀 Starting Quiz Enhancement Tests");

    try {
      // Test 1: Create a scheduled quiz
      const quiz = await this.testQuizCreation();

      if (quiz) {
        // Test 2: Add questions to the quiz
        await this.testQuestionAddition(quiz._id);

        // Test 3: Update quiz schedule
        await this.testScheduleUpdate(quiz._id);

        // Test 4: Test quiz availability
        await this.testQuizAvailability(quiz._id);
      }

      this.log("✅ All tests completed");
      this.printTestSummary();
    } catch (error) {
      this.log(`❌ Test suite failed: ${error.message}`, "ERROR");
    }
  }

  async testQuizCreation() {
    this.log("📝 Testing quiz creation with scheduling...");

    const quizData = {
      title: `Test Quiz - ${new Date().toISOString()}`,
      description: "Automated test quiz for enhanced features",
      courseId: this.courseId,
      schedule: {
        availableFrom: moment().add(1, "hour").toISOString(),
        availableUntil: moment().add(3, "hours").toISOString(),
        dueDate: moment().add(2, "hours").toISOString(),
      },
      timeLimit: 60,
      attempts: 2,
      passingScore: 70,
      questions: [
        {
          type: "multiple_choice",
          question: "What is 2 + 2?",
          options: ["3", "4", "5", "6"],
          correctAnswer: "4",
          points: 1,
          difficulty: "easy",
        },
      ],
      settings: {
        randomizeQuestions: true,
        oneQuestionAtATime: false,
        preventBacktracking: false,
        showProgressBar: true,
      },
    };

    try {
      const response = await axios.post(
        `${this.baseURL}/elearning/quizzes`,
        quizData,
        { headers: this.headers },
      );

      if (response.data.success) {
        this.log("✅ Quiz created successfully", "SUCCESS");
        this.log(`   Quiz ID: ${response.data.data._id}`);
        this.log(`   Available: ${response.data.data.isAvailable}`);
        return response.data.data;
      } else {
        this.log("❌ Quiz creation failed", "ERROR");
        return null;
      }
    } catch (error) {
      this.log(
        `❌ Quiz creation error: ${
          error.response?.data?.message || error.message
        }`,
        "ERROR",
      );
      return null;
    }
  }

  async testQuestionAddition(quizId) {
    this.log("❓ Testing bulk question addition...");

    const questions = [
      {
        type: "short_answer",
        question: "What does API stand for?",
        correctAnswers: [
          "Application Programming Interface",
          "application programming interface",
        ],
        points: 2,
        caseSensitive: false,
      },
      {
        type: "true_false",
        question: "JavaScript is a compiled language",
        correctAnswer: "False",
        points: 1,
      },
      {
        type: "multiple_select",
        question: "Which are programming languages?",
        options: ["Python", "Java", "HTML", "JavaScript"],
        correctAnswers: ["Python", "Java", "JavaScript"],
        points: 3,
      },
    ];

    try {
      const response = await axios.post(
        `${this.baseURL}/elearning/quizzes/${quizId}/questions`,
        { questions },
        { headers: this.headers },
      );

      if (response.data.success) {
        this.log("✅ Questions added successfully", "SUCCESS");
        this.log(`   Added: ${questions.length} questions`);
        return true;
      } else {
        this.log("❌ Question addition failed", "ERROR");
        return false;
      }
    } catch (error) {
      this.log(
        `❌ Question addition error: ${
          error.response?.data?.message || error.message
        }`,
        "ERROR",
      );
      return false;
    }
  }

  async testScheduleUpdate(quizId) {
    this.log("⏰ Testing schedule update...");

    const newSchedule = {
      schedule: {
        availableFrom: moment().add(2, "hours").toISOString(),
        availableUntil: moment().add(4, "hours").toISOString(),
        dueDate: moment().add(3, "hours").toISOString(),
      },
    };

    try {
      const response = await axios.put(
        `${this.baseURL}/elearning/quizzes/${quizId}/schedule`,
        newSchedule,
        { headers: this.headers },
      );

      if (response.data.success) {
        this.log("✅ Schedule updated successfully", "SUCCESS");
        this.log(`   New start: ${response.data.data.schedule.availableFrom}`);
        return true;
      } else {
        this.log("❌ Schedule update failed", "ERROR");
        return false;
      }
    } catch (error) {
      this.log(
        `❌ Schedule update error: ${
          error.response?.data?.message || error.message
        }`,
        "ERROR",
      );
      return false;
    }
  }

  async testQuizAvailability(quizId) {
    this.log("🔍 Testing quiz availability check...");

    try {
      const response = await axios.get(
        `${this.baseURL}/elearning/quizzes/${quizId}`,
        { headers: this.headers },
      );

      if (response.data.success) {
        const quiz = response.data.data;
        this.log("✅ Quiz availability checked", "SUCCESS");
        this.log(`   Currently available: ${quiz.isAvailable || "false"}`);
        this.log(
          `   Time until start: ${quiz.timeUntilStart?.formatted || "N/A"}`,
        );
        return true;
      } else {
        this.log("❌ Availability check failed", "ERROR");
        return false;
      }
    } catch (error) {
      this.log(
        `❌ Availability check error: ${
          error.response?.data?.message || error.message
        }`,
        "ERROR",
      );
      return false;
    }
  }

  printTestSummary() {
    this.log("\n📊 Test Summary:");
    const successCount = this.testResults.filter(
      (r) => r.status === "SUCCESS",
    ).length;
    const errorCount = this.testResults.filter(
      (r) => r.status === "ERROR",
    ).length;

    this.log(`   ✅ Successful tests: ${successCount}`);
    this.log(`   ❌ Failed tests: ${errorCount}`);
    this.log(`   📋 Total tests: ${this.testResults.length}`);
  }
}

// Manual test function for demonstration
async function runQuizTests() {
  console.log("🧪 Quiz Enhancement Testing Suite");
  console.log("=====================================\n");

  // Check if configuration is set
  if (TEST_CONFIG.authToken === "YOUR_AUTH_TOKEN_HERE") {
    console.log("⚠️  Please update TEST_CONFIG with actual values:");
    console.log("   - authToken: Get from login API");
    console.log("   - courseId: Get from courses API");
    console.log("   - branchId: Get from user profile\n");

    console.log("🔧 Example configuration setup:");
    console.log(`
    const TEST_CONFIG = {
      authToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      courseId: '64a1b2c3d4e5f6789012345',
      branchId: '64a1b2c3d4e5f6789012346'
    };
    `);
    return;
  }

  const tester = new QuizEnhancementTester(TEST_CONFIG);
  await tester.runAllTests();
}

// Export for use in other files
module.exports = { QuizEnhancementTester };

// Run if called directly
if (require.main === module) {
  runQuizTests().catch(console.error);
}
