import { redirect } from 'next/navigation';
import { verifyCredentials } from '@/lib/auth';
import { createSession, readSession } from '@/lib/session';
import { buttonClass, inputClass } from '@/components/ui';
import { rentalConfig } from '@/domain/config';

export const metadata = { title: 'Đăng nhập — Quản lý nhà trọ' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ loi?: string }>;
}) {
  if (await readSession()) redirect('/dashboard');

  const { loi } = await searchParams;

  async function login(formData: FormData) {
    'use server';

    const email = String(formData.get('email') ?? '');
    const password = String(formData.get('password') ?? '');

    const user = await verifyCredentials(email, password);

    if (!user) {
      redirect('/dang-nhap?loi=1');
    }

    await createSession({ userId: user.id, role: user.role, name: user.name });
    redirect('/dashboard');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-50 to-white px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" className="mx-auto size-20 rounded-2xl shadow-sm" />
          <h1 className="mt-3 text-2xl font-bold text-brand-700">
            {rentalConfig.defaults.companyName}
          </h1>
          <p className="mt-1 text-sm text-slate-500">Đăng nhập để quản lý nhà trọ</p>
        </div>

        <form
          action={login}
          className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-lg shadow-brand-100/50"
        >
          {loi ? (
            <p
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700"
            >
              Email hoặc mật khẩu chưa đúng.
            </p>
          ) : null}

          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-semibold text-slate-700">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              autoFocus
              className={`${inputClass} py-2.5`}
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-semibold text-slate-700">
              Mật khẩu
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className={`${inputClass} py-2.5`}
            />
          </div>

          <button
            type="submit"
            className={`${buttonClass()} w-full py-2.5`}
          >
            Đăng nhập
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-slate-400">
          Dùng chung tài khoản với bản Laravel.
        </p>
      </div>
    </main>
  );
}
