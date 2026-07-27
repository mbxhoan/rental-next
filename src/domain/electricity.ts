/**
 * Bản sao của `ElectricityChargeCalculator.php` và `MeterReadingCalculator.php`.
 */

import { rentalConfig } from './config.ts';

export type ElectricityCharge = {
  old: number;
  new: number;
  usage: number;
  unitPrice: number;
  amount: number;
};

/** Lỗi nghiệp vụ có gắn tên field để hiển thị đúng chỗ trên form. */
export class FieldError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = 'FieldError';
    this.field = field;
  }
}

export function calculateElectricityCharge(
  oldReading: number,
  newReading: number,
  unitPrice?: number | null,
): ElectricityCharge {
  assertValidReadings(oldReading, newReading);

  const resolvedUnitPrice =
    unitPrice ?? rentalConfig.defaults.defaultElectricityUnitPrice;
  const usage = newReading - oldReading;

  return {
    old: oldReading,
    new: newReading,
    usage,
    unitPrice: resolvedUnitPrice,
    amount: usage * resolvedUnitPrice,
  };
}

export function assertValidReadings(oldReading: number, newReading: number): void {
  if (oldReading < 0 || newReading < 0) {
    throw new FieldError('electricity_new', 'Chỉ số điện không được âm.');
  }

  if (newReading < oldReading) {
    throw new FieldError('electricity_new', 'Số điện mới không được nhỏ hơn số điện cũ.');
  }
}
