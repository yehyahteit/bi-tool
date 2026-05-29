import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { detectColumns } from '@/lib/parsers/typeDetector';

const ROW_LIMIT = 50_000;

/**
 * POST /api/datasets/merge
 *
 * Body (JSON):
 *   mode: 'join' | 'append'
 *   leftId: string        — base dataset
 *   rightId: string       — dataset to merge in
 *   name: string          — name for the new merged dataset
 *
 *   // join-only:
 *   leftKey: string       — column name on the left dataset
 *   rightKey: string      — column name on the right dataset
 *   joinType: 'inner' | 'left' | 'right' | 'full'
 *
 *   // append-only:
 *   fillMissing: boolean  — fill missing columns with null (default true)
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { mode, leftId, rightId, name, leftKey, rightKey, joinType = 'left', fillMissing = true } = body;

  if (!mode || !leftId || !rightId || !name) {
    return NextResponse.json({ error: 'Missing required fields: mode, leftId, rightId, name' }, { status: 400 });
  }
  if (mode === 'join' && (!leftKey || !rightKey)) {
    return NextResponse.json({ error: 'Join mode requires leftKey and rightKey' }, { status: 400 });
  }

  // Verify ownership of both datasets
  const [leftDs, rightDs] = await Promise.all([
    supabase.from('datasets').select('*').eq('id', leftId).eq('user_id', user.id).single(),
    supabase.from('datasets').select('*').eq('id', rightId).eq('user_id', user.id).single(),
  ]);

  if (!leftDs.data) return NextResponse.json({ error: 'Left dataset not found or not owned by you' }, { status: 404 });
  if (!rightDs.data) return NextResponse.json({ error: 'Right dataset not found or not owned by you' }, { status: 404 });

  // Fetch all rows from both datasets
  async function fetchAllRows(datasetId: string): Promise<Record<string, unknown>[]> {
    const all: Record<string, unknown>[] = [];
    const PAGE = 1000;
    let page = 1;
    while (true) {
      const from = (page - 1) * PAGE;
      const { data } = await supabase
        .from('dataset_rows')
        .select('data')
        .eq('dataset_id', datasetId)
        .order('row_index')
        .range(from, from + PAGE - 1);
      if (!data || data.length === 0) break;
      for (const r of data) all.push(r.data as Record<string, unknown>);
      if (data.length < PAGE) break;
      page++;
    }
    return all;
  }

  const [leftRows, rightRows] = await Promise.all([
    fetchAllRows(leftId),
    fetchAllRows(rightId),
  ]);

  let mergedRows: Record<string, unknown>[] = [];

  if (mode === 'append') {
    // Stack rows vertically — union of all columns
    if (fillMissing) {
      // Collect all column names
      const allCols = new Set<string>();
      for (const r of leftRows) for (const k of Object.keys(r)) allCols.add(k);
      for (const r of rightRows) for (const k of Object.keys(r)) allCols.add(k);
      const fill = (row: Record<string, unknown>): Record<string, unknown> => {
        const out: Record<string, unknown> = {};
        for (const c of allCols) out[c] = row[c] ?? null;
        return out;
      };
      mergedRows = [...leftRows.map(fill), ...rightRows.map(fill)];
    } else {
      mergedRows = [...leftRows, ...rightRows];
    }
  } else if (mode === 'join') {
    // Build lookup map from right dataset keyed by rightKey value
    const rightMap = new Map<unknown, Record<string, unknown>[]>();
    for (const r of rightRows) {
      const k = r[rightKey];
      if (!rightMap.has(k)) rightMap.set(k, []);
      rightMap.get(k)!.push(r);
    }

    // Determine suffix for conflicting column names (excluding the key columns)
    const leftCols = new Set(leftRows[0] ? Object.keys(leftRows[0]) : []);
    const rightCols = new Set(rightRows[0] ? Object.keys(rightRows[0]) : []);
    const conflicts = new Set([...rightCols].filter((c) => c !== rightKey && leftCols.has(c) && c !== leftKey));

    function mergeRow(l: Record<string, unknown>, r: Record<string, unknown> | null): Record<string, unknown> {
      const out: Record<string, unknown> = { ...l };
      if (!r) return out;
      for (const [k, v] of Object.entries(r)) {
        if (k === rightKey) continue; // don't duplicate the key
        const col = conflicts.has(k) ? `${k}_right` : k;
        out[col] = v;
      }
      return out;
    }

    const usedRightKeys = new Set<unknown>();

    for (const l of leftRows) {
      const keyVal = l[leftKey];
      const matches = rightMap.get(keyVal) ?? [];
      if (matches.length > 0) {
        usedRightKeys.add(keyVal);
        for (const r of matches) {
          mergedRows.push(mergeRow(l, r));
        }
      } else if (joinType === 'left' || joinType === 'full') {
        mergedRows.push(mergeRow(l, null));
      }
    }

    // Right / full join — add unmatched right rows
    if (joinType === 'right' || joinType === 'full') {
      for (const r of rightRows) {
        const keyVal = r[rightKey];
        if (!usedRightKeys.has(keyVal)) {
          // Build a row with null left columns + right values
          const out: Record<string, unknown> = {};
          for (const c of leftCols) out[c] = null;
          for (const [k, v] of Object.entries(r)) {
            if (k === rightKey) { out[leftKey] = v; continue; }
            const col = conflicts.has(k) ? `${k}_right` : k;
            out[col] = v;
          }
          mergedRows.push(out);
        }
      }
    }
  } else {
    return NextResponse.json({ error: 'Invalid mode. Use "join" or "append".' }, { status: 400 });
  }

  // Enforce row limit
  const limitedRows = mergedRows.slice(0, ROW_LIMIT);

  // Detect schema from merged rows
  const columnsSchema = detectColumns(limitedRows);

  // Create the new merged dataset record
  const { data: newDataset, error: dsError } = await supabase
    .from('datasets')
    .insert({
      user_id: user.id,
      name,
      description: mode === 'join'
        ? `JOIN of "${leftDs.data.name}" and "${rightDs.data.name}" on ${leftKey} = ${rightKey} (${joinType})`
        : `APPEND of "${leftDs.data.name}" + "${rightDs.data.name}"`,
      file_name: `merged_${Date.now()}.json`,
      file_type: 'json',
      status: 'processing',
      row_count: 0,
      column_count: 0,
    })
    .select()
    .single();

  if (dsError || !newDataset) {
    return NextResponse.json({ error: dsError?.message ?? 'Failed to create dataset' }, { status: 500 });
  }

  try {
    // Insert rows in chunks
    const CHUNK = 1000;
    for (let i = 0; i < limitedRows.length; i += CHUNK) {
      const chunk = limitedRows.slice(i, i + CHUNK).map((data, j) => ({
        dataset_id: newDataset.id,
        row_index: i + j,
        data,
        is_cleaned: false,
      }));
      const { error: insertErr } = await supabase.from('dataset_rows').insert(chunk);
      if (insertErr) throw new Error(insertErr.message);
    }

    // Mark ready
    const { data: updated } = await supabase
      .from('datasets')
      .update({
        status: 'ready',
        row_count: limitedRows.length,
        column_count: columnsSchema.length,
        columns_schema: columnsSchema,
      })
      .eq('id', newDataset.id)
      .select()
      .single();

    return NextResponse.json({ data: updated }, { status: 201 });
  } catch (err) {
    await supabase.from('datasets').update({
      status: 'error',
      error_message: err instanceof Error ? err.message : 'Merge error',
    }).eq('id', newDataset.id);
    return NextResponse.json({ error: 'Failed to merge datasets' }, { status: 500 });
  }
}
