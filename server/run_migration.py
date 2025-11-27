"""
Run Supabase migration files

Usage:
    python server/run_migration.py supabase/migration/09_add_component_metadata.sql
"""
import sys
import os
from pathlib import Path
from supabase_client import supabase, SUPABASE_URL

def run_migration(migration_file: str) -> bool:
    """Execute a SQL migration file"""
    if not supabase:
        print("❌ Error: Supabase not configured. Check your .env file.")
        print(f"   SUPABASE_URL: {'✓' if SUPABASE_URL else '✗'}")
        return False

    # Read migration file
    file_path = Path(migration_file)
    if not file_path.exists():
        print(f"❌ Error: Migration file not found: {migration_file}")
        return False

    print(f"📄 Reading migration file: {file_path.name}")
    sql_content = file_path.read_text(encoding='utf-8')

    # Execute SQL
    print(f"🔄 Executing migration...")
    try:
        # Use Supabase RPC to execute raw SQL
        # Note: For complex migrations, you might need to split into separate statements
        # or use psql directly

        # Split by common delimiters but be careful with function definitions
        statements = []
        current = []
        in_function = False

        for line in sql_content.split('\n'):
            line_stripped = line.strip()

            # Track function boundaries
            if 'CREATE OR REPLACE FUNCTION' in line_stripped or 'CREATE FUNCTION' in line_stripped:
                in_function = True
            elif line_stripped.startswith('$$') and in_function:
                in_function = False

            current.append(line)

            # Split on semicolon only if not in function
            if line_stripped.endswith(';') and not in_function:
                statement = '\n'.join(current).strip()
                if statement and not statement.startswith('--'):
                    statements.append(statement)
                current = []

        # Add remaining
        if current:
            statement = '\n'.join(current).strip()
            if statement and not statement.startswith('--'):
                statements.append(statement)

        print(f"📊 Found {len(statements)} SQL statements to execute")

        # Execute each statement
        executed = 0
        for i, stmt in enumerate(statements, 1):
            # Skip comments and empty statements
            if not stmt or stmt.startswith('--'):
                continue

            # Show preview of statement
            first_line = stmt.split('\n')[0][:80]
            print(f"   [{i}/{len(statements)}] {first_line}...")

            try:
                # Use postgrest to execute
                result = supabase.postgrest.rpc('exec_sql', {'sql': stmt}).execute()
                executed += 1
            except Exception as e:
                # If exec_sql RPC doesn't exist, we need to use direct SQL execution
                # This requires using the underlying connection
                print(f"   ⚠️  Note: Using alternative execution method")
                # For complex migrations, recommend using Supabase Dashboard SQL Editor
                print(f"   ⚠️  For this migration, please use Supabase Dashboard SQL Editor")
                print(f"   📋 Copy the SQL from: {file_path}")
                return False

        print(f"✅ Migration completed successfully! ({executed} statements executed)")
        return True

    except Exception as e:
        print(f"❌ Error executing migration: {e}")
        print("\n💡 Alternative: Use Supabase Dashboard SQL Editor")
        print(f"   1. Go to your Supabase Dashboard → SQL Editor")
        print(f"   2. Create a new query")
        print(f"   3. Copy and paste the contents of: {file_path}")
        print(f"   4. Click 'Run' or press Cmd/Ctrl + Enter")
        return False

def main():
    if len(sys.argv) < 2:
        print("Usage: python server/run_migration.py <migration_file>")
        print("\nExample:")
        print("  python server/run_migration.py supabase/migration/09_add_component_metadata.sql")
        sys.exit(1)

    migration_file = sys.argv[1]
    success = run_migration(migration_file)
    sys.exit(0 if success else 1)

if __name__ == '__main__':
    main()
