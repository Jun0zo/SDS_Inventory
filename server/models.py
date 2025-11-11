"""Pydantic models for API request/response validation."""
from pydantic import BaseModel, Field
from typing import Optional, Dict

class WarehouseSheet(BaseModel):
    """Configuration for a warehouse's Google Sheet mapping."""
    spreadsheet_id: str = Field(..., min_length=10)
    sheet_name: str = "WMS_LRN3"

class ServerConfig(BaseModel):
    """Server configuration model."""
    google_api_key: Optional[str] = None              # global API key
    warehouses: Dict[str, WarehouseSheet] = {}        # { "EA2": {spreadsheet_id, sheet_name}, ... }

class SyncRequest(BaseModel):
    """Request model for warehouse sync."""
    warehouse_code: str
    force: bool = False

class ApiResponse(BaseModel):
    """Standardized API response model."""
    ok: bool
    message: str = ""
    data: Optional[dict] = None

# Production Line Models
class ProductionLineMaterial(BaseModel):
    """Material in production line BOM."""
    id: Optional[str] = None
    material_code: str
    material_name: str
    quantity_per_unit: float = Field(..., gt=0)
    unit: str = "EA"

class ProductionLine(BaseModel):
    """Production line configuration."""
    id: Optional[str] = None
    warehouse_id: str
    line_code: str
    line_name: str
    line_count: int = Field(default=1, gt=0)
    daily_production_capacity: int = Field(default=1000, gt=0)
    output_product_code: Optional[str] = None
    output_product_name: Optional[str] = None
    materials: list[ProductionLineMaterial] = Field(default_factory=list)
    created_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

class ProductionLineCreate(BaseModel):
    """Request model for creating production line."""
    warehouse_id: str
    line_code: str
    line_name: str
    line_count: int = Field(default=1, gt=0)
    daily_production_capacity: int = Field(default=1000, gt=0)
    output_product_code: Optional[str] = None
    output_product_name: Optional[str] = None
    materials: list[ProductionLineMaterial] = Field(default_factory=list)

class ProductionLineUpdate(BaseModel):
    """Request model for updating production line."""
    line_code: Optional[str] = None
    line_name: Optional[str] = None
    line_count: Optional[int] = Field(default=None, gt=0)
    daily_production_capacity: Optional[int] = Field(default=None, gt=0)
    output_product_code: Optional[str] = None
    output_product_name: Optional[str] = None
    materials: Optional[list[ProductionLineMaterial]] = None
