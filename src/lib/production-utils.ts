/**
 * Production line utilities for calculating stock days and capacity
 */

export interface StockInfo {
  currentStock: number;
  dailyConsumption: number;
  stockDays: number;
}

export interface ProductionLineInfo {
  // lineCount is always 1 now
  dailyProductionCapacity: number;
  materials: Array<{
    material_code: string;
    quantity_per_unit: number;
  }>;
}

/**
 * Calculate stock days for a material
 * @param currentStock Current stock quantity
 * @param dailyConsumption Daily consumption rate
 * @returns Stock days information
 */
export function calculateStockDays(
  currentStock: number,
  dailyConsumption: number
): StockInfo {
  const stockDays = dailyConsumption > 0 ? currentStock / dailyConsumption : 0;

  return {
    currentStock,
    dailyConsumption,
    stockDays: Math.round(stockDays * 10) / 10 // Round to 1 decimal place
  };
}

/**
 * Calculate total daily consumption for a production line
 * @param productionLines Array of production lines
 * @returns Map of material_code to daily consumption
 */
export function calculateDailyConsumption(
  productionLines: ProductionLineInfo[]
): Map<string, number> {
  const consumptionMap = new Map<string, number>();

  for (const line of productionLines) {
    // lineCount is always 1 now
    const totalCapacity = line.dailyProductionCapacity;

    for (const material of line.materials) {
      const currentConsumption = consumptionMap.get(material.material_code) || 0;
      const additionalConsumption = material.quantity_per_unit * totalCapacity;
      consumptionMap.set(material.material_code, currentConsumption + additionalConsumption);
    }
  }

  return consumptionMap;
}

/**
 * Get stock status color based on stock days
 * @param stockDays Number of stock days remaining
 * @returns Tailwind CSS color class
 */
export function getStockStatusColor(stockDays: number): string {
  if (stockDays <= 0) return 'text-red-600';
  if (stockDays < 7) return 'text-orange-600';
  if (stockDays < 30) return 'text-yellow-600';
  return 'text-green-600';
}

/**
 * Get stock status label based on stock days
 * @param stockDays Number of stock days remaining
 * @returns Status label
 */
export function getStockStatusLabel(stockDays: number): string {
  if (stockDays <= 0) return '재고 부족';
  if (stockDays < 7) return '긴급 (7일 미만)';
  if (stockDays < 30) return '주의 (30일 미만)';
  return '안전 (30일 이상)';
}

/**
 * Calculate stock days for all materials in production lines
 * @param productionLines Array of production lines
 * @param materialStock Map of material_code to current stock
 * @returns Map of material_code to stock info
 */
export function calculateAllStockDays(
  productionLines: ProductionLineInfo[],
  materialStock: Map<string, number>
): Map<string, StockInfo> {
  console.log('🔢 calculateAllStockDays: Input', {
    productionLinesCount: productionLines.length,
    productionLines: productionLines,
    materialStockCount: materialStock.size,
    materialStock: Array.from(materialStock.entries())
  });

  const consumptionMap = calculateDailyConsumption(productionLines);
  console.log('📊 Daily Consumption Map:', Array.from(consumptionMap.entries()));

  const stockDaysMap = new Map<string, StockInfo>();

  for (const [materialCode, dailyConsumption] of consumptionMap) {
    const currentStock = materialStock.get(materialCode) || 0;
    const stockInfo = calculateStockDays(currentStock, dailyConsumption);
    stockDaysMap.set(materialCode, stockInfo);

    console.log(`📈 Material ${materialCode}:`, {
      currentStock,
      dailyConsumption,
      stockDays: stockInfo.stockDays
    });
  }

  console.log('✅ Final Stock Days Map:', {
    size: stockDaysMap.size,
    entries: Array.from(stockDaysMap.entries())
  });

  return stockDaysMap;
}

/**
 * Calculate stock days for each production line
 * @param productionLines Array of production lines
 * @param materialStock Map of material_code to current stock
 * @returns Map of line_id to stock info summary
 */
export function calculateStockDaysByLine(
  productionLines: Array<{
    id: string;
    name: string;
    dailyProductionCapacity: number;
    materials: Array<{
      material_code: string;
      quantity_per_unit: number;
    }>;
  }>,
  materialStock: Map<string, number>
): Map<string, { lineName: string; avgStockDays: number; criticalCount: number; totalMaterials: number }> {
  const result = new Map<string, { lineName: string; avgStockDays: number; criticalCount: number; totalMaterials: number }>();

  for (const line of productionLines) {
    const lineMaterials = line.materials || [];
    if (lineMaterials.length === 0) continue;

    let totalStockDays = 0;
    let criticalCount = 0;
    const materialCodes = new Set<string>();

    for (const material of lineMaterials) {
      const currentStock = materialStock.get(material.material_code) || 0;
      const dailyConsumption = material.quantity_per_unit * line.dailyProductionCapacity;
      const stockDays = dailyConsumption > 0 ? currentStock / dailyConsumption : 0;

      totalStockDays += stockDays;
      if (stockDays <= 0) criticalCount++;
      materialCodes.add(material.material_code);
    }

    const avgStockDays = totalStockDays / lineMaterials.length;

    result.set(line.id, {
      lineName: line.name,
      avgStockDays: Math.round(avgStockDays * 10) / 10,
      criticalCount,
      totalMaterials: materialCodes.size
    });
  }

  return result;
}
