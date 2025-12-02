const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { swaggerSetup } = require("./config/swagger");
const http = require("http");

const socketIo = require("socket.io");

require("dotenv").config();

// Import routes
const authRoutes = require("./routes/authRoutes");
const branchRoutes = require("./routes/branchRoutes");
const departmentRoutes = require("./routes/departmentRoutes");
const userRoutes = require("./routes/userRoutes");
const studentRoutes = require("./routes/studentRoutes");
const teacherRoutes = require("./routes/teacherRoutes");
const classRoutes = require("./routes/classRoutes");
const courseRoutes = require("./routes/courseRoutes");
const examRoutes = require("./routes/examRoutes");
const elearningRoutes = require("./routes/elearningRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const feeRoutes = require("./routes/feeRoutes");
const paymentsRoutes = require("./routes/paymentsRoutes");
const expenseRoutes = require("./routes/expenseRoutes");
const attendanceRoutes = require("./routes/attendanceRoutes");
const scholarshipRoutes = require("./routes/scholarshipRoutes");
const adminRoutes = require("./routes/adminRoutes");
const financialReportRoutes = require("./routes/financialReportRoutes");
const systemAnalyticsRoutes = require("./routes/systemAnalyticsRoutes");
const globalSettingsRoutes = require("./routes/globalSettingsRoutes");
const noticeRoutes = require("./routes/noticeRoutes");

// Landing page content routes
const newsRoutes = require("./routes/newsRoutes");
const eventRoutes = require("./routes/eventRoutes");
const staffRoutes = require("./routes/staffRoutes");
const publicCourseRoutes = require("./routes/publicCourseRoutes");
const pushRoutes = require("./routes/pushRoutes");
const studentApplicationRoutes = require("./routes/studentApplicationRoutes");

// Import middleware
const errorHandler = require("./middlewares/errorHandler");
const securityMiddleware = require("./middlewares/security");

const app = express();

// Security middleware - comprehensive security headers
securityMiddleware(app);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10000, // limit each IP to 10,000 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
});
app.use(limiter);

// CORS configuration - restrict to specific domains only
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      process.env.CMS_FRONTEND_URL || "http://localhost:3000",
      process.env.ELEARNING_FRONTEND_URL || "http://localhost:3001",
      process.env.LANDING_PAGE_URL || "http://localhost:5173", // Landing page URL
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:5173", // Vite dev server default
      "https://portal.atiamcollege.com",
      "https://www.atiamcollege.com",
      "https://atiamcollege.com", // Landing page domain
    ];

    // Check if the origin is in the allowed list
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      console.warn(`CORS blocked request from origin: ${origin}`);
      return callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "ngrok-skip-browser-warning",
  ],
};
app.use(cors(corsOptions));

// CORS error handler
app.use((err, req, res, next) => {
  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({
      error: "CORS Error",
      message: "Origin not allowed",
      status: 403,
    });
  }
  next(err);
});

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    message: "ATIAM CMS Backend is running",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

// Setup Swagger documentation
swaggerSetup(app);

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/branches", branchRoutes);
app.use("/api/users", userRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/applications", studentApplicationRoutes); // Student applications
app.use("/api/teachers", teacherRoutes);
app.use("/api/teacher", teacherRoutes); // For teacher-specific routes
app.use("/api/courses", courseRoutes);
app.use("/api/exams", examRoutes);
app.use("/api/elearning", elearningRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/fees", feeRoutes);
app.use("/api/payments", paymentsRoutes);
app.use("/api/receipts", require("./routes/receiptRoutes"));
app.use("/api/expenses", expenseRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/scholarships", scholarshipRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/classes", classRoutes);
app.use("/api/financial-reports", financialReportRoutes);
app.use("/api/reports", require("./routes/reportRoutes"));
app.use("/api/system", systemAnalyticsRoutes);
app.use("/api/global-settings", globalSettingsRoutes);
app.use("/api/notices", noticeRoutes);
app.use("/api/security", require("./routes/securityRoutes"));
app.use("/api/audit", require("./routes/auditRoutes"));
app.use("/api/branch-admins", require("./routes/branchAdminRoutes"));
app.use("/api/departments", departmentRoutes);

// Landing page content routes
app.use("/api/landing/news", newsRoutes);
app.use("/api/landing/events", eventRoutes);
app.use("/api/landing/staff", staffRoutes);
app.use("/api/landing/courses", publicCourseRoutes);
app.use("/api/push", pushRoutes);

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Global error handler
app.use(errorHandler);

// Database connection
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error("Database connection error:", error);
    process.exit(1);
  }
};

// Start server
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();

  // VAPID keys are configured in pushController.js
  // Do not generate new keys here as it will break existing subscriptions

  // Create HTTP server
  const server = http.createServer(app);

  // Initialize Socket.IO
  const io = socketIo(server, {
    cors: {
      origin: [
        process.env.CMS_FRONTEND_URL || "http://localhost:3000",
        process.env.ELEARNING_FRONTEND_URL || "http://localhost:3001",
        "http://localhost:3000",
        "http://localhost:3001",
      ],
      credentials: true,
    },
  });

  // Socket.IO connection handling
  io.on("connection", (socket) => {
    socket.on("join-discussion", (discussionId) => {
      socket.join(`discussion-${discussionId}`);
    });

    socket.on("leave-discussion", (discussionId) => {
      socket.leave(`discussion-${discussionId}`);
    });

    socket.on("new-post", (data) => {
      // Broadcast new post to discussion room
      socket.to(`discussion-${data.discussionId}`).emit("new-post", data.post);
    });

    socket.on("disconnect", () => {
      // User disconnected
    });
  });

  // Make io available to routes
  app.set("io", io);

  // Initialize quiz scheduling service after DB connection
  try {
    const quizSchedulingService = require("./services/quizSchedulingService");
  } catch (error) {
    console.error("Error initializing quiz scheduling service:", error.message);
  }

  // Initialize push notification schedulers
  try {
    const classReminderService = require("./services/classReminderService");
    classReminderService.initializeClassReminderScheduler();
  } catch (error) {
    console.error("Error initializing class reminder service:", error.message);
  }

  try {
    const liveSessionReminderService = require("./services/liveSessionReminderService");
    liveSessionReminderService.initializeLiveSessionReminderScheduler();
  } catch (error) {
    console.error(
      "Error initializing live session reminder service:",
      error.message
    );
  }

  try {
    const feeReminderService = require("./services/feeReminderService");
    feeReminderService.initializeFeeReminderScheduler();
  } catch (error) {
    console.error("Error initializing fee reminder service:", error.message);
  }

  // Initialize teacher notification schedulers
  try {
    const teacherClassReminderService = require("./services/teacherClassReminderService");
    teacherClassReminderService.initializeTeacherClassReminderScheduler();
  } catch (error) {
    console.error(
      "Error initializing teacher class reminder service:",
      error.message
    );
  }

  try {
    const gradingReminderService = require("./services/gradingReminderService");
    gradingReminderService.initializeGradingReminderScheduler();
  } catch (error) {
    console.error(
      "Error initializing grading reminder service:",
      error.message
    );
  }

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

// Handle unhandled promise rejections
process.on("unhandledRejection", (err, promise) => {
  console.log("Unhandled Rejection at:", promise, "reason:", err);
  process.exit(1);
});

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  console.log("Uncaught Exception:", err);
  process.exit(1);
});

startServer();

module.exports = app;
