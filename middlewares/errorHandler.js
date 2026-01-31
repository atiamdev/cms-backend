const { captureException } = require("../config/sentry");

// Global error handling middleware
const errorHandler = (err, req, res, next) => {
  console.error("Error:", err);

  let error = { ...err };
  error.message = err.message;

  // Determine if this is a client error (4xx) or server error (5xx)
  let statusCode = err.statusCode || 500;
  let isServerError = statusCode >= 500;

  // Mongoose bad ObjectId
  if (err.name === "CastError") {
    const message = "Resource not found";
    error = {
      message,
      statusCode: 404,
    };
    statusCode = 404;
    isServerError = false;
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    let message = "Duplicate field value entered";

    // Extract field name from error
    const field = Object.keys(err.keyValue)[0];
    if (field) {
      message = `${
        field.charAt(0).toUpperCase() + field.slice(1)
      } already exists`;
    }

    error = {
      message,
      statusCode: 400,
    };
    statusCode = 400;
    isServerError = false;
  }

  // Mongoose validation error
  if (err.name === "ValidationError") {
    const message = Object.values(err.errors)
      .map((val) => val.message)
      .join(", ");
    error = {
      message,
      statusCode: 400,
    };
    statusCode = 400;
    isServerError = false;
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    const message = "Invalid token";
    error = {
      message,
      statusCode: 401,
    };
    statusCode = 401;
    isServerError = false;
  }

  if (err.name === "TokenExpiredError") {
    const message = "Token expired";
    error = {
      message,
      statusCode: 401,
    };
    statusCode = 401;
    isServerError = false;
  }

  // Only send server errors (5xx) to Sentry, not client errors (4xx)
  if (isServerError && statusCode >= 500) {
    captureException(err, {
      user: req.user
        ? {
            id: req.user.id || req.user._id,
            email: req.user.email,
            username: req.user.username,
            role: req.user.role,
          }
        : undefined,
      tags: {
        method: req.method,
        url: req.url,
        statusCode: statusCode,
      },
      extra: {
        body: req.body,
        params: req.params,
        query: req.query,
        headers: req.headers,
      },
    });
  }

  // Default to 500 server error
  const message = error.message || "Server Error";

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === "development" && {
      stack: err.stack,
      error: err,
    }),
  });
};

module.exports = errorHandler;
