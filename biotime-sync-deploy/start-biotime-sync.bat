@echo off
echo ========================================
echo  BioTime Attendance Sync Service
echo ========================================
echo.
echo This service runs on the WINDOWS machine where BioTime is installed.
echo It syncs data between:
echo - Local BioTime API (http://localhost:8088)
echo - Remote CMS Server (portal.atiamcollege.com or as configured)
echo.
echo Make sure this folder is deployed to your BioTime Windows machine.
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if .env file exists
if not exist ".env" (
    echo Error: .env file not found
    echo Please create .env file with required configuration
    echo Make sure to set the remote CMS server URL
    pause
    exit /b 1
)

echo Starting BioTime sync service...
echo Press Ctrl+C to stop the service
echo.

node bioTime-sync.js

pause