import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { formatDMY } from '@/domain/date';
import { formatMoney } from '@/domain/money';
import { ROOM_STATUS_ACCENTS, ROOM_STATUS_BADGE_CLASSES, ROOM_STATUS_LABELS } from '@/domain/enums';
import { accentBorder, Badge, Card, EmptyState, Grid, PageHeader } from '@/components/ui';
import { getRoomMap } from '@/server/queries';

export const metadata = { title: 'Sơ đồ phòng — Quản lý nhà trọ' };

export default async function RoomMapPage() {
  await requireRole('admin', 'staff');
  const rooms = await getRoomMap();

  if (rooms.length === 0) {
    return (
      <>
        <PageHeader title="Sơ đồ phòng" />
        <Card>
          <EmptyState
            title="Chưa có phòng nào"
            description="Chưa có phòng nào trong Supabase."
          />
        </Card>
      </>
    );
  }

  // Gom theo nhà → tầng để nhìn được cả dãy trọ trong một màn.
  const byBuilding = new Map<string, Map<string, typeof rooms>>();
  for (const room of rooms) {
    const floors = byBuilding.get(room.building_name) ?? new Map();
    floors.set(room.floor_name, [...(floors.get(room.floor_name) ?? []), room]);
    byBuilding.set(room.building_name, floors);
  }

  const occupied = rooms.filter((room) => room.status === 'occupied').length;

  return (
    <>
      <PageHeader
        title="Sơ đồ phòng"
        subtitle={`${occupied}/${rooms.length} phòng đang có khách`}
      />

      <div className="space-y-6">
        {[...byBuilding].map(([buildingName, floors]) => (
          <section key={buildingName}>
            <h2 className="mb-2 flex items-center gap-2 font-bold text-brand-700">
              <span aria-hidden>🏢</span>
              {buildingName}
            </h2>

            <div className="space-y-4">
              {[...floors].map(([floorName, floorRooms]) => (
                <div key={floorName}>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
                    {floorName}
                  </p>
                  <Grid min="13rem">
                    {floorRooms.map((room) => (
                      <Card
                        key={room.id}
                        className={`border-l-4 p-3 ${accentBorder(ROOM_STATUS_ACCENTS[room.status])}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="min-w-0 font-bold text-brand-700">{room.room_code}</span>
                          <Badge className={ROOM_STATUS_BADGE_CLASSES[room.status]}>
                            {ROOM_STATUS_LABELS[room.status]}
                          </Badge>
                        </div>

                        {room.tenant_name ? (
                          <div className="mt-2 text-sm">
                            <Link
                              href={`/khach-thue?tim=${encodeURIComponent(room.tenant_name)}`}
                              className="font-medium text-slate-700 hover:text-brand-600 hover:underline"
                            >
                              {room.tenant_name}
                            </Link>
                            <p className="tabular text-xs text-slate-500">
                              {formatMoney(room.monthly_rent ?? 0)}/tháng
                              {room.lease_start_date
                                ? ` · từ ${formatDMY(room.lease_start_date)}`
                                : ''}
                            </p>
                          </div>
                        ) : (
                          <p className="mt-2 text-sm text-slate-400">
                            Trống · giá gợi ý {formatMoney(room.default_rent)}
                          </p>
                        )}

                        {room.outstanding_total > 0 ? (
                          <p className="tabular mt-2 text-xs font-medium text-rose-600">
                            Còn nợ {formatMoney(room.outstanding_total)}
                          </p>
                        ) : null}
                      </Card>
                    ))}
                  </Grid>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
