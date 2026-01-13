/**
 * Factory API functions
 * Calls the FastAPI backend for factory CRUD operations
 */
import type { Factory, ProductionLine } from '@/types/warehouse';

const BASE_URL = import.meta.env.VITE_ETL_BASE_URL
  || (import.meta.env.PROD ? '' : 'http://localhost:8787');

/**
 * List all factories
 */
export async function listFactories(): Promise<Factory[]> {
  const response = await fetch(`${BASE_URL}/api/factories`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to fetch factories' }));
    throw new Error(error.detail || 'Failed to fetch factories');
  }

  const data = await response.json();
  return data.factories || [];
}

/**
 * Get a single factory by ID
 */
export async function getFactory(id: string): Promise<Factory> {
  const response = await fetch(`${BASE_URL}/api/factories/${id}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to fetch factory' }));
    throw new Error(error.detail || 'Failed to fetch factory');
  }

  const data = await response.json();
  return data.factory;
}

/**
 * Create a new factory
 */
export async function createFactory(
  input: Omit<Factory, 'id' | 'production_line_count' | 'created_at' | 'updated_at' | 'created_by'>
): Promise<Factory> {
  const response = await fetch(`${BASE_URL}/api/factories`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to create factory' }));
    throw new Error(error.detail || 'Failed to create factory');
  }

  const data = await response.json();
  return data.factory;
}

/**
 * Update an existing factory
 */
export async function updateFactory(
  id: string,
  patch: Partial<Omit<Factory, 'id' | 'production_line_count' | 'created_at' | 'updated_at' | 'created_by'>>
): Promise<Factory> {
  const response = await fetch(`${BASE_URL}/api/factories/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(patch),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to update factory' }));
    throw new Error(error.detail || 'Failed to update factory');
  }

  const data = await response.json();
  return data.factory;
}

/**
 * Delete a factory
 */
export async function deleteFactory(id: string): Promise<void> {
  const response = await fetch(`${BASE_URL}/api/factories/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to delete factory' }));
    throw new Error(error.detail || 'Failed to delete factory');
  }
}

/**
 * Get production lines for a factory
 */
export async function getFactoryProductionLines(factoryId: string): Promise<ProductionLine[]> {
  const response = await fetch(`${BASE_URL}/api/factories/${factoryId}/production-lines`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to fetch production lines' }));
    throw new Error(error.detail || 'Failed to fetch production lines');
  }

  const data = await response.json();
  return data.production_lines || [];
}

/**
 * List all production lines (optionally filtered by factory)
 */
export async function listProductionLines(factoryId?: string): Promise<ProductionLine[]> {
  const url = factoryId
    ? `${BASE_URL}/api/production-lines?factory_id=${factoryId}`
    : `${BASE_URL}/api/production-lines`;

  const response = await fetch(url);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to fetch production lines' }));
    throw new Error(error.detail || 'Failed to fetch production lines');
  }

  const data = await response.json();
  return data.production_lines || [];
}

/**
 * Create a production line
 */
export async function createProductionLine(
  input: Omit<ProductionLine, 'id' | 'factory_name' | 'created_at' | 'updated_at' | 'created_by'>
): Promise<ProductionLine> {
  const response = await fetch(`${BASE_URL}/api/production-lines`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to create production line' }));
    throw new Error(error.detail || 'Failed to create production line');
  }

  const data = await response.json();
  return data.production_line;
}

/**
 * Update a production line
 */
export async function updateProductionLine(
  id: string,
  patch: Partial<Omit<ProductionLine, 'id' | 'factory_name' | 'created_at' | 'updated_at' | 'created_by'>>
): Promise<ProductionLine> {
  const response = await fetch(`${BASE_URL}/api/production-lines/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(patch),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to update production line' }));
    throw new Error(error.detail || 'Failed to update production line');
  }

  const data = await response.json();
  return data.production_line;
}

/**
 * Delete a production line
 */
export async function deleteProductionLine(id: string): Promise<void> {
  const response = await fetch(`${BASE_URL}/api/production-lines/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to delete production line' }));
    throw new Error(error.detail || 'Failed to delete production line');
  }
}
