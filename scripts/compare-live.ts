/**
 * Đối chiếu bản Next.js với Laravel trên DỮ LIỆU THẬT.
 *
 * Chạy cùng một kỳ chốt qua hai đường: truy vấn + tính toán của Next.js, và
 * model + service của Laravel. Lệch một đồng là in ra ngay.
 *
 * Dùng: npm run compare -- 2026-07
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

import { previewBill } from '../src/domain/bill-calculator.ts';
import { calculatePeriodForLease } from '../src/domain/billing-cycle.ts';
import { startOfMonth, today } from '../src/domain/date.ts';
import { rentalConfig } from '../src/domain/config.ts';

const here = dirname(fileURLToPath(import.meta.url));
const phpScript = resolve(here, 'compare-live-php.php');

if (!existsSync(resolve(here, '../../rental-manager/vendor/autoload.php'))) {
  console.error('Bỏ qua: chưa có rental-manager/vendor.');
  process.exit(0);
}

const month = process.argv[2] ?? today(rentalConfig.timezone).slice(0, 7);
const monthStart = startOfMonth(`${month}-01`);

const sql = postgres(process.env.DATABASE_URL!, {
  max: 1,
  types: {
    date: { to: 1082, from: [1082], serialize: (v: string) => v, parse: (v: string) => v },
    bigint: { to: 20, from: [20], serialize: (v: number) => String(v), parse: (v: string) => Number(v) },
  },
});

// Cùng truy vấn mà màn Bill tháng dùng, viết lại ở đây để script chạy độc lập
// với server-only của Next.
const leases = await sql<Record<string, never>[]>`
  select
    l.id, l.status, l.start_date, l.expected_end_date, l.actual_end_date,
    l.monthly_rent, l.due_day, l.water_fee, l.service_fee, l.electricity_unit_price,
    l.occupants_count, l.tenant_id, l.room_id,
    t.full_name as tenant_name,
    r.room_code, r.billing_day_override, r.billing_period_start_day,
    b.default_billing_day as building_billing_day,
    b.default_electricity_unit_price as building_electricity_unit_price,
    (select mr.electricity_new from meter_readings mr
      where mr.room_id = l.room_id order by mr.period_month desc limit 1) as last_electricity_new,
    (select max(bl.period_to) from bills bl
      where bl.lease_id = l.id and bl.status <> 'cancelled') as latest_bill_period_to
  from leases l
  join tenants t on t.id = l.tenant_id
  join rooms r on r.id = l.room_id
  join buildings b on b.id = r.building_id
  where l.status in ('active', 'ending_soon', 'reserved')
  order by l.id
`;

const phpRaw = execFileSync('php', ['-d', 'error_reporting=0', '-d', 'display_errors=0', phpScript, month], {
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
});
const php = JSON.parse(phpRaw.slice(phpRaw.indexOf('['))) as Record<string, unknown>[];

const phpByLease = new Map(php.map((row) => [row.lease_id as number, row]));

let checked = 0;
const failures: string[] = [];

for (const lease of leases as never as Record<string, never>[]) {
  const leaseRow = lease as Record<string, never>;
  const leaseId = Number(leaseRow.id);
  const expected = phpByLease.get(leaseId);

  if (!expected) {
    failures.push(`lease ${leaseId}: Laravel không trả về hợp đồng này`);
    continue;
  }

  const cycle = calculatePeriodForLease(
    {
      room: {
        billing_day_override: leaseRow.billing_day_override,
        billing_period_start_day: leaseRow.billing_period_start_day,
      },
      building: {
        default_billing_day: leaseRow.building_billing_day,
        default_electricity_unit_price: leaseRow.building_electricity_unit_price,
      },
    },
    {
      startDate: leaseRow.start_date,
      latestBillPeriodTo: leaseRow.latest_bill_period_to ?? null,
    },
    monthStart,
  );

  const electricityOld = Number(leaseRow.last_electricity_new ?? 0);

  const preview = previewBill(
    leaseRow as never,
    cycle.periodFrom,
    cycle.periodTo,
    {
      electricity_old: electricityOld,
      force_prorated_rent: cycle.isInitialPartialPeriod ?? false,
    },
    { default_electricity_unit_price: leaseRow.building_electricity_unit_price },
  );

  const actual = {
    period_from: cycle.periodFrom,
    period_to: cycle.periodTo,
    billing_day: cycle.billingDay,
    is_initial_partial: cycle.isInitialPartialPeriod ?? false,
    electricity_old: electricityOld,
    due_date: preview.dueDate,
    rent_amount: preview.rent.amount,
    occupied_days: preview.rent.occupiedDays,
    days_in_period: preview.rent.daysInPeriod,
    denominator_days: preview.rent.denominatorDays,
    water_amount: preview.water.amount,
    service_amount: preview.service.amount,
  };

  for (const [key, value] of Object.entries(actual)) {
    checked++;
    if (JSON.stringify(expected[key]) !== JSON.stringify(value)) {
      failures.push(
        `phòng ${expected.room_code} (lease ${leaseId}) · ${key}: Laravel=${JSON.stringify(expected[key])} Next=${JSON.stringify(value)}`,
      );
    }
  }
}

if (leases.length !== php.length) {
  failures.push(`Số hợp đồng lệch: Next=${leases.length} Laravel=${php.length}`);
}

await sql.end();

console.log(`Kỳ ${month}: đối chiếu ${leases.length} hợp đồng, ${checked} giá trị.`);

if (failures.length > 0) {
  console.error(`\n❌ Lệch ${failures.length} chỗ:\n`);
  for (const failure of failures) console.error('  ' + failure);
  process.exit(1);
}

console.log('✅ Khớp tuyệt đối với Laravel trên dữ liệu thật.');
