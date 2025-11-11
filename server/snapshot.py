"""Snapshot building utilities for dashboard data."""
from collections import defaultdict
from typing import Dict, List, Any

def build_dashboard_snapshot(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Build a dashboard-oriented snapshot from normalized sheet rows.
    
    Expected columns (tolerant):
    - Item Code, Item Nm, Zone Cd, Cell No., Available Qty., Tot. Qty., Inb. Date, Valid Date
    
    Returns a structured snapshot with zones, locations, and item summaries.
    """
    zones = defaultdict(lambda: {
        "total_avail": 0.0,
        "total_qty": 0.0,
        "locations": {}
    })
    
    item_totals = defaultdict(float)
    item_names = {}
    
    for row in rows:
        # Extract key fields
        zone_code = row.get("Zone Cd") or "UNZONED"
        location = row.get("Cell No.") or "UNLOCATED"
        item_code = row.get("Item Code")
        item_name = row.get("Item Nm")
        avail_qty = float(row.get("Available Qty.") or 0.0)
        total_qty = float(row.get("Tot. Qty.") or 0.0)
        
        # Aggregate zone totals
        zones[zone_code]["total_avail"] += avail_qty
        zones[zone_code]["total_qty"] += total_qty
        
        # Initialize location if not exists
        if location not in zones[zone_code]["locations"]:
            zones[zone_code]["locations"][location] = {
                "avail": 0.0,
                "total": 0.0,
                "items": []
            }
        
        # Update location totals
        zones[zone_code]["locations"][location]["avail"] += avail_qty
        zones[zone_code]["locations"][location]["total"] += total_qty
        
        # Add item details if present
        if item_code:
            item_detail = {
                "item_code": item_code,
                "item_nm": item_name,
                "avail": avail_qty,
                "total": total_qty
            }
            
            # Add optional date fields if present
            if row.get("Inb. Date"):
                item_detail["inb_date"] = row.get("Inb. Date")
            if row.get("Valid Date"):
                item_detail["valid_date"] = row.get("Valid Date")
            
            zones[zone_code]["locations"][location]["items"].append(item_detail)
            
            # Track item totals for top items
            item_totals[item_code] += avail_qty
            if item_name:
                item_names[item_code] = item_name
    
    # Calculate top items
    top_items_data = sorted(item_totals.items(), key=lambda x: x[1], reverse=True)[:20]
    top_items = [
        {
            "item_code": code,
            "item_nm": item_names.get(code, ""),
            "avail": qty
        }
        for code, qty in top_items_data
    ]
    
    # Build summary statistics
    summary = {
        "total_items": sum(1 for row in rows if row.get("Item Code")),
        "total_available": sum(z["total_avail"] for z in zones.values()),
        "total_quantity": sum(z["total_qty"] for z in zones.values()),
        "zone_count": len(zones),
        "location_count": sum(len(z["locations"]) for z in zones.values()),
        "top_items": top_items
    }
    
    # Convert defaultdict to regular dict for JSON serialization
    zones_dict = {k: dict(v) for k, v in zones.items()}
    
    return {
        "summary": summary,
        "zones": zones_dict
    }
