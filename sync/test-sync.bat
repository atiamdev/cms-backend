@echo off
REM Test the sync service configuration
echo ========================================
echo   Testing Sync Configuration
echo ========================================
echo.

cd /d "%~dp0"

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed!
    pause
    exit /b 1
)

REM Check if dependencies are installed
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
)

REM Check if .env file exists
if not exist ".env" (
    echo ERROR: .env file not found!
    echo Please copy .env.example to .env and configure it
    pause
    exit /b 1
)

REM Run test
echo Running connection and sync test...
echo.
node zkteco-sync.js --test

echo.
echo ========================================
echo Test completed
echo ========================================
pause
