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
    echo "PATH: %PATH%"
    echo.
    echo Press any key to exit...
    pause
    exit /b 1
) else (
    echo ✓ Node.js found
    for /f "tokens=*" %%i in ('node --version') do echo   Version: %%i
)
echo.

REM Check if dependencies are installed
if not exist "node_modules" (
    echo Installing dependencies...
    echo.
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR: Failed to install dependencies
        echo.
        echo This might be due to:
        echo - No internet connection
        echo - npm registry issues
        echo - Permission problems
        echo.
        echo Try running: npm install
        echo.
        echo Press any key to exit...
        pause
        exit /b 1
    ) else (
        echo ✓ Dependencies installed successfully
    )
    echo.
) else (
    echo ✓ Dependencies already installed
)
echo.

REM Check if .env file exists
echo Checking for .env file...
if not exist ".env" (
    echo ERROR: .env file not found in %CD%!
    echo Please copy .env.example to .env and configure it
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

REM Check and start SQL Server services
echo Checking SQL Server services...
echo.

echo [1/3] Checking SQL Server service...
sc query "MSSQL$SQLEXPRESS" 2>nul | find "STATE" >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Starting SQL Server (SQLEXPRESS)...
    net start "MSSQL$SQLEXPRESS" 2>nul >nul
    if %ERRORLEVEL% NEQ 0 (
        echo WARNING: Could not start SQL Server service
        echo The sync may not work without SQL Server running
    ) else (
        echo ✓ SQL Server started
    )
) else (
    echo ✓ SQL Server is running
)
        echo The sync may not work without SQL Server running
    ) else (
        echo ✓ SQL Server started
    )
) else (
    echo ✓ SQL Server is running
)

echo [2/3] Checking SQL Browser service...
sc query "SQLBrowser" 2>nul | find "STATE" >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Starting SQL Browser...
    net start "SQLBrowser" 2>nul >nul
    if %ERRORLEVEL% NEQ 0 (
        echo WARNING: Could not start SQL Browser service
        echo The sync may not work without SQL Browser running
    ) else (
        echo ✓ SQL Browser started
    )
) else (
    echo ✓ SQL Browser is running
)
        echo The sync may not work without SQL Browser running
    ) else (
        echo ✓ SQL Browser started
    )
) else (
    echo ✓ SQL Browser is running
)

echo [3/3] Quick connection check...
echo.
echo Testing SQL Server connection...
sqlcmd -S localhost\SQLEXPRESS -E -Q "SELECT @@SERVERNAME as Server" >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo ✓ SQL Server connection successful
) else (
    echo ⚠️  SQL Server connection failed - check services and credentials
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
