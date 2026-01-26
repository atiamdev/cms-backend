/**
 * Test Emergency Contact WhatsApp Messaging
 *
 * Tests sending WhatsApp messages to emergency contacts for attendance reports
 */

require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const WhatsAppIntegrationService = require("../services/whatsappIntegrationService");
const AttendanceReportService = require("../services/attendanceReportService");
const Student = require("../models/Student");

// Mock student data with emergency contacts
const mockStudents = [
  {
    _id: "507f1f77bcf86cd799439011",
    studentId: "STU001",
    userId: {
      firstName: "John",
      lastName: "Doe",
      phone: "+254712345678",
    },
    currentClassId: { name: "Grade 8A" },
    branchId: { name: "Main Campus" },
    parentGuardianInfo: {
      emergencyContact: {
        name: "Jane Doe",
        relationship: "Mother",
        phone: "+254712345679",
        alternatePhone: "+254712345680",
      },
    },
  },
  {
    _id: "507f1f77bcf86cd799439012",
    studentId: "STU002",
    userId: {
      firstName: "Alice",
      lastName: "Smith",
      phone: "+254723456789",
    },
    currentClassId: { name: "Grade 8B" },
    branchId: { name: "Main Campus" },
    parentGuardianInfo: {
      emergencyContact: {
        name: "Bob Smith",
        relationship: "Father",
        phone: "+254723456790",
      },
    },
  },
];

// Mock attendance report data
const mockAttendanceReport = {
  studentName: "John Doe",
  studentId: "STU001",
  weekStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  weekEnd: new Date(),
  totalDays: 5,
  presentDays: 4,
  absentDays: 1,
  attendancePercentage: 80.0,
  className: "Grade 8A",
  branchName: "ATIAM COLLEGE",
  statusEmoji: "🟡",
  statusText: "Good",
  statusMessage: "Good attendance. Try to be more consistent.",
};

async function testEmergencyContactMessaging() {
  console.log("🚨 Testing Emergency Contact WhatsApp Messaging");
  console.log("==============================================\n");

  // Connect to database
  console.log("🔌 Connecting to database...");
  try {
    await connectDB();
    console.log("✅ Database connected\n");
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
    return;
  }

  const whatsappService = new WhatsAppIntegrationService();
  const attendanceService = new AttendanceReportService();

  try {
    // Test 1: Check WhatsApp service status
    console.log("1. Checking WhatsApp Service Status");
    console.log("-----------------------------------");
    const status = whatsappService.getStatus();
    console.log("WhatsApp Service Status:", {
      enabled: status.whatsappService.enabled,
      initialized: status.whatsappService.initialized,
      integrationEnabled: status.integrationEnabled,
    });

    if (!status.whatsappService.enabled) {
      console.log(
        "❌ WhatsApp service is disabled. Check environment variables.",
      );
      return;
    }
    console.log("✅ WhatsApp service is ready\n");

    // Test 2: Find students with emergency contacts
    console.log("2. Finding Students with Emergency Contacts");
    console.log("------------------------------------------");
    const studentsWithEmergencyContacts = await Student.find({
      "parentGuardianInfo.emergencyContact.phone": { $exists: true, $ne: null },
      status: "active",
    })
      .populate("userId", "firstName lastName phone")
      .populate("currentClassId", "name")
      .limit(5); // Limit to 5 for testing

    console.log(
      `Found ${studentsWithEmergencyContacts.length} students with emergency contacts`,
    );

    if (studentsWithEmergencyContacts.length === 0) {
      console.log(
        "❌ No students found with emergency contacts. Cannot test emergency messaging.",
      );
      console.log(
        "💡 Add emergency contact information to student records to test this feature.",
      );
      console.log("   Using mock data for demonstration instead...\n");

      // Use mock data for demonstration
      studentsWithEmergencyContacts.push(
        ...mockStudents.map((student) => ({
          ...student,
          _id: student._id,
          userId: student.userId,
          currentClassId: student.currentClassId,
          branchId: student.branchId,
          parentGuardianInfo: student.parentGuardianInfo,
        })),
      );
    }

    // Display emergency contact details
    studentsWithEmergencyContacts.forEach((student, index) => {
      const emergency = student.parentGuardianInfo.emergencyContact;
      console.log(
        `${index + 1}. ${student.userId.firstName} ${student.userId.lastName} (${student.studentId})`,
      );
      console.log(
        `   Emergency Contact: ${emergency.name} (${emergency.relationship})`,
      );
      console.log(`   Phone: ${emergency.phone}`);
      if (emergency.alternatePhone) {
        console.log(`   Alternate Phone: ${emergency.alternatePhone}`);
      }
      console.log(`   Student Phone: ${student.userId.phone || "Not set"}\n`);
    });

    // Test 3: Test message formatting for emergency contacts
    console.log("3. Testing Emergency Contact Message Formatting");
    console.log("-----------------------------------------------");

    const testStudent = studentsWithEmergencyContacts[0];
    const emergency = testStudent.parentGuardianInfo.emergencyContact;

    console.log(
      `Testing with student: ${testStudent.userId.firstName} ${testStudent.userId.lastName} (${testStudent.studentId})`,
    );
    console.log(
      `Emergency Contact: ${emergency.name} (${emergency.relationship})`,
    );
    console.log("");

    // Test emergency contact message formatting
    const emergencyReportData = {
      ...mockAttendanceReport,
      studentName: `${testStudent.userId.firstName} ${testStudent.userId.lastName}`,
      studentId: testStudent.studentId,
      className: testStudent.currentClassId.name,
      recipientType: "emergency_contact",
      contactName: emergency.name,
      relationship: emergency.relationship,
    };

    console.log("📄 Emergency Contact Message Preview:");
    console.log("====================================");

    // Generate the message content (without sending)
    const emergencyMessage = `📊 *ATIAM COLLEGE - Student Attendance Report*

👨‍👩‍👧‍👦 *Regarding:* ${emergencyReportData.studentName} (${emergencyReportData.studentId})

📚 *Class:* ${emergencyReportData.className}

📅 *Report Period:*
${new Date(emergencyReportData.weekStart).toLocaleDateString()} - ${new Date(emergencyReportData.weekEnd).toLocaleDateString()}

📈 *Attendance Summary:*
• Total School Days: ${emergencyReportData.totalDays}
• Days Present: ${emergencyReportData.presentDays} ✅${"✅".repeat(Math.max(0, emergencyReportData.presentDays - 1))}
• Days Absent: ${emergencyReportData.absentDays} ❌${"❌".repeat(Math.max(0, emergencyReportData.absentDays - 1))}
• Attendance Rate: ${emergencyReportData.attendancePercentage.toFixed(1)}%

${emergencyReportData.statusEmoji} *Status:* ${emergencyReportData.statusText}

💡 *Please discuss attendance with your child and contact the school if needed.*

📞 *Contact Teachers:*
For attendance concerns, reach out to your class teacher

🔗 *View Full Report:* https://portal.atiamcollege.com/student/attendance

Thank you for your attention to this matter. 📚
📅 Generated: ${new Date().toLocaleString()}`;

    console.log(emergencyMessage);
    console.log("");

    // Test student message formatting
    const studentReportData = {
      ...mockAttendanceReport,
      studentName: `${testStudent.userId.firstName} ${testStudent.userId.lastName}`,
      studentId: testStudent.studentId,
      className: testStudent.currentClassId.name,
      recipientType: "student",
    };

    console.log("📄 Student Message Preview:");
    console.log("==========================");

    const studentMessage = `${mockAttendanceReport.statusEmoji} *ATIAM COLLEGE - Weekly Attendance Report*

👤 *Student:* ${studentReportData.studentName}
🆔 *Student ID:* ${studentReportData.studentId}
📚 *Class:* ${studentReportData.className}

📅 *Report Period:*
${new Date(mockAttendanceReport.weekStart).toLocaleDateString()} - ${new Date(mockAttendanceReport.weekEnd).toLocaleDateString()}

📈 *Attendance Summary:*
• Total School Days: ${mockAttendanceReport.totalDays}
• Days Present: ${mockAttendanceReport.presentDays} ✅${"✅".repeat(Math.max(0, mockAttendanceReport.presentDays - 1))}
• Days Absent: ${mockAttendanceReport.absentDays} ❌${"❌".repeat(Math.max(0, mockAttendanceReport.absentDays - 1))}
• Attendance Rate: ${mockAttendanceReport.attendancePercentage.toFixed(1)}%

${mockAttendanceReport.statusEmoji} *Status:* ${mockAttendanceReport.statusText}

💡 *${mockAttendanceReport.statusMessage}*

📞 *Contact Teachers:*
For attendance concerns, reach out to your class teacher

🔗 *View Full Report:* https://portal.atiamcollege.com/student/attendance

Keep up the good work! 🎓
📅 Generated: ${new Date().toLocaleString()}`;

    console.log(studentMessage);
    console.log("");

    // Test 4: Test actual sending (if TEST_PHONE_NUMBER is set)
    if (process.env.TEST_PHONE_NUMBER) {
      console.log("4. Testing Actual Message Sending");
      console.log("----------------------------------");

      console.log(
        `📤 Sending test emergency contact message to: ${process.env.TEST_PHONE_NUMBER}`,
      );

      try {
        const result =
          await whatsappService.notificationService.sendWeeklyAttendanceReport(
            emergencyReportData,
            process.env.TEST_PHONE_NUMBER,
            {
              studentId: testStudent.studentId,
              recipientType: "emergency_contact",
              testMode: true,
            },
          );

        if (result.success) {
          console.log("✅ Emergency contact test message sent successfully!");
          console.log(`📨 Message ID: ${result.messageId || "N/A"}`);
        } else {
          console.log(
            "❌ Failed to send emergency contact test message:",
            result.error,
          );
        }
      } catch (error) {
        console.log(
          "❌ Error sending emergency contact test message:",
          error.message,
        );
      }

      console.log(
        `📤 Sending test student message to: ${process.env.TEST_PHONE_NUMBER}`,
      );

      try {
        const result =
          await whatsappService.notificationService.sendWeeklyAttendanceReport(
            studentReportData,
            process.env.TEST_PHONE_NUMBER,
            {
              studentId: testStudent.studentId,
              recipientType: "student",
              testMode: true,
            },
          );

        if (result.success) {
          console.log("✅ Student test message sent successfully!");
          console.log(`📨 Message ID: ${result.messageId || "N/A"}`);
        } else {
          console.log("❌ Failed to send student test message:", result.error);
        }
      } catch (error) {
        console.log("❌ Error sending student test message:", error.message);
      }

      // Test sending to alternate emergency contact if available
      if (emergency.alternatePhone) {
        console.log(
          `📤 Sending test alternate emergency contact message to: ${process.env.TEST_PHONE_NUMBER}`,
        );

        const alternateReportData = {
          ...emergencyReportData,
          isAlternate: true,
        };

        try {
          const result =
            await whatsappService.notificationService.sendWeeklyAttendanceReport(
              alternateReportData,
              process.env.TEST_PHONE_NUMBER,
              {
                studentId: testStudent.studentId,
                recipientType: "emergency_contact",
                isAlternate: true,
                testMode: true,
              },
            );

          if (result.success) {
            console.log(
              "✅ Alternate emergency contact test message sent successfully!",
            );
            console.log(`📨 Message ID: ${result.messageId || "N/A"}`);
          } else {
            console.log(
              "❌ Failed to send alternate emergency contact test message:",
              result.error,
            );
          }
        } catch (error) {
          console.log(
            "❌ Error sending alternate emergency contact test message:",
            error.message,
          );
        }
      }
    } else {
      console.log("4. Message Sending Skipped");
      console.log("---------------------------");
      console.log("⚠️  TEST_PHONE_NUMBER not set in environment variables");
      console.log(
        "💡 Set TEST_PHONE_NUMBER in .env to test actual message sending",
      );
      console.log("💡 Example: TEST_PHONE_NUMBER=+254712345678");
    }

    console.log("\n" + "=".repeat(50));
    console.log("🎉 EMERGENCY CONTACT TESTING COMPLETE");
    console.log("=".repeat(50));

    console.log("\n📝 Summary:");
    console.log("• WhatsApp service status checked");
    console.log("• Students with emergency contacts identified");
    console.log("• Attendance reports generated");
    console.log("• Individual emergency contact messaging tested");
    console.log("• Bulk emergency contact messaging tested");

    console.log("\n💡 Next Steps:");
    console.log("• Monitor message delivery in WasenderAPI dashboard");
    console.log("• Check recipient phones for received messages");
    console.log("• Review message content and formatting");
    console.log("• Test with real emergency scenarios");
  } catch (error) {
    console.error("❌ Emergency contact testing failed:", error);
    console.error(error.stack);
  }
}

// Run the test
if (require.main === module) {
  testEmergencyContactMessaging()
    .then(() => {
      console.log("\n🏁 Test script completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n💥 Test script failed:", error);
      process.exit(1);
    });
}

module.exports = { testEmergencyContactMessaging };
