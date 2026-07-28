import Link from 'next/link';
import { formatMoney } from '@/domain/money';
import type { AccentTone } from '@/domain/enums';

/** Mấy mảnh UI lặp lại nhiều nhất, gom một chỗ cho đỡ chép đi chép lại. */

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-bold text-brand-700 sm:text-2xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Card({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/50 ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Lưới thẻ — dạng bày mặc định của app.
 *
 * Điện thoại 1 cột đọc được ngay, màn rộng thì lấp đầy chỗ trống. `auto-fit` +
 * `minmax` để trình duyệt tự quyết số cột theo bề ngang thật, không phải đoán
 * theo breakpoint. `min()` giữ cột không bao giờ rộng hơn màn hình.
 */
export function Grid({
  children,
  min = '17rem',
  className = '',
}: {
  children: React.ReactNode;
  min?: string;
  className?: string;
}) {
  return (
    <div
      className={`grid gap-3 ${className}`}
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}, 100%), 1fr))` }}
    >
      {children}
    </div>
  );
}

/** Thẻ có thể bấm — nhấc nhẹ lên khi rê chuột để biết là bấm được. */
export function LinkCard({
  href,
  children,
  accent = 'brand',
}: {
  href: string;
  children: React.ReactNode;
  accent?: AccentTone;
}) {
  return (
    <Link href={href} className="group block h-full">
      <Card
        className={`h-full overflow-hidden border-l-4 ${ACCENT_BORDER[accent]} p-4 transition group-hover:-translate-y-0.5 group-hover:shadow-md`}
      >
        {children}
      </Card>
    </Link>
  );
}

const ACCENT_BORDER: Record<AccentTone, string> = {
  brand: 'border-l-brand-500',
  accent: 'border-l-accent-500',
  emerald: 'border-l-emerald-500',
  amber: 'border-l-amber-500',
  rose: 'border-l-rose-500',
  slate: 'border-l-slate-300',
};

/** Viền trái theo tông màu, để thẻ ở mọi màn dùng chung một bảng màu. */
export function accentBorder(tone: AccentTone): string {
  return ACCENT_BORDER[tone];
}

const ACCENT_CHIP: Record<AccentTone, string> = {
  brand: 'bg-brand-50 text-brand-700',
  accent: 'bg-accent-50 text-accent-600',
  emerald: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  rose: 'bg-rose-50 text-rose-700',
  slate: 'bg-slate-100 text-slate-600',
};

const ACCENT_TEXT: Record<AccentTone, string> = {
  brand: 'text-brand-700',
  accent: 'text-accent-600',
  emerald: 'text-emerald-600',
  amber: 'text-amber-600',
  rose: 'text-rose-600',
  slate: 'text-slate-900',
};

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'brand',
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: string;
  tone?: AccentTone;
}) {
  return (
    <Card className={`border-l-4 p-4 ${ACCENT_BORDER[tone]}`}>
      <div className="flex items-start gap-3">
        {icon ? (
          <span
            aria-hidden
            className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-lg ${ACCENT_CHIP[tone]}`}
          >
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</p>
          <p className={`tabular mt-1 text-2xl font-bold ${ACCENT_TEXT[tone]}`}>{value}</p>
          {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
        </div>
      </div>
    </Card>
  );
}

export function Badge({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${className}`}
    >
      {children}
    </span>
  );
}

export function Money({ amount, className = '' }: { amount: number; className?: string }) {
  return <span className={`tabular ${className}`}>{formatMoney(amount)}</span>;
}

export function EmptyState({
  title,
  description,
  action,
  icon = '📭',
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: string;
}) {
  return (
    <div className="px-6 py-12 text-center">
      <span aria-hidden className="text-3xl">
        {icon}
      </span>
      <p className="mt-2 font-semibold text-slate-700">{title}</p>
      {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ButtonLink({
  href,
  children,
  variant = 'primary',
}: {
  href: string;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
}) {
  return (
    <Link href={href} className={buttonClass(variant)}>
      {children}
    </Link>
  );
}

/**
 * Kiểu ô nhập dùng chung cho mọi form.
 *
 * `w-full` + `min-w-0` là cặp chống tràn: thiếu `min-w-0` thì ô nhập trong flex
 * hay grid lấy chiều rộng tối thiểu theo nội dung và đẩy vỡ hàng trên mobile.
 */
export const inputClass =
  'w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition focus:border-brand-500';

export const labelClass = 'mb-1 block text-xs font-semibold text-slate-600';

/** Dùng chung cho cả <button> và <Link> để nút ở đâu cũng giống nhau. */
export function buttonClass(variant: 'primary' | 'secondary' = 'primary'): string {
  const style =
    variant === 'primary'
      ? 'bg-brand-700 text-white shadow-sm hover:bg-brand-600'
      : 'border border-slate-300 bg-white text-slate-700 hover:border-brand-300 hover:bg-brand-50';

  return `inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${style}`;
}
