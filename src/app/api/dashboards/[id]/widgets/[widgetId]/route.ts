import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type Params = Promise<{ id: string; widgetId: string }>;

// DELETE /api/dashboards/[id]/widgets/[widgetId]
export async function DELETE(_req: NextRequest, { params }: { params: Params }) {
  const { id, widgetId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify dashboard ownership
  const { data: dash } = await supabase
    .from('dashboards')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();
  if (!dash) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { error } = await supabase
    .from('dashboard_widgets')
    .delete()
    .eq('id', widgetId)
    .eq('dashboard_id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message: 'Deleted' });
}

// PATCH /api/dashboards/[id]/widgets/[widgetId]
// Used to update KPI config (label, value) or position
export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  const { id, widgetId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify dashboard ownership
  const { data: dash } = await supabase
    .from('dashboards')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();
  if (!dash) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if (body.config !== undefined) updates.config = body.config;
  if (body.title !== undefined) updates.title = body.title;
  if (body.position !== undefined) updates.position = body.position;
  if (body.chart_id !== undefined) updates.chart_id = body.chart_id;

  const { data, error } = await supabase
    .from('dashboard_widgets')
    .update(updates)
    .eq('id', widgetId)
    .eq('dashboard_id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
