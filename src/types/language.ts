export type Language = 'ko' | 'en';

export interface Translations {
  // Navigation
  dashboard: string;
  inventory: string;
  materials: string;
  zones: string;
  activity: string;
  settings: string;

  // Common
  search: string;
  filter: string;
  export: string;
  import: string;
  save: string;
  cancel: string;
  delete: string;
  edit: string;
  add: string;
  create: string;
  update: string;
  loading: string;
  error: string;
  success: string;
  confirm: string;
  close: string;
  back: string;

  // Dashboard
  totalInventory: string;
  availableStock: string;
  stockStatus: string;
  viewDetails: string;
  warehouse: string;
  warehouses: string;
  zone: string;
  zones: string;
  selectedWarehouses: string;
  zoneHeatmap: string;
  inventoryDiscrepancies: string;
  recentActivity: string;
  stockDays: string;

  // Stock Days Detail Modal
  stockDaysDetail: string;
  stockDaysDetailDescription: string;
  productionLineInfo: string;
  linesInOperation: string;
  deficient: string;
  urgent: string;
  warning: string;
  safe: string;
  total: string;
  chartView: string;
  tableView: string;
  currentStock: string;
  dailyConsumption: string;
  status: string;
  material: string;
  days: string;

  // Stock Status
  unrestricted: string;
  qualityInspection: string;
  blocked: string;
  returns: string;
  stockStatusDetail: string;
  byMaterial: string;
  byCategory: string;
  selectMaterial: string;
  searchMaterial: string;
  materialCode: string;
  materialName: string;
  quantity: string;
  stockRatio: string;
  stockQuantity: string;

  // Production Lines
  productionLines: string;
  addProductionLine: string;
  productionLineName: string;
  dailyProductionCapacity: string;
  billOfMaterials: string;
  material: string;
  unit: string;
  lineCount: string;

  // Warehouse Management
  warehouseManagement: string;
  addWarehouse: string;
  warehouseName: string;
  warehouseCode: string;

  // Zones
  zoneManagement: string;
  addZone: string;
  zoneName: string;

  // Settings
  language: string;
  theme: string;
  dark: string;
  light: string;
  system: string;

  // Status messages
  saving: string;
  saved: string;
  deleting: string;
  deleted: string;
  loadingData: string;
  noData: string;
  materialNotFound: string;
  pleaseEnterSearchTerm: string;
}
