/**
 * Bản sao của `app/Domain/Rental/Services/BillCalculator.php` (phần tính toán).
 *
 * Chỉ port `preview()` và các hàm thuần — phần ghi DB nằm ở
 * `src/server/bills.ts` để tách rõ tính tiền và ghi dữ liệu, đúng quy ước
 * "không tính tiền ngoài service" của dự án gốc.
 */

import { type CivilDate, addDays, civil } from './date.ts';
import { rentalConfig } from './config.ts';
import type { BillItemType } from './enums.ts';
import { normalizeMoneyInput } from './money.ts';
import { calculateProratedRent, type ProratedRentResult } from './prorated-rent.ts';
import {
  calculateElectricityCharge,
  FieldError,
  type ElectricityCharge,
} from './electricity.ts';
import {
  resolveElectricityUnitPrice,
  resolveServiceFee,
  resolveWaterFee,
  type BuildingFeeContext,
} from './fee-settings.ts';

/** Các cột của hợp đồng mà việc tính bill cần tới. */
export type LeaseForBilling = {
  id: number;
  start_date: CivilDate;
  expected_end_date: CivilDate | null;
  actual_end_date: CivilDate | null;
  monthly_rent: number;
  due_day: number | null;
  water_fee: number | null;
  service_fee: number | null;
  electricity_unit_price: number | null;
  occupants_count: number | null;
};

/** Dữ liệu người dùng nhập cho một dòng bill. */
export type BillRowInput = {
  electricity_old?: unknown;
  electricity_new?: unknown;
  electricity_unit_price?: unknown;
  manual_rent_amount?: unknown;
  manual_water_amount?: unknown;
  manual_service_amount?: unknown;
  manual_surcharge_amount?: unknown;
  manual_discount_amount?: unknown;
  force_prorated_rent?: boolean;
  manual_reason?: unknown;
  note?: unknown;
  meter_note?: unknown;
  meter_reset?: boolean;
};

export type AmountBlock = {
  calculatedAmount: number;
  manualAmount: number | null;
  amount: number;
};

export type BillPreview = {
  periodFrom: CivilDate;
  periodTo: CivilDate;
  dueDate: CivilDate;
  rent: ProratedRentResult;
  electricity: ElectricityCharge | null;
  water: AmountBlock;
  service: AmountBlock;
  surcharge: AmountBlock;
  discount: AmountBlock;
  electricityError: string | null;
  originalCalculatedAmount: number | null;
  manualAmount: number | null;
  totalAmount: number | null;
  isManualOverride: boolean;
};

export function previewBill(
  lease: LeaseForBilling,
  periodStartInput: CivilDate | Date | string,
  periodEndInput: CivilDate | Date | string,
  input: BillRowInput = {},
  building?: BuildingFeeContext,
): BillPreview {
  const [periodFrom, periodTo] = normalizePeriod(periodStartInput, periodEndInput);

  const manualRentAmount = normalizeMoneyInput(input.manual_rent_amount);
  const manualWaterAmount = normalizeMoneyInput(input.manual_water_amount);
  const manualServiceAmount = normalizeMoneyInput(input.manual_service_amount);
  const manualSurchargeAmount = normalizeMoneyInput(input.manual_surcharge_amount);
  const manualDiscountAmount = normalizeMoneyInput(input.manual_discount_amount);
  const forceProratedRent = Boolean(input.force_prorated_rent);

  const rent = calculateProratedRent({
    periodStart: periodFrom,
    periodEnd: periodTo,
    leaseStartDate: lease.start_date,
    expectedEndDate: lease.expected_end_date,
    actualEndDate: lease.actual_end_date,
    monthlyRent: Number(lease.monthly_rent),
    manualRentAmount,
    prorateMode: forceProratedRent ? 'fixed_30_days' : rentalConfig.defaults.prorateMode,
    forceProratedRent,
  });

  const electricityOld = normalizeMoneyInput(input.electricity_old) ?? 0;
  const electricityNew = normalizeMoneyInput(input.electricity_new);
  const electricityUnitPrice =
    normalizeMoneyInput(input.electricity_unit_price) ??
    (Number(lease.electricity_unit_price) || resolveElectricityUnitPrice(building));

  let electricity: ElectricityCharge | null = null;
  let electricityError: string | null = null;

  if (electricityNew !== null) {
    try {
      electricity = calculateElectricityCharge(electricityOld, electricityNew, electricityUnitPrice);
    } catch (error) {
      electricityError =
        error instanceof FieldError ? error.message : 'Số điện mới không hợp lệ.';
    }
  }

  const occupantsCount = Math.max(1, Number(lease.occupants_count ?? 1));
  const leaseWaterFee = Number(lease.water_fee ?? 0);
  const leaseServiceFee = Number(lease.service_fee ?? 0);

  // Phí ghi trên hợp đồng thắng bậc phí mặc định của cấu hình.
  const waterCalculatedAmount = leaseWaterFee > 0 ? leaseWaterFee : resolveWaterFee(occupantsCount);
  const serviceCalculatedAmount =
    leaseServiceFee > 0 ? leaseServiceFee : resolveServiceFee(occupantsCount);
  const surchargeCalculatedAmount = 0;
  const discountCalculatedAmount = 0;

  const water = block(waterCalculatedAmount, manualWaterAmount);
  const service = block(serviceCalculatedAmount, manualServiceAmount);
  const surcharge = block(surchargeCalculatedAmount, manualSurchargeAmount);
  const discount = block(discountCalculatedAmount, manualDiscountAmount);

  const isManualOverride = [
    manualRentAmount,
    manualWaterAmount,
    manualServiceAmount,
    manualSurchargeAmount,
    manualDiscountAmount,
  ].some((value) => value !== null);

  let originalCalculatedAmount: number | null = null;
  let manualAmount: number | null = null;
  let totalAmount: number | null = null;

  // Chưa nhập số điện thì chưa chốt được tổng tiền.
  if (electricity !== null) {
    originalCalculatedAmount = totalOf([
      { type: 'rent', amount: rent.calculatedAmount },
      { type: 'electricity', amount: electricity.amount },
      { type: 'water', amount: water.calculatedAmount },
      { type: 'service', amount: service.calculatedAmount },
      { type: 'surcharge', amount: surcharge.calculatedAmount },
      { type: 'discount', amount: discount.calculatedAmount },
    ]);

    manualAmount = totalOf([
      { type: 'rent', amount: rent.amount },
      { type: 'electricity', amount: electricity.amount },
      { type: 'water', amount: water.amount },
      { type: 'service', amount: service.amount },
      { type: 'surcharge', amount: surcharge.amount },
      { type: 'discount', amount: discount.amount },
    ]);

    totalAmount = isManualOverride ? manualAmount : originalCalculatedAmount;
  }

  return {
    periodFrom,
    periodTo,
    dueDate: resolveDueDate(lease, periodTo),
    rent,
    electricity,
    water,
    service,
    surcharge,
    discount,
    electricityError,
    originalCalculatedAmount,
    manualAmount: isManualOverride ? manualAmount : null,
    totalAmount,
    isManualOverride,
  };
}

/** Cộng dồn các dòng bill; dòng giảm trừ luôn bị trừ ra. Tổng không âm. */
export function totalOf(items: { type: BillItemType | string; amount: number }[]): number {
  let total = 0;

  for (const item of items) {
    const amount = Math.trunc(Number(item.amount) || 0);
    if (item.type === 'discount') {
      total -= Math.abs(amount);
      continue;
    }
    total += amount;
  }

  return Math.max(0, total);
}

export function outstandingOf(totalAmount: number, paidAmount: number): number {
  return Math.max(0, totalAmount - paidAmount);
}

/** Hạn thanh toán = ngày cuối kỳ + `due_day` ngày (kẹp 1..28). */
export function resolveDueDate(
  lease: Pick<LeaseForBilling, 'due_day'>,
  periodTo: CivilDate,
): CivilDate {
  const dueDay = Math.max(
    1,
    Math.min(28, Number(lease.due_day) || rentalConfig.defaults.defaultDueDay),
  );
  return addDays(periodTo, dueDay);
}

export function normalizePeriod(
  periodStartInput: CivilDate | Date | string,
  periodEndInput: CivilDate | Date | string,
): [CivilDate, CivilDate] {
  const periodFrom = civil(periodStartInput);
  const periodTo = civil(periodEndInput);
  if (periodTo < periodFrom) throw new Error('Kỳ bill không hợp lệ.');
  return [periodFrom, periodTo];
}

/** Bắt buộc có lý do khi điều chỉnh tay. */
export function assertManualReasonWhenNeeded(input: BillRowInput): void {
  const hasOverride = [
    input.manual_rent_amount,
    input.manual_water_amount,
    input.manual_service_amount,
    input.manual_surcharge_amount,
    input.manual_discount_amount,
  ].some((value) => normalizeMoneyInput(value) !== null);

  if (!hasOverride) return;

  const reason = typeof input.manual_reason === 'string' ? input.manual_reason.trim() : '';
  if (reason === '') {
    throw new FieldError('manual_reason', 'Vui lòng nhập lý do điều chỉnh.');
  }
}

function block(calculatedAmount: number, manualAmount: number | null): AmountBlock {
  return {
    calculatedAmount,
    manualAmount,
    amount: manualAmount ?? calculatedAmount,
  };
}
