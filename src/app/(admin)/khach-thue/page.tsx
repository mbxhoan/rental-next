import { requireRole } from '@/lib/auth';
import { formatMoney } from '@/domain/money';
import { LEASE_STATUS_LABELS } from '@/domain/enums';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { listTenants } from '@/server/queries';

export const metadata = { title: 'Khách thuê — Quản lý nhà trọ' };

export default async function TenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ tim?: string }>;
}) {
  await requireRole('admin', 'staff', 'viewer');

  const { tim } = await searchParams;
  const search = tim ?? '';
  const tenants = await listTenants(search);

  return (
    <>
      <PageHeader title="Khách thuê" subtitle={`${tenants.length} người`} />

      <form method="get" className="mb-4 flex gap-2">
        <input
          name="tim"
          defaultValue={search}
          placeholder="Tìm theo tên, số điện thoại hoặc CCCD"
          className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Tìm
        </button>
      </form>

      <Card>
        {tenants.length === 0 ? (
          <EmptyState
            title={search ? 'Không tìm thấy khách nào' : 'Chưa có khách thuê'}
            description={search ? 'Thử từ khoá khác xem sao.' : undefined}
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {tenants.map((tenant) => (
              <li
                key={tenant.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{tenant.full_name}</p>
                  <p className="text-xs text-slate-500">
                    {[
                      tenant.phone,
                      tenant.room_code ? `Phòng ${tenant.room_code}` : null,
                      tenant.building_name,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Chưa có hợp đồng'}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {tenant.outstanding_total > 0 ? (
                    <span className="tabular text-sm font-medium text-rose-600">
                      nợ {formatMoney(tenant.outstanding_total)}
                    </span>
                  ) : null}
                  {tenant.lease_status ? (
                    <Badge className="bg-slate-100 text-slate-600">
                      {LEASE_STATUS_LABELS[tenant.lease_status]}
                    </Badge>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
