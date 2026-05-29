import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type Params = Promise<{ catId: string }>;

export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  const { catId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if (body.name        !== undefined) updates.name        = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.columns     !== undefined) updates.columns     = body.columns;
  if (body.sort_order  !== undefined) updates.sort_order  = body.sort_order;

  const { data, error } = await supabase
    .from('config_categories')
    .update(updates)
    .eq('id', catId)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Params }) {
  const { catId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('config_categories')
    .delete()
    .eq('id', catId)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message: 'Deleted' });
}
