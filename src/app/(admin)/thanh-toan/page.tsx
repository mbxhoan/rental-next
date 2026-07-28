import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { formatDMY } from '@/domain/date';
import { formatMoney } from '@/domain/money';
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/domain/enums';
import { Badge, Card, EmptyState, Grid, PageHeader } from '@/components/ui';
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

      {/* Form thu tiền lên trước trên mobile — đó là việc hay làm nhất ở màn này. */}
      <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div>
          <h2 className="mb-2 text-sm font-bold tracking-wide text-slate-500 uppercase">Ghi nhận thu tiền</h2>
          <PaymentForm
            bills={unpaid.map((bill) => ({
              id: bill.id,
              label: `${bill.room_code} · ${bill.tenant_name}`,
              outstanding: bill.outstanding_amount,
            }))}
          />
        </div>

        <div>
          <h2 className="mb-2 text-sm font-bold tracking-wide text-slate-500 uppercase">Lịch sử thu tiền</h2>
          {payments.length === 0 ? (
            <Card>
              <EmptyState title="Chưa có phiếu thu nào" />
            </Card>
          ) : (
            <Grid min="15rem">
              {payments.map((payment) => (
                <Card key={payment.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 font-medium break-words text-slate-900">
                      {payment.room_code} · {payment.tenant_name}
                    </p>
                    {payment.status === 'voided' ? (
                      <Badge className="shrink-0 bg-slate-200 text-slate-600">Đã huỷ</Badge>
                    ) : null}
                  </div>

                  <p className="mt-1 text-xs text-slate-500">
                    {formatDMY(payment.paid_date)} ·{' '}
                    {PAYMENT_METHOD_LABELS[payment.method as PaymentMethod] ?? payment.method}
                    {' · '}
                    <Link href={`/hoa-don/${payment.bill_id}`} className="hover:underline">
                      bill #{payment.bill_id}
                    </Link>
                  </p>
                  {payment.void_reason ? (
                    <p className="mt-0.5 text-xs text-rose-600">Đã huỷ: {payment.void_reason}</p>
                  ) : null}

                  <p
                    className={`tabular mt-2 text-lg font-semibold ${
                      payment.status === 'voided'
                        ? 'text-slate-400 line-through'
                        : 'text-emerald-700'
                    }`}
                  >
                    {formatMoney(payment.amount)}
                  </p>
                </Card>
              ))}
            </Grid>
          )}
        </div>
      </div>
    </>
  );
}
