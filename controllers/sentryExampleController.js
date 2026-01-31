/**
 * Example Controller with Sentry Integration
 *
 * This file demonstrates how to use Sentry for error tracking in your controllers.
 * You can copy these patterns into your existing controllers.
 */

const {
  captureException,
  captureMessage,
  addBreadcrumb,
} = require("../config/sentry");

// Example 1: Automatic Error Handling with Express
// The global error handler will automatically catch and report errors to Sentry
const automaticErrorHandling = async (req, res, next) => {
  try {
    // Your code here
    const result = await someAsyncOperation();
    res.json({ success: true, data: result });
  } catch (error) {
    // Just pass the error to the next middleware
    // It will be caught by the error handler and sent to Sentry automatically
    next(error);
  }
};

// Example 2: Manual Error Capture with Context
const manualErrorCapture = async (req, res) => {
  try {
    const payment = await processPayment(req.body);
    res.json({ success: true, data: payment });
  } catch (error) {
    // Capture with additional context
    captureException(error, {
      user: req.user,
      tags: {
        feature: "payments",
        payment_method: req.body.paymentMethod,
        severity: "critical",
      },
      extra: {
        amount: req.body.amount,
        currency: req.body.currency,
        studentId: req.body.studentId,
        timestamp: new Date().toISOString(),
      },
      level: "error", // 'fatal', 'error', 'warning', 'log', 'info', 'debug'
    });

    res.status(500).json({
      success: false,
      message: "Payment processing failed",
    });
  }
};

// Example 3: Warning Messages
const captureWarning = async (req, res) => {
  const diskSpace = await checkDiskSpace();

  if (diskSpace < 1000) {
    // Less than 1GB
    captureMessage("Low disk space detected", "warning", {
      tags: { component: "storage" },
      extra: {
        availableSpace: diskSpace,
        threshold: 1000,
      },
    });
  }

  res.json({ success: true, diskSpace });
};

// Example 4: Breadcrumbs for Debugging
const trackUserActions = async (req, res, next) => {
  try {
    // Add breadcrumb to track user flow
    addBreadcrumb({
      category: "enrollment",
      message: "Student enrollment started",
      level: "info",
      data: {
        studentId: req.body.studentId,
        courseId: req.body.courseId,
        timestamp: Date.now(),
      },
    });

    const enrollment = await createEnrollment(req.body);

    addBreadcrumb({
      category: "enrollment",
      message: "Student enrollment completed",
      level: "info",
      data: {
        enrollmentId: enrollment._id,
        success: true,
      },
    });

    res.json({ success: true, data: enrollment });
  } catch (error) {
    addBreadcrumb({
      category: "enrollment",
      message: "Student enrollment failed",
      level: "error",
      data: {
        errorMessage: error.message,
        errorType: error.name,
      },
    });

    next(error); // This will include all breadcrumbs in the error report
  }
};

// Example 5: Database Operation with Error Context
const databaseOperation = async (req, res, next) => {
  try {
    const student = await Student.findById(req.params.id);

    if (!student) {
      // Don't send 404 to Sentry (it's a client error, not a bug)
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    res.json({ success: true, data: student });
  } catch (error) {
    // Database errors will be automatically sent to Sentry
    // with request context by the error handler
    next(error);
  }
};

// Example 6: External API Call with Error Handling
const externalApiCall = async (req, res, next) => {
  try {
    const response = await axios.post("https://api.mpesa.com/payment", {
      amount: req.body.amount,
      phone: req.body.phone,
    });

    res.json({ success: true, data: response.data });
  } catch (error) {
    // Capture API errors with specific context
    captureException(error, {
      tags: {
        service: "mpesa",
        endpoint: "/payment",
      },
      extra: {
        requestData: {
          amount: req.body.amount,
          phone: req.body.phone,
        },
        responseStatus: error.response?.status,
        responseData: error.response?.data,
      },
    });

    res.status(503).json({
      success: false,
      message: "Payment service unavailable",
    });
  }
};

// Example 7: Critical Business Logic
const criticalOperation = async (req, res, next) => {
  try {
    // Start a transaction for performance monitoring
    addBreadcrumb({
      category: "performance",
      message: "Starting certificate generation",
      level: "info",
    });

    const startTime = Date.now();
    const certificate = await generateCertificate(req.params.studentId);
    const duration = Date.now() - startTime;

    // Log slow operations
    if (duration > 5000) {
      captureMessage("Certificate generation is slow", "warning", {
        tags: {
          performance: "slow",
          operation: "certificate_generation",
        },
        extra: {
          duration,
          studentId: req.params.studentId,
        },
      });
    }

    res.json({ success: true, data: certificate });
  } catch (error) {
    // Mark critical errors
    captureException(error, {
      level: "fatal",
      tags: {
        critical: true,
        operation: "certificate_generation",
      },
    });

    next(error);
  }
};

// Example 8: Scheduled Job Error Handling
const scheduledJobExample = async () => {
  try {
    addBreadcrumb({
      category: "cron",
      message: "Starting daily report generation",
      level: "info",
    });

    const reports = await generateDailyReports();

    console.log(`Generated ${reports.length} reports`);
  } catch (error) {
    // Scheduled jobs need manual error capture
    captureException(error, {
      tags: {
        job: "daily_reports",
        scheduled: true,
      },
      extra: {
        timestamp: new Date().toISOString(),
        jobName: "generateDailyReports",
      },
    });

    console.error("Failed to generate daily reports:", error);
  }
};

module.exports = {
  automaticErrorHandling,
  manualErrorCapture,
  captureWarning,
  trackUserActions,
  databaseOperation,
  externalApiCall,
  criticalOperation,
  scheduledJobExample,
};
