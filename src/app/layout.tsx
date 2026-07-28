import type { Metadata, Viewport } from 'next';
import { PwaSetup } from '@/components/pwa';
import './globals.css';

export const metadata: Metadata = {
  title: 'Quản lý nhà trọ',
  description: 'Quản lý phòng, hợp đồng, bill tháng và thu tiền nhà trọ.',
  // iOS không đọc manifest, phải khai riêng thì mở từ màn hình chính mới ẩn
  // được thanh địa chỉ của Safari.
  appleWebApp: { capable: true, title: 'Nhà trọ', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#14305a',
  // Cho tràn ra vùng tai thỏ; phần chừa mép để CSS safe-area lo.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className="h-full">
      <body className="min-h-full">
        <PwaSetup />
        {children}
      </body>
    </html>
  );
}
