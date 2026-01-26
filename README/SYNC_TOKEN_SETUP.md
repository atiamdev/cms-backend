# Sync Token Setup Guide

## Overview

The CMS now supports **cross-branch sync tokens** that can be generated from the Superadmin Dashboard. These tokens have superadmin privileges and can be used to sync attendance data from any branch.

## Key Features

✅ **Cross-Branch Support**: One token works for all branches  
✅ **Superadmin Privileges**: No permission restrictions  
✅ **UI-Based Generation**: Generate tokens from the dashboard  
✅ **Long-Lived Tokens**: Configurable expiry (1-730 days)  
✅ **Secure**: Full audit logging and token management

---

## Generating a Sync Token

### Method 1: Superadmin Dashboard (Recommended)

1. **Login** as a superadmin user
2. Navigate to **Superadmin Dashboard** (`/dashboard/superadmin`)
3. Find the **Sync Token Generator** card
4. Enter:
   - **Token Name**: Descriptive name (e.g., "Main Branch Sync Token")
   - **Expiry**: Select token validity period (365 days recommended)
5. Click **Generate Token**
6. **Copy the token** or **Download .env file**

### Method 2: CLI Script (Legacy)

```bash
cd cms-backend/sync
node generate-sync-token.js
```

---

## Setting Up Branch Sync

### 1. Prepare the Branch Windows PC

Install the sync service on the branch Windows PC where the ZKTeco device is connected.

### 2. Configure Environment Variables

Create or update the `.env` file in the `cms-backend/sync` directory:

```env
# Branch Configuration
BRANCH_ID=6789abcdef1234567890abcd
BRANCH_NAME=Nairobi Main Branch

# API Configuration
CLOUD_API_URL=https://your-cms-api.com
API_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Database Configuration
ZKTECO_DB_PATH=C:\Program Files (x86)\ZKTime5.0\att2000.mdb
ZKTECO_DB_COPY_PATH=C:\Program Files (x86)\ZKTime5.0\att2000_copy.mdb

# Sync Settings
SYNC_INTERVAL=60000
COPY_INTERVAL=30000
BATCH_SIZE=100
USE_DB_COPY=true
```

### 3. Get Your Branch ID

You can find your Branch ID in the CMS:

- Navigate to **Settings** → **Branches**
- Click on your branch
- Copy the MongoDB ObjectId from the URL or details page

Or use the MongoDB shell:

```javascript
db.branches.find({ name: "Your Branch Name" });
```

### 4. Start the Sync Service

```bash
cd cms-backend/sync
node zkteco-sync.js
```

Or use the Windows batch file:

```bash
start-sync.bat
```

---

## Token Architecture

### Token Structure

```json
{
  "user": {
    "id": "sync-service-superadmin-1704537600000",
    "email": "admin@example.com",
    "roles": ["superadmin"],
    "purpose": "attendance-sync",
    "tokenName": "Main Branch Sync Token",
    "generatedBy": "6789abcdef1234567890abcd",
    "generatedAt": "2026-01-06T10:00:00.000Z"
  }
}
```

### Key Differences from User Tokens

| Feature        | User Token          | Sync Token           |
| -------------- | ------------------- | -------------------- |
| **Scope**      | Single branch       | All branches         |
| **Role**       | User-specific       | Superadmin           |
| **Expiry**     | 24 hours            | 1-730 days           |
| **Purpose**    | User authentication | Attendance sync      |
| **Generation** | Login endpoint      | Superadmin dashboard |

---

## Security Considerations

### ⚠️ Important Security Notes

1. **Keep Tokens Secure**

   - Never commit tokens to version control
   - Don't share tokens publicly
   - Store in `.env` files (add to `.gitignore`)

2. **Token Rotation**

   - Rotate tokens periodically (every 6-12 months)
   - Generate new tokens if compromised
   - Old tokens expire automatically

3. **Audit Logging**

   - All token generation is logged
   - Sync operations are tracked
   - Review audit logs regularly

4. **Branch Validation**
   - Always include `BRANCH_ID` in sync requests
   - System validates branch exists
   - Prevents data pollution

---

## Troubleshooting

### Common Issues

#### 1. Token Not Working

**Symptom**: `401 Unauthorized` or `Invalid API token`

**Solutions**:

- Verify token is correctly copied (no extra spaces/newlines)
- Check token hasn't expired
- Ensure `JWT_SECRET` matches on backend
- Regenerate token if needed

#### 2. Cross-Branch Not Working

**Symptom**: Data not syncing to correct branch

**Solutions**:

- Verify `BRANCH_ID` in `.env` is correct
- Check branch exists in database
- Confirm token has superadmin role
- Review backend logs for errors

#### 3. Database Copy Errors

**Symptom**: `Database file locked` or `EBUSY` errors

**Solutions**:

- Enable `USE_DB_COPY=true` in `.env`
- Adjust `COPY_INTERVAL` (default: 30000ms)
- Check ZKTeco software isn't exclusively locking the file
- Use existing copy if recent (< 5 minutes)

#### 4. Sync Service Crashes

**Symptom**: Process terminates unexpectedly

**Solutions**:

- Check `.env` configuration
- Verify API URL is reachable
- Review error logs
- Ensure Node.js version compatibility (14+)

---

## Testing the Setup

### 1. Test Sync Service Connection

```bash
node zkteco-sync.js --test
```

This will:

- Verify database access
- Test API connectivity
- Read sample records
- Validate token

### 2. Manual Sync Test

```bash
curl -X POST https://your-api.com/api/attendance/sync-from-branch \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "branchId": "6789abcdef1234567890abcd",
    "branchName": "Test Branch",
    "logs": [],
    "syncTime": "2026-01-06T10:00:00.000Z"
  }'
```

Expected response:

```json
{
  "success": true,
  "message": "Attendance synced successfully",
  "data": {
    "processedCount": 0,
    "errorCount": 0
  }
}
```

---

## Migration from Old Tokens

If you have existing branch-specific tokens:

1. **Generate New Token**: Create a superadmin token from dashboard
2. **Update .env Files**: Replace old `API_TOKEN` with new one
3. **Test**: Verify sync still works
4. **Deploy**: Roll out to all branch PCs
5. **Monitor**: Check logs for issues

### Compatibility

- ✅ New tokens work with all branches
- ✅ Old branch-specific tokens still supported
- ✅ No downtime during migration
- ✅ Can run both token types simultaneously

---

## API Reference

### Generate Sync Token

**Endpoint**: `POST /api/auth/generate-sync-token`

**Headers**:

```
Authorization: Bearer <superadmin-user-token>
Content-Type: application/json
```

**Request Body**:

```json
{
  "tokenName": "Main Branch Sync Token",
  "expiresInDays": 365
}
```

**Response**:

```json
{
  "success": true,
  "message": "Sync token generated successfully",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "tokenName": "Main Branch Sync Token",
    "purpose": "attendance-sync",
    "expiresIn": "365 days",
    "expiryDate": "2027-01-06T10:00:00.000Z",
    "generatedAt": "2026-01-06T10:00:00.000Z",
    "generatedBy": {
      "id": "6789abcdef1234567890abcd",
      "name": "Super Admin",
      "email": "admin@example.com"
    },
    "instructions": {
      "usage": "Add this token to the .env file on branch Windows PC",
      "envVariable": "API_TOKEN",
      "scope": "All branches (cross-branch enabled)"
    }
  }
}
```

---

## Best Practices

### 1. Token Management

- Use descriptive token names
- Document which branches use which tokens
- Set reasonable expiry periods (1 year)
- Generate new tokens before expiry

### 2. Deployment

- Test on one branch first
- Gradually roll out to all branches
- Keep old token active during transition
- Monitor sync logs after deployment

### 3. Monitoring

- Check sync status regularly
- Review error logs
- Monitor API performance
- Track attendance data accuracy

### 4. Documentation

- Keep branch configurations documented
- Maintain list of active tokens
- Document sync schedules
- Update procedures when changes occur

---

## Support

For issues or questions:

1. Check this documentation
2. Review backend logs
3. Check audit logs in CMS
4. Contact system administrator

---

**Last Updated**: January 6, 2026  
**Version**: 2.0
