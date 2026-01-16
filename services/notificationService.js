const Notice = require("../models/Notice");
const User = require("../models/User");

class NotificationService {
  /**
   * Map user role to target audience
   * @param {string} role - User role
   * @returns {string} Target audience
   */
  getTargetAudienceForRole(role) {
    switch (role) {
      case "student":
        return "students";
      case "teacher":
        return "teachers";
      case "secretary":
      case "branchadmin":
      case "admin":
      case "superadmin":
        return "staff";
      case "parent":
        return "parents";
      default:
        return "all";
    }
  }
  /**
   * Send notification to enrolled students about live session
   * @param {Object} params
   * @param {string} params.courseId - Course ID
   * @param {string} params.sessionId - Live session ID
   * @param {string} params.title - Notification title
   * @param {string} params.message - Notification message
   * @param {string} params.type - Notification type (scheduled, updated, cancelled)
   * @param {string} params.actionUrl - URL to redirect to
   */
  async notifyLiveSessionStudents({
    courseId,
    sessionId,
    title,
    message,
    type,
    actionUrl,
  }) {
    try {
      // Get enrolled students
      const { Enrollment } = require("../models/elearning");
      const enrollments = await Enrollment.find({ courseId }).populate(
        "studentId"
      );

      // Filter out enrollments with null studentId
      const validEnrollments = enrollments.filter((e) => e.studentId);

      if (validEnrollments.length === 0) {
        return;
      }

      const studentIds = validEnrollments.map((e) => e.studentId._id);
      const branchId = validEnrollments[0].studentId.branchId; // Assume all students in same branch

      // Create notice for students
      const notice = await Notice.create({
        title,
        content: message,
        type: "academic", // Changed from "live-session" to valid enum value
        priority: "medium",
        targetAudience: "students", // Changed from array to string
        branchId,
        author: {
          userId: "system", // Use dedicated system user for system-generated notifications
          name: "System",
        },
        isActive: true,
        publishDate: new Date(),
        expiryDate: null, // No expiry for live session notifications
        metadata: {
          sessionId,
          courseId,
          type,
          actionUrl,
        },
      });

      console.log(
        `Created notification for ${studentIds.length} students: ${title}`
      );
      return notice;
    } catch (error) {
      console.error("Error sending live session notification:", error);
      throw error;
    }
  }

  /**
   * Send notification to a specific user
   * @param {Object} params
   * @param {string} params.userId - User ID
   * @param {string} params.title - Notification title
   * @param {string} params.message - Notification message
   * @param {string} params.type - Notification type
   * @param {string} params.actionUrl - URL to redirect to
   */
  async notifyUser({ userId, title, message, type, actionUrl }) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error("User not found");
      }

      const notice = await Notice.create({
        title,
        content: message,
        type: type || "info", // Default to "info" if type not provided or invalid
        priority: "medium",
        // No targetAudience - specificRecipients controls visibility for personal notifications
        specificRecipients: [userId], // Target specific user only
        branchId: user.branchId,
        author: {
          userId: userId, // Use the target user ID as author (required field)
          name: "System",
        },
        isActive: true,
        publishDate: new Date(),
        expiryDate: null,
        metadata: {
          userId,
          actionUrl,
        },
      });

      console.log(`Created notification for user ${userId}: ${title}`);
      return notice;
    } catch (error) {
      console.error("Error sending user notification:", error);
      throw error;
    }
  }

  /**
   * Send course update notification to enrolled students
   * @param {Object} params
   * @param {string} params.courseId - Course ID
   * @param {string} params.title - Notification title
   * @param {string} params.message - Notification message
   * @param {string} params.updateType - Type of update (content, schedule, material)
   * @param {string} params.actionUrl - URL to redirect to
   */
  async notifyCourseUpdate({
    courseId,
    title,
    message,
    updateType,
    actionUrl,
  }) {
    try {
      // Get enrolled students
      const { Enrollment } = require("../models/elearning");
      const enrollments = await Enrollment.find({ courseId }).populate(
        "studentId"
      );

      const validEnrollments = enrollments.filter((e) => e.studentId);
      if (validEnrollments.length === 0) {
        return;
      }

      const studentIds = validEnrollments.map((e) => e.studentId._id);
      const branchId = validEnrollments[0].studentId.branchId;

      // Create notice for students
      const notice = await Notice.create({
        title,
        content: message,
        type: "academic",
        priority: "medium",
        targetAudience: "students",
        branchId,
        author: {
          userId: validEnrollments[0].studentId._id,
          name: "System",
        },
        isActive: true,
        publishDate: new Date(),
        expiryDate: null,
        metadata: {
          courseId,
          updateType,
          actionUrl,
          studentIds,
        },
      });

      console.log(
        `Created course update notification for ${studentIds.length} students: ${title}`
      );
      return notice;
    } catch (error) {
      console.error("Error sending course update notification:", error);
      throw error;
    }
  }

  /**
   * Send quiz result notification to student
   * @param {Object} params
   * @param {string} params.studentId - Student ID
   * @param {string} params.quizId - Quiz ID
   * @param {string} params.quizTitle - Quiz title
   * @param {number} params.score - Quiz score
   * @param {string} params.grade - Letter grade
   * @param {string} params.actionUrl - URL to view results
   */
  async notifyQuizResult({
    studentId,
    quizId,
    quizTitle,
    score,
    grade,
    actionUrl,
  }) {
    try {
      const student = await require("../models/Student")
        .findById(studentId)
        .populate("userId");
      if (!student) {
        throw new Error("Student not found");
      }

      const title = `Quiz Results: ${quizTitle}`;
      const message = `Your quiz "${quizTitle}" has been graded. Score: ${score}%, Grade: ${grade}`;

      const notice = await Notice.create({
        title,
        content: message,
        type: "academic",
        priority: "high",
        // No targetAudience - specificRecipients controls visibility for personal notifications
        specificRecipients: [student.userId._id], // Target specific student only
        branchId: student.branchId,
        author: {
          userId: student.userId._id,
          name: "System",
        },
        isActive: true,
        publishDate: new Date(),
        expiryDate: null,
        metadata: {
          studentId,
          quizId,
          quizTitle,
          score,
          grade,
          actionUrl,
        },
      });

      console.log(
        `Created quiz result notification for student ${studentId}: ${title}`
      );
      return notice;
    } catch (error) {
      console.error("Error sending quiz result notification:", error);
      throw error;
    }
  }

  /**
   * Send payment notification to user
   * @param {Object} params
   * @param {string} params.userId - User ID
   * @param {string} params.paymentId - Payment ID
   * @param {string} params.amount - Payment amount
   * @param {string} params.status - Payment status (paid, failed, pending)
   * @param {string} params.description - Payment description
   * @param {string} params.actionUrl - URL to view receipt
   */
  async notifyPaymentStatus({
    userId,
    paymentId,
    amount,
    status,
    description,
    actionUrl,
  }) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error("User not found");
      }

      let title, message, priority;

      switch (status.toLowerCase()) {
        case "paid":
        case "completed":
          title = "Payment Successful";
          message = `Your payment of ${amount} for ${description} has been processed successfully.`;
          priority = "medium";
          break;
        case "failed":
        case "cancelled":
          title = "Payment Failed";
          message = `Your payment of ${amount} for ${description} could not be processed. Please try again.`;
          priority = "high";
          break;
        case "pending":
          title = "Payment Processing";
          message = `Your payment of ${amount} for ${description} is being processed.`;
          priority = "low";
          break;
        default:
          title = "Payment Update";
          message = `Payment status update for ${description}: ${status}`;
          priority = "medium";
      }

      const notice = await Notice.create({
        title,
        content: message,
        type: "info",
        priority,
        targetAudience: null, // Personal notices don't have a general audience
        specificRecipients: [userId], // Target specific user only
        branchId: user.branchId,
        author: {
          userId,
          name: "System",
        },
        isActive: true,
        publishDate: new Date(),
        expiryDate: null,
        metadata: {
          userId,
          paymentId,
          amount,
          status,
          description,
          actionUrl,
        },
      });

      console.log(`Created payment notification for user ${userId}: ${title}`);
      return notice;
    } catch (error) {
      console.error("Error sending payment notification:", error);
      throw error;
    }
  }
}

module.exports = new NotificationService();
