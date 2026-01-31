# Sentry Error Tracking Setup Guide

This guide explains how to set up Sentry error tracking and performance monitoring for the ATIAM CMS Backend.

## What is Sentry?

Sentry is a real-time error tracking and performance monitoring platform that helps you:

- Track and fix errors in production
- Monitor application performance
- Get alerted when errors occur
- See detailed stack traces and user context
- Identify patterns in errors

## Setup Instructions

### 1. Create a Sentry Account

1. Go to [https://sentry.io](https://sentry.io) and sign up for a free account
2. Create a new project
3. Select **Node.js** as your platform
4. Copy your **DSN (Data Source Name)** - it looks like:
   ```
   https://abc123def456@o123456.ingest.sentry.io/789012
   ```

### 2. Install Dependencies

The Sentry packages have already been added to `package.json`. Install them by running:

```bash
npm install
```

This will install:

- `@sentry/node` - Sentry SDK for Node.js
- `@sentry/profiling-node` - Performance profiling integration

### 3. Configure Environment Variables

Add the following to your `.env` file:

```bash
# Sentry Error Tracking & Performance Monitoring
SENTRY_DSN=your-sentry-dsn-here
SENTRY_ENVIRONMENT=production  # or development, staging, etc.
SENTRY_ENABLED=true
```

**Important:**

- Replace `your-sentry-dsn-here` with your actual Sentry DSN
- Set `SENTRY_ENVIRONMENT` to match your deployment environment
- Set `SENTRY_ENABLED=false` to disable Sentry without removing the DSN

### 4. Restart Your Application

```bash
npm run dev     # For development
npm start       # For production
```

You should see a message: `✓ Sentry initialized for [environment] environment`

## Features Implemented

### Automatic Error Tracking

All uncaught errors and unhandled promise rejections are automatically sent to Sentry with:

- Full stack trace
- Request information (method, URL, headers)
- User context (if authenticated)
- Environment details

### Performance Monitoring

Sentry tracks:

- API endpoint response times
- Database query performance
- Overall application performance

### Error Filtering

The following errors are NOT sent to Sentry (to reduce noise):

- Client errors (4xx status codes)
- JWT validation errors (expired/invalid tokens)
- CORS errors
- 404 Not Found errors

### User Context

When a user is authenticated, errors include:

- User ID
- Email
- Username
- Role

This helps identify which users are affected by specific errors.

## Testing Sentry Integration

To test if Sentry is working correctly, you can temporarily add a test error:

```javascript
// In any controller
throw new Error("Test Sentry Error - Please Delete This");
```

Then:

1. Trigger the endpoint that contains this error
2. Check your Sentry dashboard
3. You should see the error appear within seconds
4. Remove the test error

## Using Sentry Manually in Your Code

You can also capture errors manually in your controllers:

```javascript
const {
  captureException,
  captureMessage,
  addBreadcrumb,
} = require("../config/sentry");

// Capture an exception
try {
  // Your code
} catch (error) {
  captureException(error, {
    tags: {
      feature: "payments",
      severity: "high",
    },
    extra: {
      transactionId: transaction.id,
      amount: transaction.amount,
    },
  });
  // Handle error
}

// Capture a warning message
captureMessage("Low disk space detected", "warning", {
  extra: { freeSpace: diskSpace },
});

// Add breadcrumbs to track user actions
addBreadcrumb({
  category: "auth",
  message: "User logged in",
  level: "info",
  data: { userId: user.id },
});
```

## Best Practices

1. **Don't Over-Report**: We filter out expected errors (like validation errors) to reduce noise
2. **Add Context**: Include relevant data to help debug issues faster
3. **Set Proper Environments**: Use different projects or environments for dev/staging/production
4. **Review Regularly**: Check your Sentry dashboard weekly to identify patterns
5. **Set Up Alerts**: Configure email/Slack alerts for critical errors

## Sample Rate Configuration

Performance monitoring sample rates are configured in `config/sentry.js`:

- **Production**: 10% of transactions (reduces data usage)
- **Development**: 100% of transactions (full visibility)

You can adjust these based on your needs and Sentry plan.

## Deployment Considerations

### Zero-Downtime Deployment

Sentry integration is designed to not disrupt operations:

- If `SENTRY_DSN` is not set, the app runs normally without Sentry
- Sentry errors are logged but don't crash the app
- All Sentry operations are non-blocking

### Security

- Never commit your `.env` file with the Sentry DSN
- Rotate your DSN if it's accidentally exposed
- Sentry filters sensitive data automatically (passwords, tokens)

## Troubleshooting

### "Sentry DSN not provided"

- Add `SENTRY_DSN` to your `.env` file
- Restart your application

### Errors not appearing in Sentry

1. Check that `SENTRY_ENABLED=true`
2. Verify your DSN is correct
3. Check that you're triggering a 5xx error (not 4xx)
4. Look at console logs for Sentry initialization message

### Too many errors reported

- Review ignored errors in `config/sentry.js`
- Add more error types to the ignore list
- Implement proper error handling in your code

## Support

- Sentry Documentation: https://docs.sentry.io/platforms/node/
- Sentry Express Guide: https://docs.sentry.io/platforms/node/guides/express/

## Cost

Sentry offers:

- **Free Tier**: 5,000 errors/month
- **Team Tier**: Starting at $26/month for 50,000 errors
- **Business Tier**: Starting at $80/month for 100,000 errors

For our backend, the free tier should be sufficient initially. Monitor your usage in the Sentry dashboard.
