import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify ownership
  const { data: dash } = await supabase.from('dashboards').select('id').eq('id', id).eq('user_id', user.id).single();
  if (!dash) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const { chart_id, widget_type, title, config, position } = body;

  const { data, error } = await supabase
    .from('dashboard_widgets')
    .insert({ dashboard_id: id, chart_id, widget_type, title, config: config ?? {}, position: position ?? { x: 0, y: 0, w: 6, h: 4 } })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  // body = { widgets: [{ id, position }] } for layout updates
  const updates = body.widgets ?? [];

  await Promise.all(
    updates.map((w: { id: string; position: object }) =>
      supabase.from('dashboard_widgets').update({ position: w.position }).eq('id', w.id)
    )
  );

  return NextResponse.json({ message: 'Layout updated' });
}
