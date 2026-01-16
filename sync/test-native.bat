@echo off
echo ================================================================
echo   Testing Native Driver Connection
echo ================================================================
echo.

echo Running native driver test...
echo.

node test-native-driver.js

echo.
echo ================================================================
echo.

if %errorLevel% equ 0 (
    echo ✅ SUCCESS! Connection is working!
    echo.
    echo You can now run:
    echo   node zkteco-mssql-sync.js
    echo.
) else (
    echo ❌ Test failed. See error messages above.
    echo.
    echo Try:
    echo   1. npm install msnodesqlv8
    echo   2. Run this script again
    echo.
    echo Or see CONNECTION_FIX.md for troubleshooting.
    echo.
)

pause
