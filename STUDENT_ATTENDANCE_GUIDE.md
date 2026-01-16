# Student Attendance Feature - Complete Guide

## Overview

Students can now view their attendance records synced from the ZKTeco fingerprint system. Each student sees **only their own attendance** with detailed clock in/out times and statistics.

---

## Frontend Implementation

### Student Attendance Page

**URL:** `http://localhost:3000/student/attendance`

### Features

#### 1. **Attendance Statistics Cards**

- **Attendance Rate:** Overall percentage for selected month
- **Present Days:** Number of days marked present
- **Absent Days:** Number of days marked absent
- **Late Days:** Number of days marked late

#### 2. **Monthly Overview**

- Month selector to view historical data
- Color-coded summary cards:
  - 🟢 **Present** - Green
  - 🔴 **Absent** - Red
  - 🟡 **Late** - Yellow
  - 🔵 **Total Rate** - Blue

#### 3. **Attendance Records List**

Each record shows:

- **Date:** Full date with weekday
- **Status Badge:** Present/Absent/Late/Excused
- **Clock In Time:** 🟢 When student arrived
- **Clock Out Time:** 🔴 When student left
- **Duration:** ⏱️ Total time in school (hours and minutes)
- **Method:** How attendance was recorded
  - 🔐 **Fingerprint** (from ZKTeco)
  - ✍️ **Manual** (marked by staff)
  - 💳 **Card** (if using card system)
- **Sync Source:** Shows "ZKTeco Synced" badge if from fingerprint device
- **Remarks:** Any notes added by staff

#### 4. **Performance Analysis**

- **Overall Rating:** Excellent/Good/Average/Needs Improvement
- **Consistency:** Based on absent days (High/Medium/Low)
- **Punctuality:** Based on late days (Excellent/Good/Fair)

---

## Backend API

### New Endpoint: Get My Attendance

**Endpoint:** `GET /api/attendance/my-attendance`

**Authorization:** Student role only (protected endpoint)

**Query Parameters:**

```javascript
{
  page: 1,              // Page number (default: 1)
  limit: 50,            // Records per page (default: 50)
  dateFrom: '2025-10-01', // Start date (defaults to current month)
  dateTo: '2025-10-31',   // End date (defaults to current month)
  status: 'present',    // Filter by status (optional)
  sortBy: 'date',       // Sort field (default: 'date')
  sortOrder: 'desc'     // Sort order (default: 'desc')
}
```

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "_id": "67023abc123...",
      "userId": "688a19e8...",
      "userType": "student",
      "status": "present",
      "date": "2025-10-06T00:00:00.000Z",
      "clockIn": "2025-10-06T06:15:23.000Z",
      "clockOut": "2025-10-06T14:30:45.000Z",
      "durationMinutes": 495,
      "method": "biometric",
      "syncSource": "zkteco_db",
      "zktecoData": {
        "enrollNumber": "123",
        "deviceSerialNumber": "K40-001",
        "verifyMode": 1,
        "inOutMode": 0
      },
      "deviceIp": "192.168.107.40",
      "studentId": {
        "_id": "...",
        "studentId": "STD001",
        "admissionNumber": "ADM7C70514"
      },
      "classId": {
        "_id": "...",
        "name": "Grade 10A",
        "grade": "10",
        "section": "A"
      },
      "recordedBy": null
    }
  ],
  "pagination": {
    "total": 23,
    "page": 1,
    "limit": 50,
    "pages": 1
  },
  "summary": {
    "total": 23,
    "present": 20,
    "absent": 2,
    "late": 1,
    "excused": 0,
    "attendancePercentage": 86.96
  }
}
```

---

## Security & Privacy

### Access Control

✅ **Students can ONLY see their own records**

- The endpoint automatically filters by `req.user._id` (logged-in student)
- No ability to view other students' attendance
- Route protected with `authorize(["student"])` middleware

### Data Filtering

```javascript
const query = {
  userId: req.user._id, // Only logged-in student's records
  branchId: req.user.branchId, // Only from their branch
  userType: "student", // Only student records
};
```

### Authorization Flow

```
1. Student logs in → Gets JWT token with userId
2. Makes request to /api/attendance/my-attendance
3. Backend middleware:
   - protect() → Validates JWT token
   - authorize(["student"]) → Checks role is "student"
4. Controller filters records by userId from token
5. Returns only that student's data
```

---

## Data Mapping

### ZKTeco → CMS Attendance

| ZKTeco Field     | CMS Field          | Description                 |
| ---------------- | ------------------ | --------------------------- |
| SSN              | admissionNumber    | Student admission number    |
| USERID           | zktecoEnrollNumber | Device enrollment ID        |
| CHECKTIME        | clockIn            | First scan of the day       |
| CHECKTIME (next) | clockOut           | Last scan of the day        |
| -                | durationMinutes    | Auto-calculated from in/out |
| -                | method             | Set to "biometric"          |
| -                | syncSource         | Set to "zkteco_db"          |
| Device IP        | deviceIp           | Stored for reference        |

### Attendance Status Logic

The sync automatically determines status:

- **Present:** Has clock-in time (regardless of time)
- **Late:** Clock-in after school start time (configurable)
- **Absent:** No record for that school day
- **Excused:** Manually set by staff

---

## Usage Examples

### Frontend API Call

```typescript
import { getMyAttendance } from "../../services/attendance";

// Get current month's attendance
const { data } = await getMyAttendance({
  dateFrom: "2025-10-01",
  dateTo: "2025-10-31",
  limit: 100,
});

// Access the data
console.log("Total days:", data.summary.total);
console.log("Present:", data.summary.present);
console.log("Attendance %:", data.summary.attendancePercentage);

// Loop through records
data.data.forEach((record) => {
  console.log(`${record.date}: ${record.status}`);
  if (record.clockIn) {
    console.log(`  In: ${new Date(record.clockIn).toLocaleTimeString()}`);
  }
  if (record.clockOut) {
    console.log(`  Out: ${new Date(record.clockOut).toLocaleTimeString()}`);
  }
});
```

### Testing the Endpoint

```bash
# Login as student first
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "student@example.com", "password": "password123"}'

# Copy the token from response

# Get attendance (replace YOUR_TOKEN)
curl -X GET "http://localhost:5000/api/attendance/my-attendance?dateFrom=2025-10-01&dateTo=2025-10-31" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## UI Components

### 1. Stats Cards

```tsx
<StatsCard
  title="Attendance Rate"
  value={`${attendanceRate.toFixed(1)}%`}
  icon={TrendingUp}
  color="blue"
/>
```

### 2. Status Badge

```tsx
<span
  className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${getStatusColor(
    record.status
  )}`}
>
  {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
</span>
```

### 3. Time Display

```tsx
{
  record.clockIn && (
    <p className="text-xs text-gray-500">
      <span className="text-green-600">IN:</span>
      {new Date(record.clockIn).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      })}
    </p>
  );
}
```

### 4. ZKTeco Badge

```tsx
{
  record.syncSource === "zkteco_db" && (
    <p className="text-xs text-blue-500">
      <CheckCircle className="h-3 w-3" />
      ZKTeco Synced
    </p>
  );
}
```

---

## Responsive Design

### Mobile (< 640px)

- 2-column grid for stats cards
- Smaller padding and font sizes
- Stack record details vertically
- Collapsible month selector

### Tablet (640px - 1024px)

- 2-column grid for stats cards
- Full-width records list
- Balanced spacing

### Desktop (> 1024px)

- 4-column grid for stats cards
- 3-column layout (overview + records)
- Maximum readability
- Hover effects enabled

---

## Real-Time Updates

### Auto-Refresh

```tsx
refetchInterval: 5 * 60 * 1000; // Refetch every 5 minutes
```

This ensures:

- Student sees new attendance within 5 minutes of fingerprint scan
- Sync happens every 30-60 seconds on backend
- Maximum delay: ~6 minutes (sync + refetch)

### Manual Refresh

Student can select a different month to trigger immediate refetch:

```tsx
const [selectedMonth, setSelectedMonth] = useState(
  new Date().toISOString().slice(0, 7)
);
```

---

## Error Handling

### No Records Found

```tsx
<div className="text-center py-12">
  <Calendar className="mx-auto h-16 w-16 text-gray-400" />
  <h3 className="mt-4 text-lg font-medium text-gray-900">
    No attendance records found
  </h3>
  <p className="mt-2 text-sm text-gray-500">
    Attendance records for the selected period will appear here.
  </p>
</div>
```

### Loading State

```tsx
if (isLoading) {
  return <LoadingSpinner />;
}
```

### Authentication Error

Handled by the `protect` middleware - redirects to login if not authenticated.

---

## Performance Optimizations

### 1. **Pagination**

- Default limit: 50 records per page
- Prevents loading thousands of records at once

### 2. **Date Filtering**

- Defaults to current month only
- Reduces database query size

### 3. **Lean Queries**

```javascript
.lean()  // Returns plain JavaScript objects instead of Mongoose documents
```

### 4. **Selective Population**

Only populates needed fields:

```javascript
.populate({
  path: "studentId",
  select: "studentId admissionNumber currentClassId",
})
```

### 5. **Indexed Queries**

Attendance collection has indexes on:

- `userId`
- `branchId`
- `date`
- `userType`

---

## Future Enhancements

### Planned Features

1. **Export Attendance**

   - Download as PDF/Excel
   - Monthly/yearly reports

2. **Parent Access**

   - Parents can view their child's attendance
   - Email notifications for absences

3. **Attendance Trends**

   - Charts showing attendance over time
   - Comparison with class average

4. **Leave Requests**

   - Students/parents can request leave
   - Auto-marks as "excused" when approved

5. **Notifications**
   - Push notifications for sync updates
   - Alerts for low attendance

---

## Troubleshooting

### Issue: Student sees no records

**Check:**

1. Is ZKTeco sync running?
2. Has student scanned fingerprint?
3. Is `admissionNumber` correctly mapped?
4. Check backend logs for sync errors

**Solution:**

```bash
# Check sync status
curl -X GET "http://localhost:5000/api/attendance/last-sync" \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

### Issue: Wrong attendance times

**Cause:** Timezone differences

**Solution:** Ensure ZKTeco device time matches server time

### Issue: "Unauthorized" error

**Cause:** Student not logged in or invalid token

**Solution:** Log out and log back in to refresh token

---

## Complete Flow Diagram

```
Student Scans Fingerprint on K40
         ↓
ZKTeco Software writes to att2000.mdb
         ↓
Sync script (every 30s) copies database
         ↓
Sync script reads attendance records
         ↓
POST to /api/attendance/sync-from-branch
         ↓
Backend matches admissionNumber → Student → User
         ↓
Creates Attendance record with:
  - userId (from Student.userId)
  - clockIn (from CHECKTIME)
  - method: "biometric"
  - syncSource: "zkteco_db"
         ↓
Student visits /student/attendance
         ↓
Frontend calls GET /api/attendance/my-attendance
         ↓
Backend filters by logged-in student's userId
         ↓
Returns attendance records + summary
         ↓
Frontend displays with clock in/out times
```

---

## Summary

✅ **Secure** - Students only see their own data  
✅ **Real-time** - Updates every 5 minutes  
✅ **Detailed** - Shows exact clock in/out times from fingerprint  
✅ **User-friendly** - Clean, responsive interface  
✅ **Accurate** - Direct sync from ZKTeco device  
✅ **Performant** - Optimized queries with pagination

**The student attendance feature is now fully functional!** 🎉
