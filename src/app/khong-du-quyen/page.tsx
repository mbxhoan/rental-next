import Link from 'next/link';

export default function Forbidden() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center">
        <p className="text-sm font-medium text-slate-400">403</p>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">
          Tài khoản của bạn không có quyền vào trang này
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Liên hệ quản trị viên nếu bạn cần được cấp quyền.
        </p>
        <Link
          href="/dashboard"
          className="mt-5 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Về trang tổng quan
        </Link>
      </div>
    </main>
  );
}
