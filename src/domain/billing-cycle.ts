/**
 * Bản sao của `app/Domain/Rental/Services/BillingCycleResolver.php`.
 *
 * Bill tháng N = ngày chốt tháng N-1 → ngày chốt tháng N.
 * Ví dụ ngày chốt 24, tháng 05/2026 → kỳ 24/04/2026 → 24/05/2026.
 */

import {
  type CivilDate,
  civil,
  endOfMonth,
  inclusiveDays,
  setDay,
  startOfMonth,
  subMonths,
  yearMonth,
} from './date.ts';
import {
  resolveBillingDay,
  resolveBillingPeriodStartDay,
  type BuildingFeeContext,
  type RoomFeeContext,
} from './fee-settings.ts';

export type BillingPeriod = {
  periodFrom: CivilDate;
  periodTo: CivilDate;
  periodStartDay: number;
  billingDay: number;
  labelMonth: CivilDate;
  isInitialPartialPeriod?: boolean;
};

export type CycleContext = {
  room?: RoomFeeContext;
  building?: BuildingFeeContext;
};

export function calculatePeriod(
  context: CycleContext,
  month: CivilDate | Date | string,
): BillingPeriod {
  const reference = startOfMonth(civil(month));
  const billingDay = resolveBillingDay(context.room, context.building);
  const periodStartDay = resolveBillingPeriodStartDay(context.room, context.building);

  // Ngày bắt đầu nhỏ hơn ngày chốt → kỳ nằm gọn trong tháng đang chốt.
  const periodFromReference = periodStartDay < billingDay ? reference : subMonths(reference, 1);

  return {
    periodFrom: setDay(periodFromReference, periodStartDay),
    periodTo: setDay(reference, billingDay),
    periodStartDay,
    billingDay,
    labelMonth: reference,
  };
}

export type LeaseCycleInput = {
  startDate: CivilDate | Date | string | null;
  /** period_to lớn nhất của bill chưa huỷ, null nếu hợp đồng chưa có bill nào. */
  latestBillPeriodTo?: CivilDate | Date | string | null;
  hasExistingBills?: boolean | null;
};

/**
 * Kỳ bill cho hợp đồng, có xử lý riêng bill đầu tiên.
 *
 * Khách vào giữa tháng và chưa từng có bill:
 * - vào trước/đúng ngày chốt → kỳ kết thúc ở ngày chốt;
 * - vào sau ngày chốt → kỳ kéo tới cuối tháng để vẫn thu được kỳ đầu.
 */
export function calculatePeriodForLease(
  context: CycleContext,
  lease: LeaseCycleInput,
  month: CivilDate | Date | string,
): BillingPeriod {
  const reference = startOfMonth(civil(month));
  const period = calculatePeriod(context, reference);

  const latestBillPeriodTo =
    lease.hasExistingBills === false
      ? null
      : lease.latestBillPeriodTo
        ? civil(lease.latestBillPeriodTo)
        : null;

  const hasExistingBills = lease.hasExistingBills ?? latestBillPeriodTo !== null;

  // Đã có bill nhưng bỏ sót vài tháng → neo kỳ mới theo ngày chốt của bill gần nhất.
  if (latestBillPeriodTo !== null && latestBillPeriodTo < startOfMonth(reference)) {
    const anchorDay = Number(latestBillPeriodTo.slice(8, 10));
    return {
      ...period,
      periodFrom: setDay(subMonths(reference, 1), anchorDay),
      periodTo: setDay(reference, anchorDay),
      periodStartDay: anchorDay,
      billingDay: anchorDay,
    };
  }

  if (hasExistingBills || !lease.startDate) {
    return period;
  }

  const leaseStartDate = civil(lease.startDate);

  if (yearMonth(leaseStartDate) !== yearMonth(period.labelMonth)) {
    return period;
  }

  const originalPeriodFrom = period.periodFrom;
  const originalPeriodTo = period.periodTo;
  const next: BillingPeriod = { ...period };

  if (leaseStartDate > next.periodFrom) {
    next.periodFrom = leaseStartDate;
  }

  if (leaseStartDate > next.periodTo) {
    next.periodTo = endOfMonth(reference);
    next.billingDay = Number(next.periodTo.slice(8, 10));
  }

  if (
    next.periodFrom !== originalPeriodFrom ||
    next.periodTo !== originalPeriodTo ||
    inclusiveDays(next.periodFrom, next.periodTo) < 30
  ) {
    next.isInitialPartialPeriod = true;
  }

  return next;
}

/** Số ngày của kỳ chốt, tính cả hai đầu. */
export function daysInCycle(context: CycleContext, month: CivilDate | Date | string): number {
  const period = calculatePeriod(context, month);
  return inclusiveDays(period.periodFrom, period.periodTo);
}
