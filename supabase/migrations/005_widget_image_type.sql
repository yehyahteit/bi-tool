-- Add 'image' to the widget_type check constraint
-- Drop the old constraint and recreate it with the new value

alter table public.dashboard_widgets
  drop constraint if exists dashboard_widgets_widget_type_check;

alter table public.dashboard_widgets
  add constraint dashboard_widgets_widget_type_check
  check (widget_type in ('chart', 'kpi', 'filter', 'text', 'image'));
