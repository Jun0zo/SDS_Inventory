export type Warehouse = {
  id: string;
  code: string;
  name: string;
  uses_sap: boolean;
  uses_wms: boolean;
  time_zone?: string | null;
  created_by?: string | null;
  created_at?: string;
};

// Production Line Material (BOM - Bill of Materials)
export type ProductionLineMaterial = {
  id: string;
  material_code: string;
  material_name: string;
  quantity_per_unit: number; // 제품 1개 생산에 필요한 자재 수량
  unit: string; // 단위 (예: EA, KG, L 등)
};

// Production Line
export type ProductionLine = {
  id: string;
  warehouse_id: string;
  line_code: string;
  line_name: string;
  line_count: number; // 라인 수 (항상 1)
  daily_production_capacity: number; // 일일 생산량 (개/일)
  output_product_code?: string | null; // 생산되는 제품 코드 (선택사항)
  output_product_name?: string | null; // 생산되는 제품명 (선택사항)
  materials: ProductionLineMaterial[]; // BOM (Bill of Materials)
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export const TIME_ZONES = [
  { value: 'America/New_York', label: 'Eastern (New York)' },
  { value: 'America/Chicago', label: 'Central (Chicago)' },
  { value: 'America/Denver', label: 'Mountain (Denver)' },
  { value: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Paris', label: 'Paris' },
  { value: 'Asia/Seoul', label: 'Seoul' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
  { value: 'Asia/Shanghai', label: 'Shanghai' },
  { value: 'Australia/Sydney', label: 'Sydney' },
];
