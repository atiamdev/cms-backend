# Attendance Management System

A comprehensive attendance tracking system with ZKTeco biometric device integration for the ATIAM College Management System.

## 🌟 Features

### Core Attendance Management

- **Multi-User Support**: Students, teachers, secretaries, and admin staff
- **Multiple Attendance Types**: Biometric, card, manual entry, and mobile
- **Real-time Clock In/Out**: Automatic time tracking with total hours calculation
- **Status Management**: Present, absent, late, half-day, early departure
- **Late Arrival Detection**: Automatic calculation of late minutes
- **Early Departure Tracking**: Monitor early departures with time calculations

### ZKTeco Integration

- **Biometric Device Support**: Direct integration with ZKTeco fingerprint scanners
- **Card Reader Support**: RFID/magnetic card attendance
- **Real-time Sync**: Automatic synchronization of attendance data
- **Device Management**: Multiple device support with device identification
- **Error Handling**: Robust error handling for device communication

### Reporting & Analytics

- **Dashboard Analytics**: Real-time attendance statistics and trends
- **Detailed Reports**: Comprehensive attendance reports with filters
- **Excel Export**: Export attendance data to Excel format
- **Trend Analysis**: Historical attendance trends and patterns
- **Class-wise Reports**: Attendance breakdown by class/department
- **Top Performers**: Identify users with best attendance rates

### Advanced Features

- **Approval Workflow**: Attendance approval system for corrections
- **Geolocation Support**: Location-based attendance for mobile users
- **Attendance Alerts**: Notifications for late arrivals and absences
- **Data Validation**: Comprehensive validation and error checking
- **Role-based Access**: Different access levels for different user types
- **Audit Trail**: Complete tracking of attendance modifications

## 📁 File Structure

```
attendance-system/
├── models/
│   └── Attendance.js           # Attendance data model
├── controllers/
│   ├── attendanceController.js     # Main attendance operations
│   └── attendanceReportController.js # Reporting and analytics
├── routes/
│   └── attendanceRoutes.js         # API endpoints
├── services/
│   └── zktecoService.js            # ZKTeco device integration
├── utils/
│   └── attendanceHelpers.js        # Utility functions
├── middlewares/
│   └── attendanceValidation.js     # Validation middleware
└── test-attendance-management.js   # Test suite
```

## 🚀 Quick Start

### 1. Installation

```bash
# Install dependencies (already included in main package.json)
npm install
```

### 2. Environment Setup

Add to your `.env` file:

```env
# ZKTeco Device Configuration
ZKTECO_DEFAULT_IP=192.168.1.201
ZKTECO_DEFAULT_PORT=4370
ZKTECO_TIMEOUT=5000

# Attendance Settings
ATTENDANCE_LATE_THRESHOLD=30  # minutes
ATTENDANCE_EARLY_DEPARTURE_THRESHOLD=30  # minutes
ATTENDANCE_WORKING_HOURS_START=08:00
ATTENDANCE_WORKING_HOURS_END=17:00
```

### 3. Database Setup

The attendance system uses the existing MongoDB connection. The Attendance model will be automatically created when you start the server.

### 4. Testing

```bash
# Run the attendance system tests
node test-attendance-management.js
```

## 📚 API Endpoints

### Attendance Management

| Method | Endpoint                        | Description                         | Access                                   |
| ------ | ------------------------------- | ----------------------------------- | ---------------------------------------- |
| GET    | `/api/attendance`               | Get attendance records with filters | Admin, Secretary, Teacher                |
| POST   | `/api/attendance/mark`          | Mark attendance manually            | Admin, Secretary, Teacher                |
| PUT    | `/api/attendance/:id/clock-out` | Clock out user                      | Admin, Secretary, Teacher, Student (own) |
| PUT    | `/api/attendance/:id`           | Update attendance record            | Admin, Secretary                         |
| DELETE | `/api/attendance/:id`           | Delete attendance record            | Admin only                               |
| GET    | `/api/attendance/summary`       | Get attendance summary              | Admin, Secretary, Teacher                |

### ZKTeco Integration

| Method | Endpoint                      | Description             | Access           |
| ------ | ----------------------------- | ----------------------- | ---------------- |
| POST   | `/api/attendance/sync-zkteco` | Sync from ZKTeco device | Admin, Secretary |

### Reporting

| Method | Endpoint                            | Description                | Access                    |
| ------ | ----------------------------------- | -------------------------- | ------------------------- |
| GET    | `/api/attendance/reports/dashboard` | Dashboard analytics        | Admin, Secretary, Teacher |
| GET    | `/api/attendance/reports/detailed`  | Detailed attendance report | Admin, Secretary, Teacher |
| GET    | `/api/attendance/reports/export`    | Export to Excel            | Admin, Secretary          |
| GET    | `/api/attendance/reports/trends`    | Attendance trends analysis | Admin, Secretary, Teacher |

## 🔧 ZKTeco Device Setup

### Supported Devices

- ZKTeco F18 / F19 / F21 series
- ZKTeco MA300 / MA500 series
- ZKTeco iClock series
- Most TCP/IP enabled ZKTeco devices

### Network Configuration

1. **Device IP Setup**: Configure your ZKTeco device with a static IP address
2. **Network Access**: Ensure the CMS server can reach the device IP
3. **Port Configuration**: Default port is 4370 (configurable)

### Device Registration

```javascript
// Example: Sync attendance from ZKTeco device
const syncData = {
  deviceIp: "192.168.1.201",
  devicePort: 4370,
  deviceName: "Main Gate Scanner",
};

// POST /api/attendance/sync-zkteco
```

### User Enrollment

Users need to be enrolled in the ZKTeco device with their biometric data. The enrollment number should match:

- Student ID for students
- Employee ID for teachers/staff
- Or use the `biometricId` field in the user profile

## 📊 Usage Examples

### 1. Mark Manual Attendance

```javascript
const attendanceData = {
  userId: "60d5ecb74d2a4b3c84d5e8f1",
  userType: "student",
  clockInTime: "2024-01-15T08:15:00.000Z",
  status: "late",
  notes: "Traffic jam",
  attendanceType: "manual",
};

// POST /api/attendance/mark
```

### 2. Clock Out User

```javascript
const clockOutData = {
  clockOutTime: "2024-01-15T15:30:00.000Z",
  notes: "Regular departure",
};

// PUT /api/attendance/:id/clock-out
```

### 3. Get Attendance Report

```javascript
// GET /api/attendance/reports/detailed?startDate=2024-01-01&endDate=2024-01-31&userType=student&classId=60d5ecb74d2a4b3c84d5e8f2
```

### 4. Export Attendance Data

```javascript
// GET /api/attendance/reports/export?startDate=2024-01-01&endDate=2024-01-31&format=excel
```

## 🔐 Security & Permissions

### Role-based Access Control

- **Admin**: Full access to all attendance features
- **Secretary**: Can mark, view, and generate reports
- **Teacher**: Can view attendance, limited reporting
- **Student**: Can only view their own attendance

### Data Validation

- Clock in/out time validation
- Duplicate attendance prevention
- Date range restrictions
- User authorization checks

## 📈 Analytics & Reporting

### Dashboard Metrics

- Daily/weekly/monthly attendance rates
- Late arrival statistics
- Top performing classes/individuals
- Attendance trends over time

### Report Types

1. **Summary Reports**: Quick overview with key metrics
2. **Detailed Reports**: Individual attendance records
3. **Trend Analysis**: Historical patterns and forecasts
4. **Class Reports**: Class-wise attendance breakdown
5. **Alert Reports**: Late arrivals and early departures

## 🛠️ Troubleshooting

### Common Issues

1. **ZKTeco Connection Failed**

   - Check device IP and network connectivity
   - Verify device is powered on and functioning
   - Ensure firewall allows connection on specified port

2. **Duplicate Attendance Error**

   - Each user can only have one attendance record per day
   - Use clock-out endpoint to update existing records

3. **Permission Denied**

   - Check user roles and branch authorization
   - Students can only access their own records

4. **Validation Errors**
   - Ensure clock-out time is after clock-in time
   - Check date formats (ISO 8601 required)
   - Verify required fields are provided

### Debug Mode

Enable debug logging in your `.env`:

```env
DEBUG_ATTENDANCE=true
LOG_LEVEL=debug
```

## 🔄 Data Migration

If migrating from an existing attendance system:

1. **Export existing data** to CSV format
2. **Map fields** to the new schema
3. **Use bulk import** via the API or direct database insertion
4. **Validate data** using the test suite

## 📞 Support

For technical support or feature requests:

- Check the test suite for usage examples
- Review the API documentation
- Contact the development team

## 🚦 Status Indicators

- 🟢 **Active Development**: Core features complete
- 🟡 **Testing Phase**: ZKTeco integration testing
- 🔵 **Documentation**: Comprehensive guides available
- ⚪ **Future**: Mobile app integration planned

---

_Built with ❤️ for ATIAM College Management System_
