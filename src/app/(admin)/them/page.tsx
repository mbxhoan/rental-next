import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { USER_ROLE_LABELS } from '@/domain/enums';
import { buttonClass, Card, PageHeader } from '@/components/ui';
import { InstallApp } from '@/components/pwa';

export const metadata = { title: 'Thêm — Quản lý nhà trọ' };

/** Mấy mục không nhét vừa thanh tab dưới đáy, cộng hướng dẫn cài app. */
const MORE_LINKS = [
  { href: '/khach-thue', label: 'Khách thuê', icon: '👥', roles: ['admin', 'staff', 'viewer'] },
  { href: '/hop-dong', label: 'Hợp đồng', icon: '📋', roles: ['admin', 'staff'] },
  { href: '/so-do-phong', label: 'Sơ đồ phòng', icon: '🏠', roles: ['admin', 'staff'] },
  { href: '/bao-cao', label: 'Báo cáo tháng', icon: '📈', roles: ['admin', 'staff'] },
  { href: '/chi-so-dien', label: 'Chỉnh mốc điện', icon: '⚡', roles: ['admin', 'staff'] },
  { href: '/cai-dat', label: 'Tài khoản thanh toán', icon: '🏦', roles: ['admin'] },
  { href: '/huong-dan', label: 'Hướng dẫn', icon: '📖', roles: ['admin', 'staff', 'viewer'] },
];

export default async function MorePage() {
  const session = await requireUser();
  const links = MORE_LINKS.filter((link) => link.roles.includes(session.role));

  return (
    <>
      <PageHeader title="Thêm" subtitle={`${session.name} · ${USER_ROLE_LABELS[session.role]}`} />

      <div className="grid gap-3 sm:grid-cols-2">
        {links.map((link) => (
          <Link key={link.href} href={link.href}>
            <Card className="flex h-full items-center gap-3 border-l-4 border-l-brand-500 p-4 transition hover:-translate-y-0.5 hover:shadow-md">
              <span aria-hidden className="text-xl">
                {link.icon}
              </span>
              <span className="min-w-0 font-semibold text-slate-800">{link.label}</span>
              <span className="ml-auto text-slate-300">›</span>
            </Card>
          </Link>
        ))}
      </div>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-bold tracking-wide text-slate-500 uppercase">Cài app vào điện thoại</h2>
        <Card className="space-y-3 p-4">
          <p className="text-sm text-slate-600">
            Cài xong thì mở từ màn hình chính như app thường: không còn thanh địa chỉ, vào
            thẳng Tổng quan. Vẫn cần mạng — app không giữ bản cache của bill để tránh xem
            nhầm số cũ.
          </p>
          <InstallApp />
        </Card>
      </section>

      <form action="/dang-xuat" method="post" className="mt-6">
        <button
          type="submit"
          className={`${buttonClass('secondary')} w-full py-3 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600`}
        >
          Đăng xuất
        </button>
      </form>
    </>
  );
}
