/** Dịch từ tests/Unit/Domain/Rental/Services/BillStatusResolverTest.php */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { resolveBillStatus } from './bill-status.ts';

const TODAY = '2026-06-15';

test('bill đã huỷ thì giữ nguyên đã huỷ', () => {
  const status = resolveBillStatus(
    { status: 'cancelled', total_amount: 1_000_000, paid_amount: 1_000_000, due_date: null },
    TODAY,
  );
  assert.equal(status, 'cancelled');
});

test('trả đủ hoặc dư đều là đã thanh toán', () => {
  assert.equal(
    resolveBillStatus(
      { status: 'sent', total_amount: 1_000_000, paid_amount: 1_000_000, due_date: null },
      TODAY,
    ),
    'paid',
  );
  assert.equal(
    resolveBillStatus(
      { status: 'sent', total_amount: 1_000_000, paid_amount: 1_500_000, due_date: null },
      TODAY,
    ),
    'paid',
  );
});

test('trả thiếu là thanh toán một phần, kể cả khi đã quá hạn', () => {
  assert.equal(
    resolveBillStatus(
      { status: 'sent', total_amount: 1_000_000, paid_amount: 400_000, due_date: '2026-06-01' },
      TODAY,
    ),
    'partial',
  );
});

test('chưa trả mà còn nháp thì vẫn là nháp dù quá hạn', () => {
  assert.equal(
    resolveBillStatus(
      { status: 'draft', total_amount: 1_000_000, paid_amount: 0, due_date: '2026-06-01' },
      TODAY,
    ),
    'draft',
  );
});

test('chưa trả và quá hạn thì thành quá hạn', () => {
  assert.equal(
    resolveBillStatus(
      { status: 'sent', total_amount: 1_000_000, paid_amount: 0, due_date: '2026-06-14' },
      TODAY,
    ),
    'overdue',
  );
});

test('đúng ngày hạn thì chưa tính là quá hạn', () => {
  assert.equal(
    resolveBillStatus(
      { status: 'sent', total_amount: 1_000_000, paid_amount: 0, due_date: TODAY },
      TODAY,
    ),
    'sent',
  );
});

test('bill 0 đồng chưa trả thì không tự thành đã thanh toán', () => {
  assert.equal(
    resolveBillStatus(
      { status: 'sent', total_amount: 0, paid_amount: 0, due_date: null },
      TODAY,
    ),
    'sent',
  );
});

test('bill đang điều chỉnh giữ nguyên trạng thái dù còn số đã thu', () => {
  assert.equal(
    resolveBillStatus(
      { status: 'adjusting', total_amount: 6_000_000, paid_amount: 2_000_000, due_date: null },
      TODAY,
    ),
    'adjusting',
  );
});
