@echo off
REM SQL Server Service Manager for ZKTeco Sync
echo ========================================
echo   SQL Server Service Manager
echo ========================================
echo.

echo Checking SQL Server services...
echo.

echo [1/2] SQL Server (SQLEXPRESS):
sc query "MSSQL$SQLEXPRESS" | find "STATE"
echo.

echo [2/2] SQL Browser:
sc query "SQLBrowser" | find "STATE"
echo.

echo Service management options:
echo 1. Start SQL Server: net start "MSSQL$SQLEXPRESS"
echo 2. Start SQL Browser: net start "SQLBrowser"
echo 3. Stop SQL Server: net stop "MSSQL$SQLEXPRESS"
echo 4. Stop SQL Browser: net stop "SQLBrowser"
echo.

echo Testing connection...
sqlcmd -S localhost\SQLEXPRESS -E -Q "SELECT @@SERVERNAME as Server, DB_NAME() as Database"
echo.

pause