@echo off
echo ================================================================
echo   SQL Server Connection Diagnostics
echo ================================================================
echo.

echo [Step 1] Checking SQL Server Service...
sc query "MSSQL$SQLEXPRESS" | find "STATE"
echo.

echo [Step 2] Checking SQL Browser Service...
sc query "SQLBrowser" | find "STATE"
echo.

echo [Step 3] Checking TCP/IP Protocol...
echo (This requires SQL Server Configuration Manager - check manually)
echo SQL Server Configuration Manager ^> Protocols for SQLEXPRESS ^> TCP/IP
echo.

echo [Step 4] Testing SQLCMD Connection...
echo Attempting to connect with SQLCMD...
sqlcmd -S localhost\SQLEXPRESS -E -Q "SELECT @@SERVERNAME as ServerName, DB_NAME() as CurrentDB, @@VERSION as Version" -W -w 999
if %errorLevel% neq 0 (
    echo [ERROR] SQLCMD connection failed!
    echo This means SQL Server is not accessible even with native tools.
    echo.
    echo Possible causes:
    echo   1. SQL Server service is not running
    echo   2. Instance name is wrong (not SQLEXPRESS)
    echo   3. Windows Authentication is not enabled
    echo.
) else (
    echo [OK] SQLCMD connection successful
)
echo.

echo [Step 5] Listing Databases...
sqlcmd -S localhost\SQLEXPRESS -E -Q "SELECT name FROM sys.databases ORDER BY name" -h -1
echo.

echo [Step 6] Checking for ZKTeco Database...
sqlcmd -S localhost\SQLEXPRESS -E -Q "IF EXISTS(SELECT 1 FROM sys.databases WHERE name='zkteco') SELECT 'Database zkteco EXISTS' ELSE SELECT 'Database zkteco NOT FOUND'"
echo.

echo [Step 7] Checking ZKTeco Tables (if database exists)...
sqlcmd -S localhost\SQLEXPRESS -E -d zkteco -Q "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME" -h -1 2>nul
if %errorLevel% neq 0 (
    echo [INFO] Could not query zkteco database
    echo Either database doesn't exist or has different name
)
echo.

echo [Step 8] Running Node.js Connection Test...
if exist "check-environment.js" (
    node check-environment.js
) else (
    echo [WARNING] check-environment.js not found
)
echo.

echo [Step 9] Running npm test (if node_modules exists)...
if exist "node_modules" (
    call npm test
) else (
    echo [WARNING] node_modules not found
    echo Run: npm install
)
echo.

echo ================================================================
echo   Diagnostics Complete
echo ================================================================
echo.
echo If all tests passed, your SQL Server is ready!
echo If any test failed, see TROUBLESHOOTING.md for solutions.
echo.
pause
