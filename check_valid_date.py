#!/usr/bin/env python3
import os
from supabase import create_client
from datetime import datetime, timedelta

# Get Supabase credentials from environment or use defaults
url = os.environ.get("VITE_SUPABASE_URL", "https://your-project.supabase.co")
key = os.environ.get("VITE_SUPABASE_ANON_KEY", "your-anon-key")

supabase = create_client(url, key)

# Check valid_date for these items
print("=" * 80)
print("CHECKING valid_date for items")
print("=" * 80)

response = supabase.table("wms_raw_rows")\
    .select("item_code, production_lot_no, available_qty, valid_date, split_key")\
    .in_("item_code", ["12500579", "12000325"])\
    .limit(5)\
    .execute()

print(f"\nFound {len(response.data)} rows:")
today = datetime.now().date()
min_date = today - timedelta(days=30)
max_date = today + timedelta(days=90)

print(f"\nMaterialized view filters:")
print(f"  Today: {today}")
print(f"  Min date (TODAY - 30 days): {min_date}")
print(f"  Max date (TODAY + 90 days): {max_date}")
print()

for row in response.data:
    valid_date_str = row.get('valid_date')
    split_key = row.get('split_key')

    print(f"Item: {row.get('item_code')}")
    print(f"  production_lot_no: {row.get('production_lot_no')}")
    print(f"  available_qty: {row.get('available_qty')}")
    print(f"  valid_date: {valid_date_str}")
    print(f"  split_key: {split_key}")

    if valid_date_str:
        try:
            # Parse the date string
            if 'T' in valid_date_str:
                valid_date = datetime.fromisoformat(valid_date_str.replace('Z', '+00:00')).date()
            else:
                valid_date = datetime.strptime(valid_date_str, '%Y-%m-%d').date()

            in_range = (min_date <= valid_date <= max_date)
            print(f"  Date in range? {in_range}")
            if not in_range:
                print(f"    ❌ OUT OF RANGE! valid_date ({valid_date}) not between {min_date} and {max_date}")
        except Exception as e:
            print(f"  ❌ Error parsing date: {e}")
    else:
        print(f"  ❌ valid_date is NULL")

    if not split_key:
        print(f"  ❌ split_key is NULL")

    print()
