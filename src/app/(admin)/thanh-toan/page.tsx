import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { formatDMY } from '@/domain/date';
import { formatMoney } from '@/domain/money';
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/domain/enums';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { listBills, listPayments } from '@/server/queries';
import { PaymentForm } from './payment-form';

export const metadata = { title: 'Thanh toán — Quản lý nhà trọ' };

export default async function PaymentsPage() {
  await requireRole('admin', 'staff');

  const [payments, bills] = await Promise.all([listPayments(), listBills(300)]);
  const unpaid = bills.filter(
    (bill) => bill.outstanding_amount > 0 && bill.status !== 'draft' && bill.status !== 'cancelled',
  );

  return (
    <>
      <PageHeader
        title="Thanh toán"
        subtitle={`${unpaid.length} bill còn phải thu · ${payments.length} phiếu thu gần nhất`}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <h2 className="mb-2 text-sm font-semibold text-slate-500">Lịch sử thu tiền</h2>
          <Card>
            {payments.length === 0 ? (
              <EmptyState title="Chưa có phiếu thu nào" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {payments.map((payment) => (
                  <li
                    key={payment.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <div>
                      <p className="font-medium text-slate-900">
                        {payment.room_code} · {payment.tenant_name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatDMY(payment.paid_date)} ·{' '}
                        {PAYMENT_METHOD_LABELS[payment.method as PaymentMethod] ?? payment.method}
                        {' · '}
                        <Link href={`/hoa-don/${payment.bill_id}`} className="hover:underline">
                          bill #{payment.bill_id}
                        </Link>
                      </p>
                      {payment.void_reason ? (
                        <p className="text-xs text-rose-600">Đã huỷ: {payment.void_reason}</p>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`tabular font-semibold ${
                          payment.status === 'voided'
                            ? 'text-slate-400 line-through'
                            : 'text-emerald-700'
                        }`}
                      >
                        {formatMoney(payment.amount)}
                      </span>
                      {payment.status === 'voided' ? (
                        <Badge className="bg-slate-200 text-slate-600">Đã huỷ</Badge>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold text-slate-500">Ghi nhận thu tiền</h2>
          <PaymentForm
            bills={unpaid.map((bill) => ({
              id: bill.id,
              label: `${bill.room_code} · ${bill.tenant_name}`,
              outstanding: bill.outstanding_amount,
            }))}
          />
        </div>
      </div>
    </>
  );
}
