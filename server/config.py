"""FastAPI application configuration."""
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="Warehouse Sheets ETL Server",
        description="API for fetching Google Sheets data and creating snapshots",
        version="1.0.0"
    )

    # Configure CORS
    frontend_url = os.getenv("FRONTEND_URL", "")

    # Allow localhost for development, and specific frontend URL for production
    if frontend_url:
        allowed_origins = [
            frontend_url,
            "http://localhost:5173",  # Vite dev server
            "http://localhost:3000",  # Alternative dev port
        ]
    else:
        # Development mode: allow all origins
        allowed_origins = ["*"]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    return app
