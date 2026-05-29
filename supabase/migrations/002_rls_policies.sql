-- =============================================
-- Row-Level Security Policies
-- =============================================

-- Enable RLS on all tables
alter table public.profiles          enable row level security;
alter table public.datasets          enable row level security;
alter table public.dataset_rows      enable row level security;
alter table public.charts            enable row level security;
alter table public.dashboards        enable row level security;
alter table public.dashboard_widgets enable row level security;
alter table public.ai_insights       enable row level security;

-- ─── PROFILES ─────────────────────────────────────────────────────────────────
create policy "Users can view own profile"
  on public.profiles for select
  using (id = auth.uid());

create policy "Users can update own profile"
  on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- ─── DATASETS ─────────────────────────────────────────────────────────────────
create policy "Users can CRUD own datasets"
  on public.datasets for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─── DATASET ROWS ─────────────────────────────────────────────────────────────
create policy "Users can access rows of own datasets"
  on public.dataset_rows for all
  using (
    exists (
      select 1 from public.datasets d
      where d.id = dataset_rows.dataset_id
        and d.user_id = auth.uid()
    )
  );

-- ─── CHARTS ───────────────────────────────────────────────────────────────────
create policy "Users can CRUD own charts"
  on public.charts for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─── DASHBOARDS ───────────────────────────────────────────────────────────────
create policy "Users can CRUD own dashboards"
  on public.dashboards for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "Public dashboards are readable by anyone"
  on public.dashboards for select
  using (is_public = true);

-- ─── DASHBOARD WIDGETS ────────────────────────────────────────────────────────
create policy "Users can CRUD widgets of own dashboards"
  on public.dashboard_widgets for all
  using (
    exists (
      select 1 from public.dashboards d
      where d.id = dashboard_widgets.dashboard_id
        and d.user_id = auth.uid()
    )
  );

create policy "Widgets of public dashboards are readable"
  on public.dashboard_widgets for select
  using (
    exists (
      select 1 from public.dashboards d
      where d.id = dashboard_widgets.dashboard_id
        and d.is_public = true
    )
  );

-- ─── AI INSIGHTS ──────────────────────────────────────────────────────────────
create policy "Users can access own insights"
  on public.ai_insights for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─── STORAGE ──────────────────────────────────────────────────────────────────
-- Run these in the Supabase dashboard Storage section or via CLI
-- insert into storage.buckets (id, name, public) values ('datasets', 'datasets', false);
-- insert into storage.buckets (id, name, public) values ('exports', 'exports', false);

-- create policy "Users can upload to own folder"
--   on storage.objects for insert
--   with check (bucket_id = 'datasets' and auth.uid()::text = (storage.foldername(name))[1]);

-- create policy "Users can read own files"
--   on storage.objects for select
--   using (bucket_id = 'datasets' and auth.uid()::text = (storage.foldername(name))[1]);

-- create policy "Users can delete own files"
--   on storage.objects for delete
--   using (bucket_id = 'datasets' and auth.uid()::text = (storage.foldername(name))[1]);
