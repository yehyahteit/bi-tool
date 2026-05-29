import type { ColumnType } from '@/types';
import { clsx } from 'clsx';

const map: Record<ColumnType, { label: string; cls: string }> = {
  string:  { label: 'Text',    cls: 'bg-blue-50 text-blue-700' },
  number:  { label: 'Number',  cls: 'bg-green-50 text-green-700' },
  boolean: { label: 'Boolean', cls: 'bg-yellow-50 text-yellow-700' },
  date:    { label: 'Date',    cls: 'bg-purple-50 text-purple-700' },
  unknown: { label: '?',       cls: 'bg-gray-50 text-gray-500' },
};

export default function TypeBadge({ type }: { type: ColumnType }) {
  const { label, cls } = map[type] ?? map.unknown;
  return (
    <span className={clsx('badge text-[10px] font-semibold', cls)}>{label}</span>
  );
}
