BioTime Sync Service - Deployment Package
=========================================

This package contains all files needed to run the BioTime sync service
on your Windows machine where BioTime 9.5 is installed.

Installation Steps:
1. Extract this package to a folder on your BioTime Windows machine
2. Run: npm install
3. Edit .env file with your configuration
4. Run: test-biotime-connection.bat (to test setup)
5. Run: start-biotime-sync.bat (to start sync service)

Required Configuration in .env:
- BIOTIME_API_URL=http://localhost:8088
- BIOTIME_USERNAME=your_biotime_admin
- BIOTIME_PASSWORD=your_biotime_password
- CMS_BASE_URL=https://portal.atiamcollege.com
- CMS_API_KEY=your_api_key_from_cms

For detailed instructions, see README.md and WINDOWS_SETUP_GUIDE.md

Contact: Your system administrator
