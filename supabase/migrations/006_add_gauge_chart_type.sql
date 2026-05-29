-- Add 'gauge' to the charts_chart_type_check constraint
alter table public.charts
  drop constraint if exists charts_chart_type_check;

alter table public.charts
  add constraint charts_chart_type_check
  check (chart_type in ('bar', 'line', 'pie', 'donut', 'area', 'scatter', 'table', 'kpi', 'stacked_bar', 'gauge'));
