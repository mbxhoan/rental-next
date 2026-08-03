import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { buildBillDisplay, type BillForDisplay } from './bill-display.ts';

test('kỳ hiển thị có thể khác kỳ tính tiền mà không đổi giá trị bill', () => {
  const bill: BillForDisplay = {
    id: 202,
    code: null,
    period_from: '2026-06-02',
    period_to: '2026-07-02',
    display_period_from: '2026-06-30',
    display_period_to: '2026-07-31',
    due_date: '2026-07-07',
    total_amount: 5_222_100,
    paid_amount: 0,
    outstanding_amount: 5_222_100,
    status: 'sent',
    is_manual_override: false,
    manual_reason: null,
    note: null,
    tenant_name: 'Uyên Vũng Tàu',
    room_code: 'JA-202',
    floor_name: 'Tầng 2',
    building_name: 'Nhà trọ JA',
    monthly_rent: 3_000_000,
    items: [
      {
        type: 'rent',
        description: 'Tiền phòng',
        quantity: 1,
        unit_price: 3_000_000,
        amount: 3_000_000,
        meta: null,
      },
      {
        type: 'electricity',
        description: 'Tiền điện tháng 7/2026',
        quantity: 533,
        unit_price: 3_700,
        amount: 1_972_100,
        meta: { old_reading: 3586, new_reading: 4119, usage: 533, unit_price: 3_700 },
      },
    ],
  };

  const display = buildBillDisplay(bill);

  assert.equal(display.periodLabel, '7/2026');
  assert.equal(display.readingFromLabel, '30/06/2026');
  assert.equal(display.readingToLabel, '31/07/2026');
  assert.equal(display.summary.totalAmount, 5_222_100);
  assert.equal(display.summary.outstandingAmount, 5_222_100);
});
