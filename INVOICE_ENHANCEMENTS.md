# Monthly Invoice System - Enhanced Features

## Overview

The monthly invoice system has been significantly enhanced with three major improvements:
1. **Automated Student Notifications** - Students receive notifications when invoices are generated
2. **Invoice Consolidation** - Multiple courses consolidated into single monthly invoices
3. **Robust Error Recovery** - Cron jobs with retry logic and admin alerting

---

## 1. Invoice Notification System

### Features

Students are automatically notified when invoices are generated through multiple channels:
- **In-App Notices** - High-priority notices in the student portal
- **Email Notifications** - Formatted email with invoice details
- **Push Notifications** - Mobile/web push notifications

### Notification Service

**Location**: `services/invoiceNotificationService.js`

#### Main Functions

##### `notifyStudentOfInvoice(params)`
Sends notification to a single student about a new invoice.

```javascript
await notifyStudentOfInvoice({
  studentId: "student_id",
  feeId: "fee_id",
  amount: 5000,
  dueDate: new Date("2026-02-10"),
  period: "January 2026",
  branchId: "branch_id"
});
```

##### `notifyStudentsOfInvoices(invoices)`
Sends bulk notifications for multiple invoices efficiently (batched processing).

```javascript
await notifyStudentsOfInvoices([
  { studentId: "...", feeId: "...", amount: 5000, ... },
  { studentId: "...", feeId: "...", amount: 3000, ... }
]);
```

##### `sendPaymentReminder(params)`
Sends payment reminder for overdue invoices.

```javascript
await sendPaymentReminder({
  studentId: "student_id",
  feeId: "fee_id",
  balance: 2500,
  dueDate: new Date("2026-01-10"),
  daysOverdue: 5
});
```

### Integration

Notifications are automatically sent when:
- Monthly invoices are generated (scheduled or manual)
- Weekly/quarterly/annual invoices are created
- Student enrolls in a course with `createInvoiceOnEnrollment` enabled

---

## 2. Invoice Consolidation

### Features

**Before**: Students enrolled in multiple courses received separate invoices for each course.

**After**: All courses are consolidated into a single monthly invoice per student (configurable).

### Benefits

- **Simpler Payment Process** - Students pay once per month instead of multiple times
- **Reduced Confusion** - One invoice to track instead of many
- **Better Reporting** - Clearer financial overview per student

### Configuration

Invoice consolidation is **enabled by default** but can be disabled:

```javascript
// Generate consolidated invoices (default)
await generateMonthlyInvoices({ 
  periodYear: 2026, 
  periodMonth: 1,
  consolidate: true  // One invoice per student
});

// Generate separate invoices per course
await generateMonthlyInvoices({ 
  periodYear: 2026, 
  periodMonth: 1,
  consolidate: false  // One invoice per course
});
```

### Database Schema Changes

**Fee Model** - New fields added:
```javascript
{
  isConsolidated: Boolean,           // Flag indicating consolidated invoice
  consolidatedFeeStructures: [ObjectId], // Array of fee structure IDs included
  metadata: Mixed                     // Additional metadata (e.g., course count)
}
```

### Example Consolidated Invoice

A student enrolled in 3 courses (Math: KES 2,000, English: KES 1,500, Science: KES 2,500):

**Single Invoice**:
- Total Amount: KES 6,000
- Fee Components: All components from all 3 courses
- Due Date: 10th of the month
- Consolidated Fee Structures: [math_fee_id, english_fee_id, science_fee_id]

---

## 3. Error Recovery & Alerting

### Features

Scheduled jobs now include:
- **Automatic Retry Logic** - Jobs retry up to 3 times on failure
- **Exponential Backoff** - Increasing delays between retries (2s, 4s, 8s)
- **Admin Alerting** - Administrators notified of persistent failures
- **Execution Tracking** - Full history of job runs and failures
- **Health Monitoring** - Real-time job health status

### Enhanced Jobs

All scheduled jobs now have retry protection:
- Student Inactivity Check
- At-Risk Notifications
- Monthly Invoice Generation
- Weekly Invoice Generation
- Quarterly Invoice Generation
- Annual Invoice Generation

### Retry Mechanism

```javascript
// Job will automatically retry up to 3 times
await executeJobWithRetry(
  "monthlyInvoiceGeneration",
  async () => {
    const result = await generateMonthlyInvoices({ ... });
    return result;
  },
  2  // Max retries (2 for invoice jobs to avoid duplicates)
);
```

### Admin Alerts

When a job fails **2+ consecutive times**, administrators receive:
- **Urgent In-App Notice** with error details
- Alert includes: job name, error message, consecutive failure count
- System logs maintain full error history

### Monitoring Endpoints

#### Get Job Status
```
GET /api/system/jobs/status
```
Returns current status of all scheduled jobs.

**Response**:
```json
{
  "success": true,
  "data": {
    "monthlyInvoiceGeneration": {
      "running": true,
      "history": {
        "lastRun": "2026-01-13T03:00:00.000Z",
        "lastSuccess": "2026-01-13T03:00:05.123Z",
        "failures": 0,
        "consecutiveFailures": 0
      }
    }
  }
}
```

#### Get Job Health Report
```
GET /api/system/jobs/health
```
Returns comprehensive health report with alerts.

**Response**:
```json
{
  "success": true,
  "data": {
    "timestamp": "2026-01-13T10:30:00.000Z",
    "totalJobs": 6,
    "healthStatus": "healthy",
    "jobs": {
      "monthlyInvoiceGeneration": {
        "lastRun": "2026-01-13T03:00:00.000Z",
        "lastSuccess": "2026-01-13T03:00:05.123Z",
        "failures": 0,
        "consecutiveFailures": 0,
        "timeSinceLastRun": "450 minutes",
        "timeSinceLastSuccess": "450 minutes",
        "health": "good"
      }
    },
    "alerts": []
  }
}
```

#### System Health Check
```
GET /api/system/health
```
General system health including database connection and memory usage.

---

## Usage Examples

### Manual Invoice Generation (with notifications)

```javascript
// Via API endpoint
POST /api/fees/generate-monthly
{
  "year": 2026,
  "month": 1
}

// Response includes notification count
{
  "success": true,
  "message": "Generated invoices for 2026-01",
  "data": {
    "created": 150,
    "skipped": 20,
    "notificationsPending": 150
  }
}
```

### Backfill Historical Invoices

```bash
# With consolidation (default)
node scripts/backfill-monthly-invoices.js --from=2025-09 --to=2026-01 --force

# Without consolidation
node scripts/backfill-monthly-invoices.js --from=2025-09 --to=2026-01 --consolidate=false --force

# Dry run to preview
node scripts/backfill-monthly-invoices.js --from=2025-09 --to=2026-01 --dryRun --force
```

### Check Job Health (Admin Dashboard)

```javascript
// Fetch job health
const response = await fetch('/api/system/jobs/health', {
  headers: { 'Authorization': `Bearer ${adminToken}` }
});

const health = await response.json();

// Display alerts if any
if (health.data.alerts.length > 0) {
  console.warn('Job Alerts:', health.data.alerts);
}
```

---

## Configuration

### Environment Variables

No new environment variables required. The system uses existing configurations.

### Notification Preferences

Notification behavior can be customized by modifying `invoiceNotificationService.js`:
- Email templates
- Notification priority levels
- Batch sizes for bulk notifications

### Job Schedules

Cron schedules are defined in `scheduledJobs.js`:
- **Monthly**: 1st of month at 03:00
- **Weekly**: Every Monday at 03:00
- **Quarterly**: 1st of Jan/Apr/Jul/Oct at 03:00
- **Annual**: January 1st at 03:00

---

## Testing

### Test Notification Service

```javascript
const { notifyStudentOfInvoice } = require('./services/invoiceNotificationService');

// Send test notification
await notifyStudentOfInvoice({
  studentId: "test_student_id",
  feeId: "test_fee_id",
  amount: 5000,
  dueDate: new Date(),
  period: "Test Period",
  branchId: "test_branch_id"
});
```

### Test Consolidated Invoice

```javascript
const { generateMonthlyInvoices } = require('./services/monthlyInvoiceService');

// Generate test invoices with consolidation
const result = await generateMonthlyInvoices({
  periodYear: 2026,
  periodMonth: 2,
  consolidate: true
});

console.log(`Created ${result.created} consolidated invoices`);
```

---

## Breaking Changes

### ⚠️ Important Changes

1. **academicTermId is now optional** in Fee model
   - Existing queries filtering by academicTermId should handle null values
   - Update frontend to not require academicTermId for monthly invoices

2. **Late fee fields removed**
   - `lateFeeApplied` removed from Fee model
   - `lateFeeAmount` and `lateFeeGracePeriod` removed from FeeStructure
   - Balance calculation updated

3. **Invoice consolidation enabled by default**
   - Students will receive one invoice per month instead of multiple
   - Existing integrations expecting separate invoices per course may need updates

---

## Troubleshooting

### Notifications Not Sending

1. Check if email service is configured properly
2. Verify student has valid email in profile
3. Check logs for notification errors: `console.log` statements in service

### Jobs Failing Repeatedly

1. Check job health: `GET /api/system/jobs/health`
2. Review server logs for specific error messages
3. Check database connectivity
4. Verify scheduled jobs are initialized: Look for "INITIALIZING SCHEDULED JOBS" in startup logs

### Consolidated Invoices Creating Duplicates

1. Ensure `periodYear`, `periodMonth`, and `periodStart` are set correctly
2. Check unique indexes on Fee model are working
3. Run backfill with `--dryRun` first to preview

---

## Future Enhancements

Potential improvements for consideration:
- SMS notifications via Twilio/Africa's Talking
- WhatsApp notifications for invoices
- Parent/guardian notification options
- Customizable notification templates per branch
- Invoice preview before sending notifications
- Scheduled notification preferences (e.g., "Don't send before 9 AM")

---

## Support

For issues or questions:
1. Check server logs: `pm2 logs` or console output
2. Review job health endpoint for diagnostic information
3. Check Notice model for system alerts
4. Review this documentation for configuration options
