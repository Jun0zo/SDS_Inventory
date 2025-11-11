#!/usr/bin/env python3
"""Test script for zone capacity sync"""

import sys
import os

# Add server directory to path
sys.path.insert(0, os.path.dirname(__file__))

from zone_capacity import get_zone_capacity_manager

# Test the sync
manager = get_zone_capacity_manager()
print("🔧 Testing zone capacity sync for EA2-F...")
manager.update_current_quantities(['EA2-F'])
print("✅ Sync completed")

# Check results
import json
with open('data/zone_capacities.json', 'r') as f:
    data = json.load(f)

for zone_id, zone_data in data.items():
    print(f"\n📊 {zone_data['zone_code']}:")
    print(f"   Max Capacity: {zone_data['max_capacity']}")
    print(f"   Current Stock: {zone_data['current_stock']}")
    print(f"   Utilization: {zone_data['utilization_percentage']:.1f}%")
