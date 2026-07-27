/** Dịch 1:1 từ tests/Unit/Domain/Rental/Services/BillCalculatorTest.php */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { previewBill, totalOf, type LeaseForBilling } from './bill-calculator.ts';

function makeLease(overrides: Partial<LeaseForBilling> = {}): LeaseForBilling {
  return {
    id: 1,
    start_date: '2026-03-01',
    expected_end_date: null,
    actual_end_date: null,
    monthly_rent: 5_800_000,
    due_day: 5,
    water_fee: 100_000,
    service_fee: 150_000,
    electricity_unit_price: 3_700,
    occupants_count: 1,
    ...overrides,
  };
}

test('tổng bill bằng tổng các dòng', () => {
  const preview = previewBill(makeLease(), '2026-03-01', '2026-03-31', {
    electricity_old: 1_000,
    electricity_new: 1_082,
  });

  assert.equal(preview.totalAmount, 6_353_400);
  assert.equal(preview.originalCalculatedAmount, 6_353_400);
  assert.equal(preview.manualAmount, null);
  assert.equal(preview.isManualOverride, false);
});

test('phí nước/dịch vụ ghi trên hợp đồng thắng bậc phí mặc định', () => {
  const preview = previewBill(
    makeLease({ monthly_rent: 5_700_000, occupants_count: 2, water_fee: 200_000, service_fee: 200_000 }),
    '2026-03-01',
    '2026-03-31',
    { electricity_old: 3_780, electricity_new: 3_780 },
  );

  assert.equal(preview.water.amount, 200_000);
  assert.equal(preview.service.amount, 200_000);
  assert.equal(preview.electricity?.amount, 0);
  assert.equal(preview.totalAmount, 6_100_000);
  assert.equal(preview.isManualOverride, false);
});

test('hạn thanh toán = ngày cuối kỳ + due_day, kể cả kỳ vắt hai tháng', () => {
  const preview = previewBill(
    makeLease({ monthly_rent: 4_500_000 }),
    '2026-04-24',
    '2026-05-24',
    { electricity_old: 3_464, electricity_new: 3_585 },
  );

  assert.equal(preview.dueDate, '2026-05-29');
});

test('bill đầu ép chia 30 ngày dù cấu hình đang là calendar_days', () => {
  const previous = process.env.RENTAL_PRORATE_MODE;
  process.env.RENTAL_PRORATE_MODE = 'calendar_days';

  try {
    const lease = makeLease({ start_date: '2026-06-11', monthly_rent: 5_700_000 });

    // Không ép: mẫu số là số ngày thật của kỳ (20 ngày) → thu trọn tiền tháng.
    const natural = previewBill(lease, '2026-06-11', '2026-06-30', {
      electricity_old: 0,
      electricity_new: 0,
    });
    assert.equal(natural.rent.prorateMode, 'calendar_days');
    assert.equal(natural.rent.amount, 5_700_000);

    // Ép chia: luôn lấy mẫu số 30 ngày bất kể cấu hình.
    const forced = previewBill(lease, '2026-06-11', '2026-06-30', {
      electricity_old: 0,
      electricity_new: 0,
      force_prorated_rent: true,
    });

    assert.equal(forced.rent.amount, 3_800_000);
    assert.equal(forced.rent.occupiedDays, 20);
    assert.equal(forced.rent.denominatorDays, 30);
    assert.equal(forced.totalAmount, 4_050_000);
  } finally {
    if (previous === undefined) delete process.env.RENTAL_PRORATE_MODE;
    else process.env.RENTAL_PRORATE_MODE = previous;
  }
});

// --- Ngoài bộ test gốc ---

test('chưa nhập số điện thì chưa có tổng tiền', () => {
  const preview = previewBill(makeLease(), '2026-03-01', '2026-03-31', {});

  assert.equal(preview.electricity, null);
  assert.equal(preview.totalAmount, null);
  assert.equal(preview.originalCalculatedAmount, null);
});

test('số điện mới nhỏ hơn số cũ thì trả lỗi chứ không ném ra ngoài', () => {
  const preview = previewBill(makeLease(), '2026-03-01', '2026-03-31', {
    electricity_old: 500,
    electricity_new: 400,
  });

  assert.equal(preview.electricityError, 'Số điện mới không được nhỏ hơn số điện cũ.');
  assert.equal(preview.totalAmount, null);
});

test('điều chỉnh tay được ghi nhận và giữ lại số gốc để đối chiếu', () => {
  const preview = previewBill(makeLease(), '2026-03-01', '2026-03-31', {
    electricity_old: 1_000,
    electricity_new: 1_082,
    manual_rent_amount: '5.000.000',
  });

  assert.equal(preview.isManualOverride, true);
  assert.equal(preview.originalCalculatedAmount, 6_353_400);
  assert.equal(preview.totalAmount, 5_553_400);
  assert.equal(preview.manualAmount, 5_553_400);
});

test('dòng giảm trừ bị trừ ra và tổng không âm', () => {
  assert.equal(totalOf([{ type: 'rent', amount: 100 }, { type: 'discount', amount: 30 }]), 70);
  // Giảm trừ nhập số âm vẫn phải trừ ra, không được cộng vào.
  assert.equal(totalOf([{ type: 'rent', amount: 100 }, { type: 'discount', amount: -30 }]), 70);
  assert.equal(totalOf([{ type: 'rent', amount: 10 }, { type: 'discount', amount: 999 }]), 0);
});
