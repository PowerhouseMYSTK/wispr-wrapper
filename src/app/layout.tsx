import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Wispr',
  description: 'Wispr desktop wrapper',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
