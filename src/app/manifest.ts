import type { MetadataRoute } from 'next';
import { rentalConfig } from '@/domain/config';

/**
 * Manifest cho PWA — thứ khiến điện thoại cho phép "Thêm vào màn hình chính"
 * và mở app không còn thanh địa chỉ.
 *
 * `start_url` vào thẳng Tổng quan: mở từ icon là thấy số liệu ngay, chưa đăng
 * nhập thì middleware tự đẩy sang trang đăng nhập.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `Quản lý nhà trọ — ${rentalConfig.defaults.companyName}`,
    short_name: 'Nhà trọ',
    description: 'Quản lý phòng, hợp đồng, bill tháng và thu tiền nhà trọ.',
    lang: 'vi',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f8fafc',
    theme_color: '#0f172a',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      // `maskable` để Android bo icon theo hình của máy thay vì dán vào ô trắng.
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Lên bill tháng', url: '/bill-thang' },
      { name: 'Thu tiền', url: '/thanh-toan' },
      { name: 'Sơ đồ phòng', url: '/so-do-phong' },
    ],
  };
}
