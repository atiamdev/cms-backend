const mongoose = require("mongoose");
const Course = require("./models/Course");

// MongoDB connection
const connectDB = async () => {
  try {
    await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://localhost:27017/cms",
      {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      }
    );
    console.log("MongoDB Connected...");
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
};

const checkAndFixCourses = async () => {
  try {
    await connectDB();

    // Find all courses
    const courses = await Course.find({});
    console.log(`Found ${courses.length} courses`);

    // Check which courses don't have names
    const coursesWithoutNames = courses.filter((c) => !c.name);
    console.log(`\nCourses without names: ${coursesWithoutNames.length}`);

    if (coursesWithoutNames.length > 0) {
      console.log("\nCourses missing name field:");
      coursesWithoutNames.forEach((course) => {
        console.log(`- ID: ${course._id}`);
        console.log(`  Code: ${course.code || "No code"}`);
        console.log(`  Description: ${course.description || "No description"}`);
        console.log(`  Level: ${course.level || "No level"}`);
      });

      console.log("\n\nTo fix these courses, update them with proper names.");
      console.log(
        "You can run this command in MongoDB shell or use the update script below:\n"
      );

      coursesWithoutNames.forEach((course) => {
        const suggestedName =
          course.code ||
          course.description?.substring(0, 50) ||
          `Course ${course._id}`;
        console.log(
          `db.courses.updateOne({ _id: ObjectId("${course._id}") }, { $set: { name: "${suggestedName}" } })`
        );
      });
    }

    // Show courses that have names
    const coursesWithNames = courses.filter((c) => c.name);
    if (coursesWithNames.length > 0) {
      console.log(`\n\nCourses with names: ${coursesWithNames.length}`);
      coursesWithNames.forEach((course) => {
        console.log(`- ${course.name} (${course._id})`);
      });
    }

    await mongoose.connection.close();
    console.log("\nDatabase connection closed.");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
};

checkAndFixCourses();
