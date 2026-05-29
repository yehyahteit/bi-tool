import { parseExcel } from './excel';
import { parseCsv } from './csv';
import type { FileType } from '@/types';

export async function parseFile(
  file: File
): Promise<{ rows: Record<string, unknown>[]; fileType: FileType }> {
  const ext = file.name.split('.').pop()?.toLowerCase() as FileType;

  if (ext === 'xlsx' || ext === 'xls') {
    const buffer = await file.arrayBuffer();
    return { rows: parseExcel(buffer), fileType: ext };
  }

  if (ext === 'csv') {
    const text = await file.text();
    return { rows: parseCsv(text), fileType: 'csv' };
  }

  if (ext === 'json') {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return { rows, fileType: 'json' };
  }

  if (ext === 'txt') {
    const text = await file.text();
    // Attempt CSV parse first (tab or comma delimited)
    const rows = parseCsv(text);
    return { rows, fileType: 'txt' };
  }

  throw new Error(`Unsupported file type: ${ext}`);
}

export { parseExcel } from './excel';
export { parseCsv } from './csv';
export { detectColumns, castValue } from './typeDetector';
