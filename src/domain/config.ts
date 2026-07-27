/**
 * Bản sao của `config/rental.php` bên Laravel.
 *
 * Giữ nguyên tên biến môi trường RENTAL_* để hai app đọc cùng một cấu hình,
 * tránh trường hợp Laravel tính ra một số mà Next.js tính ra số khác.
 */

export type ProrateMode = 'calendar_days' | 'fixed_30_days';
export type MoneyRounding = 'none' | 'nearest_500' | 'nearest_1000';

export type FeeTier = { min: number; max: number | null; amount: number };

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envStr(key: string, fallback: string): string {
  const raw = process.env[key];
  return raw === undefined || raw.trim() === '' ? fallback : raw.trim();
}

/**
 * Đọc env mỗi lần truy cập (getter) chứ không chốt lúc import.
 *
 * Lý do: script và test đặt biến môi trường sau khi module đã được import,
 * nếu chốt sẵn thì cấu hình bị đóng băng và test hoá ra không kiểm tra gì cả.
 */
export const rentalConfig = {
  currency: 'VND',
  get timezone() {
    return envStr('APP_TIMEZONE', 'Asia/Ho_Chi_Minh');
  },
  defaults: {
    // Laravel default là fixed_30_days; .env production đang đặt calendar_days.
    get prorateMode() {
      return envStr('RENTAL_PRORATE_MODE', 'fixed_30_days') as ProrateMode;
    },
    get moneyRounding() {
      return envStr('RENTAL_MONEY_ROUNDING', 'nearest_1000') as MoneyRounding;
    },
    get defaultElectricityUnitPrice() {
      return envInt('RENTAL_DEFAULT_ELECTRICITY_UNIT_PRICE', 3700);
    },
    get defaultDueDay() {
      return envInt('RENTAL_DEFAULT_DUE_DAY', 5);
    },
    get defaultBillingDay() {
      return envInt('RENTAL_DEFAULT_BILLING_DAY', 24);
    },
    get defaultDepositAmount() {
      return envInt('RENTAL_DEFAULT_DEPOSIT_AMOUNT', 7_500_000);
    },
    get reminderDaysBeforeDue() {
      return envInt('RENTAL_REMINDER_DAYS_BEFORE_DUE', 3);
    },
    get companyName() {
      return envStr('RENTAL_COMPANY_NAME', 'Nhà trọ');
    },
    get companyPhone() {
      return envStr('RENTAL_COMPANY_PHONE', '');
    },
    get companyEmail() {
      return envStr('RENTAL_COMPANY_EMAIL', '');
    },
    get companyAddress() {
      return envStr('RENTAL_COMPANY_ADDRESS', '');
    },
    get pdfFooterNote() {
      return envStr('RENTAL_PDF_FOOTER_NOTE', 'Vui lòng thanh toán đúng hạn. Cảm ơn quý khách.');
    },
  },
  fees: {
    water: [
      { min: 1, max: 1, amount: 100_000 },
      { min: 2, max: null, amount: 200_000 },
    ] as FeeTier[],
    service: [
      { min: 1, max: 1, amount: 150_000 },
      { min: 2, max: null, amount: 200_000 },
    ] as FeeTier[],
    commissionRate: 0.8,
  },
  helperTexts: {
    depositNotRevenue: 'Tiền cọc không tính là doanh thu.',
    ownerWithdrawalNotExpense: 'Rút tiền chủ nhà chỉ làm giảm quỹ, không phải chi phí.',
    oldElectricityFromLatestBill: 'Số điện cũ được lấy từ kỳ bill gần nhất.',
  },
} as const;

export type RentalConfig = typeof rentalConfig;
