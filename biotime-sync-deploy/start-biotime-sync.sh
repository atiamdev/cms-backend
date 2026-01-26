#!/bin/bash

echo "========================================"
echo " BioTime Attendance Sync Service"
echo "========================================"
echo
echo "This service runs on the WINDOWS machine where BioTime is installed."
echo "It syncs data between:"
echo "- Local BioTime API (http://localhost:8007)"
echo "- Remote CMS Server (portal.atiamcollege.com or as configured)"
echo
echo "Make sure this folder is deployed to your BioTime Windows machine."
echo

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed or not in PATH"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "Error: .env file not found"
    echo "Please create .env file with required configuration"
    exit 1
fi

echo "Starting BioTime sync service..."
echo "Press Ctrl+C to stop the service"
echo

node sync/bioTime-sync.js