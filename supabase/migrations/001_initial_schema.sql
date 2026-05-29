-- =============================================
-- AI BI Studio — Initial Schema
-- =============================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ─── PROFILES ─────────────────────────────────────────────────────────────────
-- Extends Supabase auth.users with app-level preferences
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  avatar_url  text,
  plan        text not null default 'free' check (plan in ('free', 'pro', 'enterprise')),
  preferences jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── DATASETS ─────────────────────────────────────────────────────────────────
create table public.datasets (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  description     text,
  file_name       text not null,
  file_path       text,                       -- Supabase Storage path
  file_size       bigint,
  file_type       text not null check (file_type in ('xlsx','xls','csv','json','txt')),
  status          text not null default 'pending'
                    check (status in ('pending','processing','ready','error')),
  row_count       integer default 0,
  column_count    integer default 0,
  columns_schema  jsonb not null default '[]', -- [{name, type, nullable, sample}]
  cleaning_config jsonb not null default '{}',
  error_message   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ─── DATASET ROWS ─────────────────────────────────────────────────────────────
create table public.dataset_rows (
  id          bigserial primary key,
  dataset_id  uuid not null references public.datasets(id) on delete cascade,
  row_index   integer not null,
  data        jsonb not null,
  is_cleaned  boolean not null default false
);
create index idx_dataset_rows_dataset_id on public.dataset_rows(dataset_id);
create index idx_dataset_rows_index on public.dataset_rows(dataset_id, row_index);

-- ─── CHARTS ───────────────────────────────────────────────────────────────────
create table public.charts (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  dataset_id   uuid not null references public.datasets(id) on delete cascade,
  name         text not null,
  description  text,
  chart_type   text not null check (chart_type in (
    'bar','line','pie','donut','area','scatter','table','kpi','stacked_bar'
  )),
  config       jsonb not null default '{}',  -- axes, colors, aggregations, filters
  thumbnail    text,                          -- Storage path for preview image
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ─── DASHBOARDS ───────────────────────────────────────────────────────────────
create table public.dashboards (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  description     text,
  layout          jsonb not null default '[]',  -- react-grid-layout serialized
  global_filters  jsonb not null default '{}',
  theme           text not null default 'light' check (theme in ('light','dark')),
  is_public       boolean not null default false,
  public_slug     text unique,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_dashboards_user on public.dashboards(user_id);
create index idx_dashboards_slug on public.dashboards(public_slug) where public_slug is not null;

-- ─── DASHBOARD WIDGETS ────────────────────────────────────────────────────────
create table public.dashboard_widgets (
  id              uuid primary key default uuid_generate_v4(),
  dashboard_id    uuid not null references public.dashboards(id) on delete cascade,
  chart_id        uuid references public.charts(id) on delete set null,
  widget_type     text not null check (widget_type in ('chart','kpi','filter','text')),
  title           text,
  config          jsonb not null default '{}',  -- KPI config or text content
  position        jsonb not null default '{}',  -- {x, y, w, h}
  created_at      timestamptz not null default now()
);
create index idx_widgets_dashboard on public.dashboard_widgets(dashboard_id);

-- ─── AI INSIGHTS ──────────────────────────────────────────────────────────────
create table public.ai_insights (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  dataset_id  uuid not null references public.datasets(id) on delete cascade,
  type        text not null check (type in ('summary','chart_suggestions','anomalies','auto_dashboard')),
  content     jsonb not null default '{}',
  model       text,
  tokens_used integer,
  expires_at  timestamptz default (now() + interval '24 hours'),
  created_at  timestamptz not null default now()
);
create index idx_insights_dataset on public.ai_insights(dataset_id, type);

-- ─── UPDATED_AT TRIGGER ───────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at_profiles   before update on public.profiles         for each row execute function public.set_updated_at();
create trigger set_updated_at_datasets   before update on public.datasets         for each row execute function public.set_updated_at();
create trigger set_updated_at_charts     before update on public.charts           for each row execute function public.set_updated_at();
create trigger set_updated_at_dashboards before update on public.dashboards       for each row execute function public.set_updated_at();
