-- Check what tables exist in the current database
SELECT 
  schemaname,
  tablename,
  tableowner
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename LIKE '%raw%'
ORDER BY tablename;

-- Check wms_raw_rows structure if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'wms_raw_rows' AND table_schema = 'public') THEN
    RAISE NOTICE 'wms_raw_rows table exists';
    
    -- Check if warehouse_code column exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wms_raw_rows' AND column_name = 'warehouse_code' AND table_schema = 'public') THEN
      RAISE NOTICE 'warehouse_code column exists in wms_raw_rows';
    ELSE
      RAISE NOTICE 'warehouse_code column does NOT exist in wms_raw_rows';
      
      -- Show all columns in wms_raw_rows
      RAISE NOTICE 'Columns in wms_raw_rows:';
      FOR r IN (
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'wms_raw_rows' AND table_schema = 'public' 
        ORDER BY ordinal_position
      ) LOOP
        RAISE NOTICE '  %: %', r.column_name, r.data_type;
      END LOOP;
    END IF;
  ELSE
    RAISE NOTICE 'wms_raw_rows table does NOT exist';
  END IF;
END $$;
