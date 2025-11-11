#!/bin/bash

# Start the Google Sheets ETL Server

echo "Starting Google Sheets ETL Server..."
echo "Server will be available at: http://localhost:8787"
echo "API Documentation: http://localhost:8787/docs"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Run the server with uvicorn
uvicorn app:app --reload --port 8787
