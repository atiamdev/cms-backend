const mongoose = require("mongoose");
const Enrollment = require("./models/elearning/Enrollment");
const ECourse = require("./models/elearning/ECourse");

async function cleanupOrphanedEnrollments() {
  try {
    console.log("Starting cleanup of orphaned enrollments...");

    // Find all enrollments
    const allEnrollments = await Enrollment.find({});
    console.log(`Found ${allEnrollments.length} total enrollments`);

    // Find enrollments with null or invalid courseId
    const orphanedEnrollments = allEnrollments.filter(
      (enrollment) => !enrollment.courseId
    );

    if (orphanedEnrollments.length === 0) {
      console.log("No orphaned enrollments found.");
      return;
    }

    console.log(`Found ${orphanedEnrollments.length} orphaned enrollments`);

    // Get valid course IDs
    const validCourses = await ECourse.find({}, "_id");
    const validCourseIds = new Set(
      validCourses.map((course) => course._id.toString())
    );

    // Find enrollments with courseId that doesn't exist in courses
    const invalidEnrollments = allEnrollments.filter(
      (enrollment) =>
        enrollment.courseId &&
        !validCourseIds.has(enrollment.courseId.toString())
    );

    console.log(
      `Found ${invalidEnrollments.length} enrollments with invalid course references`
    );

    const allToDelete = [...orphanedEnrollments, ...invalidEnrollments];

    if (allToDelete.length > 0) {
      const deleteResult = await Enrollment.deleteMany({
        _id: { $in: allToDelete.map((e) => e._id) },
      });

      console.log(
        `Deleted ${deleteResult.deletedCount} orphaned/invalid enrollments`
      );
    }

    console.log("Cleanup completed successfully");
  } catch (error) {
    console.error("Error during cleanup:", error);
  }
}

// Run cleanup if this script is executed directly
if (require.main === module) {
  // Connect to database (you'll need to adjust the connection string)
  mongoose
    .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/cms", {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    })
    .then(() => {
      console.log("Connected to database");
      return cleanupOrphanedEnrollments();
    })
    .then(() => {
      console.log("Cleanup script completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Cleanup script failed:", error);
      process.exit(1);
    });
}

module.exports = { cleanupOrphanedEnrollments };
