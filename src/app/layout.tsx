import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI BI Studio',
  description: 'Upload data, build charts, create dashboards — powered by AI.',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: '/favicon-32x32.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
