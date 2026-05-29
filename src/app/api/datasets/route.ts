import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { detectColumns } from '@/lib/parsers/typeDetector';
import { parseExcel } from '@/lib/parsers/excel';
import { parseCsv } from '@/lib/parsers/csv';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ROW_LIMIT = 50_000;

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') ?? '1');
  const pageSize = parseInt(searchParams.get('pageSize') ?? '20');
  const from = (page - 1) * pageSize;

  const { data, error, count } = await supabase
    .from('datasets')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data, count, page, pageSize, totalPages: Math.ceil((count ?? 0) / pageSize) });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const name = (formData.get('name') as string) || file?.name || 'Untitled';
  const description = formData.get('description') as string | null;

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'File too large (max 50MB)' }, { status: 400 });

  const ext = file.name.split('.').pop()?.toLowerCase();
  const validExts = ['xlsx', 'xls', 'csv', 'json', 'txt'];
  if (!ext || !validExts.includes(ext)) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
  }

  // Create dataset record
  const { data: dataset, error: dsError } = await supabase
    .from('datasets')
    .insert({
      user_id: user.id,
      name,
      description,
      file_name: file.name,
      file_type: ext,
      file_size: file.size,
      status: 'processing',
    })
    .select()
    .single();

  if (dsError || !dataset) {
    return NextResponse.json({ error: dsError?.message ?? 'Failed to create dataset' }, { status: 500 });
  }

  try {
    // Upload raw file to Storage
    const bytes = await file.arrayBuffer();
    const storagePath = `${user.id}/${dataset.id}/${file.name}`;
    await supabase.storage.from('datasets').upload(storagePath, bytes, {
      contentType: file.type,
      upsert: true,
    });

    // Parse
    let rows: Record<string, unknown>[] = [];
    if (ext === 'xlsx' || ext === 'xls') {
      rows = parseExcel(bytes);
    } else {
      const text = await file.text();
      if (ext === 'csv' || ext === 'txt') rows = parseCsv(text);
      else if (ext === 'json') {
        const parsed = JSON.parse(text);
        rows = Array.isArray(parsed) ? parsed : [parsed];
      }
    }

    // Limit rows
    const limitedRows = rows.slice(0, ROW_LIMIT);

    // Detect schema
    const columnsSchema = detectColumns(limitedRows);

    // Batch insert rows (chunks of 1000)
    const CHUNK = 1000;
    for (let i = 0; i < limitedRows.length; i += CHUNK) {
      const chunk = limitedRows.slice(i, i + CHUNK).map((data, j) => ({
        dataset_id: dataset.id,
        row_index: i + j,
        data,
        is_cleaned: false,
      }));
      await supabase.from('dataset_rows').insert(chunk);
    }

    // Update dataset to ready
    const { data: updated } = await supabase
      .from('datasets')
      .update({
        status: 'ready',
        row_count: limitedRows.length,
        column_count: columnsSchema.length,
        columns_schema: columnsSchema,
        file_path: storagePath,
      })
      .eq('id', dataset.id)
      .select()
      .single();

    return NextResponse.json({ data: updated }, { status: 201 });
  } catch (err) {
    await supabase.from('datasets').update({
      status: 'error',
      error_message: err instanceof Error ? err.message : 'Parse error',
    }).eq('id', dataset.id);

    return NextResponse.json({ error: 'Failed to process file' }, { status: 500 });
  }
}
