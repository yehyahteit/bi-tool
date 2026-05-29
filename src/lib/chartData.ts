import type { ChartConfig, ChartFilter, AggregationType } from '@/types';

type Row = Record<string, unknown>;

function aggregate(values: number[], agg: AggregationType): number {
  if (!values.length) return 0;
  switch (agg) {
    case 'sum':    return values.reduce((a, b) => a + b, 0);
    case 'avg':    return values.reduce((a, b) => a + b, 0) / values.length;
    case 'count':  return values.length;
    case 'min':    return Math.min(...values);
    case 'max':    return Math.max(...values);
    default:       return values[0] ?? 0;
  }
}

/** Apply a single filter predicate to a row. */
function passesFilter(r: Row, f: ChartFilter): boolean {
  if (!f.column) return true;
  const v = r[f.column];
  const sv = String(v ?? '').toLowerCase();
  const fv = String(f.value ?? '').toLowerCase();
  switch (f.operator) {
    case 'eq':           return String(v) === String(f.value);
    case 'neq':          return String(v) !== String(f.value);
    case 'gt':           return Number(v) > Number(f.value);
    case 'gte':          return Number(v) >= Number(f.value);
    case 'lt':           return Number(v) < Number(f.value);
    case 'lte':          return Number(v) <= Number(f.value);
    case 'contains':     return Array.isArray(f.value)
                           ? (f.value as string[]).some((val) => sv.includes(val.toLowerCase()))
                           : sv.includes(fv);
    case 'not_contains': return Array.isArray(f.value)
                           ? !(f.value as string[]).some((val) => sv.includes(val.toLowerCase()))
                           : !sv.includes(fv);
    case 'starts_with':  return sv.startsWith(fv);
    case 'ends_with':    return sv.endsWith(fv);
    case 'in':           return Array.isArray(f.value) && (f.value as string[]).map(String).includes(String(v));
    case 'not_in':       return Array.isArray(f.value) && !(f.value as string[]).map(String).includes(String(v));
    case 'between':      return Number(v) >= Number(f.value) && Number(v) <= Number((f as {value2?: unknown}).value2 ?? f.value);
    case 'is_empty':     return v === null || v === undefined || String(v).trim() === '';
    case 'is_not_empty': return v !== null && v !== undefined && String(v).trim() !== '';
    default:             return true;
  }
}

/** Apply an array of filters to rows — exported so ChartBuilder can reuse for cascading. */
export function applyFilters(rows: Row[], filters: ChartFilter[]): Row[] {
  let result = rows;
  for (const f of filters) {
    // Skip filters with no column or no value (unless the op is is_empty / is_not_empty)
    const hasValue = f.value !== '' && f.value !== null && f.value !== undefined &&
                     !(Array.isArray(f.value) && (f.value as unknown[]).length === 0);
    const valueRequired = !['is_empty', 'is_not_empty'].includes(f.operator);
    if (!f.column || (valueRequired && !hasValue)) continue;
    result = result.filter((r) => passesFilter(r, f));
  }
  return result;
}

/** Unpivot (melt) wide-format rows into long format */
export function unpivotRows(rows: Row[], config: ChartConfig): Row[] {
  const {
    unpivotIdCols = [],
    unpivotValueCols = [],
    unpivotKeyName = 'Period',
    unpivotValueName = 'Value',
  } = config;
  if (!unpivotValueCols.length) return rows;
  const result: Row[] = [];
  for (const row of rows) {
    for (const col of unpivotValueCols) {
      const newRow: Row = {};
      // Keep identifier columns
      for (const id of unpivotIdCols) newRow[id] = row[id];
      // Add the period and value
      newRow[unpivotKeyName] = col;
      const raw = row[col];
      // Parse numeric strings like "1,234" or "57.80%"
      if (typeof raw === 'string') {
        const cleaned = raw.replace(/,/g, '').replace(/%$/, '');
        const n = parseFloat(cleaned);
        newRow[unpivotValueName] = isNaN(n) ? raw : n;
      } else {
        newRow[unpivotValueName] = raw;
      }
      result.push(newRow);
    }
  }
  return result;
}

/** Try to parse a value as a date for sorting — handles "13-APR-2026", ISO, etc. */
function parseSortKey(val: string): number {
  const d = new Date(val);
  if (!isNaN(d.getTime())) return d.getTime();
  // Handle "DD-MON-YYYY" like "13-APR-2026"
  const m = val.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (m) {
    const months: Record<string, number> = {
      jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11
    };
    const mo = months[m[2].toLowerCase()];
    if (mo !== undefined) return new Date(Number(m[3]), mo, Number(m[1])).getTime();
  }
  return 0; // non-date: don't sort
}

/** Linear regression — returns slope and intercept */
function linearRegression(ys: number[]): { slope: number; intercept: number } {
  const n = ys.length;
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0 };
  const xs = ys.map((_, i) => i);
  const sumX  = xs.reduce((a, b) => a + b, 0);
  const sumY  = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0);
  const sumX2 = xs.reduce((s, x) => s + x * x, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

export function buildChartData(
  rows: Row[],
  config: ChartConfig
): { data: Row[]; keys: string[] } {
  const {
    xAxis, yAxis, aggregation = 'sum', groupBy, filters = [],
    unpivot = false, showTrend = false, trendKeys,
  } = config;

  // Apply filters first, then unpivot if enabled
  let filtered = applyFilters(rows, filters);
  if (unpivot) filtered = unpivotRows(filtered, config);

  if (!xAxis) return { data: filtered.slice(0, 500), keys: [] };

  // Group by xAxis — preserve insertion order (order from unpivotValueCols)
  const groups: Record<string, Row[]> = {};
  for (const row of filtered) {
    const key = String(row[xAxis] ?? '(blank)');
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  }

  // Sort groups — by date if all keys look like dates, else alphabetically
  const groupKeys = Object.keys(groups);
  const allAreDates = groupKeys.every((k) => parseSortKey(k) > 0);
  const sortedKeys = allAreDates
    ? [...groupKeys].sort((a, b) => parseSortKey(a) - parseSortKey(b))
    : groupKeys; // preserve original order (unpivot column order)

  // Determine y columns
  const yColumns = Array.isArray(yAxis)
    ? yAxis
    : yAxis
    ? [yAxis]
    : [];

  if (!yColumns.length) {
    return {
      data: sortedKeys.map((k) => ({ [xAxis]: k, count: groups[k].length })),
      keys: ['count'],
    };
  }

  // Aggregate
  const data = sortedKeys.map((k) => {
    const rs = groups[k];
    const entry: Row = { [xAxis]: k };

    if (groupBy) {
      const subGroups = new Set(rs.map((r) => String(r[groupBy] ?? 'Other')));
      for (const sg of subGroups) {
        const sgRows = rs.filter((r) => String(r[groupBy] ?? 'Other') === sg);
        const vals = sgRows.map((r) => Number(r[yColumns[0]]) || 0);
        entry[sg] = aggregate(vals, aggregation);
      }
    } else {
      for (const col of yColumns) {
        const vals = rs.map((r) => Number(r[col]) || 0);
        entry[col] = aggregate(vals, aggregation);
      }
    }

    return entry;
  });

  const keys = groupBy
    ? [...new Set(filtered.map((r) => String(r[groupBy] ?? 'Other')))]
    : yColumns;

  // Add trend lines
  if (showTrend && data.length > 1) {
    const seriesForTrend = trendKeys?.length ? trendKeys : keys;
    for (const key of seriesForTrend) {
      const trendKey = `${key}__trend`;
      const ys = data.map((d) => Number(d[key]) || 0);
      const { slope, intercept } = linearRegression(ys);
      data.forEach((d, i) => { d[trendKey] = Math.round((intercept + slope * i) * 100) / 100; });
    }
  }

  return { data, keys };
}

// KPI aggregation
export function buildKPIValue(rows: Row[], config: ChartConfig): number | string {
  const { kpiColumn, kpiAggregation = 'sum' } = config;
  if (!kpiColumn) return rows.length;
  const vals = rows.map((r) => Number(r[kpiColumn]) || 0);
  const result = aggregate(vals, kpiAggregation);
  return result;
}
