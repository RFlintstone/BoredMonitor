#!/bin/sh

# Start the Node.js backend in the background
echo "Starting Node.js Backend on port 5000..."
node /app/backend/dist/server.js &

# Start Nginx in the foreground (which serves the frontend and proxies the API)
echo "Starting Nginx Frontend on port 80..."
nginx -g "daemon off;"
