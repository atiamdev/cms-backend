# Manual E-Learning Enrollment Feature

## Overview

This feature allows admins and superadmins to manually enroll students (both regular students and e-course students) into e-learning courses. This is particularly useful for handling cash payments or administrative enrollments that bypass the standard payment flow.

## API Endpoint

### Manual Student Enrollment

**POST** `/api/elearning/courses/:courseId/enroll-student`

**Authentication Required:** Yes (Admin or SuperAdmin only)

**Request Parameters:**

- `courseId` (path parameter): The ID of the course to enroll the student in

**Request Body:**

```json
{
  "studentId": "string (required)",
  "notes": "string (optional)"
}
```

**Example Request:**

```javascript
POST /api/elearning/courses/6547abc123def456/enroll-student
Authorization: Bearer <admin_token>

{
  "studentId": "6547xyz789ghi012",
  "notes": "Cash payment received - KES 5000"
}
```

**Success Response (201):**

```json
{
  "success": true,
  "message": "Student successfully enrolled in course",
  "data": {
    "enrollment": {
      "_id": "6547enrollment123",
      "studentId": {
        "_id": "6547xyz789ghi012",
        "firstName": "John",
        "lastName": "Doe",
        "email": "john.doe@example.com",
        "studentType": "regular"
      },
      "courseId": {
        "_id": "6547abc123def456",
        "title": "Introduction to Programming",
        "description": "Learn programming basics",
        "thumbnail": "...",
        "pricing": {
          "type": "paid",
          "amount": 5000
        }
      },
      "enrolledBy": {
        "_id": "6547admin456",
        "firstName": "Admin",
        "lastName": "User",
        "email": "admin@example.com",
        "role": "admin"
      },
      "enrollmentType": "manual",
      "status": "active",
      "notes": "Cash payment received - KES 5000",
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

**Error Responses:**

- **400 Bad Request** - Validation error or business logic error

```json
{
  "success": false,
  "message": "Student ID is required"
}
```

```json
{
  "success": false,
  "message": "Student is already enrolled in this course (Status: active)",
  "data": {
    "enrollment": { ... }
  }
}
```

```json
{
  "success": false,
  "message": "Cannot enroll in unpublished course"
}
```

```json
{
  "success": false,
  "message": "Course is full (50/50 students enrolled)"
}
```

- **403 Forbidden** - Admin trying to enroll student from different branch

```json
{
  "success": false,
  "message": "You can only enroll students from your branch"
}
```

- **404 Not Found** - Course or student not found

```json
{
  "success": false,
  "message": "Course not found"
}
```

```json
{
  "success": false,
  "message": "Student not found"
}
```

## Features

### 1. Bypasses Payment Requirements

- No payment validation or processing required
- Ideal for cash payments or voucher-based enrollments
- Admin can add notes explaining payment method

### 2. Access Control

- **Branch Admin:** Can only enroll students from their own branch
- **Super Admin:** Can enroll students from any branch

### 3. Validation Checks

The endpoint performs the following validations:

- ✅ Course exists and is published
- ✅ Student exists and has role "student"
- ✅ Student not already enrolled (prevents duplicates)
- ✅ Course has available capacity (if maxStudents is set)
- ✅ Admin has permission to enroll this student

### 4. Student Type Support

Works with both student types:

- **Regular Students** (`studentType: "regular"`)
- **E-Course Students** (`studentType: "ecourse"`)

### 5. Auto-Approval

- Enrollment status is automatically set to `"active"`
- No approval workflow required for manual enrollments
- Student can immediately access course content

### 6. Audit Trail

Every manual enrollment is logged in the audit system with:

- Admin who performed the enrollment
- Student details
- Course details
- Enrollment type and notes
- Timestamp and IP address

## Database Schema Updates

### Enrollment Model

Added new fields to support manual enrollment:

```javascript
{
  // ... existing fields ...

  // Who enrolled the student (for manual enrollments)
  enrolledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },

  // Notes about the enrollment (e.g., "Cash payment received")
  notes: {
    type: String,
  },
}
```

### AuditLog Model

Added new enum values:

**Actions:**

- `ENROLLMENT_CREATED`
- `ENROLLMENT_UPDATED`
- `ENROLLMENT_DELETED`

**Resource Types:**

- `ENROLLMENT`

## Testing

A comprehensive test file is provided: `test-manual-enrollment.js`

**Run tests:**

```bash
node test-manual-enrollment.js
```

**Tests included:**

1. ✅ Get published course for testing
2. ✅ Get student for enrollment
3. ✅ Manual enrollment by admin
4. ✅ Duplicate enrollment prevention
5. ✅ Verify enrollment in student records

## Use Cases

### 1. Cash Payment

```javascript
// Student pays KES 5000 in cash for a course
POST /api/elearning/courses/courseId/enroll-student
{
  "studentId": "studentId",
  "notes": "Cash payment received - KES 5000 on 2024-01-15"
}
```

### 2. Scholarship/Waiver

```javascript
// Enroll student with scholarship
POST /api/elearning/courses/courseId/enroll-student
{
  "studentId": "studentId",
  "notes": "Full scholarship awarded - No payment required"
}
```

### 3. Voucher Redemption

```javascript
// Student redeems physical voucher
POST /api/elearning/courses/courseId/enroll-student
{
  "studentId": "studentId",
  "notes": "Voucher code: VOUCHER2024 redeemed"
}
```

### 4. Administrative Enrollment

```javascript
// Enroll staff member for training
POST /api/elearning/courses/courseId/enroll-student
{
  "studentId": "studentId",
  "notes": "Mandatory training enrollment"
}
```

## Frontend Integration (TODO)

To integrate this feature in the admin dashboard, you'll need:

1. **Student Search Component**

   - Search students by name, email, or student ID
   - Display student type (regular/ecourse)
   - Show student's current enrollments

2. **Course Selection**

   - List published courses
   - Show available capacity
   - Display course pricing

3. **Enrollment Form**

   - Student selector (dropdown or search)
   - Course selector
   - Notes textarea (for payment details)
   - Submit button

4. **Confirmation Dialog**

   - Display student info
   - Display course info
   - Confirm enrollment action

5. **Success/Error Handling**
   - Show success message with enrollment details
   - Handle duplicate enrollment gracefully
   - Display error messages clearly

**Sample React Component Structure:**

```
AdminManualEnrollment/
├── StudentSearch.tsx          // Search and select student
├── CourseSelector.tsx         // Select course from list
├── EnrollmentForm.tsx         // Main form with notes
├── EnrollmentConfirmation.tsx // Confirm before enrolling
└── EnrollmentHistory.tsx      // View recent manual enrollments
```

## Security Considerations

1. **Authorization:**

   - Only admin and superadmin roles can access this endpoint
   - Branch admins restricted to their branch students

2. **Validation:**

   - All inputs are validated
   - MongoDB ObjectId format validated
   - Student role verification

3. **Audit Logging:**

   - All manual enrollments are logged
   - Includes admin details, student details, and notes
   - Cannot be deleted (audit trail integrity)

4. **Duplicate Prevention:**
   - Unique index on `(studentId, courseId)` prevents duplicates
   - API returns clear error message for duplicate attempts

## Troubleshooting

### Issue: "Student not found"

**Solution:** Verify the studentId exists and the user has role "student"

### Issue: "You can only enroll students from your branch"

**Solution:** Branch admins can only enroll students from their assigned branch. Use superadmin account for cross-branch enrollments.

### Issue: "Course is full"

**Solution:** Check course `maxStudents` limit. Either increase the limit or remove inactive enrollments.

### Issue: "Student is already enrolled"

**Solution:** Check existing enrollment status. If status is "dropped" or "suspended", you may need to update the existing enrollment instead of creating a new one.

## Related Documentation

- [E-Learning Routes](/cms-backend/routes/elearningRoutes.js)
- [E-Course Controller](/cms-backend/controllers/elearning/eCourseController.js)
- [Enrollment Model](/cms-backend/models/elearning/Enrollment.js)
- [Audit Log Model](/cms-backend/models/AuditLog.js)
