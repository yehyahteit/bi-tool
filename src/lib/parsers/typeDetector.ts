import type { ColumnSchema, ColumnType } from '@/types';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T|\s|$)/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const US_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/;
const BOOL_TRUE = /^(true|yes|1|on)$/i;
const BOOL_FALSE = /^(false|no|0|off)$/i;

function detectCellType(val: unknown): ColumnType {
  if (val === null || val === undefined || val === '') return 'unknown';

  if (typeof val === 'boolean') return 'boolean';
  if (typeof val === 'number') return 'number';

  const str = String(val).trim();

  if (BOOL_TRUE.test(str) || BOOL_FALSE.test(str)) return 'boolean';
  if (!isNaN(Number(str)) && str !== '') return 'number';
  if (ISO_DATE.test(str) || ISO_DATETIME.test(str) || US_DATE.test(str)) return 'date';

  return 'string';
}

export function detectColumns(
  rows: Record<string, unknown>[],
  sampleSize = 200
): ColumnSchema[] {
  if (!rows.length) return [];

  const keys = Object.keys(rows[0]);
  const sample = rows.slice(0, sampleSize);

  return keys.map((name) => {
    const values = sample.map((r) => r[name]);
    const nonNull = values.filter((v) => v !== null && v !== undefined && v !== '');

    // Type voting
    const typeCounts: Record<ColumnType, number> = {
      string: 0,
      number: 0,
      boolean: 0,
      date: 0,
      unknown: 0,
    };

    nonNull.forEach((v) => {
      typeCounts[detectCellType(v)]++;
    });

    // Pick winning type (ignore unknown votes)
    const { unknown: _u, ...counted } = typeCounts;
    const type = (
      Object.entries(counted).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'string'
    ) as ColumnType;

    const nullable = values.length > nonNull.length;
    const sampleValues = nonNull.slice(0, 5);

    // Min/max for numbers and dates
    let min: number | string | undefined;
    let max: number | string | undefined;

    if (type === 'number') {
      const nums = nonNull.map(Number).filter((n) => !isNaN(n));
      if (nums.length) {
        min = Math.min(...nums);
        max = Math.max(...nums);
      }
    } else if (type === 'date') {
      const dates = nonNull.map((v) => new Date(String(v)).getTime()).filter((d) => !isNaN(d));
      if (dates.length) {
        min = new Date(Math.min(...dates)).toISOString().split('T')[0];
        max = new Date(Math.max(...dates)).toISOString().split('T')[0];
      }
    }

    const uniqueCount = new Set(nonNull.map(String)).size;

    return { name, type, nullable, sample: sampleValues, uniqueCount, min, max };
  });
}

export function castValue(value: unknown, type: ColumnType): unknown {
  if (value === null || value === undefined || value === '') return null;

  switch (type) {
    case 'number':
      return isNaN(Number(value)) ? null : Number(value);
    case 'boolean':
      return BOOL_TRUE.test(String(value)) ? true : BOOL_FALSE.test(String(value)) ? false : null;
    case 'date':
      return new Date(String(value)).toISOString();
    default:
      return String(value);
  }
}
