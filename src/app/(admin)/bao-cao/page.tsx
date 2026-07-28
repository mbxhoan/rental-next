import { requireRole } from '@/lib/auth';
import { formatDMY, today } from '@/domain/date';
import { formatMoney } from '@/domain/money';
import { rentalConfig } from '@/domain/config';
import {
  BILL_ITEM_TYPE_LABELS,
  EXPENSE_CATEGORY_LABELS,
  type ExpenseCategory,
} from '@/domain/enums';
import { Card, Grid, PageHeader, StatCard } from '@/components/ui';
import { MonthPicker } from '@/components/month-picker';
import { listBuildings } from '@/server/queries';
import { buildMonthlyReport } from '@/server/reports';

export const metadata = { title: 'Báo cáo tháng — Quản lý nhà trọ' };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ thang?: string; nha?: string }>;
}) {
  await requireRole('admin', 'staff');

  const { thang, nha } = await searchParams;
  const now = today(rentalConfig.timezone);
  const month = /^\d{4}-\d{2}$/.test(thang ?? '') ? thang! : now.slice(0, 7);

  const buildings = await listBuildings();
  const buildingId = nha ? Number(nha) : null;
  const building = buildings.find((item) => item.id === buildingId) ?? null;

  const report = await buildMonthlyReport(month, building?.id ?? null);
  const { revenue, expenses, operating, deposits, cash } = report;

  const scope = building ? building.name : 'tất cả các nhà';

  return (
    <>
      <PageHeader
        title="Báo cáo tháng"
        subtitle={`${scope} · ${formatDMY(report.range.from)} → ${formatDMY(report.range.to)}`}
      />

      <MonthPicker
        basePath="/bao-cao"
        month={month}
        monthLabel="Tháng"
        buildingId={building?.id ?? null}
        buildings={buildings.map((item) => ({ id: item.id, name: item.name }))}
        allowAllBuildings
      />

      <div className="mt-5 space-y-6">
        <Section title="Doanh thu" hint="Chỉ tính bill đã chốt — bỏ nháp và đã huỷ.">
          <Grid min="13rem">
            <StatCard
              label="Tổng bill"
              value={formatMoney(revenue.totalBill)}
              hint={`${revenue.billCount} bill trong kỳ`}
              icon="🧾"
              tone="brand"
            />
            <StatCard
              label="Đã thu"
              value={formatMoney(revenue.paidTotal)}
              hint="Phiếu thu đã xác nhận"
              icon="💵"
              tone="emerald"
            />
            <StatCard
              label="Còn phải thu"
              value={formatMoney(revenue.outstandingTotal)}
              icon="⏳"
              tone={revenue.outstandingTotal > 0 ? 'rose' : 'emerald'}
            />
          </Grid>

          <BreakdownTable
            rows={Object.entries(revenue.breakdown).map(([key, amount]) => ({
              label: BILL_ITEM_TYPE_LABELS[key] ?? key,
              amount,
            }))}
            total={revenue.totalBill}
            totalLabel="Tổng bill"
          />
        </Section>

        <Section title="Chi phí" hint="Nhập bên bản Laravel, bản này chỉ đọc.">
          <BreakdownTable
            rows={Object.entries(expenses.breakdown).map(([key, amount]) => ({
              label: EXPENSE_CATEGORY_LABELS[key as ExpenseCategory] ?? key,
              amount,
            }))}
            total={expenses.total}
            totalLabel="Tổng chi"
          />
        </Section>

        <Section
          title="Lợi nhuận vận hành"
          hint="Chỉ tính điện, nước, phí dịch vụ trừ chi phí vận hành. KHÔNG tính tiền phòng."
        >
          <Grid min="13rem">
            <StatCard
              label="Thu phí vận hành"
              value={formatMoney(operating.incomeTotal)}
              icon="⚡"
              tone="brand"
            />
            <StatCard
              label="Chi vận hành"
              value={formatMoney(operating.expenseTotal)}
              icon="🧰"
              tone="amber"
            />
            <StatCard
              label="Lãi vận hành"
              value={formatMoney(operating.operatingProfit)}
              icon={operating.operatingProfit >= 0 ? '📈' : '📉'}
              tone={operating.operatingProfit >= 0 ? 'emerald' : 'rose'}
            />
          </Grid>

          <BreakdownTable
            rows={Object.entries(operating.incomeBreakdown).map(([key, amount]) => ({
              label: BILL_ITEM_TYPE_LABELS[key] ?? key,
              amount,
            }))}
            total={operating.incomeTotal}
            totalLabel="Tổng thu phí"
          />
        </Section>

        <Section title="Tiền cọc" hint={rentalConfig.helperTexts.depositNotRevenue}>
          <Grid min="12rem">
            <StatCard label="Thu cọc" value={formatMoney(deposits.collected)} icon="🔐" tone="brand" />
            <StatCard
              label="Đang giữ"
              value={formatMoney(deposits.holding)}
              hint="Số dư hiện tại, không theo kỳ"
              icon="🏦"
              tone="accent"
            />
            <StatCard label="Hoàn cọc" value={formatMoney(deposits.refunded)} icon="↩️" tone="amber" />
            <StatCard label="Trừ cọc" value={formatMoney(deposits.deducted)} icon="✂️" tone="rose" />
          </Grid>
        </Section>

        <Section title="Quỹ tiền" hint={rentalConfig.helperTexts.ownerWithdrawalNotExpense}>
          <Card className="overflow-hidden">
            <dl className="divide-y divide-slate-100">
              <CashRow label="Số dư đầu kỳ" amount={cash.openingBalance} />
              <CashRow label="Thu tiền bill" amount={cash.billPaymentInflow} sign="+" />
              <CashRow label="Thu cọc" amount={cash.depositCollectInflow} sign="+" />
              <CashRow label="Chi phí" amount={cash.expensesOutflow} sign="−" />
              <CashRow label="Hoàn cọc" amount={cash.depositRefundOutflow} sign="−" />
              <CashRow label="Chủ nhà rút" amount={cash.ownerWithdrawalOutflow} sign="−" />
              <CashRow label="Điều chỉnh quỹ" amount={cash.adjustmentNet} sign="+" />
              <CashRow label="Số dư cuối kỳ" amount={cash.closingBalance} strong />
            </dl>
          </Card>
        </Section>
      </div>

      <p className="mt-6 text-xs text-slate-400">
        Số liệu đọc trực tiếp từ database dùng chung, khớp với báo cáo bên bản Laravel.
      </p>
    </>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-sm font-bold tracking-wide text-slate-500 uppercase">{title}</h2>
      {hint ? <p className="mt-0.5 mb-2 text-xs text-slate-400">{hint}</p> : <div className="mb-2" />}
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function BreakdownTable({
  rows,
  total,
  totalLabel,
}: {
  rows: { label: string; amount: number }[];
  total: number;
  totalLabel: string;
}) {
  const visible = rows.filter((row) => row.amount !== 0);

  // Kỳ rỗng thì chỉ một dòng, đừng chiếm nguyên khung trống to đùng.
  if (visible.length === 0) {
    return (
      <Card className="px-4 py-3 text-sm text-slate-400">Kỳ này chưa có số liệu.</Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <dl className="divide-y divide-slate-100">
        {visible.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
            <dt className="min-w-0 text-sm text-slate-600">{row.label}</dt>
            <dd className="tabular shrink-0 font-semibold text-slate-900">
              {formatMoney(row.amount)}
            </dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-3 bg-brand-50 px-4 py-2.5">
          <dt className="min-w-0 text-sm font-semibold text-brand-700">{totalLabel}</dt>
          <dd className="tabular shrink-0 text-lg font-bold text-brand-700">{formatMoney(total)}</dd>
        </div>
      </dl>
    </Card>
  );
}

function CashRow({
  label,
  amount,
  sign,
  strong = false,
}: {
  label: string;
  amount: number;
  sign?: '+' | '−';
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 px-4 py-2.5 ${strong ? 'bg-brand-50' : ''}`}
    >
      <dt className={`min-w-0 text-sm ${strong ? 'font-semibold text-brand-700' : 'text-slate-600'}`}>
        {label}
      </dt>
      <dd
        className={`tabular shrink-0 ${
          strong ? 'text-lg font-bold text-brand-700' : 'font-semibold text-slate-900'
        }`}
      >
        {sign && amount !== 0 ? `${sign} ` : ''}
        {formatMoney(amount)}
      </dd>
    </div>
  );
}
