'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { UserRole } from '@/domain/enums';

/**
 * Điện thoại: thanh tab dưới đáy — ngón cái với tới được, và giống app thật khi
 * cài PWA. Máy tính: thanh ngang trên đầu như cũ.
 *
 * Dùng emoji thay cho bộ icon: đỡ một thư viện, và emoji hệ thống luôn nét ở
 * mọi độ phân giải.
 */

const LINKS: { href: string; label: string; short: string; icon: string; roles: UserRole[] }[] = [
  { href: '/dashboard', label: 'Tổng quan', short: 'Tổng quan', icon: '📊', roles: ['admin', 'staff', 'viewer'] },
  { href: '/so-do-phong', label: 'Sơ đồ phòng', short: 'Phòng', icon: '🏠', roles: ['admin', 'staff'] },
  { href: '/bill-thang', label: 'Bill tháng', short: 'Lên bill', icon: '🧾', roles: ['admin', 'staff'] },
  { href: '/hoa-don', label: 'Hoá đơn', short: 'Hoá đơn', icon: '📄', roles: ['admin', 'staff', 'viewer'] },
  { href: '/thanh-toan', label: 'Thanh toán', short: 'Thu tiền', icon: '💵', roles: ['admin', 'staff'] },
  { href: '/khach-thue', label: 'Khách thuê', short: 'Khách', icon: '👥', roles: ['admin', 'staff', 'viewer'] },
  { href: '/hop-dong', label: 'Hợp đồng', short: 'Hợp đồng', icon: '📋', roles: ['admin', 'staff'] },
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
      <header className="no-print sticky top-0 z-20 border-b border-slate-200 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link href="/dashboard" className="font-semibold text-slate-900">
            Nhà trọ
          </Link>

          <nav className="hidden flex-1 items-center gap-1 md:flex">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  isActive(link.href)
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {/* Máy tính không có thanh tab dưới đáy nên vào trang Thêm bằng tên. */}
            <Link href="/them" className="hidden text-sm text-slate-500 hover:underline sm:inline">
              {userName}
            </Link>
            <form action="/dang-xuat" method="post">
              <button
                type="submit"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50"
              >
                Thoát
              </button>
            </form>
          </div>
        </div>
      </header>

      <nav className="no-print fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
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
      className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition ${
        active ? 'text-slate-900' : 'text-slate-400'
      }`}
    >
      <span aria-hidden className="text-lg leading-none">
        {icon}
      </span>
      {short}
    </Link>
  );
}
