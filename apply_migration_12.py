#!/usr/bin/env python3
"""
Apply migration 12: Fix material capacity MV unique index
This fixes the 500 error when updating expected materials.
"""

import os
import sys

try:
    import psycopg2
except ImportError:
    print("Error: psycopg2 not installed")
    print("Install it with: pip install psycopg2-binary")
    sys.exit(1)

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

# Get Supabase project reference
supabase_url = os.getenv('SUPABASE_URL', '')
if not supabase_url:
    print("Error: SUPABASE_URL not set in .env")
    sys.exit(1)

project_ref = supabase_url.replace('https://', '').split('.')[0]

# Database connection string for Supabase
# Format: postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
db_password = os.getenv('SUPABASE_DB_PASSWORD', '')
if not db_password:
    db_password = input("Enter Supabase database password: ")

db_url = f"postgresql://postgres.{project_ref}:{db_password}@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres"

# Read migration SQL
migration_file = 'supabase/migration/12_fix_material_capacity_unique_index.sql'
with open(migration_file, 'r') as f:
    sql = f.read()

print(f"Connecting to Supabase project: {project_ref}")
print(f"Executing migration: {migration_file}")

try:
    # Connect to database
    conn = psycopg2.connect(db_url)
    conn.autocommit = True
    cur = conn.cursor()

    # Execute migration
    cur.execute(sql)

    print("\n✓ Migration executed successfully!")
    print("The 500 error should now be fixed.")

    # Close connection
    cur.close()
    conn.close()

except psycopg2.Error as e:
    print(f"\n✗ Database error: {e}")
    sys.exit(1)
except Exception as e:
    print(f"\n✗ Error: {e}")
    sys.exit(1)
