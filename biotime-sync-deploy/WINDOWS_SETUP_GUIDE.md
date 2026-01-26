# BioTime Windows Deployment Guide

This guide explains how to deploy and configure the BioTime sync service on your Windows machine where BioTime 9.5 is installed.

## Architecture

```
Windows Machine (BioTime Server)
├── BioTime 9.5 Software
├── Senseface 2A Device
└── Sync Service (Node.js)
    ├── Connects to local BioTime API
    └── Syncs with remote CMS server
```

The sync service runs on the **same Windows machine as BioTime** and acts as a bridge to your remote CMS server.

## Prerequisites

- Windows machine with BioTime 9.5 installed and running
- Node.js installed (v14 or higher)
- Network access to remote CMS server (portal.atiamcollege.com)
- BioTime API enabled and accessible

## Deployment Steps

### Step 1: Deploy Sync Files

1. **Create sync folder** on your BioTime Windows machine:

   ```cmd
   mkdir C:\BioTimeSync
   cd C:\BioTimeSync
   ```

2. **Copy required files** from CMS backend:
   - `sync/` folder
   - `services/bioTimeService.js`
   - `.env.example` (rename to `.env`)
   - `package.json`

3. **Install dependencies**:
   ```cmd
   npm install
   ```

### Step 2: Configure Environment

Edit the `.env` file with your configuration:

```env
# BioTime API (local)
BIOTIME_API_URL=http://localhost:8007
BIOTIME_USERNAME=your_biotime_admin
BIOTIME_PASSWORD=your_biotime_password

# CMS API (remote)
CMS_API_URL=https://portal.atiamcollege.com
CMS_API_TOKEN=your_jwt_token_from_cms

# Branch Configuration
BRANCH_ID=your_branch_id
BRANCH_NAME=Your Branch Name

# Sync Settings
BIOTIME_SYNC_INTERVAL=60000
BIOTIME_BATCH_SIZE=100
```

### Step 3: Get CMS API Token

1. **Login to CMS** at `https://portal.atiamcollege.com`
2. **Generate API token** (you may need to add this endpoint to CMS if it doesn't exist)
3. **Add token to `.env`** as `CMS_API_TOKEN`

### Step 4: Test Configuration

Run the test script:

```cmd
test-biotime-connection.bat
```

This will verify:

- ✅ BioTime API connectivity
- ✅ CMS API connectivity
- ✅ Authentication and permissions

### Step 5: Start Sync Service

**For testing:**

```cmd
start-biotime-sync.bat
```

**For production** (background service):

```cmd
# Install PM2 globally
npm install -g pm2

# Start as background service
pm2 start sync/bioTime-sync.js --name "biotime-sync"
pm2 save
pm2 startup
```

## Configuration Details

1. Open BioTime web interface (usually `http://localhost:8080`)
2. Go to **System** > **API Settings**
3. Ensure API is enabled on port 8007
4. Create admin user with API access

## Step 2: Set Up Environment

1. Copy `.env.example` to `.env`:

   ```cmd
   copy .env.example .env
   ```

2. Edit `.env` file and update:
   ```env
   BIOTIME_API_URL=http://localhost:8007
   BIOTIME_USERNAME=your_admin_username
   BIOTIME_PASSWORD=your_admin_password
   ```

## Step 3: Test Connection

Run the test script:

```cmd
test-biotime-connection.bat
```

This will test:

- Network connectivity to BioTime
- API authentication
- Employee, device, and transaction APIs

## Step 4: Start Services

### Terminal 1: Start CMS Backend

```cmd
npm install
npm run dev
```

### Terminal 2: Start BioTime Sync

```cmd
start-biotime-sync.bat
```

## Step 5: Test API Endpoints

### Test Manual Sync

```cmd
curl -X POST http://localhost:5000/api/attendance/sync-biotime ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Test Access Control

```cmd
curl -X POST http://localhost:5000/api/attendance/update-access ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer YOUR_JWT_TOKEN" ^
  -d "{\"studentId\": \"TEST001\", \"feeStatus\": \"paid\"}"
```

## Step 6: Configure BioTime Data

1. **Create Department**: "Test Branch"
2. **Add Test Employees**:
   - Employee Code: TEST001, TEST002, etc.
   - Assign to "Test Branch"
3. **Add Device**: Configure your Senseface 2A
4. **Set Access Rules**: Create groups based on fee status

## Troubleshooting

### Connection Issues

```cmd
# Check if BioTime is running
netstat -ano | findstr :8007

# Test basic connectivity
curl http://localhost:8007/docs/api-docs/
```

### Firewall Issues

```cmd
# Open port in Windows Firewall
netsh advfirewall firewall add rule name="BioTime API" dir=in action=allow protocol=TCP localport=8007
```

### Authentication Issues

- Verify username/password in BioTime
- Check user has admin/API permissions
- Try creating a new admin user specifically for API access

## Next Steps

1. Add real students to CMS with matching BioTime employee codes
2. Test fee status changes and access control
3. Configure automated sync intervals
4. Set up production environment with proper security

## Support

- Check BioTime logs in web interface
- Monitor CMS backend console for sync status
- Use the test script to diagnose issues
