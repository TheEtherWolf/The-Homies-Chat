#!/bin/bash
# Start script for Glitch compatibility

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

# Start the application
echo "Starting The Homies App..."
npm start
