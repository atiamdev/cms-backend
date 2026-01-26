@echo off
echo Testing BioTime connection...
echo.

cd /d "%~dp0"

if not exist node_modules (
    echo Installing dependencies...
    npm install
    echo.
)

echo Running BioTime connection test...
node test-connection.js

echo.
pause