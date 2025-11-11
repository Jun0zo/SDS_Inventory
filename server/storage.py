"""Storage utilities for configuration and snapshot management."""
import json
import os
import datetime
from typing import Tuple, Optional
from models import ServerConfig

# Directory paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
CONF_PATH = os.path.join(DATA_DIR, "config.json")
SNAP_DIR = os.path.join(DATA_DIR, "snapshots")

# Ensure directories exist
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(SNAP_DIR, exist_ok=True)

def load_config() -> ServerConfig:
    """Load server configuration from disk, creating default if not exists."""
    if not os.path.exists(CONF_PATH):
        default_config = ServerConfig()
        with open(CONF_PATH, "w", encoding="utf-8") as f:
            json.dump(default_config.model_dump(), f, ensure_ascii=False, indent=2)
    
    with open(CONF_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
        return ServerConfig(**data)

def save_config(cfg: ServerConfig) -> None:
    """Save server configuration to disk."""
    with open(CONF_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg.model_dump(), f, ensure_ascii=False, indent=2)

def snapshot_paths(warehouse_code: str) -> Tuple[str, str]:
    """Get snapshot paths for a warehouse (timestamped and latest)."""
    warehouse_dir = os.path.join(SNAP_DIR, warehouse_code)
    os.makedirs(warehouse_dir, exist_ok=True)
    
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    timestamped_path = os.path.join(warehouse_dir, f"{timestamp}.json")
    latest_path = os.path.join(warehouse_dir, "latest.json")
    
    return timestamped_path, latest_path

def write_snapshot(warehouse_code: str, payload: dict) -> str:
    """Write snapshot to both timestamped and latest files."""
    timestamped_path, latest_path = snapshot_paths(warehouse_code)
    
    # Write timestamped version
    with open(timestamped_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    
    # Write/overwrite latest version
    with open(latest_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    
    return timestamped_path

def read_latest_snapshot(warehouse_code: str) -> Optional[dict]:
    """Read the latest snapshot for a warehouse."""
    latest_path = os.path.join(SNAP_DIR, warehouse_code, "latest.json")
    
    if not os.path.exists(latest_path):
        return None
    
    with open(latest_path, "r", encoding="utf-8") as f:
        return json.load(f)
