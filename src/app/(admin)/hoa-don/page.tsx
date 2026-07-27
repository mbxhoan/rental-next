import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { formatDMY } from '@/domain/date';
import { formatMoney } from '@/domain/money';
import { BILL_STATUS_BADGE_CLASSES, BILL_STATUS_LABELS } from '@/domain/enums';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { listBills } from '@/server/queries';

export const metadata = { title: 'Hoá đơn — Quản lý nhà trọ' };

export default async function BillsPage() {
  await requireRole('admin', 'staff', 'viewer');
  const bills = await listBills();

  return (
    <>
      <PageHeader title="Hoá đơn" subtitle={`${bills.length} bill gần nhất`} />

      <Card>
        {bills.length === 0 ? (
          <EmptyState title="Chưa có hoá đơn nào" description="Vào Bill tháng để chốt kỳ đầu tiên." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {bills.map((bill) => (
              <li key={bill.id}>
                <Link
                  href={`/hoa-don/${bill.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">
                      {bill.room_code} · {bill.tenant_name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {bill.building_name} · {formatDMY(bill.period_from)} →{' '}
                      {formatDMY(bill.period_to)}
                      {bill.due_date ? ` · hạn ${formatDMY(bill.due_date)}` : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="tabular font-semibold text-slate-900">
                        {formatMoney(bill.total_amount)}
                      </p>
                      {bill.outstanding_amount > 0 && bill.status !== 'draft' ? (
                        <p className="tabular text-xs text-rose-600">
                          còn {formatMoney(bill.outstanding_amount)}
                        </p>
                      ) : null}
                    </div>
                    <Badge className={BILL_STATUS_BADGE_CLASSES[bill.status]}>
                      {BILL_STATUS_LABELS[bill.status]}
                    </Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
