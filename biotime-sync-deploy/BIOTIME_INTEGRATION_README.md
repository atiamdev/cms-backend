# BioTime 9.5 Integration Guide

This guide explains how to integrate ZKTeco BioTime 9.5 with the ATIAM CMS for attendance tracking and fee-based access control.

## Architecture Overview

The BioTime integration uses a **distributed architecture**:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Senseface 2A  │────│   BioTime 9.5   │────│  Sync Service   │
│   (Device)      │    │   (Windows)     │    │  (Windows)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                         │
                                                         │ HTTP API
                                                         ▼
                                               ┌─────────────────┐
                                               │   CMS Backend   │
                                               │   (Remote)      │
                                               └─────────────────┘
```

### Components:

1. **Senseface 2A**: Facial recognition device
2. **BioTime 9.5**: Time attendance software on Windows
3. **Sync Service**: Node.js service on Windows machine
4. **CMS Backend**: Remote server (portal.atiamcollege.com)

### Data Flow:

- **Students**: CMS → Sync Service → BioTime
- **Attendance**: BioTime → Sync Service → CMS
- **Access Control**: CMS fee status → Sync Service → BioTime device

## Deployment

The sync service **must run on the Windows machine** where BioTime is installed. It acts as a bridge between the local BioTime system and the remote CMS server.

### Required Files to Deploy:

- `sync/` folder (contains sync scripts)
- `services/bioTimeService.js`
- `.env` (with proper configuration)
- `package.json` (for dependencies)
- `node_modules/` (install with `npm install`)

## Configuration

Add the following environment variables to your `.env` file:

```env
# BioTime API Configuration
BIOTIME_API_URL=http://biotimedxb.com:8007
BIOTIME_USERNAME=your_biotime_username
BIOTIME_PASSWORD=your_biotime_password

# Sync Configuration
BIOTIME_SYNC_INTERVAL=60000
BIOTIME_BATCH_SIZE=100
```

## API Endpoints

### Student Access Control

**Update Student Access Based on Fee Status**

```
POST /api/attendance/update-access
```

Request Body:

```json
{
  "studentId": "STU001",
  "feeStatus": "paid" // or "pending" or "partial"
}
```

Response:

```json
{
  "success": true,
  "message": "Student access updated successfully. Status: paid",
  "data": {
    "studentId": "STU001",
    "feeStatus": "paid",
    "accessEnabled": true
  }
}
```

### Manual Sync

**Sync Attendance from BioTime**

```
POST /api/attendance/sync-biotime
```

This endpoint:

1. Uploads transactions from all BioTime devices
2. Retrieves recent attendance transactions
3. Creates attendance records in CMS database

## Automated Sync Service

The BioTime sync service runs continuously and performs the following tasks:

1. **Student Sync**: Syncs student data from CMS to BioTime
2. **Access Control**: Updates BioTime access permissions based on fee status
3. **Attendance Sync**: Retrieves attendance transactions from BioTime

### Localhost Testing Setup

### Prerequisites

- BioTime 9.5 installed and running on Windows machine
- CMS backend running on localhost (same or different machine)
- Network connectivity between machines

### Step 1: Configure BioTime for Network Access

1. **Open BioTime Web Interface**:
   - Access BioTime admin panel (usually `http://localhost:8080` or similar)
   - Go to **System Settings** > **Network Settings**

2. **Enable API Access**:
   - Ensure API service is enabled
   - Check the API port (default: 8080 or 8007)
   - Verify API documentation is accessible at `http://[BIOTIME_IP]:[PORT]/docs/api-docs/`

3. **Configure Firewall**:
   - Open Windows Firewall for BioTime port
   - Allow inbound connections on the API port

### Step 2: Network Configuration

#### Option A: Same Machine (Recommended for Testing)

If CMS and BioTime are on the same Windows machine:

```env
BIOTIME_API_URL=http://localhost:8007
BIOTIME_USERNAME=admin
BIOTIME_PASSWORD=your_password
```

#### Option B: Different Machines on Same Network

If CMS is on a different machine:

```env
BIOTIME_API_URL=http://[WINDOWS_MACHINE_IP]:8007
BIOTIME_USERNAME=admin
BIOTIME_PASSWORD=your_password
```

**Find Windows Machine IP:**

```cmd
ipconfig
```

Look for IPv4 Address under your network adapter.

### Step 3: Update Environment Variables

Create or update your `.env` file in `cms-backend/`:

```env
# BioTime API Configuration
BIOTIME_API_URL=http://localhost:8007
BIOTIME_USERNAME=your_biotime_username
BIOTIME_PASSWORD=your_biotime_password

# Sync Configuration
BIOTIME_SYNC_INTERVAL=30000  # 30 seconds for testing
BIOTIME_BATCH_SIZE=10        # Smaller batch for testing

# Branch Configuration (adjust as needed)
BRANCH_ID=your_branch_id
BRANCH_NAME=Test Branch
```

### Step 4: Test Network Connectivity

1. **Test BioTime API Access**:

```bash
curl http://localhost:8007/docs/api-docs/
```

2. **Test API Connectivity with Node.js**:

```bash
cd cms-backend
node -e "
const BioTimeService = require('./services/bioTimeService');
const service = new BioTimeService();
service.authenticate().then(() => {
  console.log('✅ BioTime API connection successful');
  return service.getEmployees({page_size: 1});
}).then(result => {
  console.log('✅ Employee API working, found', result.count, 'employees');
}).catch(error => {
  console.error('❌ Connection failed:', error.message);
});
"
```

### Step 5: Configure BioTime for Testing

1. **Create Test Department**:
   - In BioTime: Go to **Personnel** > **Department**
   - Create department: "Test Branch"

2. **Create Test Users**:
   - Add test employees with codes like "TEST001", "TEST002"
   - Assign to "Test Branch" department

3. **Configure Access Areas**:
   - Create test access areas
   - Assign users to areas

4. **Set Up Device** (if available):
   - Add your Senseface 2A device
   - Configure device settings

### Step 6: Start Testing

1. **Start CMS Backend**:

```bash
cd cms-backend
npm run dev
```

2. **Start BioTime Sync Service** (in new terminal):

```bash
cd cms-backend
./sync/start-biotime-sync.sh
```

3. **Test API Endpoints**:

**Test Student Sync:**

```bash
curl -X POST http://localhost:5000/api/attendance/sync-biotime \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Test Access Control:**

```bash
curl -X POST http://localhost:5000/api/attendance/update-access \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "studentId": "TEST001",
    "feeStatus": "paid"
  }'
```

### Step 7: Troubleshooting Network Issues

#### Firewall Configuration

```cmd
# Open port in Windows Firewall
netsh advfirewall firewall add rule name="BioTime API" dir=in action=allow protocol=TCP localport=8007

# Check if port is open
netstat -ano | findstr :8007
```

#### Host File Configuration

If using hostnames instead of IP:

```
# Edit C:\Windows\System32\drivers\etc\hosts
# Add line:
192.168.1.100 biotime-server
```

Then use:

```env
BIOTIME_API_URL=http://biotime-server:8007
```

#### Test Different Ports

BioTime might use different ports. Check:

- 8007 (common for API)
- 8080 (common for web interface)
- 80/443 (if configured)

#### Network Debugging

```bash
# Test basic connectivity
ping [WINDOWS_MACHINE_IP]

# Test port connectivity
telnet [WINDOWS_MACHINE_IP] 8007

# Check BioTime service status
net start | findstr BioTime
```

### Step 8: Advanced Testing

1. **Create Test Students in CMS**:
   - Add students with IDs matching BioTime employee codes
   - Set different fee statuses

2. **Monitor Sync Logs**:
   - Watch console output from sync service
   - Check for successful API calls

3. **Test Real Device** (if available):
   - Enroll test users on Senseface 2A
   - Test access control with different fee statuses

### Common Issues & Solutions

1. **Connection Refused**:
   - Check if BioTime service is running
   - Verify port number
   - Check firewall settings

2. **Authentication Failed**:
   - Verify username/password
   - Check user permissions in BioTime
   - Try different user accounts

3. **API Returns Empty Data**:
   - Check if users exist in BioTime
   - Verify department/area assignments
   - Check API filters

4. **CORS Issues** (if testing from browser):
   - Configure BioTime CORS settings
   - Or test API directly with curl/Postman

### Production Considerations

Once testing is complete, for production deployment:

1. Use HTTPS for API communication
2. Implement proper authentication
3. Configure VPN for secure access
4. Set up monitoring and alerts
5. Configure backup and failover

## Starting the Sync Service

**Windows:**

```batch
cd cms-backend
start-biotime-sync.bat
```

**Linux/Mac:**

```bash
cd cms-backend
chmod +x sync/start-biotime-sync.sh
./sync/start-biotime-sync.sh
```

### Running as Background Service

For production deployment, configure the sync service to run as a background process:

**Using PM2:**

```bash
npm install -g pm2
pm2 start sync/bioTime-sync.js --name "biotime-sync"
pm2 save
pm2 startup
```

## Where to Run the Sync Service

The BioTime sync service can run on **any machine** that can access both:

1. **BioTime API** - The machine where BioTime 9.5 is installed
2. **CMS Database** - MongoDB instance (local or remote)

### Deployment Options

#### Option 1: Same Machine as BioTime (Recommended for Testing)

- Run sync service on the Windows machine with BioTime
- Access BioTime via `http://localhost:8007`
- Access CMS database via network connection

#### Option 2: Same Machine as CMS Backend

- Run sync service on the CMS server
- Access BioTime via network: `http://[BIOTIME_IP]:8007`
- Access CMS database locally

#### Option 3: Dedicated Sync Server

- Run sync service on a separate machine
- Access both BioTime API and CMS database over network
- Best for high-availability setups

### Network Requirements

Ensure the sync service machine can reach:

- BioTime API endpoint (default port 8007)
- MongoDB database (default port 27017)
- Any firewalls allow these connections

## BioTime Configuration

### 1. Device Setup

1. Add Senseface 2A device in BioTime
2. Configure device IP and settings
3. Set device as attendance terminal

### 2. User Management

1. Create users in BioTime with employee codes matching CMS student IDs
2. Enroll biometric data (face/fingerprint) for each student
3. Assign users to appropriate departments/areas

### 3. Access Control Setup

1. Create access groups based on fee status:
   - **Fee_Paid**: Full access
   - **Fee_Pending**: Restricted or no access
2. Configure time zones and access levels
3. Set device permissions based on user groups

### 4. Department/Area Setup

1. Create departments matching CMS branches/departments
2. Configure access areas for different locations
3. Assign users to appropriate departments and areas

## Fee-Based Access Control

The system automatically controls access based on student fee status:

- **Paid**: `app_status = 1` (Enabled) - Full access granted
- **Pending/Partial**: `app_status = 0` (Disabled) - Access denied

When fee status changes in CMS:

1. Update student record in database
2. Call BioTime API to update user access status
3. Resync user data to devices for immediate effect

## Troubleshooting

### Common Issues

1. **Authentication Failed**
   - Check BioTime username/password
   - Verify API URL is accessible
   - Check BioTime user permissions

2. **Student Not Found in BioTime**
   - Ensure student is enrolled in BioTime with correct employee code
   - Verify employee code matches CMS student ID

3. **Access Control Not Working**
   - Check BioTime access group configuration
   - Verify device is configured for access control
   - Ensure user is assigned to correct access group

4. **Sync Service Not Starting**
   - Check environment variables
   - Verify Node.js installation
   - Check file permissions

### Logs

Sync service logs are written to console. For production, configure log rotation:

```bash
pm2 logs biotime-sync
```

### Manual Testing

Test API connectivity:

```bash
node -e "
const BioTimeService = require('./services/bioTimeService');
const service = new BioTimeService();
service.authenticate().then(() => console.log('Connected')).catch(console.error);
"
```

## Migration from ZKTeco K40

1. **Backup Data**: Export all attendance data from old system
2. **Device Replacement**: Replace K40 with Senseface 2A
3. **Re-enrollment**: Re-enroll all users in new device
4. **Configuration**: Set up BioTime as described above
5. **Testing**: Test attendance tracking and access control
6. **Go-Live**: Switch to new system

## API Reference

### BioTimeService Methods

- `authenticate()`: Get JWT token
- `getEmployees(filters)`: List employees
- `createEmployee(data)`: Create employee
- `updateEmployee(id, data)`: Update employee
- `updateEmployeeAccess(id, feeStatus)`: Update access status
- `resyncEmployeeToDevice(ids)`: Sync to devices
- `getTransactions(filters)`: Get attendance transactions
- `getDevices(filters)`: List devices
- `uploadTransactionsFromDevice(ids)`: Upload from devices

## Support

For BioTime-specific issues:

- Refer to BioTime 9.5 documentation
- Contact ZKTeco support
- Check BioTime logs in web interface

For CMS integration issues:

- Check CMS logs
- Verify API endpoints
- Test with BioTime API directly
