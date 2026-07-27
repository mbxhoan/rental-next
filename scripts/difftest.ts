/**
 * So khớp bản port TypeScript với service gốc của Laravel trên cùng bộ ca.
 *
 * Dùng: npm run difftest
 * Cần có PHP + vendor/ của rental-manager. Nếu thiếu thì script tự bỏ qua.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { previewBill } from '../src/domain/bill-calculator.ts';
import { calculatePeriod, calculatePeriodForLease } from '../src/domain/billing-cycle.ts';
import { calculateElectricityCharge } from '../src/domain/electricity.ts';
import { resolveServiceFee, resolveWaterFee } from '../src/domain/fee-settings.ts';
import { roundVnd } from '../src/domain/money.ts';
import { calculateProratedRent } from '../src/domain/prorated-rent.ts';
import { generateCases } from './difftest-cases.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const phpScript = resolve(here, 'difftest-php.php');
const vendorAutoload = resolve(here, '../../rental-manager/vendor/autoload.php');

if (!existsSync(vendorAutoload)) {
  console.error('Bỏ qua: không tìm thấy rental-manager/vendor. Chạy `composer install` bên Laravel trước.');
  process.exit(0);
}

const cases = generateCases();

// PHP đọc RENTAL_* từ .env của Laravel; ép cứng để hai bên cùng điều kiện.
process.env.RENTAL_MONEY_ROUNDING = 'nearest_1000';
process.env.RENTAL_DEFAULT_BILLING_DAY = '24';
process.env.RENTAL_DEFAULT_ELECTRICITY_UNIT_PRICE = '3700';

const phpRaw = execFileSync('php', ['-d', 'error_reporting=0', phpScript], {
  input: JSON.stringify(cases),
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});

const php = JSON.parse(phpRaw.slice(phpRaw.indexOf('{')));

let checked = 0;
const failures: string[] = [];

function compare(label: string, index: number, expected: unknown, actual: unknown): void {
  checked++;
  const a = JSON.stringify(expected);
  const b = JSON.stringify(actual);
  if (a !== b) {
    failures.push(`${label}[${index}]\n    PHP: ${a}\n    TS : ${b}\n    ca : ${JSON.stringify((cases as never)[label as never][index])}`);
  }
}

// --- Tiền phòng theo ngày ---
cases.prorate.forEach((testCase, index) => {
  let actual: unknown;
  try {
    const result = calculateProratedRent(testCase as never);
    actual = {
      bill_start: result.billStart,
      bill_end: result.billEnd,
      days_in_period: result.daysInPeriod,
      occupied_days: result.occupiedDays,
      denominator_days: result.denominatorDays,
      calculated_amount: result.calculatedAmount,
      amount: result.amount,
      prorate_mode: result.prorateMode,
    };
  } catch (error) {
    actual = { error: (error as Error).message };
  }
  compare('prorate', index, php.prorate[index], actual);
});

// --- Kỳ chốt ---
cases.cycle.forEach((testCase, index) => {
  const context = {
    room: {
      billing_day_override: testCase.roomBillingDayOverride,
      billing_period_start_day: testCase.roomPeriodStartDay,
    },
    building: { default_billing_day: testCase.buildingBillingDay },
  };

  let actual: unknown;
  try {
    const period = calculatePeriod(context, testCase.month);
    const leasePeriod = calculatePeriodForLease(
      context,
      { startDate: testCase.leaseStartDate, hasExistingBills: testCase.hasExistingBills },
      testCase.month,
    );
    actual = {
      period_from: period.periodFrom,
      period_to: period.periodTo,
      period_start_day: period.periodStartDay,
      billing_day: period.billingDay,
      lease_period_from: leasePeriod.periodFrom,
      lease_period_to: leasePeriod.periodTo,
      lease_billing_day: leasePeriod.billingDay,
      lease_is_initial_partial: leasePeriod.isInitialPartialPeriod ?? false,
    };
  } catch (error) {
    actual = { error: (error as Error).message };
  }
  compare('cycle', index, php.cycle[index], actual);
});

// --- Tiền điện ---
cases.electricity.forEach((testCase, index) => {
  let actual: unknown;
  try {
    const result = calculateElectricityCharge(
      testCase.oldReading,
      testCase.newReading,
      testCase.unitPrice,
    );
    actual = {
      old: result.old,
      new: result.new,
      usage: result.usage,
      unit_price: result.unitPrice,
      amount: result.amount,
    };
  } catch {
    actual = { error: 'invalid' };
  }
  compare('electricity', index, php.electricity[index], actual);
});

// --- Làm tròn tiền ---
cases.money.forEach((testCase, index) => {
  compare('money', index, php.money[index], roundVnd(testCase.amount, testCase.mode as never));
});

// --- Bậc phí nước / dịch vụ ---
cases.fees.forEach((testCase, index) => {
  compare('fees', index, php.fees[index], {
    water: resolveWaterFee(testCase.occupantsCount),
    service: resolveServiceFee(testCase.occupantsCount),
  });
});

// --- Bill hoàn chỉnh ---
cases.bill.forEach((testCase, index) => {
  let actual: unknown;
  try {
    // PHP dùng array_filter bỏ key null → bên TS cũng phải bỏ, vì "không nhập"
    // khác với "nhập null" ở nhánh manual override.
    const row = Object.fromEntries(
      Object.entries(testCase.row).filter(([, value]) => value !== null),
    );

    const preview = previewBill(
      { id: 1, ...testCase.lease } as never,
      testCase.periodStart,
      testCase.periodEnd,
      row,
      { default_electricity_unit_price: testCase.buildingElectricityUnitPrice },
    );

    actual = {
      due_date: preview.dueDate,
      rent_amount: preview.rent.amount,
      rent_calculated: preview.rent.calculatedAmount,
      occupied_days: preview.rent.occupiedDays,
      electricity_amount: preview.electricity?.amount ?? null,
      water_amount: preview.water.amount,
      service_amount: preview.service.amount,
      surcharge_amount: preview.surcharge.amount,
      discount_amount: preview.discount.amount,
      original_calculated_amount: preview.originalCalculatedAmount,
      manual_amount: preview.manualAmount,
      total_amount: preview.totalAmount,
      is_manual_override: preview.isManualOverride,
      electricity_error: preview.electricityError,
    };
  } catch (error) {
    actual = { error: (error as Error).message };
  }
  compare('bill', index, php.bill[index], actual);
});

if (failures.length > 0) {
  console.error(`\n❌ Lệch ${failures.length}/${checked} ca:\n`);
  for (const failure of failures.slice(0, 25)) console.error('  ' + failure + '\n');
  if (failures.length > 25) console.error(`  ... và ${failures.length - 25} ca nữa`);
  process.exit(1);
}

console.log(`✅ Khớp tuyệt đối PHP ↔ TypeScript trên ${checked} ca.`);
