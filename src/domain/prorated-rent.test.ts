/** Dịch 1:1 từ tests/Unit/Domain/Rental/Services/ProratedRentCalculatorTest.php */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { calculateProratedRent } from './prorated-rent.ts';

// PHPUnit ép RENTAL_PRORATE_MODE=fixed_30_days, nên test ở đây truyền thẳng
// mode vào để không phụ thuộc .env của máy chạy test.
const FIXED = 'fixed_30_days' as const;

test('ở trọn tháng thì thu đúng tiền tháng', () => {
  const result = calculateProratedRent({
    periodStart: '2026-03-01',
    periodEnd: '2026-03-31',
    leaseStartDate: '2026-03-01',
    monthlyRent: 5_800_000,
    prorateMode: FIXED,
  });

  assert.equal(result.amount, 5_800_000);
  assert.equal(result.occupiedDays, 31);
  assert.equal(result.billStart, '2026-03-01');
  assert.equal(result.billEnd, '2026-03-31');
});

test('vào giữa tháng thì chia theo ngày', () => {
  const result = calculateProratedRent({
    periodStart: '2026-03-01',
    periodEnd: '2026-03-31',
    leaseStartDate: '2026-03-10',
    monthlyRent: 5_800_000,
    prorateMode: FIXED,
  });

  // 5.800.000 / 30 * 22 = 4.253.333 → làm tròn 4.253.000
  assert.equal(result.amount, 4_253_000);
  assert.equal(result.occupiedDays, 22);
  assert.equal(result.billStart, '2026-03-10');
  assert.equal(result.billEnd, '2026-03-31');
});

test('trả phòng sớm thì chia theo ngày', () => {
  const result = calculateProratedRent({
    periodStart: '2026-03-01',
    periodEnd: '2026-03-31',
    leaseStartDate: '2026-03-01',
    actualEndDate: '2026-03-15',
    monthlyRent: 5_800_000,
    prorateMode: FIXED,
  });

  // 5.800.000 / 30 * 15 = 2.900.000
  assert.equal(result.amount, 2_900_000);
  assert.equal(result.occupiedDays, 15);
  assert.equal(result.billEnd, '2026-03-15');
});

test('kỳ chốt dài 32 ngày mà ở trọn thì vẫn thu đúng tiền tháng', () => {
  const result = calculateProratedRent({
    periodStart: '2026-05-02',
    periodEnd: '2026-06-02',
    leaseStartDate: '2026-04-01',
    monthlyRent: 5_000_000,
    prorateMode: FIXED,
  });

  assert.equal(result.amount, 5_000_000);
});

test('ở thiếu kỳ thì mẫu số là 30 ngày cố định', () => {
  const result = calculateProratedRent({
    periodStart: '2026-05-02',
    periodEnd: '2026-06-02',
    leaseStartDate: '2026-05-22',
    monthlyRent: 5_000_000,
    prorateMode: FIXED,
  });

  // 5.000.000 / 30 * 12 = 2.000.000
  assert.equal(result.amount, 2_000_000);
  assert.equal(result.occupiedDays, 12);
});

test('kỳ đầu ngắn có thể ép chia theo ngày dù ở trọn kỳ', () => {
  const result = calculateProratedRent({
    periodStart: '2026-06-11',
    periodEnd: '2026-06-30',
    leaseStartDate: '2026-06-11',
    monthlyRent: 5_700_000,
    prorateMode: FIXED,
    forceProratedRent: true,
  });

  assert.equal(result.amount, 3_800_000);
  assert.equal(result.occupiedDays, 20);
  assert.equal(result.denominatorDays, 30);
});

// --- Ngoài bộ test gốc: chốt lại hành vi của mode production (calendar_days) ---

test('calendar_days lấy mẫu số là số ngày thật của kỳ', () => {
  const result = calculateProratedRent({
    periodStart: '2026-03-01',
    periodEnd: '2026-03-31',
    leaseStartDate: '2026-03-10',
    monthlyRent: 5_800_000,
    prorateMode: 'calendar_days',
  });

  // 5.800.000 / 31 * 22 = 4.116.129 → làm tròn 4.116.000
  assert.equal(result.denominatorDays, 31);
  assert.equal(result.amount, 4_116_000);
});

test('hết hạn hợp đồng trước kỳ thì tiền phòng bằng 0', () => {
  const result = calculateProratedRent({
    periodStart: '2026-03-01',
    periodEnd: '2026-03-31',
    leaseStartDate: '2026-01-01',
    actualEndDate: '2026-02-10',
    monthlyRent: 5_800_000,
    prorateMode: FIXED,
  });

  assert.equal(result.occupiedDays, 0);
  assert.equal(result.amount, 0);
});

test('nhập tay thì ghi đè số tính ra nhưng vẫn giữ lại số gốc', () => {
  const result = calculateProratedRent({
    periodStart: '2026-03-01',
    periodEnd: '2026-03-31',
    leaseStartDate: '2026-03-01',
    monthlyRent: 5_800_000,
    manualRentAmount: 5_000_000,
    prorateMode: FIXED,
  });

  assert.equal(result.amount, 5_000_000);
  assert.equal(result.calculatedAmount, 5_800_000);
  assert.equal(result.manualAmount, 5_000_000);
});

test('kỳ ngược đầu đuôi thì báo lỗi', () => {
  assert.throws(
    () =>
      calculateProratedRent({
        periodStart: '2026-03-31',
        periodEnd: '2026-03-01',
        leaseStartDate: '2026-03-01',
        monthlyRent: 5_800_000,
      }),
    /Kỳ tính tiền không hợp lệ/,
  );
});
