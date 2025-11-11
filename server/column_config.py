"""
Column configuration management for inventory views
Stores user preferences for which columns to show/hide
"""
import json
from pathlib import Path
from typing import Dict, List, Any, Optional
import logging

logger = logging.getLogger(__name__)

# Base directory for column configs
DATA_DIR = Path(__file__).parent / "data" / "column_configs"
DATA_DIR.mkdir(parents=True, exist_ok=True)

# Default column configurations
DEFAULT_WMS_COLUMNS = [
    {"key": "item_code", "label": "Item Code", "visible": True, "order": 1, "width": 150},
    {"key": "zone_cd", "label": "Zone", "visible": True, "order": 2, "width": 100},
    {"key": "cell_no", "label": "Location", "visible": True, "order": 3, "width": 120},
    {"key": "uld_id", "label": "ULD", "visible": True, "order": 4, "width": 120},
    {"key": "lot_no", "label": "Lot", "visible": True, "order": 5, "width": 150},
    {"key": "available_qty", "label": "Available Qty", "visible": True, "order": 6, "width": 120},
    {"key": "tot_qty", "label": "Total Qty", "visible": True, "order": 7, "width": 120},
    {"key": "production_lot_no", "label": "Production Lot", "visible": False, "order": 8, "width": 150},
    {"key": "inb_date", "label": "Inbound Date", "visible": False, "order": 9, "width": 120},
    {"key": "valid_date", "label": "Valid Date", "visible": False, "order": 10, "width": 120},
    {"key": "prod_date", "label": "Production Date", "visible": False, "order": 11, "width": 120},
    {"key": "item_nm", "label": "Item Name", "visible": False, "order": 12, "width": 200},
    {"key": "description", "label": "Description", "visible": False, "order": 13, "width": 250},
    {"key": "unit", "label": "Unit", "visible": False, "order": 14, "width": 80},
    {"key": "weight", "label": "Weight", "visible": False, "order": 15, "width": 100},
    {"key": "volume", "label": "Volume", "visible": False, "order": 16, "width": 100},
    {"key": "storer_nm", "label": "Storer", "visible": False, "order": 17, "width": 150},
    {"key": "supplier_code", "label": "Supplier", "visible": False, "order": 18, "width": 120},
]

DEFAULT_SAP_COLUMNS = [
    {"key": "material", "label": "Material", "visible": True, "order": 1, "width": 150},
    {"key": "material_description", "label": "Description", "visible": True, "order": 2, "width": 250},
    {"key": "plant", "label": "Plant", "visible": True, "order": 3, "width": 100},
    {"key": "storage_location", "label": "Storage Location", "visible": True, "order": 4, "width": 150},
    {"key": "batch", "label": "Batch", "visible": True, "order": 5, "width": 150},
    {"key": "unrestricted", "label": "Unrestricted", "visible": True, "order": 6, "width": 120},
    {"key": "quality_inspection", "label": "Quality Inspection", "visible": False, "order": 7, "width": 150},
    {"key": "blocked", "label": "Blocked", "visible": False, "order": 8, "width": 100},
    {"key": "returns", "label": "Returns", "visible": False, "order": 9, "width": 100},
    {"key": "base_unit_of_measure", "label": "Unit", "visible": False, "order": 10, "width": 80},
    {"key": "material_type", "label": "Material Type", "visible": False, "order": 11, "width": 120},
    {"key": "material_group", "label": "Material Group", "visible": False, "order": 12, "width": 120},
    {"key": "stock_segment", "label": "Stock Segment", "visible": False, "order": 13, "width": 150},
]

def get_config_path(warehouse_code: str) -> Path:
    """Get the file path for a warehouse's column config"""
    return DATA_DIR / f"{warehouse_code}.json"

def load_column_config(warehouse_code: str) -> Dict[str, Any]:
    """Load column configuration for a warehouse"""
    config_path = get_config_path(warehouse_code)
    
    if not config_path.exists():
        # Return default config
        return {
            "warehouse_code": warehouse_code,
            "wms_columns": DEFAULT_WMS_COLUMNS,
            "sap_columns": DEFAULT_SAP_COLUMNS,
            "created_at": None,
            "updated_at": None
        }
    
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
            logger.info(f"Loaded column config for warehouse {warehouse_code}")
            return config
    except Exception as e:
        logger.error(f"Error loading column config for {warehouse_code}: {e}")
        # Return default on error
        return {
            "warehouse_code": warehouse_code,
            "wms_columns": DEFAULT_WMS_COLUMNS,
            "sap_columns": DEFAULT_SAP_COLUMNS,
            "created_at": None,
            "updated_at": None
        }

def save_column_config(warehouse_code: str, config: Dict[str, Any]) -> bool:
    """Save column configuration for a warehouse"""
    config_path = get_config_path(warehouse_code)
    
    try:
        # Add metadata
        from datetime import datetime
        now = datetime.utcnow().isoformat()
        
        if not config.get('created_at'):
            config['created_at'] = now
        config['updated_at'] = now
        config['warehouse_code'] = warehouse_code
        
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
        
        logger.info(f"Saved column config for warehouse {warehouse_code}")
        return True
    except Exception as e:
        logger.error(f"Error saving column config for {warehouse_code}: {e}")
        return False

def reset_column_config(warehouse_code: str) -> Dict[str, Any]:
    """Reset column configuration to defaults"""
    config_path = get_config_path(warehouse_code)
    
    # Delete existing config file
    if config_path.exists():
        config_path.unlink()
        logger.info(f"Reset column config for warehouse {warehouse_code}")
    
    # Return default config
    return {
        "warehouse_code": warehouse_code,
        "wms_columns": DEFAULT_WMS_COLUMNS,
        "sap_columns": DEFAULT_SAP_COLUMNS,
        "created_at": None,
        "updated_at": None
    }

def list_all_configs() -> List[str]:
    """List all warehouse codes that have custom column configs"""
    if not DATA_DIR.exists():
        return []
    
    configs = []
    for path in DATA_DIR.glob("*.json"):
        warehouse_code = path.stem
        configs.append(warehouse_code)
    
    return sorted(configs)
