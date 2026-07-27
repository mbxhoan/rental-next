/** Dịch 1:1 từ tests/Unit/Domain/Rental/Services/BillingCycleResolverTest.php */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { calculatePeriod, calculatePeriodForLease, daysInCycle } from './billing-cycle.ts';

test('nhà chốt ngày 2 → kỳ từ tháng trước sang tháng này', () => {
  const period = calculatePeriod({ building: { default_billing_day: 2 } }, '2026-05-15');

  assert.equal(period.periodFrom, '2026-04-02');
  assert.equal(period.periodTo, '2026-05-02');
  assert.equal(period.billingDay, 2);
});

test('nhà chốt ngày 5 → kỳ từ tháng trước sang tháng này', () => {
  const period = calculatePeriod({ building: { default_billing_day: 5 } }, '2026-05-01');

  assert.equal(period.periodFrom, '2026-04-05');
  assert.equal(period.periodTo, '2026-05-05');
});

test('chốt ngày 15 xử lý đúng tháng 2', () => {
  const period = calculatePeriod({ building: { default_billing_day: 15 } }, '2026-02-01');

  assert.equal(period.periodFrom, '2026-01-15');
  assert.equal(period.periodTo, '2026-02-15');
});

test('không có nhà thì lấy ngày chốt mặc định của cấu hình', () => {
  const period = calculatePeriod({}, '2026-05-01');

  assert.equal(period.billingDay, 24);
  assert.equal(period.periodFrom, '2026-04-24');
  assert.equal(period.periodTo, '2026-05-24');
});

test('ngày chốt riêng của phòng thắng ngày chốt của nhà', () => {
  const period = calculatePeriod(
    { room: { billing_day_override: 6 }, building: { default_billing_day: 24 } },
    '2026-06-01',
  );

  assert.equal(period.periodFrom, '2026-05-06');
  assert.equal(period.periodTo, '2026-06-06');
  assert.equal(period.billingDay, 6);
});

test('chốt ngày 30 bị kẹp theo độ dài tháng 2', () => {
  const period = calculatePeriod({ building: { default_billing_day: 30 } }, '2026-02-01');

  assert.equal(period.periodFrom, '2026-01-30');
  assert.equal(period.periodTo, '2026-02-28');
  assert.equal(period.billingDay, 30);
});

test('phòng cấu hình được ngày bắt đầu nằm trong cùng tháng', () => {
  const period = calculatePeriod(
    {
      room: { billing_day_override: 30, billing_period_start_day: 1 },
      building: { default_billing_day: 24 },
    },
    '2026-06-01',
  );

  assert.equal(period.periodFrom, '2026-06-01');
  assert.equal(period.periodTo, '2026-06-30');
  assert.equal(period.periodStartDay, 1);
  assert.equal(period.billingDay, 30);
});

test('bill đầu tiên của khách vào giữa tháng bắt đầu từ ngày vào', () => {
  const period = calculatePeriodForLease(
    { room: { billing_day_override: 30 }, building: { default_billing_day: 24 } },
    { startDate: '2026-06-11', hasExistingBills: false },
    '2026-06-01',
  );

  assert.equal(period.periodFrom, '2026-06-11');
  assert.equal(period.periodTo, '2026-06-30');
  assert.equal(period.isInitialPartialPeriod, true);
});

test('bill đầu tiên khi vào sau ngày chốt thì kéo tới cuối tháng', () => {
  const period = calculatePeriodForLease(
    { room: {}, building: { default_billing_day: 6 } },
    { startDate: '2026-06-11', hasExistingBills: false },
    '2026-06-01',
  );

  assert.equal(period.periodFrom, '2026-06-11');
  assert.equal(period.periodTo, '2026-06-30');
  assert.equal(period.billingDay, 30);
  assert.equal(period.isInitialPartialPeriod, true);
});

test('kỳ đầu ngắn do cấu hình cũng được đánh dấu là kỳ đầu', () => {
  const period = calculatePeriodForLease(
    {
      room: { billing_day_override: 30, billing_period_start_day: 11 },
      building: { default_billing_day: 6 },
    },
    { startDate: '2026-06-11', hasExistingBills: false },
    '2026-06-01',
  );

  assert.equal(period.periodFrom, '2026-06-11');
  assert.equal(period.periodTo, '2026-06-30');
  assert.equal(period.isInitialPartialPeriod, true);
});

test('hợp đồng đã có bill thì dùng kỳ chốt bình thường của phòng', () => {
  const period = calculatePeriodForLease(
    { room: { billing_day_override: 30 }, building: { default_billing_day: 24 } },
    { startDate: '2026-06-11', hasExistingBills: true },
    '2026-07-01',
  );

  assert.equal(period.periodFrom, '2026-06-30');
  assert.equal(period.periodTo, '2026-07-30');
});

test('daysInCycle tính cả hai đầu kỳ', () => {
  // 02/04 → 02/05 = 31 ngày
  assert.equal(daysInCycle({ building: { default_billing_day: 2 } }, '2026-05-01'), 31);
});

// --- Ngoài bộ test gốc: nhánh neo theo bill gần nhất khi bỏ sót tháng ---

test('bỏ sót vài tháng thì kỳ mới neo theo ngày chốt của bill gần nhất', () => {
  const period = calculatePeriodForLease(
    { room: { billing_day_override: 24 }, building: { default_billing_day: 24 } },
    { startDate: '2026-01-05', latestBillPeriodTo: '2026-03-18' },
    '2026-06-01',
  );

  assert.equal(period.periodFrom, '2026-05-18');
  assert.equal(period.periodTo, '2026-06-18');
  assert.equal(period.billingDay, 18);
});
