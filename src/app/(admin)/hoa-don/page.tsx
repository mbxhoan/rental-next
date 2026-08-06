import { requireRole } from '@/lib/auth';
import { formatDMY, formatMonthLabel } from '@/domain/date';
import { formatMoney } from '@/domain/money';
import { BILL_STATUS_ACCENTS, BILL_STATUS_BADGE_CLASSES, BILL_STATUS_LABELS } from '@/domain/enums';
import { Badge, Card, EmptyState, Grid, LinkCard, PageHeader } from '@/components/ui';
import { listBills, type BillListRow } from '@/server/queries';

export const metadata = { title: 'Hoá đơn — Quản lý nhà trọ' };

export default async function BillsPage() {
  await requireRole('admin', 'staff', 'viewer');
  const bills = await listBills();
  const groups = groupBillsByMonth(bills);

  return (
    <>
      <PageHeader title="Hoá đơn" subtitle={`${bills.length} bill trong ${groups.length} kỳ chốt`} />

      {bills.length === 0 ? (
        <Card>
          <EmptyState title="Chưa có hoá đơn nào" description="Vào Bill tháng để chốt kỳ đầu tiên." />
        </Card>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.key}>
              <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="text-base font-bold text-brand-700">Kỳ chốt tháng {group.label}</h2>
                  <p className="mt-0.5 text-xs text-slate-500">{group.bills.length} hoá đơn trong kỳ này</p>
                </div>
                <BillStats stats={group.stats} />
              </div>

              <Grid>
                {group.bills.map((bill) => (
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
                      {bill.building_name} · {formatDMY(bill.display_period_from ?? bill.period_from)} →{' '}
                      {formatDMY(bill.display_period_to ?? bill.period_to)}
                    </p>
                    {bill.due_date ? (
                      <p className="text-xs text-slate-500">Hạn {formatDMY(bill.due_date)}</p>
                    ) : null}

                    <div className="mt-3 flex items-end justify-between gap-2 border-t border-slate-100 pt-3">
                      <p className="tabular text-lg font-bold text-brand-700">
                        {formatMoney(bill.total_amount)}
                      </p>
                      {bill.outstanding_amount > 0 && bill.status !== 'draft' && bill.status !== 'adjusting' ? (
                        <p className="tabular text-sm font-semibold text-rose-600">
                          còn {formatMoney(bill.outstanding_amount)}
                        </p>
                      ) : null}
                    </div>
                  </LinkCard>
                ))}
              </Grid>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

type BillStats = {
  paid: { amount: number; count: number };
  toCollect: { amount: number; count: number };
  toFinalize: { amount: number; count: number };
  cancelled: { amount: number; count: number };
};

function groupBillsByMonth(bills: BillListRow[]) {
  const groups = new Map<string, BillListRow[]>();

  for (const bill of bills) {
    const key = bill.period_to.slice(0, 7);
    const current = groups.get(key) ?? [];
    current.push(bill);
    groups.set(key, current);
  }

  return [...groups.entries()].map(([key, groupedBills]) => ({
    key,
    label: formatMonthLabel(`${key}-01`),
    bills: groupedBills,
    stats: summarizeBills(groupedBills),
  }));
}

function summarizeBills(bills: BillListRow[]): BillStats {
  const stats: BillStats = {
    paid: { amount: 0, count: 0 },
    toCollect: { amount: 0, count: 0 },
    toFinalize: { amount: 0, count: 0 },
    cancelled: { amount: 0, count: 0 },
  };

  for (const bill of bills) {
    if (bill.paid_amount > 0) {
      stats.paid.amount += bill.paid_amount;
      stats.paid.count += 1;
    }

    if (bill.status === 'draft' || bill.status === 'adjusting') {
      stats.toFinalize.amount += bill.total_amount;
      stats.toFinalize.count += 1;
    } else if (bill.status === 'cancelled') {
      stats.cancelled.amount += bill.total_amount;
      stats.cancelled.count += 1;
    } else if (bill.outstanding_amount > 0) {
      stats.toCollect.amount += bill.outstanding_amount;
      stats.toCollect.count += 1;
    }
  }

  return stats;
}

function BillStats({ stats }: { stats: BillStats }) {
  const cards = [
    { label: 'Đã thu', value: stats.paid, className: 'border-emerald-100 bg-emerald-50/70 text-emerald-700' },
    { label: 'Chờ thu', value: stats.toCollect, className: 'border-amber-100 bg-amber-50/70 text-amber-700' },
    { label: 'Chờ chốt', value: stats.toFinalize, className: 'border-violet-100 bg-violet-50/70 text-violet-700' },
    { label: 'Đã huỷ', value: stats.cancelled, className: 'border-slate-200 bg-slate-50 text-slate-600' },
  ];

  return (
    <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end lg:w-auto">
      {cards.map((card) => (
        <div key={card.label} className={`min-w-0 rounded-lg border px-2.5 py-1.5 sm:min-w-[7.5rem] ${card.className}`}>
          <p className="truncate text-[11px] font-semibold">{card.label}</p>
          <p className="tabular truncate text-sm font-bold">{formatMoney(card.value.amount)}</p>
          <p className="text-[10px] opacity-75">{card.value.count} bill</p>
        </div>
      ))}
    </div>
  );
}
