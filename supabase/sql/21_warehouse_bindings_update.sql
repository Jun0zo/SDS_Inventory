-- Update warehouse_bindings table to add source_bindings column
-- Run this in Supabase SQL Editor

-- Add source_bindings column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'warehouse_bindings' 
        AND column_name = 'source_bindings'
    ) THEN
        ALTER TABLE public.warehouse_bindings 
        ADD COLUMN source_bindings JSONB NOT NULL DEFAULT '{}'::JSONB;
        
        RAISE NOTICE 'Added source_bindings column';
    ELSE
        RAISE NOTICE 'source_bindings column already exists';
    END IF;
END $$;

-- Verify the column was added
SELECT column_name, data_type, column_default
FROM information_schema.columns 
WHERE table_name = 'warehouse_bindings' 
AND table_schema = 'public'
ORDER BY ordinal_position;
