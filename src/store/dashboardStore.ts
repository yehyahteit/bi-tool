import { create } from 'zustand';
import type { Dashboard, DashboardWidget, LayoutItem, GlobalFilter } from '@/types';

interface DashboardState {
  dashboard: Dashboard | null;
  widgets: DashboardWidget[];
  layout: LayoutItem[];
  globalFilters: Record<string, unknown>;
  isDirty: boolean;

  setDashboard: (d: Dashboard) => void;
  setWidgets: (w: DashboardWidget[]) => void;
  addWidget: (w: DashboardWidget) => void;
  removeWidget: (id: string) => void;
  updateLayout: (layout: LayoutItem[]) => void;
  setGlobalFilter: (key: string, value: unknown) => void;
  resetFilters: () => void;
  markDirty: () => void;
  markClean: () => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  dashboard: null,
  widgets: [],
  layout: [],
  globalFilters: {},
  isDirty: false,

  setDashboard: (d) => set({ dashboard: d, layout: d.layout ?? [], isDirty: false }),
  setWidgets: (w) => set({ widgets: w }),
  addWidget: (w) =>
    set((s) => ({
      widgets: [...s.widgets, w],
      layout: [
        ...s.layout,
        {
          i: w.id,
          x: w.position.x ?? 0,
          y: w.position.y ?? 9999,
          w: w.position.w ?? 6,
          h: w.position.h ?? 4,
          minW: 2,
          minH: 2,
        },
      ],
      isDirty: true,
    })),
  removeWidget: (id) =>
    set((s) => ({
      widgets: s.widgets.filter((w) => w.id !== id),
      layout: s.layout.filter((l) => l.i !== id),
      isDirty: true,
    })),
  updateLayout: (layout) => set({ layout, isDirty: true }),
  setGlobalFilter: (key, value) =>
    set((s) => ({ globalFilters: { ...s.globalFilters, [key]: value } })),
  resetFilters: () => set({ globalFilters: {} }),
  markDirty: () => set({ isDirty: true }),
  markClean: () => set({ isDirty: false }),
}));
