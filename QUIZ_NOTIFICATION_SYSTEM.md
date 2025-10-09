# Quiz Notification System Implementation

## 🎯 Overview

This document outlines the implementation of a comprehensive notification system for quiz events including email notifications, dashboard alerts, and reminder system integration.

## 📦 Required Dependencies

Add these to your `package.json`:

```json
{
  "dependencies": {
    "nodemailer": "^6.9.7",
    "node-schedule": "^2.1.1",
    "socket.io": "^4.7.4",
    "ejs": "^3.1.9",
    "html-to-text": "^9.0.5",
    "date-fns": "^2.30.0"
  }
}
```

## 🔧 Notification Service Implementation

### Base Notification Service

```javascript
// services/notificationService.js
const nodemailer = require("nodemailer");
const schedule = require("node-schedule");
const { format, addMinutes, addHours, addDays } = require("date-fns");
const path = require("path");
const ejs = require("ejs");
const { convert } = require("html-to-text");

class NotificationService {
  constructor() {
    this.emailTransporter = null;
    this.scheduledJobs = new Map();
    this.initializeEmailTransporter();
  }

  initializeEmailTransporter() {
    this.emailTransporter = nodemailer.createTransporter({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: process.env.SMTP_PORT || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  // Email Notification Methods
  async sendQuizStartedNotification(quiz, students) {
    const template = await this.loadEmailTemplate("quiz-started", {
      quizTitle: quiz.title,
      quizDescription: quiz.description,
      dueDate: quiz.schedule?.dueDate
        ? format(new Date(quiz.schedule.dueDate), "PPpp")
        : null,
      timeLimit: quiz.timeLimit,
      attempts: quiz.attempts,
      quizUrl: `${process.env.FRONTEND_URL}/student/quizzes/${quiz._id}`,
    });

    const notifications = students.map((student) => ({
      to: student.email,
      subject: `Quiz Available: ${quiz.title}`,
      html: template.html,
      text: template.text,
    }));

    return this.sendBulkEmails(notifications);
  }

  async sendQuizReminderNotification(quiz, students, reminderType) {
    const timeLeft = this.calculateTimeLeft(quiz.schedule.dueDate);

    const template = await this.loadEmailTemplate("quiz-reminder", {
      quizTitle: quiz.title,
      reminderType,
      timeLeft,
      dueDate: format(new Date(quiz.schedule.dueDate), "PPpp"),
      quizUrl: `${process.env.FRONTEND_URL}/student/quizzes/${quiz._id}`,
    });

    const notifications = students.map((student) => ({
      to: student.email,
      subject: `Reminder: ${quiz.title} ${reminderType}`,
      html: template.html,
      text: template.text,
    }));

    return this.sendBulkEmails(notifications);
  }

  async sendQuizEndingSoonNotification(quiz, students) {
    const template = await this.loadEmailTemplate("quiz-ending-soon", {
      quizTitle: quiz.title,
      endTime: format(new Date(quiz.schedule.availableUntil), "PPpp"),
      quizUrl: `${process.env.FRONTEND_URL}/student/quizzes/${quiz._id}`,
    });

    const notifications = students.map((student) => ({
      to: student.email,
      subject: `Urgent: ${quiz.title} Ends Soon`,
      html: template.html,
      text: template.text,
    }));

    return this.sendBulkEmails(notifications);
  }

  async sendQuizCompletedNotification(quiz, student, attempt) {
    const template = await this.loadEmailTemplate("quiz-completed", {
      studentName: student.firstName,
      quizTitle: quiz.title,
      score: attempt.score,
      totalScore: attempt.totalScore,
      percentage: Math.round((attempt.score / attempt.totalScore) * 100),
      completedAt: format(new Date(attempt.completedAt), "PPpp"),
      passed: attempt.score >= (quiz.passingScore || 60),
      resultsUrl: `${process.env.FRONTEND_URL}/student/quiz-results/${attempt._id}`,
    });

    return this.sendEmail({
      to: student.email,
      subject: `Quiz Completed: ${quiz.title}`,
      html: template.html,
      text: template.text,
    });
  }

  async sendQuizGradedNotification(quiz, student, attempt) {
    const template = await this.loadEmailTemplate("quiz-graded", {
      studentName: student.firstName,
      quizTitle: quiz.title,
      score: attempt.score,
      totalScore: attempt.totalScore,
      percentage: Math.round((attempt.score / attempt.totalScore) * 100),
      feedback: attempt.feedback,
      passed: attempt.score >= (quiz.passingScore || 60),
      resultsUrl: `${process.env.FRONTEND_URL}/student/quiz-results/${attempt._id}`,
    });

    return this.sendEmail({
      to: student.email,
      subject: `Quiz Graded: ${quiz.title}`,
      html: template.html,
      text: template.text,
    });
  }

  // Template Loading
  async loadEmailTemplate(templateName, data) {
    const templatePath = path.join(
      __dirname,
      "../templates/email",
      `${templateName}.ejs`
    );
    const html = await ejs.renderFile(templatePath, data);
    const text = convert(html, {
      wordwrap: 130,
      selectors: [
        { selector: "a", options: { ignoreHref: true } },
        { selector: "img", format: "skip" },
      ],
    });

    return { html, text };
  }

  // Bulk Email Sending
  async sendBulkEmails(notifications) {
    const results = [];
    const batchSize = 10; // Send 10 emails at a time

    for (let i = 0; i < notifications.length; i += batchSize) {
      const batch = notifications.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map((notification) => this.sendEmail(notification))
      );
      results.push(...batchResults);
    }

    return results;
  }

  async sendEmail(emailData) {
    try {
      const result = await this.emailTransporter.sendMail({
        from: `"ATIAM CMS" <${process.env.SMTP_USER}>`,
        ...emailData,
      });

      console.log(`✅ Email sent to ${emailData.to}: ${emailData.subject}`);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error(`❌ Failed to send email to ${emailData.to}:`, error);
      return { success: false, error: error.message };
    }
  }

  // Scheduling Methods
  scheduleQuizNotifications(quiz) {
    if (!quiz.schedule) return;

    const quizId = quiz._id.toString();
    this.cancelScheduledNotifications(quizId);

    // Schedule start notification
    if (quiz.schedule.availableFrom) {
      this.scheduleNotification(
        `${quizId}-start`,
        new Date(quiz.schedule.availableFrom),
        () => this.handleQuizStarted(quiz)
      );
    }

    // Schedule reminder notifications
    if (quiz.schedule.dueDate) {
      const dueDate = new Date(quiz.schedule.dueDate);

      // 24 hours before due
      this.scheduleNotification(
        `${quizId}-reminder-24h`,
        addDays(dueDate, -1),
        () => this.handleQuizReminder(quiz, "24 hours before due")
      );

      // 2 hours before due
      this.scheduleNotification(
        `${quizId}-reminder-2h`,
        addHours(dueDate, -2),
        () => this.handleQuizReminder(quiz, "2 hours before due")
      );

      // 30 minutes before due
      this.scheduleNotification(
        `${quizId}-reminder-30m`,
        addMinutes(dueDate, -30),
        () => this.handleQuizReminder(quiz, "30 minutes before due")
      );
    }

    // Schedule end warning
    if (quiz.schedule.availableUntil) {
      this.scheduleNotification(
        `${quizId}-ending-soon`,
        addMinutes(new Date(quiz.schedule.availableUntil), -15),
        () => this.handleQuizEndingSoon(quiz)
      );
    }
  }

  scheduleNotification(jobId, date, callback) {
    if (date <= new Date()) {
      console.log(`⚠️ Skipping past notification: ${jobId}`);
      return;
    }

    const job = schedule.scheduleJob(date, callback);
    this.scheduledJobs.set(jobId, job);

    console.log(
      `📅 Scheduled notification: ${jobId} for ${format(date, "PPpp")}`
    );
  }

  cancelScheduledNotifications(quizId) {
    const jobsToCancel = Array.from(this.scheduledJobs.keys()).filter((jobId) =>
      jobId.startsWith(quizId)
    );

    jobsToCancel.forEach((jobId) => {
      const job = this.scheduledJobs.get(jobId);
      if (job) {
        job.cancel();
        this.scheduledJobs.delete(jobId);
        console.log(`🗑️ Cancelled notification: ${jobId}`);
      }
    });
  }

  // Event Handlers
  async handleQuizStarted(quiz) {
    try {
      const students = await this.getQuizStudents(quiz);
      await this.sendQuizStartedNotification(quiz, students);

      // Emit real-time notification
      this.emitRealTimeNotification("quiz-started", {
        quizId: quiz._id,
        quizTitle: quiz.title,
        students: students.map((s) => s._id),
      });
    } catch (error) {
      console.error("Error handling quiz started:", error);
    }
  }

  async handleQuizReminder(quiz, reminderType) {
    try {
      const students = await this.getQuizStudentsWithoutCompletion(quiz);
      if (students.length > 0) {
        await this.sendQuizReminderNotification(quiz, students, reminderType);

        // Emit real-time notification
        this.emitRealTimeNotification("quiz-reminder", {
          quizId: quiz._id,
          quizTitle: quiz.title,
          reminderType,
          students: students.map((s) => s._id),
        });
      }
    } catch (error) {
      console.error("Error handling quiz reminder:", error);
    }
  }

  async handleQuizEndingSoon(quiz) {
    try {
      const students = await this.getActiveQuizStudents(quiz);
      if (students.length > 0) {
        await this.sendQuizEndingSoonNotification(quiz, students);

        // Emit real-time notification
        this.emitRealTimeNotification("quiz-ending-soon", {
          quizId: quiz._id,
          quizTitle: quiz.title,
          students: students.map((s) => s._id),
        });
      }
    } catch (error) {
      console.error("Error handling quiz ending soon:", error);
    }
  }

  // Student Query Methods
  async getQuizStudents(quiz) {
    const Student = require("../models/Student");
    return await Student.find({
      courses: quiz.courseId,
      branchId: quiz.branchId,
    }).select("firstName lastName email");
  }

  async getQuizStudentsWithoutCompletion(quiz) {
    const Student = require("../models/Student");
    const QuizAttempt = require("../models/QuizAttempt");

    const completedStudentIds = await QuizAttempt.distinct("studentId", {
      quizId: quiz._id,
      status: "completed",
    });

    return await Student.find({
      _id: { $nin: completedStudentIds },
      courses: quiz.courseId,
      branchId: quiz.branchId,
    }).select("firstName lastName email");
  }

  async getActiveQuizStudents(quiz) {
    const Student = require("../models/Student");
    const QuizAttempt = require("../models/QuizAttempt");

    const activeStudentIds = await QuizAttempt.distinct("studentId", {
      quizId: quiz._id,
      status: "active",
    });

    return await Student.find({
      _id: { $in: activeStudentIds },
    }).select("firstName lastName email");
  }

  // Real-time Notifications
  setSocketIO(io) {
    this.io = io;
  }

  emitRealTimeNotification(type, data) {
    if (this.io) {
      this.io.emit("quiz-notification", { type, data, timestamp: new Date() });
      console.log(`📡 Real-time notification sent: ${type}`);
    }
  }

  // Utility Methods
  calculateTimeLeft(dueDate) {
    const now = new Date();
    const due = new Date(dueDate);
    const diff = due - now;

    if (diff <= 0) return "overdue";

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `${days} day${days > 1 ? "s" : ""}`;
    if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""}`;
    return `${minutes} minute${minutes > 1 ? "s" : ""}`;
  }

  // Cleanup
  shutdown() {
    // Cancel all scheduled jobs
    this.scheduledJobs.forEach((job, jobId) => {
      job.cancel();
      console.log(`🛑 Cancelled job: ${jobId}`);
    });
    this.scheduledJobs.clear();
  }
}

module.exports = new NotificationService();
```

## 📧 Email Templates

### Quiz Started Template

```html
<!-- templates/email/quiz-started.ejs -->
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Quiz Available: <%= quizTitle %></title>
    <style>
      body {
        font-family: Arial, sans-serif;
        line-height: 1.6;
        color: #333;
      }
      .container {
        max-width: 600px;
        margin: 0 auto;
        padding: 20px;
      }
      .header {
        background: #4f46e5;
        color: white;
        padding: 20px;
        text-align: center;
      }
      .content {
        padding: 20px;
        background: #f9f9f9;
      }
      .button {
        display: inline-block;
        background: #4f46e5;
        color: white;
        padding: 12px 24px;
        text-decoration: none;
        border-radius: 5px;
        margin: 10px 0;
      }
      .info-box {
        background: white;
        padding: 15px;
        border-left: 4px solid #4f46e5;
        margin: 15px 0;
      }
      .footer {
        text-align: center;
        padding: 20px;
        color: #666;
        font-size: 12px;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>📚 Quiz Now Available</h1>
      </div>

      <div class="content">
        <h2><%= quizTitle %></h2>

        <% if (quizDescription) { %>
        <p><%= quizDescription %></p>
        <% } %>

        <div class="info-box">
          <h3>📋 Quiz Details</h3>
          <ul>
            <li><strong>Time Limit:</strong> <%= timeLimit %> minutes</li>
            <li><strong>Attempts Allowed:</strong> <%= attempts %></li>
            <% if (dueDate) { %>
            <li><strong>Due Date:</strong> <%= dueDate %></li>
            <% } %>
          </ul>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="<%= quizUrl %>" class="button">Start Quiz Now</a>
        </div>

        <p>
          <strong>Important:</strong> Make sure you have a stable internet
          connection and sufficient time to complete the quiz.
        </p>
      </div>

      <div class="footer">
        <p>ATIAM College Management System</p>
        <p>This is an automated message. Please do not reply to this email.</p>
      </div>
    </div>
  </body>
</html>
```

### Quiz Reminder Template

```html
<!-- templates/email/quiz-reminder.ejs -->
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Reminder: <%= quizTitle %></title>
    <style>
      body {
        font-family: Arial, sans-serif;
        line-height: 1.6;
        color: #333;
      }
      .container {
        max-width: 600px;
        margin: 0 auto;
        padding: 20px;
      }
      .header {
        background: #f59e0b;
        color: white;
        padding: 20px;
        text-align: center;
      }
      .content {
        padding: 20px;
        background: #fef3c7;
      }
      .button {
        display: inline-block;
        background: #f59e0b;
        color: white;
        padding: 12px 24px;
        text-decoration: none;
        border-radius: 5px;
        margin: 10px 0;
      }
      .warning-box {
        background: #fef2f2;
        border: 1px solid #fecaca;
        padding: 15px;
        border-radius: 5px;
        margin: 15px 0;
      }
      .footer {
        text-align: center;
        padding: 20px;
        color: #666;
        font-size: 12px;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>⏰ Quiz Reminder</h1>
      </div>

      <div class="content">
        <h2><%= quizTitle %></h2>

        <div class="warning-box">
          <h3>📢 Reminder: <%= reminderType %></h3>
          <p><strong>Time remaining:</strong> <%= timeLeft %></p>
          <p><strong>Due date:</strong> <%= dueDate %></p>
        </div>

        <p>Don't forget to complete your quiz! Time is running out.</p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="<%= quizUrl %>" class="button">Take Quiz Now</a>
        </div>
      </div>

      <div class="footer">
        <p>ATIAM College Management System</p>
      </div>
    </div>
  </body>
</html>
```

## 🔌 Socket.IO Integration

### Real-time Notification Setup

```javascript
// services/socketService.js
const socketIo = require("socket.io");
const jwt = require("jsonwebtoken");

class SocketService {
  constructor(server) {
    this.io = socketIo(server, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
      },
    });

    this.setupMiddleware();
    this.setupEventHandlers();
  }

  setupMiddleware() {
    this.io.use((socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = decoded.userId;
        socket.userType = decoded.userType;
        socket.branchId = decoded.branchId;
        next();
      } catch (err) {
        next(new Error("Authentication error"));
      }
    });
  }

  setupEventHandlers() {
    this.io.on("connection", (socket) => {
      console.log(`User connected: ${socket.userId} (${socket.userType})`);

      // Join user-specific room
      socket.join(`user-${socket.userId}`);

      // Join branch room for branch-wide notifications
      if (socket.branchId) {
        socket.join(`branch-${socket.branchId}`);
      }

      socket.on("disconnect", () => {
        console.log(`User disconnected: ${socket.userId}`);
      });
    });
  }

  // Send notification to specific user
  sendToUser(userId, event, data) {
    this.io.to(`user-${userId}`).emit(event, data);
  }

  // Send notification to all users in a branch
  sendToBranch(branchId, event, data) {
    this.io.to(`branch-${branchId}`).emit(event, data);
  }

  // Send quiz notification to multiple students
  sendQuizNotification(studentIds, event, data) {
    studentIds.forEach((studentId) => {
      this.sendToUser(studentId, event, data);
    });
  }

  getIO() {
    return this.io;
  }
}

module.exports = SocketService;
```

## 🎛️ Dashboard Alerts Integration

### Alert Controller

```javascript
// controllers/alertController.js
const Alert = require("../models/Alert");
const notificationService = require("../services/notificationService");

exports.getUserAlerts = async (req, res) => {
  try {
    const { page = 1, limit = 20, unreadOnly = false } = req.query;

    const filter = {
      userId: req.user._id,
      ...(unreadOnly === "true" && { read: false }),
    };

    const alerts = await Alert.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate("relatedQuiz", "title")
      .exec();

    const total = await Alert.countDocuments(filter);

    res.json({
      success: true,
      data: {
        alerts,
        total,
        page: parseInt(page),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.markAlertAsRead = async (req, res) => {
  try {
    await Alert.findByIdAndUpdate(req.params.alertId, {
      read: true,
      readAt: new Date(),
    });

    res.json({ success: true, message: "Alert marked as read" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.markAllAlertsAsRead = async (req, res) => {
  try {
    await Alert.updateMany(
      { userId: req.user._id, read: false },
      { read: true, readAt: new Date() }
    );

    res.json({ success: true, message: "All alerts marked as read" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.createQuizAlert = async (userId, type, quizId, title, message) => {
  try {
    const alert = new Alert({
      userId,
      type,
      title,
      message,
      relatedQuiz: quizId,
      priority: type.includes("urgent") ? "high" : "medium",
    });

    await alert.save();

    // Send real-time notification
    notificationService.emitRealTimeNotification("new-alert", {
      userId,
      alert: alert.toObject(),
    });

    return alert;
  } catch (error) {
    console.error("Error creating quiz alert:", error);
  }
};
```

### Alert Model

```javascript
// models/Alert.js
const mongoose = require("mongoose");

const alertSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: [
        "quiz-available",
        "quiz-reminder",
        "quiz-ending-soon",
        "quiz-completed",
        "quiz-graded",
        "quiz-overdue",
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    read: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
    },
    relatedQuiz: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Quiz",
    },
    actionUrl: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

alertSchema.index({ userId: 1, createdAt: -1 });
alertSchema.index({ userId: 1, read: 1 });

module.exports = mongoose.model("Alert", alertSchema);
```

## 🚀 Integration with Quiz Controller

### Enhanced Quiz Controller with Notifications

```javascript
// Add to controllers/quizController.js

const notificationService = require("../services/notificationService");
const { createQuizAlert } = require("./alertController");

// In createQuiz function, add:
if (savedQuiz.schedule) {
  notificationService.scheduleQuizNotifications(savedQuiz);
}

// In updateQuizSchedule function, add:
notificationService.scheduleQuizNotifications(updatedQuiz);

// Add new method for quiz completion
exports.completeQuizAttempt = async (req, res) => {
  try {
    const attempt = await QuizAttempt.findById(req.params.attemptId)
      .populate("quizId")
      .populate("studentId");

    if (!attempt) {
      return res
        .status(404)
        .json({ success: false, error: "Quiz attempt not found" });
    }

    // Update attempt status
    attempt.status = "completed";
    attempt.completedAt = new Date();
    await attempt.save();

    // Send completion notification
    await notificationService.sendQuizCompletedNotification(
      attempt.quizId,
      attempt.studentId,
      attempt
    );

    // Create dashboard alert
    await createQuizAlert(
      attempt.studentId._id,
      "quiz-completed",
      attempt.quizId._id,
      `Quiz Completed: ${attempt.quizId.title}`,
      `You have successfully completed the quiz. Your score: ${attempt.score}/${attempt.totalScore}`
    );

    res.json({ success: true, data: attempt });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
```

## ⚙️ Environment Configuration

Add these to your `.env` file:

```env
# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Frontend URL for links in emails
FRONTEND_URL=http://localhost:3000

# Socket.IO Configuration
SOCKET_CORS_ORIGIN=http://localhost:3000
```

## 🧪 Testing the Notification System

### Test Script

```javascript
// test-notifications.js
const notificationService = require("./services/notificationService");

async function testNotifications() {
  console.log("🧪 Testing Quiz Notification System...\n");

  // Mock quiz data
  const mockQuiz = {
    _id: "507f1f77bcf86cd799439011",
    title: "Test Quiz - JavaScript Fundamentals",
    description: "A comprehensive test on JavaScript basics",
    courseId: "507f1f77bcf86cd799439012",
    branchId: "507f1f77bcf86cd799439013",
    timeLimit: 60,
    attempts: 2,
    passingScore: 70,
    schedule: {
      availableFrom: new Date(Date.now() + 5000), // 5 seconds from now
      availableUntil: new Date(Date.now() + 86400000), // 24 hours from now
      dueDate: new Date(Date.now() + 86400000), // 24 hours from now
    },
  };

  // Test scheduling
  console.log("📅 Testing notification scheduling...");
  notificationService.scheduleQuizNotifications(mockQuiz);

  // Test email template loading
  console.log("📧 Testing email template loading...");
  try {
    const template = await notificationService.loadEmailTemplate(
      "quiz-started",
      {
        quizTitle: mockQuiz.title,
        quizDescription: mockQuiz.description,
        timeLimit: mockQuiz.timeLimit,
        attempts: mockQuiz.attempts,
        quizUrl: "http://localhost:3000/student/quizzes/test",
      }
    );
    console.log("✅ Template loaded successfully");
  } catch (error) {
    console.error("❌ Template loading failed:", error.message);
  }

  console.log("\n🎯 Notification system test completed!");
}

if (require.main === module) {
  testNotifications();
}
```

## 📱 Frontend Integration

### React Hook for Real-time Notifications

```typescript
// hooks/useNotifications.ts
import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

export const useNotifications = (token: string) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const newSocket = io(
      process.env.REACT_APP_BACKEND_URL || "http://localhost:5000",
      {
        auth: { token },
      }
    );

    newSocket.on("quiz-notification", (notification) => {
      setNotifications((prev) => [notification, ...prev]);
      setUnreadCount((prev) => prev + 1);

      // Show browser notification
      if (Notification.permission === "granted") {
        new Notification(notification.data.quizTitle, {
          body: getNotificationBody(notification.type),
          icon: "/icon-192x192.png",
        });
      }
    });

    newSocket.on("new-alert", (data) => {
      // Handle new dashboard alert
      console.log("New alert:", data.alert);
    });

    setSocket(newSocket);

    return () => newSocket.close();
  }, [token]);

  const getNotificationBody = (type: string) => {
    switch (type) {
      case "quiz-started":
        return "A new quiz is now available";
      case "quiz-reminder":
        return "Don't forget to complete your quiz";
      case "quiz-ending-soon":
        return "Quiz access ends soon";
      default:
        return "Quiz update";
    }
  };

  const markAsRead = (index: number) => {
    setNotifications((prev) => prev.filter((_, i) => i !== index));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  return {
    notifications,
    unreadCount,
    markAsRead,
  };
};
```

---

This comprehensive notification system provides:

- 📧 Email notifications for all quiz events
- 📱 Real-time browser notifications via Socket.IO
- 🎛️ Dashboard alerts and reminders
- ⏰ Automated scheduling based on quiz timings
- 🎨 Professional email templates
- 🧪 Testing framework for validation

The system integrates seamlessly with your existing quiz functionality and provides students and teachers with timely, relevant notifications about quiz activities.
