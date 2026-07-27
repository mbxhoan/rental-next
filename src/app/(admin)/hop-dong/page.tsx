import { requireRole } from '@/lib/auth';
import { formatDMY } from '@/domain/date';
import { formatMoney } from '@/domain/money';
import { LEASE_STATUS_LABELS, LEASE_STATUSES } from '@/domain/enums';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { listLeases } from '@/server/queries';

export const metadata = { title: 'Hợp đồng — Quản lý nhà trọ' };

const STATUS_CLASSES: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  ending_soon: 'bg-amber-100 text-amber-700',
  reserved: 'bg-sky-100 text-sky-700',
  ended: 'bg-slate-200 text-slate-600',
  cancelled: 'bg-slate-200 text-slate-500',
};

export default async function LeasesPage({
  searchParams,
}: {
  searchParams: Promise<{ trang_thai?: string }>;
}) {
  await requireRole('admin', 'staff');

  const { trang_thai } = await searchParams;
  const status = LEASE_STATUSES.includes(trang_thai as never) ? trang_thai! : '';
  const leases = await listLeases(status);

  return (
    <>
      <PageHeader title="Hợp đồng" subtitle={`${leases.length} hợp đồng`} />

      <form method="get" className="mb-4 flex items-end gap-2">
        <div>
          <label htmlFor="trang_thai" className="mb-1 block text-xs font-medium text-slate-600">
            Trạng thái
          </label>
          <select
            id="trang_thai"
            name="trang_thai"
            defaultValue={status}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Tất cả</option>
            {LEASE_STATUSES.map((value) => (
              <option key={value} value={value}>
                {LEASE_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Lọc
        </button>
      </form>

      <Card>
        {leases.length === 0 ? (
          <EmptyState title="Không có hợp đồng nào khớp bộ lọc" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {leases.map((lease) => (
              <li
                key={lease.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">
                    {lease.room_code} · {lease.tenant_name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {lease.building_name} · {lease.floor_name} · từ{' '}
                    {formatDMY(lease.start_date)}
                    {lease.actual_end_date ? ` → ${formatDMY(lease.actual_end_date)}` : ''}
                    {` · ${lease.occupants_count} người`}
                  </p>
                </div>

                <div className="flex items-center gap-3 text-right">
                  <div>
                    <p className="tabular font-semibold text-slate-900">
                      {formatMoney(lease.monthly_rent)}
                    </p>
                    <p className="tabular text-xs text-slate-500">
                      cọc {formatMoney(lease.deposit_amount)}
                    </p>
                  </div>
                  {lease.outstanding_total > 0 ? (
                    <span className="tabular text-sm font-medium text-rose-600">
                      nợ {formatMoney(lease.outstanding_total)}
                    </span>
                  ) : null}
                  <Badge className={STATUS_CLASSES[lease.status] ?? 'bg-slate-100 text-slate-600'}>
                    {LEASE_STATUS_LABELS[lease.status]}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
