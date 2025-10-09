#!/usr/bin/env node

// Migration script to create Student/Teacher documents for existing users
require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");
const Student = require("../models/Student");
const Teacher = require("../models/Teacher");
const Branch = require("../models/Branch");
const { generateId } = require("../utils/helpers");

async function main() {
  try {
    console.log("🚀 Starting user migration to students/teachers...");

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    // Get all branches for prefix configuration
    const branches = await Branch.find({});
    const branchMap = {};
    branches.forEach((branch) => {
      branchMap[branch._id.toString()] = branch;
    });

    // Find all users with student role who don't have a student record
    const studentUsers = await User.find({ roles: "student" });
    console.log(`\n📚 Found ${studentUsers.length} users with student role`);

    let studentsCreated = 0;
    for (const user of studentUsers) {
      // Check if student record already exists
      const existingStudent = await Student.findOne({ userId: user._id });
      if (!existingStudent) {
        const branch = branchMap[user.branchId?.toString()];
        const studentIdPrefix = branch?.configuration?.studentIdPrefix || "STU";

        // Generate unique student ID
        let studentId;
        let attempts = 0;
        do {
          studentId = generateId(studentIdPrefix, 6);
          const existing = await Student.findOne({
            studentId,
            branchId: user.branchId,
          });
          if (!existing) break;
          attempts++;
        } while (attempts < 10);

        // Generate admission number
        const admissionNumber = generateId("ADM", 8);

        try {
          await Student.create({
            userId: user._id,
            branchId: user.branchId,
            studentId,
            admissionNumber,
            enrollmentDate: user.createdAt || new Date(),
            academicStatus: "active",
            personalInfo: {
              firstName: user.firstName,
              lastName: user.lastName,
              email: user.email,
              dateOfBirth: user.profileDetails?.dateOfBirth,
              gender: user.profileDetails?.gender || "not_specified",
              phoneNumber: user.profileDetails?.phoneNumber,
              address: user.profileDetails?.address,
            },
            parentGuardianInfo: {
              fatherName:
                user.profileDetails?.parentGuardianInfo?.fatherName || "",
              motherName:
                user.profileDetails?.parentGuardianInfo?.motherName || "",
              guardianName:
                user.profileDetails?.parentGuardianInfo?.guardianName ||
                "Guardian",
              guardianPhoneNumber:
                user.profileDetails?.parentGuardianInfo?.guardianPhoneNumber ||
                "",
              emergencyContact: {
                name:
                  user.profileDetails?.parentGuardianInfo?.emergencyContact
                    ?.name || "Emergency Contact",
                relationship:
                  user.profileDetails?.parentGuardianInfo?.emergencyContact
                    ?.relationship || "parent",
                phone:
                  user.profileDetails?.parentGuardianInfo?.emergencyContact
                    ?.phone || "0000000000",
                alternatePhone:
                  user.profileDetails?.parentGuardianInfo?.emergencyContact
                    ?.alternatePhone || "",
              },
            },
          });

          studentsCreated++;
          console.log(
            `✅ Created student record for ${user.firstName} ${user.lastName} (${studentId})`
          );
        } catch (error) {
          console.error(
            `❌ Failed to create student record for ${user.firstName} ${user.lastName}:`,
            error.message
          );
        }
      }
    }

    // Find all users with teacher role who don't have a teacher record
    const teacherUsers = await User.find({ roles: "teacher" });
    console.log(`\n👩‍🏫 Found ${teacherUsers.length} users with teacher role`);

    let teachersCreated = 0;
    for (const user of teacherUsers) {
      // Check if teacher record already exists
      const existingTeacher = await Teacher.findOne({ userId: user._id });
      if (!existingTeacher) {
        const branch = branchMap[user.branchId?.toString()];
        const employeeIdPrefix =
          branch?.configuration?.teacherIdPrefix || "TEA";

        // Generate unique employee ID
        let employeeId;
        let attempts = 0;
        do {
          employeeId = generateId(employeeIdPrefix, 6);
          const existing = await Teacher.findOne({
            employeeId,
            branchId: user.branchId,
          });
          if (!existing) break;
          attempts++;
        } while (attempts < 10);

        try {
          await Teacher.create({
            userId: user._id,
            branchId: user.branchId,
            employeeId,
            joiningDate: user.createdAt || new Date(),
            employmentStatus: "active",
            department: "General",
            designation: "Teacher",
            personalInfo: {
              firstName: user.firstName,
              lastName: user.lastName,
              email: user.email,
              dateOfBirth: user.profileDetails?.dateOfBirth,
              gender: user.profileDetails?.gender || "not_specified",
              phoneNumber: user.profileDetails?.phoneNumber,
              address: user.profileDetails?.address,
            },
            qualifications: [],
            experience: user.profileDetails?.experience || 0,
            salary: {
              basicSalary: 0,
              allowances: [],
              deductions: [],
            },
            subjects: [],
            classes: [],
            emergencyContact: {
              name:
                user.profileDetails?.emergencyContact?.name ||
                "Emergency Contact",
              relationship:
                user.profileDetails?.emergencyContact?.relationship || "family",
              phone:
                user.profileDetails?.emergencyContact?.phone || "0000000000",
              alternatePhone:
                user.profileDetails?.emergencyContact?.alternatePhone || "",
            },
          });

          teachersCreated++;
          console.log(
            `✅ Created teacher record for ${user.firstName} ${user.lastName} (${employeeId})`
          );
        } catch (error) {
          console.error(
            `❌ Failed to create teacher record for ${user.firstName} ${user.lastName}:`,
            error.message
          );
        }
      }
    }

    console.log(`\n🎉 Migration completed!`);
    console.log(`📊 Summary:`);
    console.log(`   • Students created: ${studentsCreated}`);
    console.log(`   • Teachers created: ${teachersCreated}`);

    process.exit(0);
  } catch (error) {
    console.error("❌ Migration error:", error);
    process.exit(1);
  }
}

main();
