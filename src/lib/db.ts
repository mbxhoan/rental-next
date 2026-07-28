import 'server-only';
import postgres from 'postgres';

/**
 * Kết nối trực tiếp tới Supabase Postgres.
 *
 * Hai điều chỉnh bắt buộc, nếu thiếu là sai tiền hoặc sai ngày:
 *
 * 1. Cột `date` phải trả về chuỗi 'YYYY-MM-DD'. Mặc định driver dựng thành
 *    `Date` ở nửa đêm UTC rồi mọi thao tác local-time sẽ lệch 1 ngày.
 * 2. Cột `bigint` (mọi cột tiền) mặc định trả về chuỗi để khỏi mất chính xác.
 *    Số tiền VND luôn nhỏ hơn Number.MAX_SAFE_INTEGER nên ép về number an toàn.
 *
 * Serverless: pool nhỏ, và nếu dùng transaction pooler (cổng 6543) của
 * Supabase thì phải tắt prepared statement.
 */

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('Thiếu biến môi trường DATABASE_URL.');
}

const isTransactionPooler = connectionString.includes(':6543');

declare global {
  // eslint-disable-next-line no-var
  var __rentalSql: ReturnType<typeof createClient> | undefined;
}

function createClient() {
  return postgres(connectionString!, {
    // Vercel chạy nhiều instance ngắn hạn — mỗi instance chỉ cần vài kết nối.
    max: Number(process.env.DATABASE_POOL_MAX ?? 3),
    idle_timeout: 20,
    connect_timeout: 15,
    // Transaction pooler không hỗ trợ prepared statement.
    prepare: !isTransactionPooler,
    types: {
      // OID 1082 = date. Giữ nguyên chuỗi, không dựng thành Date.
      date: {
        to: 1082,
        from: [1082],
        serialize: (value: string) => value,
        parse: (value: string) => value,
      },
      // OID 20 = int8/bigint. Cột tiền + khoá ngoại đều là bigint.
      bigint: {
        to: 20,
        from: [20],
        serialize: (value: number | bigint) => String(value),
        parse: (value: string) => Number(value),
      },
    },
    transform: { undefined: null },
  });
}

export const sql = globalThis.__rentalSql ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__rentalSql = sql;
}

/** Ép về số nguyên — dùng cho cột numeric/decimal driver trả về chuỗi. */
export function toInt(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

export function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
