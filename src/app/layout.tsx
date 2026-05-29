import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI BI Studio',
  description: 'Upload data, build charts, create dashboards — powered by AI.',
  icons: {
    icon: '/icon',
    shortcut: '/icon',
    apple: '/icon',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
