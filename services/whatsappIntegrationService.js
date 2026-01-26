/**
 * WhatsApp Integration Service
 *
 * Integrates WhatsApp notifications with existing CMS systems:
 * - Payment receipts
 * - Fee invoices
 * - Attendance reports
 * - Emergency notifications
 */

const WhatsAppNotificationService = require("./whatsappNotificationService");
const Student = require("../models/Student");
const Payment = require("../models/Payment");
const Fee = require("../models/Fee");
const Attendance = require("../models/Attendance");

class WhatsAppIntegrationService {
  constructor() {
    this.notificationService = new WhatsAppNotificationService();
  }

  /**
   * Send invoice notification when fee is generated
   * @param {string} feeId - Fee document ID
   */
  async notifyInvoiceGenerated(feeId) {
    try {
      // Get fee details with student info
      const fee = await Fee.findById(feeId)
        .populate({
          path: "studentId",
          populate: {
            path: "userId",
            select: "firstName lastName phone email",
          },
        })
        .populate("academicTermId", "name")
        .populate("classId", "name");

      if (!fee || !fee.studentId?.userId?.phone) {
        console.log(
          "⚠️ Invoice notification skipped: Missing fee data or student phone",
        );
        return { success: false, reason: "missing_data" };
      }

      const student = fee.studentId;
      const user = student.userId;

      const invoiceData = {
        studentName: `${user.firstName} ${user.lastName}`,
        studentId: student.studentId,
        academicYear: fee.academicYear,
        academicTerm: fee.academicTermId?.name || "N/A",
        totalAmount: fee.totalAmountDue,
        balance: fee.balance,
        dueDate: fee.dueDate,
        feeComponents: fee.feeComponents || [],
        className: fee.classId?.name,
        branchName: "ATIAM COLLEGE",
      };

      const result = await this.notificationService.sendInvoiceNotification(
        invoiceData,
        user.phone,
      );

      return result;
    } catch (error) {
      console.error("❌ Failed to send invoice notification:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send payment receipt notification when payment is completed
   * @param {string} paymentId - Payment document ID
   */
  async notifyPaymentCompleted(paymentId) {
    try {
      // Get payment details with related data
      const payment = await Payment.findById(paymentId)
        .populate({
          path: "studentId",
          populate: {
            path: "userId",
            select: "firstName lastName phone email",
          },
        })
        .populate({
          path: "feeId",
          select: "academicYear academicTerm balance",
        });

      if (!payment || !payment.studentId?.userId?.phone) {
        console.log(
          "⚠️ Payment receipt notification skipped: Missing payment data or student phone",
        );
        return { success: false, reason: "missing_data" };
      }

      const student = payment.studentId;
      const user = student.userId;
      const fee = payment.feeId;

      const receiptData = {
        studentName: `${user.firstName} ${user.lastName}`,
        studentId: student.studentId,
        receiptNumber: payment.receiptNumber || payment.transactionRef,
        paymentDate: payment.createdAt,
        paymentMethod: payment.paymentMethod,
        amountPaid: payment.amount,
        transactionRef: payment.transactionRef,
        balance: fee?.balance || 0,
        branchName: "ATIAM COLLEGE",
      };

      const result =
        await this.notificationService.sendPaymentReceiptNotification(
          receiptData,
          user.phone,
        );

      return result;
    } catch (error) {
      console.error("❌ Failed to send payment receipt notification:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send weekly attendance report to all students
   * @param {string} classId - Optional: Send to specific class only
   * @param {Date} weekStart - Start of the week
   * @param {Date} weekEnd - End of the week
   */
  async sendWeeklyAttendanceReports(
    classId = null,
    weekStart = null,
    weekEnd = null,
  ) {
    try {
      // Default to last week if dates not provided
      const now = new Date();
      const startDate =
        weekStart || new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const endDate = weekEnd || now;

      console.log(
        `📊 Generating weekly attendance reports for period: ${startDate.toDateString()} - ${endDate.toDateString()}`,
      );

      // Build student query
      const studentQuery = { status: "active" };
      if (classId) {
        studentQuery.currentClassId = classId;
      }

      // Get all active students
      const students = await Student.find(studentQuery)
        .populate("userId", "firstName lastName phone email")
        .populate("currentClassId", "name")
        .populate("branchId", "name");

      console.log(
        `👥 Found ${students.length} active students for attendance reports`,
      );

      const notifications = [];

      for (const student of students) {
        if (!student.userId?.phone) {
          console.log(
            `⚠️ Skipping student ${student.studentId}: No phone number`,
          );
          continue;
        }

        try {
          // Calculate attendance for this student
          const attendanceRecords = await Attendance.find({
            studentId: student._id,
            date: { $gte: startDate, $lte: endDate },
            status: { $exists: true },
          });

          const totalDays = attendanceRecords.length;
          const presentDays = attendanceRecords.filter(
            (record) => record.status === "present",
          ).length;
          const absentDays = totalDays - presentDays;
          const attendancePercentage =
            totalDays > 0 ? (presentDays / totalDays) * 100 : 0;

          const attendanceData = {
            studentName: `${student.userId.firstName} ${student.userId.lastName}`,
            studentId: student.studentId,
            weekStart: startDate,
            weekEnd: endDate,
            totalDays,
            presentDays,
            absentDays,
            attendancePercentage,
            className: student.currentClassId?.name || "N/A",
            branchName: student.branchId?.name || "ATIAM COLLEGE",
          };

          notifications.push({
            type: "attendance",
            phone: student.userId.phone,
            data: attendanceData,
            options: { studentId: student.studentId },
          });
        } catch (error) {
          console.error(
            `❌ Error calculating attendance for student ${student.studentId}:`,
            error,
          );
        }
      }

      console.log(
        `📤 Sending ${notifications.length} attendance report notifications`,
      );

      const result = await this.notificationService.sendBulkNotifications(
        notifications,
        {
          delay: 2000, // 2 second delay between messages for attendance reports
        },
      );

      return result;
    } catch (error) {
      console.error("❌ Failed to send weekly attendance reports:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send weekly attendance reports to all active students (and emergency contacts)
   * @param {string} classId - Optional: Send to specific class only
   * @param {Date} weekStart - Start of the week
   * @param {Date} weekEnd - End of the week
   * @returns {Object} Results of bulk sending
   */
  async sendWeeklyAttendanceReports(
    classId = null,
    weekStart = null,
    weekEnd = null,
  ) {
    try {
      console.log("📊 Sending weekly attendance reports via WhatsApp...");

      const now = new Date();
      const AttendanceReportService = require("./attendanceReportService");
      const attendanceReportService = new AttendanceReportService();

      // Generate bulk reports
      const reports = await attendanceReportService.generateBulkWeeklyReports(
        classId,
        weekStart,
        weekEnd,
      );

      console.log(`📤 Sending ${reports.length} attendance reports...`);

      const notifications = [];

      for (const report of reports) {
        // Get full student details including emergency contacts
        const student = await Student.findById(report.studentId)
          .populate("userId", "firstName lastName phone profileDetails")
          .populate("currentClassId", "name")
          .populate("branchId", "name");

        if (!student) continue;

        // Only send to emergency contacts (not to students)
        const emergencyContacts = [];

        // Primary emergency contact
        if (student.parentGuardianInfo?.emergencyContact?.phone) {
          emergencyContacts.push({
            name:
              student.parentGuardianInfo.emergencyContact.name ||
              "Emergency Contact",
            relationship:
              student.parentGuardianInfo.emergencyContact.relationship ||
              "Guardian",
            phone: student.parentGuardianInfo.emergencyContact.phone,
            isAlternate: false,
          });
        }

        // Alternate emergency contact
        if (student.parentGuardianInfo?.emergencyContact?.alternatePhone) {
          emergencyContacts.push({
            name:
              student.parentGuardianInfo.emergencyContact.name ||
              "Emergency Contact",
            relationship:
              student.parentGuardianInfo.emergencyContact.relationship ||
              "Guardian",
            phone: student.parentGuardianInfo.emergencyContact.alternatePhone,
            isAlternate: true,
          });
        }

        // Send to each emergency contact
        for (const contact of emergencyContacts) {
          // Get specific days missed for this student
          const attendanceRecords = await Attendance.find({
            studentId: student._id,
            date: {
              $gte:
                weekStart || new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
              $lte: weekEnd || now,
            },
            status: "absent",
          }).sort({ date: 1 });

          const missedDays = attendanceRecords.map((record) => {
            const dayName = record.date.toLocaleDateString("en-US", {
              weekday: "long",
            });
            const dateStr = record.date.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            });
            return `${dayName} (${dateStr})`;
          });

          const missedDaysText =
            missedDays.length > 0
              ? `\n❌ *Days Missed:* ${missedDays.join(", ")}`
              : "\n✅ *No days missed this week*";

          notifications.push({
            type: "attendance_report",
            phone: contact.phone,
            data: {
              ...report,
              recipientType: "emergency_contact",
              contactName: contact.name,
              relationship: contact.relationship,
              isAlternate: contact.isAlternate,
              missedDays: missedDays,
              missedDaysText: missedDaysText,
            },
            options: {
              studentId: student.studentId,
              recipientType: "emergency_contact",
              relationship: contact.relationship,
              isAlternate: contact.isAlternate,
            },
          });
        }
      }

      if (notifications.length === 0) {
        return {
          success: false,
          reason: "no_valid_recipients",
          total: 0,
          successful: 0,
          failed: 0,
        };
      }

      console.log(
        `📤 Sending ${notifications.length} notifications (students + emergency contacts)...`,
      );

      const result = await this.notificationService.sendBulkNotifications(
        notifications,
        {
          delay: 2000, // 2-second delay between messages for rate limiting
        },
      );

      return result;
    } catch (error) {
      console.error("❌ Failed to send weekly attendance reports:", error);
      return {
        success: false,
        error: error.message,
        total: 0,
        successful: 0,
        failed: 0,
      };
    }
  }

  /**
   * Send emergency notification to student and contacts
   * @param {string} studentId - Student ID
   * @param {string} emergencyType - Type of emergency
   * @param {string} message - Emergency message
   * @param {string} contactPerson - Person sending the notification
   * @param {string} urgency - Urgency level (low, normal, high)
   */
  async sendEmergencyNotification(
    studentId,
    emergencyType,
    message,
    contactPerson,
    urgency = "normal",
  ) {
    try {
      const student = await Student.findById(studentId)
        .populate("userId", "firstName lastName")
        .populate("emergencyContacts");

      if (!student) {
        return { success: false, reason: "student_not_found" };
      }

      const notifications = [];

      // Send to emergency contacts
      if (student.emergencyContacts && student.emergencyContacts.length > 0) {
        for (const contact of student.emergencyContacts) {
          if (contact.phone) {
            const emergencyData = {
              studentName: `${student.userId.firstName} ${student.userId.lastName}`,
              studentId: student.studentId,
              emergencyType,
              message,
              contactPerson,
              urgency,
              branchName: "ATIAM COLLEGE",
            };

            notifications.push({
              type: "emergency",
              phone: contact.phone,
              data: emergencyData,
              options: { studentId: student.studentId, urgency },
            });
          }
        }
      }

      // Also send to student's own phone if different urgency level
      if (student.userId?.phone && urgency === "high") {
        const emergencyData = {
          studentName: `${student.userId.firstName} ${student.userId.lastName}`,
          studentId: student.studentId,
          emergencyType,
          message,
          contactPerson,
          urgency,
          branchName: "ATIAM COLLEGE",
        };

        notifications.push({
          type: "emergency",
          phone: student.userId.phone,
          data: emergencyData,
          options: { studentId: student.studentId, urgency },
        });
      }

      if (notifications.length === 0) {
        return { success: false, reason: "no_contacts" };
      }

      const result = await this.notificationService.sendBulkNotifications(
        notifications,
        {
          delay: 1000, // Quick delivery for emergencies
        },
      );

      return result;
    } catch (error) {
      console.error("❌ Failed to send emergency notification:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send custom notification to specific student
   * @param {string} studentId - Student ID
   * @param {string} message - Custom message
   * @param {string} type - Notification type
   */
  async sendCustomStudentNotification(studentId, message, type = "general") {
    try {
      const student = await Student.findById(studentId).populate(
        "userId",
        "firstName lastName phone email",
      );

      if (!student || !student.userId?.phone) {
        return { success: false, reason: "student_not_found_or_no_phone" };
      }

      const result = await this.notificationService.whatsappService.sendMessage(
        student.userId.phone,
        message,
        { type, studentId: student.studentId },
      );

      return result;
    } catch (error) {
      console.error("❌ Failed to send custom student notification:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get integration service status
   */
  getStatus() {
    return {
      whatsappService: this.notificationService.getStatus(),
      integrationEnabled: true,
    };
  }
}

module.exports = WhatsAppIntegrationService;
