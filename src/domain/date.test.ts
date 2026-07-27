import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  addDays,
  addMonths,
  civil,
  daysInMonth,
  diffDays,
  endOfMonth,
  formatDMY,
  formatMonthLabel,
  inclusiveDays,
  setDay,
  startOfMonth,
  subMonths,
  yearMonth,
} from './date.ts';

test('inclusiveDays tính cả hai đầu kỳ', () => {
  assert.equal(inclusiveDays('2026-03-01', '2026-03-31'), 31);
  assert.equal(inclusiveDays('2026-04-02', '2026-05-02'), 31);
  assert.equal(inclusiveDays('2026-03-10', '2026-03-31'), 22);
  assert.equal(inclusiveDays('2026-06-11', '2026-06-30'), 20);
  assert.equal(inclusiveDays('2026-03-01', '2026-03-01'), 1);
});

test('setDay kẹp theo độ dài tháng', () => {
  assert.equal(setDay('2026-02-01', 30), '2026-02-28');
  assert.equal(setDay('2028-02-01', 30), '2028-02-29'); // năm nhuận
  assert.equal(setDay('2026-06-01', 31), '2026-06-30');
  assert.equal(setDay('2026-05-01', 24), '2026-05-24');
});

test('subMonths giữ ngày, kẹp khi tràn', () => {
  assert.equal(subMonths('2026-05-01', 1), '2026-04-01');
  assert.equal(subMonths('2026-01-01', 1), '2025-12-01');
  assert.equal(subMonths('2026-03-31', 1), '2026-02-28');
  assert.equal(addMonths('2026-12-01', 1), '2027-01-01');
});

test('addDays qua ranh giới tháng và năm', () => {
  assert.equal(addDays('2026-05-24', 5), '2026-05-29');
  assert.equal(addDays('2026-12-30', 5), '2027-01-04');
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
});

test('mốc đầu/cuối tháng và số ngày trong tháng', () => {
  assert.equal(startOfMonth('2026-05-15'), '2026-05-01');
  assert.equal(endOfMonth('2026-06-11'), '2026-06-30');
  assert.equal(endOfMonth('2026-02-01'), '2026-02-28');
  assert.equal(daysInMonth('2028-02-10'), 29);
});

test('so sánh chuỗi ISO đúng thứ tự thời gian', () => {
  assert.ok('2026-04-02' < '2026-05-02');
  assert.ok('2026-06-30' > '2026-06-11');
  assert.equal(yearMonth('2026-06-11'), '2026-06');
});

test('civil() nhận Date từ driver DB mà không lệch ngày', () => {
  assert.equal(civil(new Date('2026-06-11T00:00:00.000Z')), '2026-06-11');
  assert.equal(civil('2026-06-11 00:00:00'), '2026-06-11');
  assert.equal(civil('2026-06-11'), '2026-06-11');
});

test('civil() từ chối ngày không tồn tại', () => {
  assert.throws(() => civil('2026-02-30'));
  assert.throws(() => civil('2026-13-01'));
  assert.throws(() => civil('11/06/2026'));
});

test('định dạng hiển thị', () => {
  assert.equal(formatDMY('2026-06-11'), '11/06/2026');
  assert.equal(formatMonthLabel('2026-06-11'), '6/2026');
  assert.equal(diffDays('2026-03-01', '2026-03-31'), 30);
});
