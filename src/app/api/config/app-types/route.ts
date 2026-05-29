import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/config/app-types — list all
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('app_types')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// POST /api/config/app-types — create new
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, name_en, name_ar, is_active, sort_order } = body;

  if (!id || !name_en) {
    return NextResponse.json({ error: 'id and name_en are required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('app_types')
    .insert({ id: String(id).trim(), name_en, name_ar: name_ar ?? '', is_active: is_active ?? true, sort_order: sort_order ?? 999 })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
