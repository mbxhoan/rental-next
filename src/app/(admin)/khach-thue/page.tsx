import { requireRole } from '@/lib/auth';
import { formatMoney } from '@/domain/money';
import { LEASE_STATUS_LABELS } from '@/domain/enums';
import { Badge, Card, EmptyState, Grid, PageHeader } from '@/components/ui';
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

      {tenants.length === 0 ? (
        <Card>
          <EmptyState
            title={search ? 'Không tìm thấy khách nào' : 'Chưa có khách thuê'}
            description={search ? 'Thử từ khoá khác xem sao.' : undefined}
          />
        </Card>
      ) : (
        <Grid>
          {tenants.map((tenant) => (
            <Card key={tenant.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 font-medium break-words text-slate-900">
                  {tenant.full_name}
                </p>
                {tenant.lease_status ? (
                  <Badge className="shrink-0 bg-slate-100 text-slate-600">
                    {LEASE_STATUS_LABELS[tenant.lease_status]}
                  </Badge>
                ) : null}
              </div>

              <p className="mt-1 text-xs text-slate-500">
                {[
                  tenant.phone,
                  tenant.room_code ? `Phòng ${tenant.room_code}` : null,
                  tenant.building_name,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'Chưa có hợp đồng'}
              </p>

              {tenant.outstanding_total > 0 ? (
                <p className="tabular mt-2 text-sm font-medium text-rose-600">
                  Còn nợ {formatMoney(tenant.outstanding_total)}
                </p>
              ) : null}
            </Card>
          ))}
        </Grid>
      )}
    </>
  );
}
