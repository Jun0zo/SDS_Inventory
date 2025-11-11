"""
Column mapping utilities for Google Sheets to PostgreSQL
Maps Sheet headers to PostgreSQL column names
"""
import re
from typing import Optional, Any

# WMS Column Mapping (Google Sheet Header → PostgreSQL Column)
WMS_COLUMN_MAP = {
    "Item Code": "item_code",
    "Cell No.": "cell_no",
    "Production Lot No.": "production_lot_no",
    "Tot. Qty.": "tot_qty",
    "Inb. Date": "inb_date",
    "Valid Date": "valid_date",
    "ULD ID": "uld_id",
    "Source No.": "source_no",
    "Lot Attr. 5": "lot_attr_5",
    "Lot Attr. 6": "lot_attr_6",
    "Item Tcd": "item_tcd",
    "Item Gcd": "item_gcd",
    "Item Gcd Nm": "item_gcd_nm",
    "Item Status": "item_status",
    "Zone Cd": "zone_cd",
    "Exchg. Avlb. Qty": "exchg_avlb_qty",
    "Exchg. Tot. Qty.": "exchg_tot_qty",
    "Available Qty.": "available_qty",
    "Unit": "unit",
    "Exchg. Unit": "exchg_unit",
    "Prod. Date": "prod_date",
    "Volume": "volume",
    "Weight": "weight",
    "Amount": "amount",
    "Storer Nm": "storer_nm",
    "Alt. Code": "alt_code",
    "Comment": "comment",
    "Lot Attr. 1": "lot_attr_1",
    "Lot Attr. 2": "lot_attr_2",
    "Lot Attr. 3": "lot_attr_3",
    "Lot Attr. 4": "lot_attr_4",
    "W/H Item Type": "wh_item_type",
    "Item User Col3": "item_user_col3",
    "Item User Col4": "item_user_col4",
    "Item User Col5": "item_user_col5",
    "Desc": "description",
    "Lot No.": "lot_no",
    "Item Nm": "item_nm",
    "Supplier Code": "supplier_code",
    "BOE No.": "boe_no",
}

# SAP Column Mapping (Google Sheet Header → PostgreSQL Column)
SAP_COLUMN_MAP = {
    "Plant": "plant",
    "Storage location": "storage_location",
    "Material": "material",
    "Material Description": "material_description",
    "Batch": "batch",
    "Stock Segment": "stock_segment",
    "Unrestricted": "unrestricted_qty",
    "Quality Inspection": "quality_inspection_qty",
    "Blocked": "blocked_qty",
    "Returns": "returns_qty",
    "Transit and Transfer": "transit_and_transfer",
    "Base Unit of Measure": "base_unit_of_measure",
    "Value Unrestricted": "value_unrestricted",
    "Currency": "currency",
    "Stock in Transit": "stock_in_transit",
    "Name 1": "name_1",
    "Material type": "material_type",
    "Material Group": "material_group",
    "DF stor. loc. level": "df_stor_loc_level",
    "Restricted-Use Stock": "restricted_use_stock",
    "Valuated Goods Receipt Blocked Stock": "valuated_goods_receipt_blocked_stock",
    "Tied Empties": "tied_empties",
    "In transfer (plant)": "in_transfer_plant",
    "Val. in Trans./Tfr": "val_in_trans_tfr",
    "Value Restricted": "value_restricted",
    "Val. GR Blocked St.": "val_gr_blocked_st",
    "Value in QualInsp.": "value_in_qualinsp",
    "Val. Tied Empties": "val_tied_empties",
    "Value BlockedStock": "value_blockedstock",
    "Value Rets Blocked": "value_rets_blocked",
    "Value in Transit": "value_in_transit",
    "Value in Stock Tfr": "value_in_stock_tfr",
}

def clean_numeric_value(value: Any) -> Optional[float]:
    """
    Clean numeric values from Google Sheets.
    Removes commas and converts to float.
    Returns None for empty/null values.
    
    Examples:
        "1,137.05" -> 1137.05
        "10,174.00" -> 10174.0
        "" -> None
        None -> None
    """
    if value is None or value == '':
        return None
    
    # Convert to string and strip whitespace
    value_str = str(value).strip()
    
    if not value_str:
        return None
    
    try:
        # Remove commas from thousands separator
        cleaned = value_str.replace(',', '')
        return float(cleaned)
    except (ValueError, AttributeError):
        return None

def normalize_column_name(header: str) -> str:
    """
    Normalize a Google Sheet header to PostgreSQL column name
    Rules:
    - Lowercase
    - Replace spaces with underscores
    - Remove dots
    - Replace / with _
    - Remove other special characters
    """
    # Lowercase
    name = header.lower()
    
    # Replace spaces and slashes with underscore
    name = name.replace(' ', '_').replace('/', '_')
    
    # Remove dots
    name = name.replace('.', '')
    
    # Remove parentheses
    name = name.replace('(', '').replace(')', '')
    
    # Remove other special characters (keep only alphanumeric and underscore)
    name = re.sub(r'[^a-z0-9_]', '', name)
    
    # Remove leading/trailing underscores
    name = name.strip('_')
    
    # Collapse multiple underscores
    name = re.sub(r'__+', '_', name)
    
    return name

# WMS numeric columns (need comma removal)
WMS_NUMERIC_COLUMNS = {
    'tot_qty', 'exchg_avlb_qty', 'exchg_tot_qty', 'available_qty',
    'volume', 'weight', 'amount'
}

# SAP numeric columns (need comma removal)
SAP_NUMERIC_COLUMNS = {
    'unrestricted_qty', 'quality_inspection_qty', 'blocked_qty', 'returns_qty',
    'transit_and_transfer', 'value_unrestricted', 'stock_in_transit',
    'restricted_use_stock', 'valuated_goods_receipt_blocked_stock',
    'tied_empties', 'in_transfer_plant', 'val_in_trans_tfr',
    'value_restricted', 'val_gr_blocked_st', 'value_in_qualinsp',
    'val_tied_empties', 'value_blockedstock', 'value_rets_blocked',
    'value_in_transit', 'value_in_stock_tfr'
}

def map_wms_row(sheet_row: dict, classification=None) -> dict:
    """Map a WMS sheet row to PostgreSQL column names and clean numeric values"""
    mapped = {}

    # First, handle ClassificationConfig columns (highest priority)
    if classification:
        # Helper function to find column by flexible matching
        def find_column_by_name(target_name: str) -> str:
            if not target_name:
                return None
            # Exact match first
            if target_name in sheet_row:
                return target_name
            # Case-insensitive match
            target_lower = target_name.lower().strip()
            for col_name in sheet_row.keys():
                if col_name.lower().strip() == target_lower:
                    return col_name
            return None

        # Zone column - map to actual database column name
        zone_col = find_column_by_name(classification.zone_col)
        if zone_col:
            # Use the actual column name as key (e.g., 'zone_cd' -> 'zone_cd')
            mapped[normalize_column_name(zone_col)] = sheet_row[zone_col]

        # Location column - always map to cell_no in database (as per user requirement)
        location_col = find_column_by_name(classification.location_col)
        if location_col:
            mapped['cell_no'] = sheet_row[location_col]  # Location data stored as cell_no

        # Lot column - map to actual database column name
        lot_col = find_column_by_name(classification.lot_col)
        if lot_col:
            mapped[normalize_column_name(lot_col)] = sheet_row[lot_col]

        # Item column (for WMS) - map to actual database column name
        item_col = find_column_by_name(classification.item_col)
        if item_col:
            mapped[normalize_column_name(item_col)] = sheet_row[item_col]

        # Quantity column - map to actual database column name
        qty_col = find_column_by_name(classification.qty_col)
        if qty_col:
            mapped[normalize_column_name(qty_col)] = clean_numeric_value(sheet_row[qty_col])

    # Then, apply standard WMS column mapping
    for sheet_header, value in sheet_row.items():
        # Skip if already mapped by classification config (using found column names)
        mapped_columns = []
        if classification:
            if zone_col: mapped_columns.append(zone_col)
            # Location data is stored as cell_no, so skip the original location column
            if lot_col: mapped_columns.append(lot_col)
            if item_col: mapped_columns.append(item_col)
            if qty_col: mapped_columns.append(qty_col)

        if sheet_header in mapped_columns:
            continue

        # Check if we have a defined mapping
        if sheet_header in WMS_COLUMN_MAP:
            pg_column = WMS_COLUMN_MAP[sheet_header]

            # Clean numeric values
            if pg_column in WMS_NUMERIC_COLUMNS:
                mapped[pg_column] = clean_numeric_value(value)
            else:
                mapped[pg_column] = value
        # Skip unknown columns (not in WMS_COLUMN_MAP)
        # This prevents errors when Google Sheet has extra columns

    return mapped

def map_sap_row(sheet_row: dict, classification=None) -> dict:
    """Map a SAP sheet row to PostgreSQL column names and clean numeric values"""
    mapped = {}

    # First, handle ClassificationConfig columns (highest priority)
    if classification:
        # Helper function to find column by flexible matching
        def find_column_by_name(target_name: str) -> str:
            if not target_name:
                return None
            # Exact match first
            if target_name in sheet_row:
                return target_name
            # Case-insensitive match
            target_lower = target_name.lower().strip()
            for col_name in sheet_row.keys():
                if col_name.lower().strip() == target_lower:
                    return col_name
            return None

        # Zone column - map to actual database column name
        zone_col = find_column_by_name(classification.zone_col)
        if zone_col:
            mapped[normalize_column_name(zone_col)] = sheet_row[zone_col]

        # Location column - map to storage_location for SAP
        location_col = find_column_by_name(classification.location_col)
        if location_col:
            mapped['storage_location'] = sheet_row[location_col]

        # Lot column - map to batch for SAP
        lot_col = find_column_by_name(classification.lot_col)
        if lot_col:
            mapped['batch'] = sheet_row[lot_col]

        # Item column (for SAP) - map to material
        item_col = find_column_by_name(classification.item_col)
        if item_col:
            mapped['material'] = sheet_row[item_col]

        # Quantity column - map to unrestricted_qty for SAP
        qty_col = find_column_by_name(classification.qty_col)
        if qty_col:
            mapped['unrestricted_qty'] = clean_numeric_value(sheet_row[qty_col])

        # Additional SAP-specific columns from classification
        if hasattr(classification, 'blocked_col') and classification.blocked_col:
            blocked_col = find_column_by_name(classification.blocked_col)
            if blocked_col:
                mapped['blocked_qty'] = clean_numeric_value(sheet_row[blocked_col])

        if hasattr(classification, 'returns_col') and classification.returns_col:
            returns_col = find_column_by_name(classification.returns_col)
            if returns_col:
                mapped['returns_qty'] = clean_numeric_value(sheet_row[returns_col])

        if hasattr(classification, 'quality_inspection_col') and classification.quality_inspection_col:
            qi_col = find_column_by_name(classification.quality_inspection_col)
            if qi_col:
                mapped['quality_inspection_qty'] = clean_numeric_value(sheet_row[qi_col])

        # Source location column
        if hasattr(classification, 'source_location_col') and classification.source_location_col:
            src_loc_col = find_column_by_name(classification.source_location_col)
            if src_loc_col:
                mapped['storage_location'] = sheet_row[src_loc_col]  # Override if different

        # Unrestricted column (same as qty_col but ensure it's mapped)
        if hasattr(classification, 'unrestricted_col') and classification.unrestricted_col:
            unrestrict_col = find_column_by_name(classification.unrestricted_col)
            if unrestrict_col:
                mapped['unrestricted_qty'] = clean_numeric_value(sheet_row[unrestrict_col])

    # Then, apply standard SAP column mapping for remaining columns
    for sheet_header, value in sheet_row.items():
        # Skip if already mapped by classification config
        mapped_columns = []
        if classification:
            if zone_col: mapped_columns.append(zone_col)
            if location_col: mapped_columns.append(location_col)
            if lot_col: mapped_columns.append(lot_col)
            if item_col: mapped_columns.append(item_col)
            if qty_col: mapped_columns.append(qty_col)
            # Add other classification columns to skip list
            if hasattr(classification, 'blocked_col') and classification.blocked_col:
                blocked_col = find_column_by_name(classification.blocked_col)
                if blocked_col: mapped_columns.append(blocked_col)
            if hasattr(classification, 'returns_col') and classification.returns_col:
                returns_col = find_column_by_name(classification.returns_col)
                if returns_col: mapped_columns.append(returns_col)
            if hasattr(classification, 'quality_inspection_col') and classification.quality_inspection_col:
                qi_col = find_column_by_name(classification.quality_inspection_col)
                if qi_col: mapped_columns.append(qi_col)
            if hasattr(classification, 'source_location_col') and classification.source_location_col:
                src_loc_col = find_column_by_name(classification.source_location_col)
                if src_loc_col: mapped_columns.append(src_loc_col)
            if hasattr(classification, 'unrestricted_col') and classification.unrestricted_col:
                unrestrict_col = find_column_by_name(classification.unrestricted_col)
                if unrestrict_col: mapped_columns.append(unrestrict_col)

        if sheet_header in mapped_columns:
            continue

        # Check if we have a defined mapping
        if sheet_header in SAP_COLUMN_MAP:
            pg_column = SAP_COLUMN_MAP[sheet_header]

            # Clean numeric values
            if pg_column in SAP_NUMERIC_COLUMNS:
                mapped[pg_column] = clean_numeric_value(value)
            else:
                mapped[pg_column] = value
        # Skip unknown columns (not in SAP_COLUMN_MAP)
        # This prevents errors when Google Sheet has extra columns

    return mapped

def get_split_key(mapped_row: dict, classification) -> Optional[str]:
    """Extract split_key from mapped row"""
    if not classification.split_enabled or not classification.split_by_column:
        return None
    
    # Normalize the split column name
    split_col_normalized = normalize_column_name(classification.split_by_column)
    
    # Try to find the split value
    value = mapped_row.get(split_col_normalized)
    if value:
        return str(value).strip()
    
    return None
