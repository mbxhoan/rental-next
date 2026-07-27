/**
 * Ngày dạng lịch thuần (civil date), KHÔNG có timezone.
 *
 * Toàn bộ cột ngày trong DB là `date` (không giờ). Nếu dùng `Date` local
 * của JS thì mỗi lần parse/format sẽ lệch ±1 ngày tuỳ máy chủ — mà lệch 1
 * ngày là lệch tiền thuê. Nên mọi phép tính ở đây chạy trên chuỗi
 * 'YYYY-MM-DD' và số học UTC (UTC không có DST nên chính là lịch thuần).
 *
 * So sánh: chuỗi ISO so sánh theo thứ tự từ điển đúng bằng thứ tự thời gian,
 * nên dùng thẳng `<`, `>`, `===` — không cần hàm riêng.
 */

export type CivilDate = string; // 'YYYY-MM-DD'

const PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export function isCivilDate(value: unknown): value is CivilDate {
  return typeof value === 'string' && PATTERN.test(value) && toUtc(value) !== null;
}

/** Chuẩn hoá về 'YYYY-MM-DD'. Nhận string ISO, Date, hoặc chuỗi có kèm giờ. */
export function civil(value: CivilDate | Date | string): CivilDate {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error('Ngày không hợp lệ.');
    // Date từ driver DB luôn là UTC midnight của ngày đó.
    return value.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  const head = text.slice(0, 10);
  if (!PATTERN.test(head)) throw new Error(`Ngày không hợp lệ: ${value}`);
  const utc = toUtc(head);
  if (utc === null) throw new Error(`Ngày không hợp lệ: ${value}`);
  return head;
}

export function civilOrNull(value: CivilDate | Date | string | null | undefined): CivilDate | null {
  if (value === null || value === undefined || value === '') return null;
  return civil(value);
}

/** Ngày hôm nay theo giờ Việt Nam (mặc định Asia/Ho_Chi_Minh = UTC+7 cố định, không DST). */
export function today(timeZone = 'Asia/Ho_Chi_Minh'): CivilDate {
  // en-CA cho ra đúng định dạng YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function year(date: CivilDate): number {
  return Number(date.slice(0, 4));
}

export function month(date: CivilDate): number {
  return Number(date.slice(5, 7));
}

export function day(date: CivilDate): number {
  return Number(date.slice(8, 10));
}

/** 'YYYY-MM' — dùng để so sánh cùng tháng. */
export function yearMonth(date: CivilDate): string {
  return date.slice(0, 7);
}

export function daysInMonth(date: CivilDate): number {
  return new Date(Date.UTC(year(date), month(date), 0)).getUTCDate();
}

export function addDays(date: CivilDate, amount: number): CivilDate {
  return fromUtc(mustUtc(date) + amount * MS_PER_DAY);
}

/**
 * Cộng/trừ tháng, kẹp ngày về cuối tháng nếu tràn (31/03 - 1 tháng = 28/02).
 *
 * Lưu ý: PHP DateTime tràn sang tháng sau (31/03 - 1 tháng = 03/03). Ở
 * BillingCycleResolver thì subMonth chỉ gọi trên ngày mùng 1 nên hai cách
 * cho kết quả giống nhau; chọn kẹp vì đó là hành vi ít gây bất ngờ hơn.
 */
export function addMonths(date: CivilDate, amount: number): CivilDate {
  const y = year(date);
  const m = month(date);
  const d = day(date);
  const totalMonths = y * 12 + (m - 1) + amount;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = totalMonths - targetYear * 12 + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return format(targetYear, targetMonth, Math.min(d, lastDay));
}

export function subMonths(date: CivilDate, amount: number): CivilDate {
  return addMonths(date, -amount);
}

export function startOfMonth(date: CivilDate): CivilDate {
  return `${date.slice(0, 7)}-01`;
}

export function endOfMonth(date: CivilDate): CivilDate {
  return format(year(date), month(date), daysInMonth(date));
}

/** Đặt ngày trong tháng, tự kẹp theo độ dài tháng (Carbon safeSetDay). */
export function setDay(date: CivilDate, target: number): CivilDate {
  return format(year(date), month(date), Math.min(target, daysInMonth(date)));
}

/** Số ngày từ `from` đến `to` (có dấu). */
export function diffDays(from: CivilDate, to: CivilDate): number {
  return Math.round((mustUtc(to) - mustUtc(from)) / MS_PER_DAY);
}

/** Số ngày của kỳ, tính cả ngày đầu lẫn ngày cuối — khớp `diffInDays() + 1` bên PHP. */
export function inclusiveDays(from: CivilDate, to: CivilDate): number {
  return diffDays(from, to) + 1;
}

export function minDate(a: CivilDate, b: CivilDate): CivilDate {
  return a <= b ? a : b;
}

export function maxDate(a: CivilDate, b: CivilDate): CivilDate {
  return a >= b ? a : b;
}

/** 'dd/mm/yyyy' — định dạng hiển thị chuẩn của app. */
export function formatDMY(date: CivilDate): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
}

/** 'n/Y' — tháng không có số 0 đứng đầu, ví dụ '5/2026'. */
export function formatMonthLabel(date: CivilDate): string {
  return `${month(date)}/${year(date)}`;
}

/** 'm/Y' — tháng có số 0 đứng đầu, ví dụ '05/2026'. */
export function formatMY(date: CivilDate): string {
  return `${date.slice(5, 7)}/${date.slice(0, 4)}`;
}

function format(y: number, m: number, d: number): CivilDate {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function toUtc(date: string): number | null {
  const match = PATTERN.exec(date);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1) return null;
  const ms = Date.UTC(y, m - 1, d);
  // Bắt ngày không tồn tại kiểu 2026-02-30 (Date.UTC tự tràn sang tháng sau).
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) {
    return null;
  }
  return ms;
}

function mustUtc(date: CivilDate): number {
  const ms = toUtc(date);
  if (ms === null) throw new Error(`Ngày không hợp lệ: ${date}`);
  return ms;
}

function fromUtc(ms: number): CivilDate {
  return new Date(ms).toISOString().slice(0, 10);
}
