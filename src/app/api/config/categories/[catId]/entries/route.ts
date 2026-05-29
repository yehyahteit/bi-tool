import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type Params = Promise<{ catId: string }>;

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { catId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('config_entries')
    .select('*')
    .eq('category_id', catId)
    .eq('user_id', user.id)
    .order('sort_order');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { catId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { data: last } = await supabase
    .from('config_entries')
    .select('sort_order')
    .eq('category_id', catId)
    .order('sort_order', { ascending: false })
    .limit(1);

  const sort_order = ((last?.[0]?.sort_order as number) ?? 0) + 1;

  const { data, error } = await supabase
    .from('config_entries')
    .insert({
      category_id: catId,
      user_id: user.id,
      data: body.data ?? {},
      is_active: body.is_active ?? true,
      sort_order,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
