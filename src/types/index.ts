// =============================================
// AI BI Studio — Core TypeScript Types
// =============================================

// ─── COLUMN / SCHEMA ──────────────────────────────────────────────────────────
export type ColumnType = 'string' | 'number' | 'boolean' | 'date' | 'unknown';

export interface ColumnLookup {
  categoryId: string;       // config_categories.id
  categoryName: string;     // display name e.g. "Application Types"
  matchField: string;       // key in entry.data to match against raw value e.g. "id"
  displayField: string;     // key in entry.data to show instead e.g. "name_en"
}

export interface ColumnSchema {
  name: string;
  type: ColumnType;
  nullable: boolean;
  sample: unknown[];
  uniqueCount?: number;
  min?: number | string;
  max?: number | string;
  lookup?: ColumnLookup;    // optional link to a config table
}

// ─── DATASET ──────────────────────────────────────────────────────────────────
export type DatasetStatus = 'pending' | 'processing' | 'ready' | 'error';
export type FileType = 'xlsx' | 'xls' | 'csv' | 'json' | 'txt';

export interface Dataset {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  file_name: string;
  file_path?: string;
  file_size?: number;
  file_type: FileType;
  status: DatasetStatus;
  row_count: number;
  column_count: number;
  columns_schema: ColumnSchema[];
  cleaning_config: CleaningConfig;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface DatasetRow {
  id: number;
  dataset_id: string;
  row_index: number;
  data: Record<string, unknown>;
  is_cleaned: boolean;
}

// ─── CLEANING ─────────────────────────────────────────────────────────────────
export type NullFillStrategy = 'mean' | 'median' | 'mode' | 'constant' | 'drop';
export type OutlierStrategy = 'iqr' | 'zscore' | 'none';

export interface CleaningRule {
  column: string;
  nullFill?: { strategy: NullFillStrategy; value?: string | number };
  outlier?: { strategy: OutlierStrategy; threshold?: number };
  rename?: string;
  cast?: ColumnType;
  trim?: boolean;
  lowercase?: boolean;
}

export interface CleaningConfig {
  rules: CleaningRule[];
  removeDuplicates: boolean;
  dropEmptyRows: boolean;
}

// ─── CHART ────────────────────────────────────────────────────────────────────
export type ChartType =
  | 'bar'
  | 'line'
  | 'pie'
  | 'donut'
  | 'area'
  | 'scatter'
  | 'table'
  | 'kpi'
  | 'stacked_bar'
  | 'gauge';

export type AggregationType = 'sum' | 'avg' | 'count' | 'min' | 'max' | 'none';

export interface ChartFilter {
  column: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'not_contains' | 'starts_with' | 'ends_with' | 'in' | 'not_in' | 'between' | 'is_empty' | 'is_not_empty';
  value: unknown;       // string | number for most operators
  value2?: unknown;     // used by 'between' as the upper bound
}

export interface ChartConfig {
  xAxis?: string;
  yAxis?: string | string[];  // string[] for stacked bar
  groupBy?: string;
  aggregation?: AggregationType;
  filters?: ChartFilter[];
  colors?: string[];
  showLegend?: boolean;
  showGrid?: boolean;
  showLabels?: boolean;
  // KPI specific
  kpiColumn?: string;
  kpiAggregation?: AggregationType;
  kpiPrefix?: string;
  kpiSuffix?: string;
  kpiCompareColumn?: string;
  // Table specific
  tableColumns?: string[];
  pageSize?: number;
  // Appearance
  title?: string;
  subtitle?: string;
  // Unpivot (wide → long) — for datasets with date/period columns as headers
  unpivot?: boolean;
  unpivotIdCols?: string[];    // columns to keep as identifiers (e.g. Key Metric, Metric Type)
  unpivotValueCols?: string[]; // columns to melt into rows (e.g. date columns)
  unpivotKeyName?: string;     // name for the new "date" column (default: "Period")
  unpivotValueName?: string;   // name for the new "value" column (default: "Value")
  // Trend line
  showTrend?: boolean;
  trendKeys?: string[];        // which series keys to add trend lines for (empty = all)
  trendColors?: string[];      // per-series trend line colors
  // Label renaming — maps original series key → display name shown in legend/tooltip
  seriesLabels?: Record<string, string>;
  // Gauge specific
  gaugeColumn?: string;
  gaugeAggregation?: AggregationType;
  gaugeMin?: number;
  gaugeMax?: number;
  gaugeThresholds?: { value: number; color: string }[]; // e.g. [{value:50,color:'#22c55e'},{value:80,color:'#f59e0b'}]
  gaugePrefix?: string;
  gaugeSuffix?: string;
}

export interface Chart {
  id: string;
  user_id: string;
  dataset_id: string;
  name: string;
  description?: string;
  chart_type: ChartType;
  config: ChartConfig;
  thumbnail?: string;
  created_at: string;
  updated_at: string;
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
export interface LayoutItem {
  i: string;  // widget id
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

export type WidgetType = 'chart' | 'kpi' | 'filter' | 'text' | 'image';

export interface DashboardWidget {
  id: string;
  dashboard_id: string;
  chart_id?: string;
  widget_type: WidgetType;
  title?: string;
  config: Record<string, unknown>;
  position: { x: number; y: number; w: number; h: number };
  created_at: string;
  // Joined
  chart?: Chart;
}

export interface GlobalFilter {
  column: string;
  label: string;
  type: 'select' | 'range' | 'date_range' | 'text';
  value?: unknown;
}

export interface Dashboard {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  layout: LayoutItem[];
  global_filters: Record<string, GlobalFilter>;
  theme: 'light' | 'dark';
  is_public: boolean;
  public_slug?: string;
  created_at: string;
  updated_at: string;
  // Joined
  widgets?: DashboardWidget[];
}

// ─── AI ───────────────────────────────────────────────────────────────────────
export type InsightType = 'summary' | 'chart_suggestions' | 'anomalies' | 'auto_dashboard';

export interface ChartSuggestion {
  chart_type: ChartType;
  title: string;
  xAxis: string;
  yAxis: string;
  reason: string;
}

export interface AnomalyItem {
  column: string;
  row_index: number;
  value: unknown;
  expected_range: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
}

export interface AIInsight {
  id: string;
  user_id: string;
  dataset_id: string;
  type: InsightType;
  content: {
    summary?: string;
    suggestions?: ChartSuggestion[];
    anomalies?: AnomalyItem[];
    dashboard?: Partial<Dashboard>;
  };
  model?: string;
  tokens_used?: number;
  expires_at?: string;
  created_at: string;
}

// ─── API RESPONSES ────────────────────────────────────────────────────────────
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
