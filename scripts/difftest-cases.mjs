/**
 * Sinh bộ ca kiểm thử dùng chung cho cả PHP (Laravel gốc) và TS (bản port).
 *
 * Sinh cố định bằng PRNG có seed để hai bên chạy trên đúng cùng một dữ liệu
 * và kết quả lặp lại được giữa các lần chạy.
 */

function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const pad = (n) => String(n).padStart(2, '0');
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const dateOf = (y, m, d) => `${y}-${pad(m)}-${pad(Math.min(d, daysInMonth(y, m)))}`;

export function generateCases(seed = 20260727, count = 400) {
  const rng = makeRng(seed);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const between = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

  const prorate = [];
  const cycle = [];

  for (let i = 0; i < count; i++) {
    const year = between(2025, 2028);
    const month = between(1, 12);
    const startDay = between(1, 31);
    const periodStart = dateOf(year, month, startDay);

    // Kỳ kết thúc cách kỳ bắt đầu 25–35 ngày, phủ cả kỳ ngắn lẫn kỳ dài.
    const endBase = new Date(Date.UTC(year, month - 1, Math.min(startDay, daysInMonth(year, month))));
    endBase.setUTCDate(endBase.getUTCDate() + between(25, 35));
    const periodEnd = endBase.toISOString().slice(0, 10);

    // Ngày vào rải quanh kỳ: trước kỳ, đầu kỳ, giữa kỳ.
    const leaseBase = new Date(Date.UTC(year, month - 1, Math.min(startDay, daysInMonth(year, month))));
    leaseBase.setUTCDate(leaseBase.getUTCDate() + between(-40, 25));
    const leaseStartDate = leaseBase.toISOString().slice(0, 10);

    let actualEndDate = null;
    if (rng() < 0.35) {
      const endLease = new Date(Date.UTC(year, month - 1, Math.min(startDay, daysInMonth(year, month))));
      endLease.setUTCDate(endLease.getUTCDate() + between(-10, 40));
      actualEndDate = endLease.toISOString().slice(0, 10);
    }

    let expectedEndDate = null;
    if (rng() < 0.25) {
      const exp = new Date(Date.UTC(year, month - 1, Math.min(startDay, daysInMonth(year, month))));
      exp.setUTCDate(exp.getUTCDate() + between(-5, 60));
      expectedEndDate = exp.toISOString().slice(0, 10);
    }

    prorate.push({
      periodStart,
      periodEnd,
      leaseStartDate,
      expectedEndDate,
      actualEndDate,
      monthlyRent: between(0, 20) * 500_000,
      manualRentAmount: rng() < 0.15 ? between(1, 20) * 250_000 : null,
      prorateMode: pick(['calendar_days', 'fixed_30_days']),
      forceProratedRent: rng() < 0.2,
    });

    cycle.push({
      month: dateOf(year, month, 1),
      buildingBillingDay: pick([null, 1, 2, 5, 6, 15, 24, 28, 29, 30, 31]),
      roomBillingDayOverride: pick([null, null, 1, 6, 24, 30, 31]),
      roomPeriodStartDay: pick([null, null, null, 1, 11, 15, 24]),
      leaseStartDate: dateOf(year, month, between(1, 31)),
      hasExistingBills: pick([true, false]),
    });
  }

  const electricity = [];
  for (let i = 0; i < count; i++) {
    const oldReading = between(0, 90_000);
    electricity.push({
      oldReading,
      newReading: rng() < 0.1 ? between(0, oldReading) : oldReading + between(0, 800),
      unitPrice: pick([null, 3000, 3700, 4000, 4500]),
    });
  }

  const money = [];
  for (let i = 0; i < count; i++) {
    money.push({
      amount: (rng() - 0.35) * 12_000_000,
      mode: pick(['none', 'nearest_500', 'nearest_1000']),
    });
  }

  const fees = [];
  for (let i = 0; i < 40; i++) {
    fees.push({ occupantsCount: between(-2, 8) });
  }

  // Bill hoàn chỉnh: gộp tiền phòng + điện + nước + dịch vụ + phụ thu/giảm trừ.
  const bill = [];
  for (let i = 0; i < count; i++) {
    const year = between(2025, 2028);
    const month = between(1, 12);
    const periodStart = dateOf(year, month, between(1, 28));
    const endBase = new Date(`${periodStart}T00:00:00Z`);
    endBase.setUTCDate(endBase.getUTCDate() + between(20, 35));
    const periodEnd = endBase.toISOString().slice(0, 10);

    const leaseBase = new Date(`${periodStart}T00:00:00Z`);
    leaseBase.setUTCDate(leaseBase.getUTCDate() + between(-60, 20));

    const oldReading = between(0, 50_000);
    const hasElectricity = rng() < 0.9;

    bill.push({
      periodStart,
      periodEnd,
      lease: {
        start_date: leaseBase.toISOString().slice(0, 10),
        expected_end_date: null,
        actual_end_date: rng() < 0.2 ? dateOf(year, month, between(1, 28)) : null,
        monthly_rent: between(0, 16) * 500_000,
        due_day: pick([1, 5, 10, 28, 31, 0]),
        water_fee: pick([0, 0, 100_000, 200_000]),
        service_fee: pick([0, 0, 150_000, 200_000]),
        electricity_unit_price: pick([0, 3000, 3700, 4500]),
        occupants_count: between(0, 4),
      },
      row: {
        electricity_old: oldReading,
        electricity_new: hasElectricity ? oldReading + between(0, 600) : null,
        manual_rent_amount: rng() < 0.15 ? between(1, 16) * 250_000 : null,
        manual_water_amount: rng() < 0.1 ? between(0, 4) * 50_000 : null,
        manual_service_amount: rng() < 0.1 ? between(0, 4) * 50_000 : null,
        manual_surcharge_amount: rng() < 0.15 ? between(0, 10) * 100_000 : null,
        manual_discount_amount: rng() < 0.15 ? between(-4, 10) * 100_000 : null,
        force_prorated_rent: rng() < 0.2,
      },
      buildingElectricityUnitPrice: pick([null, 3300, 3700]),
    });
  }

  return { prorate, cycle, electricity, money, fees, bill };
}
