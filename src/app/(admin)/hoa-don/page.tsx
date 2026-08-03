import { requireRole } from '@/lib/auth';
import { formatDMY, formatMonthLabel } from '@/domain/date';
import { formatMoney } from '@/domain/money';
import { BILL_STATUS_ACCENTS, BILL_STATUS_BADGE_CLASSES, BILL_STATUS_LABELS } from '@/domain/enums';
import { Badge, Card, EmptyState, Grid, LinkCard, PageHeader } from '@/components/ui';
import { listBills } from '@/server/queries';

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
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-brand-700">Kỳ chốt tháng {group.label}</h2>
                  <p className="mt-0.5 text-xs text-slate-500">{group.bills.length} hoá đơn trong kỳ này</p>
                </div>
                <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
                  {group.bills.length} bill
                </span>
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

function groupBillsByMonth<T extends { period_to: string }>(bills: T[]) {
  const groups = new Map<string, T[]>();

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
  }));
}
