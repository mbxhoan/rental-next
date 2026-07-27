'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import type { UserRole } from '@/domain/enums';

const LINKS: { href: string; label: string; roles: UserRole[] }[] = [
  { href: '/dashboard', label: 'Tổng quan', roles: ['admin', 'staff', 'viewer'] },
  { href: '/so-do-phong', label: 'Sơ đồ phòng', roles: ['admin', 'staff'] },
  { href: '/khach-thue', label: 'Khách thuê', roles: ['admin', 'staff', 'viewer'] },
  { href: '/hop-dong', label: 'Hợp đồng', roles: ['admin', 'staff'] },
  { href: '/bill-thang', label: 'Bill tháng', roles: ['admin', 'staff'] },
  { href: '/hoa-don', label: 'Hoá đơn', roles: ['admin', 'staff', 'viewer'] },
  { href: '/thanh-toan', label: 'Thanh toán', roles: ['admin', 'staff'] },
];

export function Nav({ role, userName }: { role: UserRole; userName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const links = LINKS.filter((link) => link.roles.includes(role));

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <header className="no-print sticky top-0 z-20 border-b border-slate-200 bg-white">
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
          <span className="hidden text-sm text-slate-500 sm:inline">{userName}</span>
          <form action="/dang-xuat" method="post">
            <button
              type="submit"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50"
            >
              Thoát
            </button>
          </form>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label="Mở menu"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm md:hidden"
          >
            ☰
          </button>
        </div>
      </div>

      {open ? (
        <nav className="grid gap-1 border-t border-slate-200 px-4 py-2 md:hidden">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={`rounded-lg px-3 py-2 text-sm font-medium ${
                isActive(link.href) ? 'bg-slate-900 text-white' : 'text-slate-700'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  );
}
