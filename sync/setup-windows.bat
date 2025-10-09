@echo off
echo ================================================================
echo   ZKTeco SQL Server Sync - Windows Setup Script
echo ================================================================
echo.

REM Check if running as Administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [WARNING] Not running as Administrator
    echo Some operations may fail without admin privileges
    echo Right-click this script and select "Run as Administrator"
    echo.
    pause
)

echo [1/8] Checking Node.js installation...
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Node.js is not installed!
    echo Please download and install from: https://nodejs.org/
    echo Install the LTS version, then run this script again.
    pause
    exit /b 1
) else (
    node --version
    echo [OK] Node.js is installed
)
echo.

echo [2/8] Checking npm installation...
where npm >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] npm is not installed!
    pause
    exit /b 1
) else (
    npm --version
    echo [OK] npm is installed
)
echo.

echo [3/8] Checking SQL Server service...
sc query "MSSQL$SQLEXPRESS" | find "RUNNING" >nul 2>&1
if %errorLevel% neq 0 (
    echo [WARNING] SQL Server SQLEXPRESS is not running
    echo Starting SQL Server...
    net start "MSSQL$SQLEXPRESS"
    if %errorLevel% neq 0 (
        echo [ERROR] Failed to start SQL Server
        echo Please start it manually in Services
        pause
    ) else (
        echo [OK] SQL Server started
    )
) else (
    echo [OK] SQL Server is running
)
echo.

echo [4/8] Checking SQL Browser service...
sc query "SQLBrowser" | find "RUNNING" >nul 2>&1
if %errorLevel% neq 0 (
    echo [WARNING] SQL Browser is not running
    echo Starting SQL Browser...
    net start "SQLBrowser"
    if %errorLevel% neq 0 (
        echo [WARNING] Failed to start SQL Browser
        echo This may cause connection issues
    ) else (
        echo [OK] SQL Browser started
    )
) else (
    echo [OK] SQL Browser is running
)
echo.

echo [5/8] Installing npm packages...
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if %errorLevel% neq 0 (
        echo [ERROR] Failed to install packages
        pause
        exit /b 1
    )
    echo [OK] Packages installed
) else (
    echo [OK] Packages already installed
    echo Run "npm install" to update if needed
)
echo.

echo [6/8] Checking .env configuration...
if not exist ".env" (
    echo [WARNING] .env file not found!
    echo Creating .env from example...
    if exist ".env.example" (
        copy ".env.example" ".env"
        echo [ACTION REQUIRED] Please edit .env file with your settings:
        echo   - SQL_SERVER (currently: localhost\SQLEXPRESS)
        echo   - SQL_DATABASE (currently: zkteco)
        echo   - CLOUD_API_URL (your cloud server URL)
        echo   - API_TOKEN (get from cloud login)
        echo   - BRANCH_ID (your branch ID from database)
        notepad ".env"
    ) else (
        echo [ERROR] .env.example not found
        echo Please create .env file manually
        pause
        exit /b 1
    )
) else (
    echo [OK] .env file exists
)
echo.

echo [7/8] Running environment check...
node check-environment.js
echo.

echo [8/8] Testing SQL Server connection...
echo Running connection test...
echo.
node test-connection-simple.js
echo.

echo ================================================================
echo   Setup Complete!
echo ================================================================
echo.
echo Next steps:
echo   1. Make sure .env file has correct values
echo   2. Verify connection test passed
echo   3. Run manual sync: node zkteco-mssql-sync.js
echo   4. Setup as service (see WINDOWS_SETUP.md)
echo.
echo For troubleshooting, see: TROUBLESHOOTING.md
echo.
pause
