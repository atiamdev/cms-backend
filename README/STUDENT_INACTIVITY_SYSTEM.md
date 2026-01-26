# Student Inactivity Auto-Detection System

## Overview

This system automatically marks students as **inactive** if they haven't attended school for **2 weeks** (10 school days - Monday to Friday). It integrates with the existing ZKTeco biometric attendance system without disrupting it.

## How It Works

### 1. Automatic Daily Check (Scheduled Job)

- **When:** Every day at **6:00 AM** (Monday to Friday)
- **What:** Scans all active students to check their last attendance date
- **Action:** Students with no attendance for 10+ school days are automatically marked as `inactive`

### 2. Automatic Reactivation

- **When:** A student who was marked inactive clocks in via ZKTeco biometric
- **What:** The attendance sync automatically detects the inactive status
- **Action:** Student status is automatically changed back to `active`

### 3. At-Risk Alerts

- Students absent for **5-9 school days** are flagged as "at risk"
- Admins can view at-risk students before they become inactive

## Configuration

The system uses these default settings (defined in `services/studentInactivityService.js`):

| Setting                  | Value      | Description                                   |
| ------------------------ | ---------- | --------------------------------------------- |
| `ABSENCE_THRESHOLD_DAYS` | 10         | School days (Mon-Fri) before marking inactive |
| `ACTIVE_STATUSES`        | ["active"] | Statuses to check for inactivity              |
| `INACTIVE_STATUS`        | "inactive" | Status to change to when threshold is reached |

## API Endpoints

All endpoints are under `/api/students/inactivity/`:

### Check & Mark Inactive Students

```
POST /api/students/inactivity/check
```

**Access:** Admin only
**Description:** Manually trigger the inactivity check (useful for testing or immediate updates)

**Response:**

```json
{
  "success": true,
  "message": "Inactivity check completed. 3 students marked inactive.",
  "data": {
    "summary": {
      "totalChecked": 150,
      "totalMarkedInactive": 3,
      "duration": "2.5s"
    },
    "results": [...]
  }
}
```

### Get At-Risk Students

```
GET /api/students/inactivity/at-risk
```

**Access:** Admin, Secretary
**Description:** Get students who are at risk of becoming inactive (absent 5-9 school days)

**Response:**

```json
{
  "success": true,
  "message": "Found 5 students at risk of becoming inactive",
  "data": {
    "threshold": 10,
    "students": [
      {
        "_id": "...",
        "studentId": "STU001",
        "admissionNumber": "ADM2024001",
        "userId": {
          "firstName": "John",
          "lastName": "Doe"
        },
        "lastAttendance": "2024-01-15T00:00:00.000Z",
        "daysAbsent": 7
      }
    ]
  }
}
```

### Get Inactivity Summary

```
GET /api/students/inactivity/summary
```

**Access:** Admin, Secretary
**Description:** Get overall inactivity statistics for the branch

**Response:**

```json
{
  "success": true,
  "data": {
    "summary": {
      "totalStudents": 200,
      "activeStudents": 185,
      "inactiveStudents": 15,
      "atRiskCount": 5,
      "inactivityRate": "7.50"
    },
    "config": {
      "absenceThresholdDays": 10,
      "description": "Students absent for 10+ school days are marked inactive"
    },
    "recentlyMarkedInactive": [...],
    "atRiskStudents": [...]
  }
}
```

### Get Student Inactivity Status

```
GET /api/students/inactivity/status/:studentId
```

**Access:** Admin, Secretary, Teacher
**Description:** Get detailed inactivity status for a specific student

### Reactivate Student

```
POST /api/students/inactivity/reactivate/:studentId
```

**Access:** Admin, Secretary
**Description:** Manually reactivate an inactive student

**Body:**

```json
{
  "reason": "Student returned to school with parent confirmation"
}
```

### Get Configuration

```
GET /api/students/inactivity/config
```

**Access:** Admin
**Description:** Get current inactivity system configuration

## Files & Components

### Backend Files

| File                                   | Purpose                                 |
| -------------------------------------- | --------------------------------------- |
| `services/studentInactivityService.js` | Core service with all inactivity logic  |
| `scheduledJobs.js`                     | Cron job scheduler (runs daily at 6 AM) |
| `routes/studentInactivityRoutes.js`    | API endpoints                           |
| `controllers/attendanceController.js`  | Modified to auto-reactivate on check-in |

### Integration Points

1. **server.js** - Initializes scheduled jobs on server start
2. **attendanceController.js** - Calls `checkAndAutoReactivate()` after syncing attendance

## Status History Tracking

All status changes are tracked in the student's `statusHistory` array:

```javascript
{
  oldStatus: "active",
  newStatus: "inactive",
  changedBy: ObjectId("system-user-id"),
  changedAt: ISODate("2024-01-25T06:00:00.000Z"),
  reason: "Automatically marked inactive due to 2 weeks of absence (no attendance records). Last attendance: 1/10/2024"
}
```

## Flow Diagrams

### Daily Inactivity Check Flow

```
[6:00 AM Cron Job]
        │
        ▼
[Get all active students]
        │
        ▼
[For each student: Check last attendance]
        │
        ├── Has attendance in last 10 school days? → Skip
        │
        └── No attendance for 10+ school days?
                │
                ▼
        [Mark as INACTIVE]
        [Add to statusHistory]
        [Log the change]
```

### Auto-Reactivation Flow

```
[Student clocks in via ZKTeco]
        │
        ▼
[Attendance sync runs]
        │
        ▼
[Save attendance record]
        │
        ▼
[Check if student is inactive]
        │
        ├── Already active? → Continue
        │
        └── Status is "inactive"?
                │
                ▼
        [Change status to ACTIVE]
        [Add to statusHistory with reason]
        [Log: "Auto-reactivated"]
```

## Testing

### Test Manual Inactivity Check

```bash
curl -X POST http://localhost:5001/api/students/inactivity/check \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

### Test Getting At-Risk Students

```bash
curl http://localhost:5001/api/students/inactivity/at-risk \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Test in Node.js Console

```javascript
// In your server environment
const {
  checkAndMarkInactiveStudents,
} = require("./services/studentInactivityService");

// Run the check
const result = await checkAndMarkInactiveStudents();
console.log(result);
```

## Logs

The system logs all activities with emojis for easy identification:

| Emoji | Meaning                      |
| ----- | ---------------------------- |
| 🔍    | Inactivity check started     |
| 📅    | Date/time information        |
| 🏢    | Processing branch            |
| 👥    | Student count                |
| ⚠️    | Student marked inactive      |
| ✅    | Check completed successfully |
| 🔄    | Student auto-reactivated     |
| ❌    | Error occurred               |

Example log output:

```
============================================================
🔍 STUDENT INACTIVITY CHECK
📅 Running at: 1/25/2024, 6:00:00 AM
============================================================

📍 Branch: Main Campus
----------------------------------------
📅 Cutoff date: 1/10/2024 (10 school days ago)
👥 Found 150 active students to check
⚠️  Marked inactive: STU001 (ADM2024001) - Last attendance: 1/5/2024
⚠️  Marked inactive: STU002 (ADM2024002) - Last attendance: Never
✅ Checked: 150, Marked inactive: 2

============================================================
📊 SUMMARY
============================================================
Total students checked: 150
Total marked inactive: 2
Duration: 3.25s
============================================================
```

## Troubleshooting

### Scheduled Job Not Running

1. Check if `scheduledJobs.js` is properly imported in `server.js`
2. Verify the server logs show "✅ Scheduled jobs initialized"
3. Check if node-cron is installed: `npm list node-cron`

### Students Not Being Marked Inactive

1. Verify the student's current status is "active"
2. Check if attendance records exist for the student
3. Run manual check: `POST /api/students/inactivity/check`

### Auto-Reactivation Not Working

1. Check attendance sync logs for the `checkAndAutoReactivate` call
2. Verify student was in "inactive" status (not "suspended" or "dropped")
3. Check the attendance record was saved successfully

## Notes

- The system only affects students with `academicStatus: "active"`
- Students with status "suspended", "graduated", "transferred", or "dropped" are NOT affected
- Weekend days (Saturday, Sunday) are NOT counted as school days
- Public holidays are NOT yet excluded (future enhancement)
- The system creates a special "system" user for automated status changes
