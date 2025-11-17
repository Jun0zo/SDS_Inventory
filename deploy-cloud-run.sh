#!/bin/bash

# Google Cloud Run Deployment Script
# This script builds and deploys the FastAPI backend to Google Cloud Run

set -e  # Exit on error

echo "🚀 Starting Google Cloud Run deployment..."

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SERVICE_NAME=${SERVICE_NAME:-"warehouse-inventory-api"}
REGION=${REGION:-"asia-northeast3"}
MEMORY=${MEMORY:-"512Mi"}
CPU=${CPU:-"1"}
MAX_INSTANCES=${MAX_INSTANCES:-"10"}

# Check if required environment variables are set
echo "📋 Checking required environment variables..."

if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}❌ ERROR: PROJECT_ID environment variable is not set${NC}"
    echo "Please set it with: export PROJECT_ID=your-gcp-project-id"
    exit 1
fi

if [ -z "$SUPABASE_URL" ]; then
    echo -e "${RED}❌ ERROR: SUPABASE_URL environment variable is not set${NC}"
    exit 1
fi

if [ -z "$SUPABASE_SERVICE_KEY" ]; then
    echo -e "${RED}❌ ERROR: SUPABASE_SERVICE_KEY environment variable is not set${NC}"
    exit 1
fi

if [ -z "$GOOGLE_SHEETS_CREDENTIALS_JSON" ]; then
    echo -e "${YELLOW}⚠️  WARNING: GOOGLE_SHEETS_CREDENTIALS_JSON is not set${NC}"
    echo "If you need Google Sheets integration, please set this variable."
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo -e "${GREEN}✅ Environment variables validated${NC}"

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}❌ ERROR: gcloud CLI is not installed${NC}"
    echo "Please install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Set the project
echo "📦 Setting GCP project to: $PROJECT_ID"
gcloud config set project $PROJECT_ID

# Enable required APIs
echo "🔧 Enabling required APIs..."
gcloud services enable containerregistry.googleapis.com --quiet
gcloud services enable run.googleapis.com --quiet
gcloud services enable cloudbuild.googleapis.com --quiet

# Build the container image using Cloud Build
echo "🏗️  Building container image..."
IMAGE_NAME="gcr.io/$PROJECT_ID/$SERVICE_NAME"

gcloud builds submit --tag $IMAGE_NAME --quiet

echo -e "${GREEN}✅ Image built successfully: $IMAGE_NAME${NC}"

# Prepare environment variables for deployment
ENV_VARS="SUPABASE_URL=$SUPABASE_URL,SUPABASE_SERVICE_KEY=$SUPABASE_SERVICE_KEY"

if [ ! -z "$FRONTEND_URL" ]; then
    ENV_VARS="$ENV_VARS,FRONTEND_URL=$FRONTEND_URL"
    echo "🌐 CORS will be configured for: $FRONTEND_URL"
else
    echo -e "${YELLOW}⚠️  FRONTEND_URL not set - CORS will allow all origins${NC}"
fi

if [ ! -z "$GOOGLE_SHEETS_CREDENTIALS_JSON" ]; then
    ENV_VARS="$ENV_VARS,GOOGLE_SHEETS_CREDENTIALS_JSON=$GOOGLE_SHEETS_CREDENTIALS_JSON"
fi

# Deploy to Cloud Run
echo "🚢 Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --image $IMAGE_NAME \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --set-env-vars "$ENV_VARS" \
  --memory $MEMORY \
  --cpu $CPU \
  --max-instances $MAX_INSTANCES \
  --quiet

# Get the service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --format="value(status.url)")

echo ""
echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}🎉 Your API is now live at:${NC}"
echo -e "${GREEN}   $SERVICE_URL${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📝 Next steps:"
echo "   1. Test the health endpoint:"
echo "      curl $SERVICE_URL/health"
echo ""
echo "   2. Update your Vercel frontend environment variable:"
echo "      VITE_API_URL=$SERVICE_URL"
echo ""
echo "   3. View logs:"
echo "      gcloud run services logs read $SERVICE_NAME --region $REGION --limit 50"
echo ""

# Test the health endpoint
echo "🏥 Testing health endpoint..."
if curl -s -f "$SERVICE_URL/health" > /dev/null; then
    echo -e "${GREEN}✅ Health check passed!${NC}"
else
    echo -e "${RED}❌ Health check failed. Check the logs for details.${NC}"
fi

echo ""
echo -e "${GREEN}🎊 Deployment complete!${NC}"
