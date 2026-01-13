"""Extended models for sheet sources and data ingestion"""
from pydantic import BaseModel, Field
from typing import Optional, Dict, List, Any, Literal
from datetime import datetime, date
from uuid import UUID

# Sheet Source Models
class ClassificationConfig(BaseModel):
    """Classification configuration for sheet sources"""
    # Common fields
    item_col: Optional[str] = None
    lot_col: Optional[str] = None  # Changed from lot_cols to lot_col (single selection)
    qty_col: Optional[str] = None  # Quantity column for dynamic mapping
    
    # WMS specific
    zone_col: Optional[str] = None
    location_col: Optional[str] = None
    
    # Split options (available for both WMS and SAP)
    split_enabled: bool = False
    split_by_column: Optional[str] = None
    
    # SAP specific
    source_location_col: Optional[str] = None
    unrestricted_col: Optional[str] = None
    quality_inspection_col: Optional[str] = None
    blocked_col: Optional[str] = None
    returns_col: Optional[str] = None

class SheetSource(BaseModel):
    """Sheet source configuration"""
    id: Optional[str] = None
    label: str
    type: Literal['wms', 'sap']
    spreadsheet_id: str
    sheet_name: str = "Sheet1"
    classification: ClassificationConfig = Field(default_factory=ClassificationConfig)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    created_by: Optional[str] = None

class CreateSheetSource(BaseModel):
    """Create sheet source request"""
    label: str
    type: Literal['wms', 'sap']
    spreadsheet_id: str
    sheet_name: str = "Sheet1"
    classification: ClassificationConfig = Field(default_factory=ClassificationConfig)

class UpdateSheetSource(BaseModel):
    """Update sheet source request"""
    label: Optional[str] = None
    spreadsheet_id: Optional[str] = None
    sheet_name: Optional[str] = None
    classification: Optional[ClassificationConfig] = None

# Warehouse Binding Models
class SourceBinding(BaseModel):
    """Individual source binding with optional split value"""
    type: Literal['wms', 'sap']
    split_value: Optional[str] = None

class WarehouseBinding(BaseModel):
    """Warehouse to source binding"""
    id: Optional[str] = None
    warehouse_code: str
    # New format: source_id -> binding details
    source_bindings: Dict[str, SourceBinding] = Field(default_factory=dict)
    # Deprecated fields (for backward compatibility)
    wms_source_ids: List[str] = Field(default_factory=list)
    sap_source_ids: List[str] = Field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    created_by: Optional[str] = None

class CreateWarehouseBinding(BaseModel):
    """Create or update warehouse binding"""
    warehouse_code: str
    source_bindings: Dict[str, SourceBinding] = Field(default_factory=dict)

class SplitValueInfo(BaseModel):
    """Information about a split value"""
    value: str
    warehouse_code: Optional[str] = None  # Which warehouse is using it (if any)
    is_available: bool

class SplitValuesResponse(BaseModel):
    """Response with available split values for a source"""
    source_id: str
    split_by_column: Optional[str] = None
    values: List[SplitValueInfo]

# Ingest Models
class IngestRequest(BaseModel):
    """Request to ingest data for a warehouse"""
    warehouse_code: str
    types: List[Literal['wms', 'sap']] = ['wms', 'sap']
    dry_run: bool = False
    batch_id: Optional[str] = None  # Optional batch identifier

class IngestResult(BaseModel):
    """Result of ingest operation"""
    warehouse_code: str
    batch_id: Optional[str] = None
    sources_processed: int = 0
    rows_inserted: int = 0
    rows_updated: int = 0
    errors: List[Dict[str, Any]] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    duration_seconds: float = 0.0
    debug_logs: List[str] = Field(default_factory=list)

# Raw Row Models
class RawRow(BaseModel):
    """Raw data row stored in database"""
    id: Optional[int] = None
    warehouse_code: str
    source_id: str
    source_type: Literal['wms', 'sap']
    header: List[str]
    row: Dict[str, Any]
    
    # Denormalized fields
    zone: Optional[str] = None
    location: Optional[str] = None
    item_code: Optional[str] = None
    lot_key: Optional[str] = None
    split_key: Optional[str] = None
    
    # Quantity fields
    available_qty: Optional[float] = None
    total_qty: Optional[float] = None
    
    # SAP stock status quantities
    unrestricted_qty: Optional[float] = None
    quality_inspection_qty: Optional[float] = None
    blocked_qty: Optional[float] = None
    returns_qty: Optional[float] = None
    
    # SAP source location
    source_location: Optional[str] = None
    
    # Date fields
    inb_date: Optional[date] = None
    valid_date: Optional[date] = None
    prod_date: Optional[date] = None
    
    fetched_at: Optional[datetime] = None
    batch_id: Optional[str] = None

# Zone Capacity Models
class MaterialInfo(BaseModel):
    """Material information for a component location"""
    location: str
    item_code: str
    lot_key: Optional[str] = None
    quantity: int = 0
    source_id: Optional[str] = None
    split_key: Optional[str] = None

class LotDistributionInfo(BaseModel):
    """Lot/batch distribution information"""
    lot_key: Optional[str] = None
    quantity: int = 0
    percentage: float = 0.0

class MaterialSummaryInfo(BaseModel):
    """Material summary information"""
    item_code: str
    total_quantity: int = 0
    lots: List[str] = Field(default_factory=list)

class ComponentDisplayInfo(BaseModel):
    """Component-level display information"""
    id: str
    location: str
    type: str
    max_capacity: Optional[int] = None
    current_stock: int = 0
    utilization_percentage: float = 0.0
    materials: List[MaterialInfo] = Field(default_factory=list)

class CachedDisplayData(BaseModel):
    """Pre-computed display data for UI caching"""
    total_items: int = 0
    unique_skus: int = 0
    max_capacity: int = 0
    current_stock: int = 0
    utilization_percentage: float = 0.0
    lot_distribution: List[LotDistributionInfo] = Field(default_factory=list)
    materials_summary: List[MaterialSummaryInfo] = Field(default_factory=list)
    components: List[ComponentDisplayInfo] = Field(default_factory=list)

class ComponentInfo(BaseModel):
    """Component (rack/flat) information"""
    id: str
    type: str  # 'rack' or 'flat'
    location: str
    x: int
    y: int
    rotation: int = 0
    w: int
    h: int
    rows: int
    cols: int
    # Capacity information
    max_capacity: Optional[int] = None
    current_stock: int = 0  # Current number of items in this component
    utilization_percentage: float = 0.0
    # Material mapping - pre-mapped materials for this component
    materials: List[MaterialInfo] = Field(default_factory=list)
    # Rack specific
    floors: Optional[int] = None
    numbering: Optional[str] = None
    order: Optional[str] = None
    per_floor_locations: Optional[int] = None
    floor_capacities: Optional[List[int]] = None

class LayoutInfo(BaseModel):
    """Layout information for a zone"""
    id: str
    zone_name: str
    components: List[ComponentInfo]

class ZoneCapacityInfo(BaseModel):
    """Zone capacity information with components"""
    zone_id: str
    zone_code: str
    zone_name: Optional[str] = None
    warehouse_code: str
    max_capacity: int = 0  # Total capacity across all components
    current_stock: int = 0  # Current number of items in zone
    item_count: int = 0  # Number of components (racks/flats)
    utilization_percentage: float = 0.0
    components: List[LayoutInfo] = []  # Cached component information (layouts merged into zones)
    cached_display_data: CachedDisplayData = Field(default_factory=CachedDisplayData)  # Pre-computed UI data
    last_updated: datetime
    last_sync: Optional[datetime] = None

class ZoneCapacityResponse(BaseModel):
    """Response with zone capacity information"""
    zones: List[ZoneCapacityInfo]
    total_zones: int
    last_updated: Optional[datetime] = None

# Header Preview Models
class HeaderPreviewRequest(BaseModel):
    """Request to preview sheet headers"""
    spreadsheet_id: str
    sheet_name: str = "Sheet1"

class HeaderPreviewResponse(BaseModel):
    """Response with sheet headers"""
    headers: List[str]
    row_count: int = 0
    sample_rows: List[Dict[str, Any]] = Field(default_factory=list)

# Factory Models
class FactoryExtended(BaseModel):
    """Extended factory model for API responses"""
    id: Optional[str] = None
    code: str
    name: str
    description: Optional[str] = None
    production_line_count: int = 0  # Computed field - number of production lines
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

class FactoryListResponse(BaseModel):
    """Response for factories list"""
    factories: List[FactoryExtended]
    total_count: int

class FactoryResponse(BaseModel):
    """Response for single factory operations"""
    factory: FactoryExtended

class FactoryCreateRequest(BaseModel):
    """Request to create factory"""
    code: str
    name: str
    description: Optional[str] = None

class FactoryUpdateRequest(BaseModel):
    """Request to update factory"""
    code: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None


# Production Line Models
class ProductionLineMaterialExtended(BaseModel):
    """Extended material model for API responses"""
    id: Optional[str] = None
    production_line_id: Optional[str] = None
    material_code: str
    material_name: str
    quantity_per_unit: float
    unit: str
    created_at: Optional[datetime] = None

class ProductionLineExtended(BaseModel):
    """Extended production line model for API responses"""
    id: Optional[str] = None
    factory_id: Optional[str] = None  # Reference to factories table
    factory_name: Optional[str] = None  # Computed field - factory name
    line_code: str
    line_name: str
    line_count: int = 1
    daily_production_capacity: int = 1000
    output_product_code: Optional[str] = None
    output_product_name: Optional[str] = None
    materials: List[ProductionLineMaterialExtended] = Field(default_factory=list)
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

class ProductionLineListResponse(BaseModel):
    """Response for production lines list"""
    production_lines: List[ProductionLineExtended]
    total_count: int

class ProductionLineResponse(BaseModel):
    """Response for single production line operations"""
    production_line: ProductionLineExtended

class ProductionLineCreateRequest(BaseModel):
    """Request to create production line"""
    factory_id: str  # Required - production lines must belong to a factory
    line_code: str
    line_name: str
    line_count: int = Field(default=1, gt=0)
    daily_production_capacity: int = Field(default=1000, gt=0)
    output_product_code: Optional[str] = None
    output_product_name: Optional[str] = None
    materials: List[Dict[str, Any]] = Field(default_factory=list)

class ProductionLineUpdateRequest(BaseModel):
    """Request to update production line"""
    factory_id: Optional[str] = None
    line_code: Optional[str] = None
    line_name: Optional[str] = None
    line_count: Optional[int] = Field(default=None, gt=0)
    daily_production_capacity: Optional[int] = Field(default=None, gt=0)
    output_product_code: Optional[str] = None
    output_product_name: Optional[str] = None
    materials: Optional[List[Dict[str, Any]]] = None
