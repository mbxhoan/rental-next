import { requireRole } from '@/lib/auth';
import { calculatePeriodForLease } from '@/domain/billing-cycle';
import { previewBill } from '@/domain/bill-calculator';
import { formatDMY, formatMonthLabel, startOfMonth, today } from '@/domain/date';
import { rentalConfig } from '@/domain/config';
import { Card, EmptyState, Grid, LinkCard, PageHeader } from '@/components/ui';
import { listBillableLeases, listBuildings } from '@/server/queries';
import { BillRowForm } from './bill-row-form';
import { MonthPicker } from '@/components/month-picker';

export const metadata = { title: 'Bill tháng — Quản lý nhà trọ' };

export default async function MonthlyBillPage({
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
        <PageHeader title="Lên bill tháng" />
        <Card>
          <EmptyState
            title="Chưa có nhà nào"
            description="Tạo nhà, tầng và phòng trước khi lên bill."
          />
        </Card>
      </>
    );
  }

  // Kỳ chốt sơ bộ theo cấu hình của nhà — dùng để lấy đúng danh sách hợp đồng.
  const coarse = calculatePeriodForLease({ building }, { startDate: null, hasExistingBills: true }, month);
  const leases = await listBillableLeases(coarse.periodFrom, coarse.periodTo);
  const forBuilding = leases.filter((lease) => lease.building_id === building.id);

  // Mỗi phòng có thể có ngày chốt riêng → tính kỳ theo từng hợp đồng.
  const rows = forBuilding.map((lease) => {
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
      {
        startDate: lease.start_date,
        latestBillPeriodTo: lease.latest_bill_period_to,
      },
      month,
    );

    const electricityOld = lease.existing_electricity_old ?? lease.last_electricity_new ?? 0;

    // Xem trước khi chưa nhập số điện: chỉ để hiện tiền phòng dự kiến.
    const preview = previewBill(lease, cycle.periodFrom, cycle.periodTo, {
      electricity_old: electricityOld,
      force_prorated_rent: cycle.isInitialPartialPeriod ?? false,
    }, { default_electricity_unit_price: lease.building_electricity_unit_price });

    return { lease, cycle, electricityOld, preview };
  });

  const pending = rows.filter(
    (row) => row.lease.existing_bill_id === null || row.lease.existing_bill_status === 'draft',
  );
  const done = rows.filter(
    (row) => row.lease.existing_bill_id !== null && row.lease.existing_bill_status !== 'draft',
  );

  return (
    <>
      <PageHeader
        title="Lên bill tháng"
        subtitle={`${building.name} · tháng ${formatMonthLabel(month)} · ${pending.length} phòng chưa chốt`}
      />

      <MonthPicker
        basePath="/bill-thang"
        month={month.slice(0, 7)}
        buildingId={building.id}
        buildings={buildings.map((item) => ({ id: item.id, name: item.name }))}
      />

      <p className="mt-3 mb-4 text-xs text-slate-500">
        {rentalConfig.helperTexts.oldElectricityFromLatestBill}
      </p>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            title="Không có hợp đồng nào cần lên bill"
            description="Kỳ này chưa có hợp đồng đang thuê ở nhà đã chọn."
          />
        </Card>
      ) : null}

      <Grid min="26rem">
        {pending.map(({ lease, cycle, electricityOld, preview }) => (
          <BillRowForm
            key={lease.id}
            leaseId={lease.id}
            roomCode={lease.room_code}
            floorName={lease.floor_name}
            tenantName={lease.tenant_name}
            periodFrom={cycle.periodFrom}
            periodTo={cycle.periodTo}
            periodLabel={`${formatDMY(cycle.periodFrom)} → ${formatDMY(cycle.periodTo)}`}
            isInitialPartialPeriod={cycle.isInitialPartialPeriod ?? false}
            electricityOld={electricityOld}
            initialElectricityNew={lease.existing_electricity_new}
            electricityUnitPrice={
              lease.electricity_unit_price || lease.building_electricity_unit_price
            }
            monthlyRent={lease.monthly_rent}
            rentPreview={preview.rent}
            waterAmount={preview.water.amount}
            serviceAmount={preview.service.amount}
          />
        ))}
      </Grid>

      {done.length > 0 ? (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-bold tracking-wide text-slate-500 uppercase">
            Đã chốt kỳ này ({done.length})
          </h2>
          <Grid min="15rem">
            {done.map(({ lease, cycle }) => (
              <LinkCard
                key={lease.id}
                href={`/hoa-don/${lease.existing_bill_id}`}
                accent="emerald"
              >
                <p className="font-semibold text-slate-800">
                  {lease.room_code} · {lease.tenant_name}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {formatDMY(cycle.periodFrom)} → {formatDMY(cycle.periodTo)}
                </p>
                <p className="mt-2 text-sm font-medium text-brand-600">
                  {lease.existing_bill_status === 'adjusting' ? 'Đang điều chỉnh →' : 'Xem bill →'}
                </p>
              </LinkCard>
            ))}
          </Grid>
        </div>
      ) : null}
    </>
  );
}
