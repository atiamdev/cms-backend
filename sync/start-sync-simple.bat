@echo off
REM ZKTeco Attendance Sync Service Launcher
echo ========================================
echo   ZKTeco Attendance Sync Service
echo ========================================
echo.

cd /d "%~dp0"
echo Current directory: %CD%
echo Script started at: %DATE% %TIME%
echo.

REM Check if Node.js is installed
echo Checking for Node.js...
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed or not in PATH!
    echo Please install Node.js from https://nodejs.org
    echo.
    echo Press any key to exit...
    pause
    exit /b 1
) else (
    echo ✓ Node.js found
    for /f "tokens=*" %%i in ('node --version') do echo   Version: %%i
)
echo.

REM Check if .env file exists
echo Checking for .env file...
if not exist ".env" (
    echo ERROR: .env file not found in %CD%!
    echo Please ensure the .env file is in the same directory as this batch file
    echo.
    echo Files in current directory:
    dir /b 2>nul
    echo.
    echo Press any key to exit...
    pause
    exit /b 1
) else (
    echo ✓ .env file found
)
echo.

REM Check if dependencies are installed
echo Checking for node_modules...
if not exist "node_modules" (
    echo ERROR: Dependencies not installed!
    echo Please run: npm install
    echo.
    echo Press any key to exit...
    pause
    exit /b 1
) else (
    echo ✓ Dependencies installed
)
echo.

REM Start SQL Server services
echo Starting SQL Server services...
echo.

echo [1/2] Starting SQL Server (SQLEXPRESS)...
net start "MSSQL$SQLEXPRESS" >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo ✓ SQL Server started successfully
) else (
    echo ⚠️  SQL Server may already be running or failed to start
)
timeout /t 2 /nobreak >nul

echo [2/2] Starting SQL Browser...
net start "SQLBrowser" >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo ✓ SQL Browser started successfully
) else (
    echo ⚠️  SQL Browser may already be running or failed to start
)
timeout /t 2 /nobreak >nul

echo.
echo Testing SQL Server connection...
sqlcmd -S localhost\SQLEXPRESS -E -Q "SELECT 'Connection OK' as Status" 2>nul
if %ERRORLEVEL% EQU 0 (
    echo ✓ SQL Server connection successful
) else (
    echo ⚠️  SQL Server connection failed - sync may not work
)
echo.

echo ========================================
echo   Starting Sync Service
echo ========================================
echo.

REM Start the sync service
echo Starting ZKTeco sync service...
echo Press Ctrl+C to stop the service
echo.
npm start

echo.
echo ========================================
echo   Sync Service Stopped
echo ========================================
echo.
echo If the service stopped unexpectedly, check the error messages above.
echo You can restart by running this batch file again.
echo.
echo Press any key to exit...
pause