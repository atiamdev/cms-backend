const Sentry = require("@sentry/node");
const { nodeProfilingIntegration } = require("@sentry/profiling-node");

/**
 * Initialize Sentry for error tracking and performance monitoring
 * This should be called at the very beginning of your application
 */
function initializeSentry() {
  // Only initialize if DSN is provided
  if (!process.env.SENTRY_DSN) {
    console.log("Sentry DSN not provided. Skipping Sentry initialization.");
    return false;
  }

  const environment =
    process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development";
  const release =
    process.env.SENTRY_RELEASE ||
    `atiam-cms-backend@${process.env.npm_package_version || "1.0.0"}`;

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: environment,
    release: release,

    // Performance Monitoring
    tracesSampleRate: environment === "production" ? 0.1 : 1.0, // Capture 10% in production, 100% in dev

    // Profiling
    profilesSampleRate: environment === "production" ? 0.1 : 1.0,
    integrations: [nodeProfilingIntegration()],

    // Don't send errors in development unless explicitly enabled
    enabled: process.env.SENTRY_ENABLED !== "false",

    // Enhanced context
    beforeSend(event, hint) {
      // Add custom filtering logic here if needed
      // For example, filter out specific errors or add additional context

      // Don't send CORS errors to Sentry (these are expected)
      if (
        event.exception?.values?.[0]?.value?.includes("Not allowed by CORS")
      ) {
        return null;
      }

      return event;
    },

    // Ignore specific errors
    ignoreErrors: [
      // Browser errors that shouldn't appear in backend
      "ResizeObserver loop limit exceeded",
      "Non-Error promise rejection captured",
      // Network errors that are expected
      "Network request failed",
      "NetworkError",
      // JWT validation errors (these are expected for invalid tokens)
      "jwt expired",
      "invalid signature",
      "jwt malformed",
    ],
  });

  console.log(`✓ Sentry initialized for ${environment} environment`);
  return true;
}

/**
 * Capture an exception manually
 * @param {Error} error - The error to capture
 * @param {Object} context - Additional context to send with the error
 */
function captureException(error, context = {}) {
  if (!process.env.SENTRY_DSN) return;

  Sentry.withScope((scope) => {
    // Add custom context
    if (context.user) {
      scope.setUser({
        id: context.user.id || context.user._id,
        email: context.user.email,
        username: context.user.username,
        role: context.user.role,
      });
    }

    if (context.tags) {
      Object.keys(context.tags).forEach((key) => {
        scope.setTag(key, context.tags[key]);
      });
    }

    if (context.extra) {
      Object.keys(context.extra).forEach((key) => {
        scope.setExtra(key, context.extra[key]);
      });
    }

    if (context.level) {
      scope.setLevel(context.level);
    }

    Sentry.captureException(error);
  });
}

/**
 * Capture a message manually
 * @param {string} message - The message to capture
 * @param {string} level - The severity level (fatal, error, warning, log, info, debug)
 * @param {Object} context - Additional context
 */
function captureMessage(message, level = "info", context = {}) {
  if (!process.env.SENTRY_DSN) return;

  Sentry.withScope((scope) => {
    if (context.user) {
      scope.setUser(context.user);
    }

    if (context.tags) {
      Object.keys(context.tags).forEach((key) => {
        scope.setTag(key, context.tags[key]);
      });
    }

    if (context.extra) {
      Object.keys(context.extra).forEach((key) => {
        scope.setExtra(key, context.extra[key]);
      });
    }

    Sentry.captureMessage(message, level);
  });
}

/**
 * Add user context to Sentry scope
 * @param {Object} user - User object
 */
function setUser(user) {
  if (!process.env.SENTRY_DSN || !user) return;

  Sentry.setUser({
    id: user.id || user._id?.toString(),
    email: user.email,
    username: user.username,
    role: user.role,
  });
}

/**
 * Clear user context
 */
function clearUser() {
  if (!process.env.SENTRY_DSN) return;
  Sentry.setUser(null);
}

/**
 * Add breadcrumb for tracking user actions
 * @param {Object} breadcrumb - Breadcrumb data
 */
function addBreadcrumb(breadcrumb) {
  if (!process.env.SENTRY_DSN) return;
  Sentry.addBreadcrumb(breadcrumb);
}

module.exports = {
  Sentry,
  initializeSentry,
  captureException,
  captureMessage,
  setUser,
  clearUser,
  addBreadcrumb,
};
