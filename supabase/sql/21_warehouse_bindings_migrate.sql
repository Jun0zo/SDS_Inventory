-- Migrate existing warehouse_bindings to new format
-- Run this AFTER adding the source_bindings column

-- Migrate existing data from wms_source_ids and sap_source_ids to source_bindings
DO $$ 
DECLARE
    binding_record RECORD;
    new_bindings JSONB;
    source_id UUID;
BEGIN
    FOR binding_record IN 
        SELECT * FROM public.warehouse_bindings 
        WHERE source_bindings = '{}'::JSONB
    LOOP
        new_bindings := '{}'::JSONB;
        
        -- Migrate WMS sources
        IF binding_record.wms_source_ids IS NOT NULL THEN
            FOREACH source_id IN ARRAY binding_record.wms_source_ids
            LOOP
                new_bindings := new_bindings || jsonb_build_object(
                    source_id::TEXT,
                    jsonb_build_object(
                        'type', 'wms',
                        'split_value', NULL
                    )
                );
            END LOOP;
        END IF;
        
        -- Migrate SAP sources
        IF binding_record.sap_source_ids IS NOT NULL THEN
            FOREACH source_id IN ARRAY binding_record.sap_source_ids
            LOOP
                new_bindings := new_bindings || jsonb_build_object(
                    source_id::TEXT,
                    jsonb_build_object(
                        'type', 'sap',
                        'split_value', NULL
                    )
                );
            END LOOP;
        END IF;
        
        -- Update the record
        UPDATE public.warehouse_bindings
        SET source_bindings = new_bindings
        WHERE id = binding_record.id;
        
        RAISE NOTICE 'Migrated binding for warehouse: %', binding_record.warehouse_code;
    END LOOP;
END $$;

-- Verify migration
SELECT 
    warehouse_code,
    source_bindings,
    wms_source_ids,
    sap_source_ids
FROM public.warehouse_bindings;
