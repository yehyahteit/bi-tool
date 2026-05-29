-- ── Dynamic Configuration System ──────────────────────────────────────────

-- 1. Categories (e.g. "Application Types", "Regions", "Status Codes")
create table if not exists public.config_categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  description text,
  slug        text not null,                         -- url-safe key, unique per user
  columns     jsonb not null default '[]'::jsonb,    -- column definitions
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, slug)
);

-- 2. Entries — one row per record in any category
create table if not exists public.config_entries (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.config_categories(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,    -- flexible key→value store
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- updated_at triggers
create trigger set_config_categories_updated_at
  before update on public.config_categories
  for each row execute procedure public.set_updated_at();

create trigger set_config_entries_updated_at
  before update on public.config_entries
  for each row execute procedure public.set_updated_at();

-- RLS
alter table public.config_categories enable row level security;
alter table public.config_entries    enable row level security;

create policy "config_categories_owner" on public.config_categories
  for all using (auth.uid() = user_id);

create policy "config_entries_owner" on public.config_entries
  for all using (auth.uid() = user_id);

-- ── Seed: Application Types category with all 34 entries ──────────────────
-- We insert as the first user (done at app level in the seed API instead,
-- since we don't know the user_id at migration time).
-- Run POST /api/config/categories/seed after first login to load App Types.
