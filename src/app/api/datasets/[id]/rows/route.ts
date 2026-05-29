import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify ownership
  const { data: dataset } = await supabase
    .from('datasets')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!dataset) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') ?? '1');
  const pageSize = parseInt(searchParams.get('pageSize') ?? '100');
  const cleaned = searchParams.get('cleaned') === 'true';
  const from = (page - 1) * pageSize;

  const { data, error, count } = await supabase
    .from('dataset_rows')
    .select('row_index, data', { count: 'exact' })
    .eq('dataset_id', id)
    .eq('is_cleaned', cleaned)
    .order('row_index')
    .range(from, from + pageSize - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data, count, page, pageSize });
}
