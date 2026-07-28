import { requireRole } from '@/lib/auth';
import { formatDMY } from '@/domain/date';
import { formatMoney } from '@/domain/money';
import {
  LEASE_STATUS_ACCENTS,
  LEASE_STATUS_BADGE_CLASSES,
  LEASE_STATUS_LABELS,
  LEASE_STATUSES,
} from '@/domain/enums';
import { accentBorder, Badge, buttonClass, Card, EmptyState, Grid, inputClass, labelClass, PageHeader } from '@/components/ui';
import { listLeases } from '@/server/queries';

export const metadata = { title: 'Hợp đồng — Quản lý nhà trọ' };

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

      <form method="get" className="mb-4 grid gap-2 sm:grid-cols-[minmax(0,14rem)_auto] sm:items-end">
        <div>
          <label htmlFor="trang_thai" className={labelClass}>
            Trạng thái
          </label>
          <select
            id="trang_thai"
            name="trang_thai"
            defaultValue={status}
            className={inputClass}
          >
            <option value="">Tất cả</option>
            {LEASE_STATUSES.map((value) => (
              <option key={value} value={value}>
                {LEASE_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        {/* sm:justify-self-start: là ô lưới nên mặc định nó kéo hết cột. */}
        <button type="submit" className={`${buttonClass()} sm:justify-self-start`}>
          Lọc
        </button>
      </form>

      {leases.length === 0 ? (
        <Card>
          <EmptyState title="Không có hợp đồng nào khớp bộ lọc" />
        </Card>
      ) : (
        <Grid>
          {leases.map((lease) => (
            <Card
              key={lease.id}
              className={`border-l-4 p-4 ${accentBorder(LEASE_STATUS_ACCENTS[lease.status])}`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 font-semibold text-slate-900">
                  {lease.room_code} · {lease.tenant_name}
                </p>
                <Badge className={`shrink-0 ${LEASE_STATUS_BADGE_CLASSES[lease.status]}`}>
                  {LEASE_STATUS_LABELS[lease.status]}
                </Badge>
              </div>

              <p className="mt-1 text-xs text-slate-500">
                {lease.building_name} · {lease.floor_name} · {lease.occupants_count} người
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Từ {formatDMY(lease.start_date)}
                {lease.actual_end_date ? ` → ${formatDMY(lease.actual_end_date)}` : ''}
              </p>

              <div className="mt-3 flex items-end justify-between gap-2 border-t border-slate-100 pt-3">
                <div>
                  <p className="tabular font-bold text-brand-700">
                    {formatMoney(lease.monthly_rent)}
                    <span className="text-xs font-normal text-slate-400">/tháng</span>
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
              </div>
            </Card>
          ))}
        </Grid>
      )}
    </>
  );
}
