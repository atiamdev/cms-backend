const mongoose = require("mongoose");
const Department = require("./models/Department");

async function createTestDepartments() {
  try {
    await mongoose.connect("mongodb://localhost:27017/atiam-cms-dev", {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log("Connected to database");

    const branchId = "688a1618d2efc2d48aad4cc7"; // The branch ID from the logs

    const departments = [
      {
        name: "Computer Science",
        code: "CS",
        description:
          "Department of Computer Science and Information Technology",
        branchId: branchId,
        isActive: true,
      },
      {
        name: "Business Administration",
        code: "BA",
        description: "Department of Business Administration and Management",
        branchId: branchId,
        isActive: true,
      },
      {
        name: "Engineering",
        code: "ENG",
        description: "Department of Engineering and Technology",
        branchId: branchId,
        isActive: true,
      },
      {
        name: "Mathematics",
        code: "MATH",
        description: "Department of Mathematics and Statistics",
        branchId: branchId,
        isActive: true,
      },
      {
        name: "English Literature",
        code: "ENG_LIT",
        description: "Department of English Literature and Language",
        branchId: branchId,
        isActive: true,
      },
    ];

    for (const deptData of departments) {
      const existingDept = await Department.findOne({
        $or: [{ name: deptData.name }, { code: deptData.code }],
      });

      if (!existingDept) {
        const department = new Department(deptData);
        await department.save();
        console.log(`Created department: ${deptData.name}`);
      } else {
        console.log(`Department already exists: ${deptData.name}`);
      }
    }

    console.log("Test departments creation completed");

    // List all departments
    const allDepts = await Department.find({ branchId: branchId });
    console.log(`Total departments for branch ${branchId}:`, allDepts.length);
    allDepts.forEach((dept) => {
      console.log(`- ${dept.name} (${dept.code})`);
    });
  } catch (error) {
    console.error("Error creating test departments:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from database");
  }
}

createTestDepartments();
