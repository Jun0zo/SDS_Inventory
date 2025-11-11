import { supabase } from '@/lib/supabase/client';
import type { Warehouse } from '@/types/warehouse';

const MOCK = !import.meta.env.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL === '';
const LS_KEY = 'mock_warehouses_v1';

// Mock data helpers
function readMock(): Warehouse[] {
  const stored = localStorage.getItem(LS_KEY);
  if (!stored) {
    // Initialize with default warehouses
    const defaults: Warehouse[] = [
      {
        id: crypto.randomUUID(),
        code: 'WH-KR-01',
        name: 'Seoul Main Warehouse',
        uses_sap: true,
        uses_wms: true,
        time_zone: 'Asia/Seoul',
        created_at: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        code: 'WH-US-01',
        name: 'New York Distribution Center',
        uses_sap: true,
        uses_wms: false,
        time_zone: 'America/New_York',
        created_at: new Date().toISOString(),
      },
    ];
    localStorage.setItem(LS_KEY, JSON.stringify(defaults));
    return defaults;
  }
  return JSON.parse(stored);
}

function writeMock(rows: Warehouse[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(rows));
}

/**
 * List all warehouses
 */
export async function listWarehouses(): Promise<Warehouse[]> {
  if (MOCK) {
    return Promise.resolve(readMock());
  }

  const { data, error } = await supabase
    .from('warehouses')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to fetch warehouses:', error);
    throw error;
  }

  return (data || []) as Warehouse[];
}

/**
 * Create a new warehouse
 */
export async function createWarehouse(
  input: Omit<Warehouse, 'id' | 'created_at' | 'created_by'>
): Promise<Warehouse> {
  // Validate code format
  const codeRegex = /^[A-Z0-9-_.]{2,16}$/;
  if (!codeRegex.test(input.code)) {
    throw new Error('Warehouse code must be 2-16 characters (A-Z, 0-9, -, _, .)');
  }

  if (MOCK) {
    const existing = readMock();
    
    // Check for duplicate code
    if (existing.some(w => w.code === input.code)) {
      throw new Error(`Warehouse with code ${input.code} already exists`);
    }

    const row: Warehouse = {
      ...input,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    
    writeMock([...existing, row]);
    return row;
  }

  const { data: user } = await supabase.auth.getUser();
  
  const { data, error } = await supabase
    .from('warehouses')
    .insert({
      ...input,
      created_by: user.user?.id,
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error(`Warehouse with code ${input.code} already exists`);
    }
    console.error('Failed to create warehouse:', error);
    throw error;
  }

  return data as Warehouse;
}

/**
 * Update a warehouse
 */
export async function updateWarehouse(
  id: string,
  patch: Partial<Omit<Warehouse, 'id' | 'created_at' | 'created_by'>>
): Promise<Warehouse> {
  // Validate code if provided
  if (patch.code) {
    const codeRegex = /^[A-Z0-9-_.]{2,16}$/;
    if (!codeRegex.test(patch.code)) {
      throw new Error('Warehouse code must be 2-16 characters (A-Z, 0-9, -, _, .)');
    }
  }

  if (MOCK) {
    const existing = readMock();
    const idx = existing.findIndex(r => r.id === id);
    
    if (idx < 0) {
      throw new Error('Warehouse not found');
    }

    // Check for duplicate code
    if (patch.code && existing.some((w, i) => i !== idx && w.code === patch.code)) {
      throw new Error(`Warehouse with code ${patch.code} already exists`);
    }

    existing[idx] = { ...existing[idx], ...patch };
    writeMock(existing);
    return existing[idx];
  }

  const { data, error } = await supabase
    .from('warehouses')
    .update(patch)
    .eq('id', id)
    .select('*');

  if (error) {
    if (error.code === '23505') {
      throw new Error(`Warehouse with code ${patch.code} already exists`);
    }
    console.error('Failed to update warehouse:', error);
    throw error;
  }

  // Return first item (should only be one)
  if (data && data.length > 0) {
    return data[0] as Warehouse;
  }
  
  // If no data returned, fetch it separately (RLS might have filtered it)
  const { data: fetchedData, error: fetchError } = await supabase
    .from('warehouses')
    .select('*')
    .eq('id', id)
    .single();
    
  if (fetchError) {
    console.error('Failed to fetch updated warehouse:', fetchError);
    throw fetchError;
  }
  
  return fetchedData as Warehouse;
}

/**
 * Delete a warehouse
 */
export async function deleteWarehouse(id: string): Promise<void> {
  if (MOCK) {
    writeMock(readMock().filter(r => r.id !== id));
    return;
  }

  const { error } = await supabase
    .from('warehouses')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Failed to delete warehouse:', error);
    throw error;
  }
}

/**
 * Check if a warehouse code is unique
 */
export async function isWarehouseCodeUnique(code: string, excludeId?: string): Promise<boolean> {
  const warehouses = await listWarehouses();
  return !warehouses.some(w => w.code === code && w.id !== excludeId);
}
