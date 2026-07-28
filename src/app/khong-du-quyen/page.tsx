import { ButtonLink } from '@/components/ui';

export default function Forbidden() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center">
        <p className="text-5xl">🔒</p>
        <p className="mt-2 text-sm font-semibold text-slate-400">403</p>
        <h1 className="mt-1 text-xl font-bold text-brand-700">
          Tài khoản của bạn không có quyền vào trang này
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Liên hệ quản trị viên nếu bạn cần được cấp quyền.
        </p>
        <div className="mt-5">
          <ButtonLink href="/dashboard">Về trang tổng quan</ButtonLink>
        </div>
      </div>
    </main>
  );
}
