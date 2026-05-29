import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('config_categories')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { name, description, columns } = body;
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const { data: existing } = await supabase
    .from('config_categories')
    .select('id')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: false })
    .limit(1);

  const sort_order = (existing?.length ?? 0) + 1;

  const { data, error } = await supabase
    .from('config_categories')
    .insert({ user_id: user.id, name, description: description ?? '', slug, columns: columns ?? [], sort_order })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
