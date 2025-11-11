#!/usr/bin/env python3
"""Basic test to verify server setup"""

import sys
import json

def test_imports():
    """Test that all required modules can be imported"""
    try:
        import fastapi
        print("✓ FastAPI imported successfully")
    except ImportError:
        print("✗ FastAPI not installed - run: pip install fastapi")
        return False
    
    try:
        import uvicorn
        print("✓ Uvicorn imported successfully")
    except ImportError:
        print("✗ Uvicorn not installed - run: pip install uvicorn[standard]")
        return False
    
    try:
        import pydantic
        print("✓ Pydantic imported successfully")
    except ImportError:
        print("✗ Pydantic not installed - run: pip install pydantic")
        return False
    
    try:
        import httpx
        print("✓ HTTPX imported successfully")
    except ImportError:
        print("✗ HTTPX not installed - run: pip install httpx")
        return False
    
    return True

def test_app():
    """Test that the app can be imported"""
    try:
        from app import app
        print("✓ App imported successfully")
        return True
    except ImportError as e:
        print(f"✗ Failed to import app: {e}")
        return False

def test_config():
    """Test configuration setup"""
    try:
        from storage import load_config, save_config
        from models import ServerConfig
        
        # Try to load or create default config
        config = load_config()
        print("✓ Configuration loaded successfully")
        
        # Check if config is valid
        assert isinstance(config.warehouses, dict)
        print(f"  - Warehouses configured: {len(config.warehouses)}")
        print(f"  - API key configured: {'Yes' if config.google_api_key else 'No'}")
        
        return True
    except Exception as e:
        print(f"✗ Configuration error: {e}")
        return False

def main():
    print("=" * 50)
    print("Google Sheets ETL Server - Setup Test")
    print("=" * 50)
    print()
    
    # Check Python version
    print(f"Python version: {sys.version}")
    if sys.version_info < (3, 8):
        print("⚠ Warning: Python 3.8+ is recommended")
    print()
    
    # Test imports
    print("Testing dependencies...")
    if not test_imports():
        print("\n⚠ Please install dependencies first:")
        print("  pip install -r requirements.txt")
        return 1
    print()
    
    # Test app
    print("Testing application...")
    if not test_app():
        return 1
    print()
    
    # Test config
    print("Testing configuration...")
    test_config()
    print()
    
    print("=" * 50)
    print("✓ Setup test complete!")
    print("\nTo start the server, run:")
    print("  ./start.sh")
    print("  or")
    print("  uvicorn app:app --reload --port 8787")
    print("\nThen visit: http://localhost:8787/docs")
    print("=" * 50)
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
