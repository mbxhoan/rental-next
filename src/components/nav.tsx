'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { UserRole } from '@/domain/enums';

/**
 * Điện thoại và máy tính bảng: thanh tab dưới đáy — ngón cái với tới được, và
 * giống app thật khi cài PWA. Máy tính: thanh ngang trên đầu.
 *
 * Mốc đổi là `lg` (1024px) chứ không phải `md`: bảy mục cộng logo và nút Thoát
 * cần ~950px, nhét vào iPad dọc 768px là tràn ra ngoài màn hình.
 *
 * Dùng emoji thay cho bộ icon: đỡ một thư viện, và emoji hệ thống luôn nét ở
 * mọi độ phân giải.
 */

const LINKS: { href: string; label: string; short: string; icon: string; roles: UserRole[] }[] = [
  { href: '/dashboard', label: 'Tổng quan', short: 'Tổng quan', icon: '📊', roles: ['admin', 'staff', 'viewer'] },
  { href: '/so-do-phong', label: 'Sơ đồ phòng', short: 'Phòng', icon: '🏠', roles: ['admin', 'staff'] },
  { href: '/bill-thang', label: 'Bill tháng', short: 'Lên bill', icon: '🧾', roles: ['admin', 'staff'] },
  { href: '/hoa-don', label: 'Hoá đơn', short: 'Hoá đơn', icon: '📄', roles: ['admin', 'staff', 'viewer'] },
  { href: '/khach-thue', label: 'Khách thuê', short: 'Khách', icon: '👥', roles: ['admin', 'staff', 'viewer'] },
  { href: '/hop-dong', label: 'Hợp đồng', short: 'Hợp đồng', icon: '📋', roles: ['admin', 'staff'] },
  { href: '/bao-cao', label: 'Báo cáo', short: 'Báo cáo', icon: '📈', roles: ['admin', 'staff'] },
  { href: '/huong-dan', label: 'Hướng dẫn', short: 'Hướng dẫn', icon: '📖', roles: ['admin', 'staff', 'viewer'] },
];

/** Thanh dưới đáy chỉ nhét vừa 5 ô; mục còn lại nằm trong trang Thêm. */
const MOBILE_TAB_COUNT = 4;

export function Nav({ role, userName }: { role: UserRole; userName: string }) {
  const pathname = usePathname();
  const links = LINKS.filter((link) => link.roles.includes(role));
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  const tabs = links.slice(0, MOBILE_TAB_COUNT);
  const moreActive = !tabs.some((tab) => isActive(tab.href));

  return (
    <>
      <header className="no-print sticky top-0 z-20 border-b border-brand-100 bg-white/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
          <Link href="/dashboard" className="flex shrink-0 items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" className="size-8 rounded-lg" />
            <span className="font-bold text-brand-700">Nhà trọ</span>
          </Link>

          <nav className="hidden min-w-0 flex-1 items-center gap-1 lg:flex">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold whitespace-nowrap transition ${
                  isActive(link.href)
                    ? 'bg-brand-700 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-brand-50 hover:text-brand-700'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {/* Máy tính không có thanh tab dưới đáy nên vào trang Thêm bằng tên. */}
            <Link
              href="/them"
              className="hidden max-w-40 truncate text-sm text-slate-500 hover:text-brand-700 sm:inline"
            >
              {userName}
            </Link>
            <form action="/dang-xuat" method="post">
              <button
                type="submit"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
              >
                Thoát
              </button>
            </form>
          </div>
        </div>
      </header>

      <nav className="no-print fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {tabs.map((link) => (
          <Tab key={link.href} href={link.href} short={link.short} icon={link.icon} active={isActive(link.href)} />
        ))}
        <Tab href="/them" short="Thêm" icon="⋯" active={moreActive} />
      </nav>
    </>
  );
}

function Tab({
  href,
  short,
  icon,
  active,
}: {
  href: string;
  short: string;
  icon: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`flex min-w-0 flex-col items-center gap-0.5 px-1 py-1.5 text-[11px] font-semibold transition ${
        active ? 'text-brand-700' : 'text-slate-400'
      }`}
    >
      <span
        aria-hidden
        className={`flex h-7 w-11 items-center justify-center rounded-full text-lg leading-none transition ${
          active ? 'bg-brand-50' : ''
        }`}
      >
        {icon}
      </span>
      <span className="w-full truncate text-center">{short}</span>
    </Link>
  );
}
