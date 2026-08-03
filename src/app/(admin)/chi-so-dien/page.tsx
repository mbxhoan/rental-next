import { requireRole } from '@/lib/auth';
import { calculatePeriodForLease } from '@/domain/billing-cycle';
import { formatMonthLabel, startOfMonth, today } from '@/domain/date';
import { rentalConfig } from '@/domain/config';
import { ButtonLink, Card, EmptyState, PageHeader } from '@/components/ui';
import { getRoomElectricityReadingAsOf, listBillableLeases, listBuildings } from '@/server/queries';
import { MonthPicker } from '@/components/month-picker';
import { MeterBaselineForm } from './meter-baseline-form';

export const metadata = { title: 'Chỉnh mốc điện — Quản lý nhà trọ' };

export default async function MeterBaselinePage({
  searchParams,
}: {
  searchParams: Promise<{ thang?: string; nha?: string }>;
}) {
  await requireRole('admin', 'staff');

  const { thang, nha } = await searchParams;
  const now = today(rentalConfig.timezone);
  const month = /^\d{4}-\d{2}$/.test(thang ?? '') ? `${thang}-01` : startOfMonth(now);
  const buildings = await listBuildings();
  const buildingId = nha ? Number(nha) : (buildings[0]?.id ?? null);
  const building = buildings.find((item) => item.id === buildingId) ?? null;

  if (!building) {
    return (
      <>
        <PageHeader title="Chỉnh mốc điện" />
        <Card><EmptyState title="Chưa có nhà nào" description="Tạo nhà, tầng và phòng trước khi chỉnh mốc điện." /></Card>
      </>
    );
  }

  const coarse = calculatePeriodForLease({ building }, { startDate: null, hasExistingBills: true }, month);
  const leases = (await listBillableLeases(coarse.periodFrom, coarse.periodTo))
    .filter((lease) => lease.building_id === building.id);
  const rows = await Promise.all(leases.map(async (lease) => {
    const cycle = calculatePeriodForLease(
      {
        room: {
          billing_day_override: lease.billing_day_override,
          billing_period_start_day: lease.billing_period_start_day,
        },
        building: {
          default_billing_day: lease.building_billing_day,
          default_electricity_unit_price: lease.building_electricity_unit_price,
        },
      },
      { startDate: lease.start_date, latestBillPeriodTo: lease.latest_bill_period_to },
      month,
    );
    const current = await getRoomElectricityReadingAsOf(lease.room_id, cycle.periodFrom);
    return {
      roomId: lease.room_id,
      roomCode: lease.room_code,
      floorName: lease.floor_name,
      tenantName: lease.tenant_name,
      effectiveFrom: cycle.periodFrom,
      currentReading: current?.electricity_reading ?? 0,
    };
  }));

  const billPath = `/bill-thang?thang=${month.slice(0, 7)}&nha=${building.id}`;
  return (
    <>
      <PageHeader
        title="Chỉnh mốc điện"
        subtitle={`${building.name} · tháng ${formatMonthLabel(month)}`}
        action={<ButtonLink href={billPath} variant="secondary">Quay lại lên bill</ButtonLink>}
      />
      <MonthPicker
        basePath="/chi-so-dien"
        month={month.slice(0, 7)}
        buildingId={building.id}
        buildings={buildings.map((item) => ({ id: item.id, name: item.name }))}
      />
      <Card className="mt-4 p-4">
        <p className="font-semibold text-slate-800">Mốc điện chỉ dùng cho bill từ kỳ này trở đi.</p>
        <p className="mt-1 text-sm text-slate-600">Bill đã chốt, tiền đã thu và báo cáo lịch sử không bị thay đổi.</p>
      </Card>
      <section className="mt-4">
        {rows.length === 0 ? (
          <Card><EmptyState title="Không có phòng đang thuê" description="Kỳ này chưa có phòng cần lên bill." /></Card>
        ) : <MeterBaselineForm rows={rows} />}
      </section>
    </>
  );
}
