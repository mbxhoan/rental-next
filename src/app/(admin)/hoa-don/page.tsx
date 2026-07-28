import { requireRole } from '@/lib/auth';
import { formatDMY } from '@/domain/date';
import { formatMoney } from '@/domain/money';
import { BILL_STATUS_ACCENTS, BILL_STATUS_BADGE_CLASSES, BILL_STATUS_LABELS } from '@/domain/enums';
import { Badge, Card, EmptyState, Grid, LinkCard, PageHeader } from '@/components/ui';
import { listBills } from '@/server/queries';

export const metadata = { title: 'Hoá đơn — Quản lý nhà trọ' };

export default async function BillsPage() {
  await requireRole('admin', 'staff', 'viewer');
  const bills = await listBills();

  return (
    <>
      <PageHeader title="Hoá đơn" subtitle={`${bills.length} bill gần nhất`} />

      {bills.length === 0 ? (
        <Card>
          <EmptyState title="Chưa có hoá đơn nào" description="Vào Bill tháng để chốt kỳ đầu tiên." />
        </Card>
      ) : (
        <Grid>
          {bills.map((bill) => (
            <LinkCard
              key={bill.id}
              href={`/hoa-don/${bill.id}`}
              accent={BILL_STATUS_ACCENTS[bill.status]}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 font-semibold text-slate-900">
                  {bill.room_code} · {bill.tenant_name}
                </p>
                <Badge className={`shrink-0 ${BILL_STATUS_BADGE_CLASSES[bill.status]}`}>
                  {BILL_STATUS_LABELS[bill.status]}
                </Badge>
              </div>

              <p className="mt-1 text-xs text-slate-500">
                {bill.building_name} · {formatDMY(bill.period_from)} → {formatDMY(bill.period_to)}
              </p>
              {bill.due_date ? (
                <p className="text-xs text-slate-500">Hạn {formatDMY(bill.due_date)}</p>
              ) : null}

              <div className="mt-3 flex items-end justify-between gap-2 border-t border-slate-100 pt-3">
                <p className="tabular text-lg font-bold text-brand-700">
                  {formatMoney(bill.total_amount)}
                </p>
                {bill.outstanding_amount > 0 && bill.status !== 'draft' ? (
                  <p className="tabular text-sm font-semibold text-rose-600">
                    còn {formatMoney(bill.outstanding_amount)}
                  </p>
                ) : null}
              </div>
            </LinkCard>
          ))}
        </Grid>
      )}
    </>
  );
}
