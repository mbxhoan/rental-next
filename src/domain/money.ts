/**
 * Bản sao của `app/Domain/Rental/Services/Money.php`.
 *
 * Mọi số tiền là số nguyên VND. Không dùng số thực để lưu tiền.
 */

import { rentalConfig, type MoneyRounding } from './config.ts';

/**
 * Làm tròn theo cấu hình.
 *
 * PHP `round()` làm tròn nửa ra xa số 0 (2.5 → 3, -2.5 → -3), còn
 * `Math.round` của JS làm tròn nửa lên (-2.5 → -2). Số tiền âm có xuất hiện
 * (dòng giảm trừ) nên phải bám đúng PHP, không dùng thẳng Math.round.
 */
export function roundVnd(amount: number, mode: MoneyRounding = 'nearest_1000'): number {
  switch (mode) {
    case 'none':
      return phpRound(amount);
    case 'nearest_500':
      return phpRound(amount / 500) * 500;
    case 'nearest_1000':
    default:
      return phpRound(amount / 1000) * 1000;
  }
}

export function roundVndDefault(amount: number): number {
  return roundVnd(amount, rentalConfig.defaults.moneyRounding);
}

/**
 * Chuẩn hoá số tiền người dùng nhập.
 *
 * Bỏ dấu phân cách '.', ',' và khoảng trắng — người dùng hay gõ "5.800.000".
 * Trả về null nếu không có giá trị, để phân biệt "không nhập" với "nhập 0".
 */
export function normalizeMoneyInput(value: unknown): number | null {
  if (value === null || value === undefined || value === false) return null;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return Number.isInteger(value) ? value : phpRound(value);
  }

  if (typeof value === 'string') {
    const cleaned = value.replace(/[,.\s]/g, '').trim();
    if (cleaned === '') return null;
    const parsed = Number(cleaned);
    if (!Number.isFinite(parsed)) return null;
    return phpRound(parsed);
  }

  return null;
}

export function assertPositive(amount: number, message = 'Số tiền phải lớn hơn 0.'): void {
  if (amount <= 0) throw new Error(message);
}

/** '5.800.000' — định dạng tiền của app (dấu chấm ngăn nghìn, giống number_format PHP). */
export function formatMoney(amount: number | string | null | undefined): string {
  const value = Math.trunc(Number(amount ?? 0)) || 0;
  const sign = value < 0 ? '-' : '';
  return sign + Math.abs(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Làm tròn nửa ra xa số 0, giống `round()` của PHP. */
function phpRound(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}
