# BioTime Sync Service

This directory contains the BioTime attendance synchronization service that runs on the Windows machine where BioTime 9.5 is installed.

## Architecture

- **Location**: Runs on the BioTime Windows server
- **Purpose**: Syncs attendance data between local BioTime API and remote CMS server
- **Communication**: HTTP API calls to remote CMS (no direct database access)

## Files

- `bioTimeService.js` - BioTime API client for authentication and data operations
- `bioTime-sync.js` - Main sync service with bidirectional data flow
- `test-connection.js` - Connection testing script
- `test-biotime-connection.bat` - Windows batch file to run connection test
- `start-biotime-sync.bat` - Windows batch file to start the sync service
- `start-biotime-sync.sh` - Linux shell script to start the sync service
- `package.json` - Node.js dependencies and scripts
- `.env` - Environment configuration

## Setup

1. Copy this entire directory to your BioTime Windows machine
2. Install Node.js (version 14+) if not already installed
3. Update the `.env` file with your configuration:
   - `BIOTIME_API_URL`: URL of your local BioTime server (default: http://localhost:8088)
   - `BIOTIME_USERNAME`: BioTime admin username
   - `BIOTIME_PASSWORD`: BioTime admin password
   - `CMS_BASE_URL`: URL of your remote CMS server
   - `CMS_API_KEY`: API key for CMS authentication

4. Install dependencies:
   ```bash
   npm install
   ```

5. Test the connection:
   ```bash
   # Windows
   test-biotime-connection.bat

   # Linux/Mac
   node test-connection.js
   ```

6. Start the sync service:
   ```bash
   # Windows
   start-biotime-sync.bat

   # Linux/Mac
   ./start-biotime-sync.sh
   ```

## Configuration

The service syncs data every 5 minutes by default. You can adjust this in the `.env` file:

```
SYNC_INTERVAL_MINUTES=5
```

## Troubleshooting

- Ensure BioTime API is accessible at the configured URL
- Check that the BioTime service is running
- Verify network connectivity to the remote CMS server
- Check the console output for detailed error messages

## Security Notes

- The service uses token-based authentication with BioTime
- API keys are used for CMS communication
- Store sensitive credentials securely and never commit to version control