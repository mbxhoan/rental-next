/**
 * Bản sao của `app/Domain/Rental/Services/ProratedRentCalculator.php`.
 *
 * Quy tắc: khách ở đủ trọn kỳ chốt thì thu đúng tiền thuê tháng (kể cả kỳ
 * dài 31–32 ngày). Ở thiếu ngày nào thì chia theo mẫu số — 30 ngày cố định
 * hoặc số ngày thật của kỳ, tuỳ `prorate_mode`.
 */

import { type CivilDate, civil, civilOrNull, inclusiveDays, maxDate } from './date.ts';
import { rentalConfig, type ProrateMode } from './config.ts';
import { roundVnd } from './money.ts';

export type ProratedRentResult = {
  billStart: CivilDate;
  billEnd: CivilDate;
  daysInPeriod: number;
  occupiedDays: number;
  denominatorDays: number;
  calculatedAmount: number;
  manualAmount: number | null;
  amount: number;
  prorateMode: ProrateMode;
};

export type ProratedRentInput = {
  periodStart: CivilDate | Date | string;
  periodEnd: CivilDate | Date | string;
  leaseStartDate: CivilDate | Date | string;
  expectedEndDate?: CivilDate | Date | string | null;
  actualEndDate?: CivilDate | Date | string | null;
  monthlyRent: number;
  manualRentAmount?: number | null;
  prorateMode?: ProrateMode | null;
  /** Kỳ đầu ngắn: ép chia theo ngày dù khách ở trọn kỳ. */
  forceProratedRent?: boolean;
};

export function calculateProratedRent(input: ProratedRentInput): ProratedRentResult {
  const {
    monthlyRent,
    manualRentAmount = null,
    forceProratedRent = false,
  } = input;

  if (monthlyRent < 0) {
    throw new Error('Giá thuê tháng không hợp lệ.');
  }

  const periodStart = civil(input.periodStart);
  const periodEnd = civil(input.periodEnd);
  const leaseStartDate = civil(input.leaseStartDate);
  const expectedEndDate = civilOrNull(input.expectedEndDate);
  const actualEndDate = civilOrNull(input.actualEndDate);

  if (periodEnd < periodStart) {
    throw new Error('Kỳ tính tiền không hợp lệ.');
  }

  const billStart = maxDate(leaseStartDate, periodStart);

  let billEnd = periodEnd;
  for (const candidate of [expectedEndDate, actualEndDate]) {
    if (candidate !== null && candidate < billEnd) billEnd = candidate;
  }

  const daysInPeriod = inclusiveDays(periodStart, periodEnd);
  const prorateMode = resolveProrateMode(input.prorateMode ?? null);
  const denominatorDays = resolveDenominatorDays(periodStart, periodEnd, prorateMode);

  const occupiedDays = billEnd >= billStart ? inclusiveDays(billStart, billEnd) : 0;

  const coversFullCycle = occupiedDays > 0 && billStart === periodStart && billEnd === periodEnd;

  let calculatedAmount: number;
  if (occupiedDays === 0) {
    calculatedAmount = 0;
  } else if (coversFullCycle && !forceProratedRent) {
    calculatedAmount = monthlyRent;
  } else {
    calculatedAmount = roundVnd(
      (monthlyRent * occupiedDays) / denominatorDays,
      rentalConfig.defaults.moneyRounding,
    );
  }

  return {
    billStart,
    billEnd,
    daysInPeriod,
    occupiedDays,
    denominatorDays,
    calculatedAmount,
    manualAmount: manualRentAmount,
    amount: manualRentAmount !== null ? manualRentAmount : calculatedAmount,
    prorateMode,
  };
}

export function resolveProrateMode(prorateMode: ProrateMode | string | null): ProrateMode {
  const mode = prorateMode || rentalConfig.defaults.prorateMode;
  return mode === 'calendar_days' || mode === 'fixed_30_days' ? mode : 'fixed_30_days';
}

function resolveDenominatorDays(
  periodStart: CivilDate,
  periodEnd: CivilDate,
  prorateMode: ProrateMode,
): number {
  if (prorateMode === 'fixed_30_days') return 30;
  return Math.max(1, inclusiveDays(periodStart, periodEnd));
}
