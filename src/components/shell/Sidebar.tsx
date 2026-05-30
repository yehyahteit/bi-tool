'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  BarChart3, Database, LayoutDashboard, Upload,
  Sparkles, Settings, ChevronRight, SlidersHorizontal,
  Menu, X,
} from 'lucide-react';
import { clsx } from 'clsx';

const navItems = [
  { href: '/', label: 'Home', icon: LayoutDashboard },
  { href: '/datasets', label: 'Datasets', icon: Database },
  { href: '/upload', label: 'Upload', icon: Upload },
  { href: '/dashboards', label: 'Dashboards', icon: BarChart3 },
  { href: '/ai', label: 'AI Assistant', icon: Sparkles },
  { href: '/config', label: 'Configuration', icon: SlidersHorizontal },
];

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();

  return (
    <aside className="w-60 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gray-100">
        <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
          <BarChart3 className="w-4.5 h-4.5 text-white" />
        </div>
        <span className="font-bold text-gray-900 text-sm">AI BI Studio</span>
        {/* Close button — only visible on mobile */}
        {onClose && (
          <button
            onClick={onClose}
            className="ml-auto p-1 rounded-lg hover:bg-gray-100 text-gray-500 md:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active =
            href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={clsx(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors group',
                active
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              <Icon className={clsx('w-4 h-4', active ? 'text-brand-600' : 'text-gray-400 group-hover:text-gray-600')} />
              {label}
              {active && <ChevronRight className="w-3 h-3 ml-auto text-brand-400" />}
            </Link>
          );
        })}
      </nav>

      {/* Settings */}
      <div className="px-3 py-3 border-t border-gray-100">
        <Link
          href="/settings"
          onClick={onClose}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
        >
          <Settings className="w-4 h-4" />
          Settings
        </Link>
      </div>
    </aside>
  );
}

export default function Sidebar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* ── Desktop: always visible sidebar ── */}
      <div className="hidden md:flex">
        <SidebarContent />
      </div>

      {/* ── Mobile: hamburger button (rendered in header area via fixed position) ── */}
      <button
        onClick={() => setOpen(true)}
        className="md:hidden fixed top-3 left-4 z-40 p-2 rounded-lg bg-white border border-gray-200 shadow-sm text-gray-600 hover:bg-gray-50"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* ── Mobile: backdrop ── */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ── Mobile: slide-out drawer ── */}
      <div
        className={clsx(
          'md:hidden fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ease-in-out',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <SidebarContent onClose={() => setOpen(false)} />
      </div>
    </>
  );
}
