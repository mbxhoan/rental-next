import { redirect } from 'next/navigation';
import { verifyCredentials } from '@/lib/auth';
import { createSession, readSession } from '@/lib/session';

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
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-slate-900">Quản lý nhà trọ</h1>
          <p className="mt-1 text-sm text-slate-500">Đăng nhập để tiếp tục</p>
        </div>

        <form
          action={login}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          {loi ? (
            <p
              role="alert"
              className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700"
            >
              Email hoặc mật khẩu chưa đúng.
            </p>
          ) : null}

          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              autoFocus
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              Mật khẩu
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-slate-900 px-4 py-2.5 font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
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
