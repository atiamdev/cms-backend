# Sentry Integration - Quick Start

## 🚀 Quick Setup (5 minutes)

### Step 1: Install Dependencies

```bash
cd cms-backend
npm install
```

### Step 2: Get Your Sentry DSN

1. **Create Account**: Go to [sentry.io](https://sentry.io) and sign up (free)
2. **Create Project**: Click "Create Project" → Select "Node.js" → Name it "atiam-cms-backend"
3. **Copy DSN**: You'll see a DSN like: `https://abc123@o123.ingest.sentry.io/456`

### Step 3: Configure Environment

Add to your `.env` file:

```bash
SENTRY_DSN=https://your-actual-dsn-here
SENTRY_ENVIRONMENT=production
SENTRY_ENABLED=true
```

### Step 4: Start Your Server

```bash
npm run dev
```

✅ Look for: `✓ Sentry initialized for production environment`

## ✨ What You Get

### Automatic Tracking (No Code Changes Needed!)

- ✅ All server errors (500+) automatically reported
- ✅ Unhandled promise rejections caught
- ✅ Uncaught exceptions logged
- ✅ Request context included (URL, method, headers)
- ✅ User context (if authenticated)
- ✅ Performance monitoring enabled

### What's NOT Sent to Sentry (to reduce noise)

- ❌ 404 Not Found errors
- ❌ 401 Unauthorized (expired tokens)
- ❌ 400 Bad Request (validation errors)
- ❌ CORS errors
- ❌ JWT validation errors

## 🧪 Test It

1. Create a test error in any controller:

   ```javascript
   throw new Error("Test Sentry - DELETE ME");
   ```

2. Trigger that endpoint via your frontend or Postman

3. Check Sentry dashboard - error should appear within 5 seconds!

4. Remove the test error

## 📊 View Errors

1. Go to [sentry.io](https://sentry.io)
2. Click your project "atiam-cms-backend"
3. See all errors in real-time with:
   - Full stack traces
   - User information
   - Request details
   - Frequency and patterns

## 🔧 Optional: Manual Error Capture

For custom error tracking in critical areas:

```javascript
const { captureException } = require("../config/sentry");

try {
  await criticalOperation();
} catch (error) {
  captureException(error, {
    tags: { feature: "payments" },
    extra: { transactionId: "12345" },
  });
  // Handle error
}
```

See `controllers/sentryExampleController.js` for more examples.

## 🎯 Benefits

1. **Proactive**: Know about errors before users report them
2. **Context**: See exactly what caused each error
3. **Patterns**: Identify recurring issues
4. **Performance**: Track slow endpoints
5. **Alerts**: Get notified via email/Slack

## 💰 Cost

- **Free**: 5,000 errors/month (sufficient for most use cases)
- **Paid**: Starts at $26/month if you need more

## 🛡️ Safety

- ✅ Zero impact if DSN not configured (app runs normally)
- ✅ Non-blocking (errors in Sentry don't crash your app)
- ✅ Sensitive data filtered automatically
- ✅ Can be disabled with `SENTRY_ENABLED=false`

## 📚 Full Documentation

See [README-SENTRY.md](./README-SENTRY.md) for complete documentation.

## ❓ Troubleshooting

**Errors not showing up?**

1. Check `SENTRY_DSN` is set correctly
2. Verify `SENTRY_ENABLED=true`
3. Ensure error is 5xx (not 4xx)
4. Check console for Sentry initialization message

**Too many errors?**

- Review and fix the most frequent ones first
- Adjust ignored errors in `config/sentry.js`
- Implement proper error handling

## 🎉 That's It!

You're now tracking errors in production. Check your Sentry dashboard regularly to catch and fix issues before they impact users.
