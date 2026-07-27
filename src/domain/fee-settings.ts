/**
 * Bản sao của `app/Domain/Rental/Services/FeeSettingResolver.php`.
 *
 * Thứ tự ưu tiên ngày chốt: phòng → nhà → cấu hình chung.
 */

import { rentalConfig, type FeeTier } from './config.ts';

/** Chỉ cần các cột liên quan, không cần cả model. */
export type BuildingFeeContext = {
  default_billing_day?: number | null;
  default_electricity_unit_price?: number | string | null;
} | null;

export type RoomFeeContext = {
  billing_day_override?: number | null;
  billing_period_start_day?: number | null;
} | null;

export function resolveWaterFee(occupantsCount: number): number {
  return resolveTier(rentalConfig.fees.water, occupantsCount, 100_000);
}

export function resolveServiceFee(occupantsCount: number): number {
  return resolveTier(rentalConfig.fees.service, occupantsCount, 150_000);
}

export function resolveDefaultDepositAmount(): number {
  return rentalConfig.defaults.defaultDepositAmount;
}

export function resolveElectricityUnitPrice(building?: BuildingFeeContext): number {
  const buildingPrice = Number(building?.default_electricity_unit_price ?? 0);
  if (buildingPrice > 0) return buildingPrice;
  return rentalConfig.defaults.defaultElectricityUnitPrice;
}

export function resolveCommissionRate(): number {
  return rentalConfig.fees.commissionRate;
}

export function resolveBillingDay(
  room?: RoomFeeContext,
  building?: BuildingFeeContext,
): number {
  const roomOverride = Number(room?.billing_day_override ?? 0);
  if (roomOverride > 0) return clampBillingDay(roomOverride);

  const buildingDefault = Number(building?.default_billing_day ?? 0);
  if (buildingDefault > 0) return clampBillingDay(buildingDefault);

  return clampBillingDay(rentalConfig.defaults.defaultBillingDay);
}

export function resolveBillingPeriodStartDay(
  room?: RoomFeeContext,
  building?: BuildingFeeContext,
): number {
  const startDay = Number(room?.billing_period_start_day ?? 0);
  if (startDay > 0) return clampBillingDay(startDay);
  return resolveBillingDay(room, building);
}

function resolveTier(tiers: FeeTier[], occupantsCount: number, fallback: number): number {
  const count = Math.max(1, occupantsCount);

  for (const tier of tiers) {
    if (count < tier.min) continue;
    if (tier.max === null || count <= tier.max) return tier.amount;
  }

  return fallback;
}

function clampBillingDay(dayOfMonth: number): number {
  return Math.max(1, Math.min(31, dayOfMonth));
}
