import 'server-only';
import { sql } from '@/lib/db';
import { endOfMonth, startOfMonth, type CivilDate } from '@/domain/date';
import {
  CASH_TRANSACTION_TYPES,
  DEPOSIT_TRANSACTION_TYPES,
  EXPENSE_CATEGORIES,
  type CashTransactionType,
  type DepositTransactionType,
  type ExpenseCategory,
} from '@/domain/enums';

/**
 * Báo cáo tháng lấy trực tiếp từ Supabase.
 *
 * Khác với công thức tính bill, mấy báo cáo này gần như chỉ là truy vấn tổng
 * hợp: logic nằm ở mệnh đề WHERE chứ không phải phép tính. Phạm vi tháng được
 * áp dụng trực tiếp trong các truy vấn Supabase.
 *
 * Lợi nhuận vận hành cũng dùng cùng phạm vi tháng, không cộng dồn ngoài kỳ.
 */

export type MonthlyReport = Awaited<ReturnType<typeof buildMonthlyReport>>;

type Range = { from: CivilDate; to: CivilDate };

export async function buildMonthlyReport(month: string, buildingId: number | null) {
  const range: Range = { from: startOfMonth(`${month}-01`), to: endOfMonth(`${month}-01`) };

  const [revenue, expenses, operating, deposits, cash] = await Promise.all([
    buildRevenue(range, buildingId),
    buildExpenses(range, buildingId),
    buildOperating(range, buildingId),
    buildDeposits(range, buildingId),
    buildCash(range, buildingId),
  ]);

  return { month, range, revenue, expenses, operating, deposits, cash };
}

/** Bill nào được tính: đã chốt trở đi, bỏ nháp và đã huỷ. */
const COUNTED_BILL_STATUSES = ['sent', 'partial', 'paid', 'overdue'];

const REVENUE_ITEM_TYPES = [
  'rent',
  'electricity',
  'water',
  'service',
  'surcharge',
  'discount',
  'manual_adjustment',
];

async function buildRevenue(range: Range, buildingId: number | null) {
  const bills = await sql<{ id: number; total_amount: number }[]>`
    select bl.id, bl.total_amount
    from bills bl
    join rooms r on r.id = bl.room_id
    where bl.status = any(${COUNTED_BILL_STATUSES})
      and bl.period_from >= ${range.from}
      and bl.period_to <= ${range.to}
      and (${buildingId}::int is null or r.building_id = ${buildingId})
  `;

  const billIds = bills.map((bill) => bill.id);
  const totalBill = bills.reduce((sum, bill) => sum + bill.total_amount, 0);

  const breakdown = zeroed(REVENUE_ITEM_TYPES);
  let paidTotal = 0;

  if (billIds.length > 0) {
    const [items, paid] = await Promise.all([
      sql<{ type: string; total_amount: number }[]>`
        select type, sum(amount)::bigint as total_amount
        from bill_items
        where bill_id = any(${billIds}) and type = any(${REVENUE_ITEM_TYPES})
        group by type
      `,
      sql<{ total: number }[]>`
        select coalesce(sum(amount), 0)::bigint as total
        from payments
        where bill_id = any(${billIds}) and status = 'confirmed'
      `,
    ]);

    for (const item of items) breakdown[item.type] = item.total_amount;
    paidTotal = paid[0]?.total ?? 0;
  }

  const outstanding = Math.max(0, totalBill - paidTotal);

  return {
    breakdown,
    billCount: bills.length,
    totalBill,
    paidTotal,
    outstandingTotal: outstanding,
    debtTotal: outstanding,
  };
}

async function buildExpenses(range: Range, buildingId: number | null) {
  const rows = await sql<{ category: string; total_amount: number }[]>`
    select category, sum(amount)::bigint as total_amount
    from expenses
    where category = any(${EXPENSE_CATEGORIES as unknown as string[]})
      and expense_date >= ${range.from}
      and expense_date <= ${range.to}
      and (${buildingId}::int is null or building_id = ${buildingId})
    group by category
  `;

  const breakdown = zeroed(EXPENSE_CATEGORIES as unknown as string[]) as Record<
    ExpenseCategory,
    number
  >;
  for (const row of rows) {
    if (row.category in breakdown) breakdown[row.category as ExpenseCategory] = row.total_amount;
  }

  return { breakdown, total: sum(Object.values(breakdown)) };
}

/** Chỉ điện/nước/dịch vụ. KHÔNG tính tiền phòng. */
const OPERATING_ITEM_TYPES = ['electricity', 'water', 'service'];

async function buildOperating(range: Range, buildingId: number | null) {
  const [incomeRows, expenseRows] = await Promise.all([
    sql<{ type: string; total_amount: number }[]>`
      select bi.type, sum(bi.amount)::bigint as total_amount
      from bill_items bi
      join bills bl on bl.id = bi.bill_id
      join rooms r on r.id = bl.room_id
      where bi.type = any(${OPERATING_ITEM_TYPES})
        and bl.status = any(${COUNTED_BILL_STATUSES})
        and bl.period_from >= ${range.from}
        and bl.period_to <= ${range.to}
        and (${buildingId}::int is null or r.building_id = ${buildingId})
      group by bi.type
    `,
    sql<{ category: string; total_amount: number }[]>`
      select category, sum(amount)::bigint as total_amount
      from expenses
      where category = any(${EXPENSE_CATEGORIES as unknown as string[]})
        and expense_date >= ${range.from}
        and expense_date <= ${range.to}
        and (${buildingId}::int is null or building_id = ${buildingId})
      group by category
    `,
  ]);

  const incomeBreakdown = zeroed(OPERATING_ITEM_TYPES);
  for (const row of incomeRows) incomeBreakdown[row.type] = row.total_amount;

  const expenseBreakdown = zeroed(EXPENSE_CATEGORIES as unknown as string[]);
  for (const row of expenseRows) {
    if (row.category in expenseBreakdown) expenseBreakdown[row.category] = row.total_amount;
  }

  const incomeTotal = sum(Object.values(incomeBreakdown));
  const expenseTotal = sum(Object.values(expenseBreakdown));

  return {
    incomeBreakdown,
    incomeTotal,
    expenseBreakdown,
    expenseTotal,
    operatingProfit: incomeTotal - expenseTotal,
  };
}

async function buildDeposits(range: Range, buildingId: number | null) {
  const [rows, holding] = await Promise.all([
    sql<{ type: string; total_amount: number }[]>`
      select dt.type, sum(dt.amount)::bigint as total_amount
      from deposit_transactions dt
      join deposits d on d.id = dt.deposit_id
      join rooms r on r.id = d.room_id
      where dt.transaction_date >= ${range.from}
        and dt.transaction_date <= ${range.to}
        and (${buildingId}::int is null or r.building_id = ${buildingId})
      group by dt.type
    `,
    // Cọc đang giữ là số dư hiện tại, KHÔNG lọc theo tháng.
    sql<{ total: number }[]>`
      select coalesce(sum(d.current_balance), 0)::bigint as total
      from deposits d
      join rooms r on r.id = d.room_id
      where (${buildingId}::int is null or r.building_id = ${buildingId})
    `,
  ]);

  const byType = zeroed(DEPOSIT_TRANSACTION_TYPES as unknown as string[]) as Record<
    DepositTransactionType,
    number
  >;
  for (const row of rows) {
    if (row.type in byType) byType[row.type as DepositTransactionType] = row.total_amount;
  }

  return {
    collected: byType.collect,
    holding: holding[0]?.total ?? 0,
    refunded: byType.refund,
    deducted: byType.deduct,
    forfeited: byType.forfeited,
  };
}

async function buildCash(range: Range, buildingId: number | null) {
  // Chưa có cấu hình số dư đầu kỳ trong Supabase nên mặc định là 0.
  const openingBalance = 0;

  const [billPayments, depositSums, expenseSum, cashSums] = await Promise.all([
    sql<{ total: number }[]>`
      select coalesce(sum(p.amount), 0)::bigint as total
      from payments p
      join bills bl on bl.id = p.bill_id
      join rooms r on r.id = bl.room_id
      where p.status = 'confirmed'
        and p.paid_date >= ${range.from}
        and p.paid_date <= ${range.to}
        and (${buildingId}::int is null or r.building_id = ${buildingId})
    `,
    sql<{ type: string; total: number }[]>`
      select dt.type, sum(dt.amount)::bigint as total
      from deposit_transactions dt
      join deposits d on d.id = dt.deposit_id
      join rooms r on r.id = d.room_id
      where dt.type in ('collect', 'refund')
        and dt.transaction_date >= ${range.from}
        and dt.transaction_date <= ${range.to}
        and (${buildingId}::int is null or r.building_id = ${buildingId})
      group by dt.type
    `,
    // Quỹ tiền trừ TOÀN BỘ chi phí, không lọc theo nhóm.
    sql<{ total: number }[]>`
      select coalesce(sum(amount), 0)::bigint as total
      from expenses
      where expense_date >= ${range.from}
        and expense_date <= ${range.to}
        and (${buildingId}::int is null or building_id = ${buildingId})
    `,
    // Rút tiền chủ nhà và điều chỉnh quỹ không gắn với nhà nào nên không lọc.
    sql<{ type: string; total: number }[]>`
      select type, sum(amount)::bigint as total
      from cash_transactions
      where type in ('owner_withdrawal', 'adjustment')
        and transaction_date >= ${range.from}
        and transaction_date <= ${range.to}
      group by type
    `,
  ]);

  const deposit = zeroed(DEPOSIT_TRANSACTION_TYPES as unknown as string[]);
  for (const row of depositSums) deposit[row.type] = row.total;

  const cash = zeroed(CASH_TRANSACTION_TYPES as unknown as string[]) as Record<
    CashTransactionType,
    number
  >;
  for (const row of cashSums) {
    if (row.type in cash) cash[row.type as CashTransactionType] = row.total;
  }

  const billPaymentInflow = billPayments[0]?.total ?? 0;
  const expensesOutflow = expenseSum[0]?.total ?? 0;

  return {
    openingBalance,
    billPaymentInflow,
    depositCollectInflow: deposit.collect,
    expensesOutflow,
    depositRefundOutflow: deposit.refund,
    ownerWithdrawalOutflow: cash.owner_withdrawal,
    adjustmentNet: cash.adjustment,
    closingBalance:
      openingBalance +
      billPaymentInflow +
      deposit.collect -
      expensesOutflow -
      deposit.refund -
      cash.owner_withdrawal +
      cash.adjustment,
  };
}

function zeroed(keys: readonly string[]): Record<string, number> {
  return Object.fromEntries(keys.map((key) => [key, 0]));
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
