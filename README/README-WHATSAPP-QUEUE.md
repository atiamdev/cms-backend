# WhatsApp Queue System - Rate Limit Management

## Overview

This document explains the new systematic message queue system implemented to handle WasenderAPI rate limits efficiently on the paid plan.

## Rate Limits (Paid Plan)

According to WasenderAPI documentation:

- **Paid Plans** (Basic, Pro, Plus, Business): **256 requests/minute**
- **Trial Plan**: 1 request/minute
- **Account Protection Mode**: 1 request/5 seconds (overrides plan limits)

## Implementation

### New Components

#### 1. WhatsApp Queue Service (`services/whatsappQueueService.js`)

A comprehensive queue-based system that:

- ✅ Handles bulk message sending with automatic rate limiting
- ✅ Processes messages at optimal speed (256/minute = ~258ms between messages with 10% safety buffer)
- ✅ Supports priority queuing (high/medium/low)
- ✅ Automatic retry on failure (up to 3 attempts)
- ✅ Real-time queue monitoring and statistics
- ✅ Graceful error handling

**Key Features:**

```javascript
// Add single message
const queueId = await whatsAppQueueService.addToQueue({
  phoneNumber: "+254712345678",
  message: "Your message here",
  metadata: { type: "invoice", studentId: "123" },
  priority: 1, // 1=high, 2=normal, 3=low
});

// Add bulk messages
const queueIds = await whatsAppQueueService.addBulkToQueue([
  { phoneNumber: "...", message: "...", priority: 2 },
  { phoneNumber: "...", message: "...", priority: 1 },
]);

// Monitor queue
const stats = whatsAppQueueService.getStats();
const status = whatsAppQueueService.getQueueStatus();
```

#### 2. Updated Services

All WhatsApp notification services now use the queue:

- ✅ **Notice WhatsApp Service** (`services/noticeWhatsAppService.js`)
  - Bulk queuing for all recipients
  - Priority-based sending (high priority notices sent first)
  - Separate message templates for students vs guardians

- 🔄 **Invoice Notification Service** (ready to update)
- 🔄 **Attendance Report Service** (ready to update)

#### 3. New API Endpoints

Added queue management endpoints to `/api/whatsapp/*`:

| Endpoint                     | Method | Description                             |
| ---------------------------- | ------ | --------------------------------------- |
| `/api/whatsapp/queue/status` | GET    | Get queue statistics and current status |
| `/api/whatsapp/queue/pause`  | POST   | Pause queue processing                  |
| `/api/whatsapp/queue/resume` | POST   | Resume queue processing                 |
| `/api/whatsapp/queue`        | DELETE | Clear queue (emergency stop)            |

All endpoints require **Admin authentication**.

## Configuration

Add to your `.env` file:

```env
# WhatsApp Queue Configuration
WHATSAPP_MESSAGES_PER_MINUTE=256

# For trial accounts, use:
# WHATSAPP_MESSAGES_PER_MINUTE=1

# For account protection mode, use:
# WHATSAPP_MESSAGES_PER_MINUTE=12  # (1 message per 5 seconds)
```

The queue service automatically calculates optimal delays:

- **256/minute** = ~234ms per message + 10% safety buffer = **258ms delay**
- **1/minute** = 60,000ms delay
- **12/minute** = 5,000ms delay

## Usage Examples

### Example 1: Sending Notice Notifications

```javascript
const noticeWhatsAppService = require("./services/noticeWhatsAppService");

// Service automatically queues all messages
const result = await noticeWhatsAppService.sendNoticeNotifications(notice);

console.log(`${result.results.queued} messages queued`);
console.log(`Queue IDs:`, result.results.queueIds);
```

### Example 2: Monitoring Queue Status

```javascript
// Via API (requires admin token)
GET /api/whatsapp/queue/status
Authorization: Bearer <admin_token>

// Response:
{
  "stats": {
    "totalQueued": 50,
    "totalSent": 45,
    "totalFailed": 2,
    "currentQueueLength": 3,
    "processing": true,
    "messagesPerMinute": 256,
    "estimatedTimeRemaining": 774  // milliseconds
  },
  "queue": {
    "queueLength": 3,
    "processing": true,
    "items": [...]
  }
}
```

### Example 3: Emergency Queue Control

```javascript
// Pause queue (e.g., during maintenance)
POST / api / whatsapp / queue / pause;

// Resume queue
POST / api / whatsapp / queue / resume;

// Clear entire queue (emergency stop)
DELETE / api / whatsapp / queue;
```

## Benefits

### Before (Without Queue)

❌ Manual delays between messages (inefficient)
❌ No retry mechanism
❌ No priority handling
❌ No visibility into sending progress
❌ Risk of hitting rate limits
❌ Sequential processing only

### After (With Queue)

✅ Systematic rate-limited sending at optimal speed
✅ Automatic retry on failure (up to 3 attempts)
✅ Priority queue (urgent messages sent first)
✅ Real-time monitoring and statistics
✅ Guaranteed compliance with API rate limits
✅ Efficient bulk processing
✅ Admin controls (pause/resume/clear)

## Performance

### Sending Speed

| Plan           | Messages/Minute | Time per Message | 100 Messages | 1000 Messages |
| -------------- | --------------- | ---------------- | ------------ | ------------- |
| Paid (256/min) | 256             | ~258ms           | ~25 seconds  | ~4.3 minutes  |
| Trial (1/min)  | 1               | 60,000ms         | 100 minutes  | ~16.7 hours   |

### Example: Sending Notices to 100 Students

**Before:**

- Sequential sending with 1000ms delay
- Total time: ~100 seconds (1.67 minutes)
- No retry on failure
- Manual monitoring

**After:**

- Queue-based sending with 258ms optimal delay
- Total time: ~25 seconds
- Automatic retry on failure
- Real-time monitoring dashboard
- **4x faster!** ⚡

## Testing

Run the test suite:

```bash
# Test the queue service
node test-whatsapp-queue.js
```

Expected output:

```
🧪 Testing WhatsApp Queue Service
============================================================

📊 Test 1: Service Initialization
✅ Queue service initialized
   Rate limit: 256 messages/minute
   Delay between messages: 258 ms

📊 Test 2: Single Message Queue
✅ Message queued with ID: msg_1738...

📊 Test 3: Bulk Message Queue
✅ Bulk messages queued: 3

📊 Test 4: Queue Status
✅ Queue status retrieved
   Total items in queue: 4

📊 Test 5: Monitor Queue Processing
📊 Queue: 3 pending | Sent: 1 | Failed: 0 | Processing: Yes
📊 Queue: 2 pending | Sent: 2 | Failed: 0 | Processing: Yes
📊 Queue: 0 pending | Sent: 4 | Failed: 0 | Processing: No

✅ Queue processing completed!

📈 Final Statistics:
============================================================
   Total Queued: 4
   Total Sent: 4
   Total Failed: 0
   Success Rate: 100.0%
   Average Processing Time: 245ms
```

## Migration Guide

### For Existing Services

To migrate existing WhatsApp notification code to use the queue:

**Before:**

```javascript
const result = await whatsAppService.sendMessage(phone, message);
if (result.success) {
  // handle success
}
```

**After:**

```javascript
const queueId = await whatsAppQueueService.addToQueue({
  phoneNumber: phone,
  message: message,
  metadata: { type: "invoice", studentId },
  priority: 2,
});
// Message will be sent automatically by the queue processor
```

### For Bulk Sending

**Before:**

```javascript
for (const student of students) {
  await whatsAppService.sendMessage(student.phone, message);
  await delay(1000); // Manual rate limiting
}
```

**After:**

```javascript
const messages = students.map((student) => ({
  phoneNumber: student.phone,
  message: buildMessage(student),
  metadata: { type: "report", studentId: student._id },
  priority: 2,
}));

await whatsAppQueueService.addBulkToQueue(messages);
// All messages queued instantly, processed systematically
```

## Monitoring & Troubleshooting

### Check Queue Status

```bash
# Via curl
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  http://localhost:5000/api/whatsapp/queue/status
```

### Common Issues

**Problem: Messages not sending**

- Check `.env` has `WHATSAPP_ENABLED=true`
- Verify `WASENDER_API_KEY` and `WASENDER_PERSONAL_ACCESS_TOKEN`
- Check queue status: `GET /api/whatsapp/queue/status`

**Problem: Queue processing stuck**

- Pause and resume: `POST /api/whatsapp/queue/pause` then `/resume`
- Check for errors in console logs
- Clear and retry: `DELETE /api/whatsapp/queue`

**Problem: Rate limit errors (429)**

- Reduce `WHATSAPP_MESSAGES_PER_MINUTE` in `.env`
- Add safety buffer (e.g., 230 instead of 256)
- Check if Account Protection mode is enabled in WasenderAPI dashboard

## Production Deployment

### Checklist

- [ ] Set `WHATSAPP_MESSAGES_PER_MINUTE=256` for paid plan
- [ ] Verify WasenderAPI credentials are set
- [ ] Test with small batch first (5-10 messages)
- [ ] Monitor queue statistics for first hour
- [ ] Set up alerts for failed messages
- [ ] Document admin access to queue controls

### Recommended Settings

```env
# Production settings for paid plan
WHATSAPP_ENABLED=true
WHATSAPP_MESSAGES_PER_MINUTE=256
WHATSAPP_MAX_RETRIES=3
WHATSAPP_RATE_LIMIT_DELAY=1000  # For direct sends only
```

## Future Enhancements

Potential improvements for future versions:

- [ ] Database persistence for queue (survive restarts)
- [ ] Scheduled sending (send at specific time)
- [ ] Queue analytics dashboard
- [ ] Webhook status updates
- [ ] Multi-session support (distribute across multiple sessions)
- [ ] Dead letter queue for permanently failed messages
- [ ] Priority lanes (separate queues per priority)

## Support

For issues related to:

- **Queue System**: Check console logs and queue status endpoint
- **Rate Limits**: See WasenderAPI documentation or contact support
- **Message Failures**: Check retry attempts and error messages in queue details

---

**Last Updated**: January 31, 2026  
**Version**: 1.0.0  
**Author**: ATIAM Development Team
