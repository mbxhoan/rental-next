import { requireRole } from '@/lib/auth';
import { calculatePeriodForLease } from '@/domain/billing-cycle';
import { previewBill } from '@/domain/bill-calculator';
import { formatDMY, formatMonthLabel, startOfMonth, today } from '@/domain/date';
import { rentalConfig } from '@/domain/config';
import { ButtonLink, Card, EmptyState, Grid, LinkCard, PageHeader } from '@/components/ui';
import { getRoomElectricityReadingAsOf, listBillableLeases, listBuildings } from '@/server/queries';
import { BillRowForm } from './bill-row-form';
import { BillingPeriodPicker } from './billing-period-picker';

export const metadata = { title: 'Bill tháng — Quản lý nhà trọ' };

export default async function MonthlyBillPage({
  searchParams,
}: {
  searchParams: Promise<{ thang?: string; nha?: string }>;
}) {
  await requireRole('admin', 'staff');

  const { thang, nha } = await searchParams;
  const now = today(rentalConfig.timezone);
  const hasSelectedMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(thang ?? '');
  const month = hasSelectedMonth ? `${thang}-01` : startOfMonth(now);

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

  if (!hasSelectedMonth) {
    return (
      <>
        <PageHeader
          title="Lên bill tháng"
          subtitle="Chọn tháng chốt trước để mở danh sách phòng cần lên bill."
        />
        <BillingPeriodPicker
          defaultMonth={month.slice(0, 7)}
          defaultBuildingId={building.id}
          buildings={buildings.map((item) => ({ id: item.id, name: item.name }))}
        />
      </>
    );
  }

  // Kỳ chốt sơ bộ theo cấu hình của nhà — dùng để lấy đúng danh sách hợp đồng.
  const coarse = calculatePeriodForLease({ building }, { startDate: null, hasExistingBills: true }, month);
  const leases = await listBillableLeases(coarse.periodFrom, coarse.periodTo);
  const forBuilding = leases.filter((lease) => lease.building_id === building.id);

  // Mỗi phòng có thể có ngày chốt riêng → tính kỳ theo từng hợp đồng.
  const rows = await Promise.all(forBuilding.map(async (lease) => {
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

    const electricity = await getRoomElectricityReadingAsOf(lease.room_id, cycle.periodFrom);
    const electricityOld = electricity?.electricity_reading ?? 0;

    // Xem trước khi chưa nhập số điện: chỉ để hiện tiền phòng dự kiến.
    const preview = previewBill(lease, cycle.periodFrom, cycle.periodTo, {
      electricity_old: electricityOld,
      force_prorated_rent: cycle.isInitialPartialPeriod ?? false,
    }, { default_electricity_unit_price: lease.building_electricity_unit_price });

    return { lease, cycle, electricityOld, preview };
  }));

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
        action={
          <ButtonLink href={`/chi-so-dien?thang=${month.slice(0, 7)}&nha=${building.id}`} variant="secondary">
            Chỉnh mốc điện
          </ButtonLink>
        }
      />

      <Card className="mb-4 flex flex-col gap-3 border-brand-200 bg-brand-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <p className="text-xs font-bold tracking-wide text-brand-700 uppercase">Đang lên bill kỳ</p>
          <p className="mt-1 text-lg font-bold text-slate-900 sm:text-xl">
            Tháng {formatMonthLabel(month)} · {building.name}
          </p>
        </div>
        <ButtonLink href="/bill-thang" variant="secondary">
          Đổi kỳ chốt
        </ButtonLink>
      </Card>

      <p className="mb-4 text-xs text-slate-500">
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
