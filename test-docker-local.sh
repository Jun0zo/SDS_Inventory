#!/bin/bash

# Local Docker test script
# This helps diagnose container startup issues

echo "🔍 Testing Docker image locally..."

# Build the image
echo "📦 Building Docker image..."
docker build -t warehouse-api-test .

if [ $? -ne 0 ]; then
    echo "❌ Docker build failed"
    exit 1
fi

echo "✅ Build successful"

# Try to run with minimal config
echo ""
echo "🚀 Starting container with minimal environment..."
echo "   (This will likely fail but show us the error)"

docker run -p 8080:8080 \
  -e PORT=8080 \
  warehouse-api-test

# If you get here, it worked!
echo ""
echo "✅ Container started successfully!"
