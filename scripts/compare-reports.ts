/**
 * Đối chiếu BÁO CÁO THÁNG của bản Next với Laravel trên DỮ LIỆU THẬT.
 *
 * Mấy báo cáo này gần như chỉ là truy vấn tổng hợp, logic nằm ở mệnh đề WHERE.
 * Unit test hàm thuần không kiểm được gì, nên cách kiểm đúng là chạy cùng một
 * kỳ qua hai đường rồi so từng con số.
 *
 * Dùng: npm run compare-reports -- 2026-02,2026-03
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// Cho Node hiểu alias `@/` như Next, để script nạp đúng mã đang chạy thật chứ
// không phải một bản chép lại. Phải tự thêm đuôi `.ts` nữa: Next tự đoán phần
// mở rộng, Node thì không.
const srcRoot = new URL('../src/', import.meta.url);
registerHooks({
  resolve(specifier, context, next) {
    if (!specifier.startsWith('@/')) return next(specifier, context);

    const path = specifier.slice(2);
    const withExtension = /\.[a-z]+$/.test(path) ? path : `${path}.ts`;
    return next(new URL(withExtension, srcRoot).href, context);
  },
});

const phpScript = resolve(here, 'compare-reports-php.php');

if (!existsSync(resolve(here, '../../rental-manager/vendor/autoload.php'))) {
  console.error('Bỏ qua: chưa có rental-manager/vendor.');
  process.exit(0);
}

const months = (process.argv[2] ?? '').split(',').filter((month) => /^\d{4}-\d{2}$/.test(month));

if (months.length === 0) {
  console.error('Cần truyền tháng, ví dụ: npm run compare-reports -- 2026-02,2026-03');
  process.exit(1);
}

const { buildMonthlyReport } = await import('../src/server/reports.ts');
const { sql } = await import('../src/lib/db.ts');

const phpRaw = execFileSync(
  'php',
  ['-d', 'error_reporting=0', '-d', 'display_errors=0', phpScript, months.join(',')],
  { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
);
const expected = JSON.parse(phpRaw.slice(phpRaw.indexOf('{'))) as Record<string, unknown>;

let checked = 0;
let nonZero = 0;
const failures: string[] = [];

for (const month of months) {
  const actual = await buildMonthlyReport(month, null);
  const laravel = expected[month] as Record<string, Record<string, unknown>>;

  if (!laravel) {
    failures.push(`${month}: Laravel không trả về kỳ này`);
    continue;
  }

  for (const section of ['revenue', 'expenses', 'operating', 'deposits', 'cash'] as const) {
    const mine = actual[section] as unknown as Record<string, unknown>;

    for (const [key, want] of Object.entries(laravel[section])) {
      const got = (mine as Record<string, unknown>)[key];
      checked++;
      if (JSON.stringify(want) !== JSON.stringify(got)) {
        failures.push(
          `${month} · ${section}.${key}: Laravel=${JSON.stringify(want)} Next=${JSON.stringify(got)}`,
        );
      } else if (isNonZero(want)) {
        nonZero++;
      }
    }
  }
}

await sql.end();

console.log(`Đối chiếu ${months.length} kỳ, ${checked} giá trị (${nonZero} giá trị khác 0).`);

if (failures.length > 0) {
  console.error(`\n❌ Lệch ${failures.length} chỗ:\n`);
  for (const failure of failures) console.error('  ' + failure);
  process.exit(1);
}

if (nonZero === 0) {
  console.warn('\n⚠️  Mọi giá trị đều bằng 0 — khớp nhưng chưa chứng minh được gì. Chọn kỳ có dữ liệu.');
  process.exit(1);
}

console.log('✅ Khớp tuyệt đối với Laravel trên dữ liệu thật.');

function isNonZero(value: unknown): boolean {
  if (typeof value === 'number') return value !== 0;
  if (value && typeof value === 'object') return Object.values(value).some((v) => v !== 0);
  return false;
}
