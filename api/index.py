"""Vercel Serverless Function - API Gateway"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import sys
from pathlib import Path

# Add server directory to path
server_path = Path(__file__).parent.parent / "server"
sys.path.insert(0, str(server_path))

# Import the FastAPI app from server
from server.app import app as fastapi_app

# Export for Vercel
app = fastapi_app

# Handler for Vercel
def handler(request, context):
    return app(request, context)

