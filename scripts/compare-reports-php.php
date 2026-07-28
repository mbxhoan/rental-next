<?php

/**
 * Chạy năm service báo cáo của Laravel trên DỮ LIỆU THẬT, in ra JSON.
 *
 * Gọi thẳng từng service chứ không qua `MonthlyReportsDashboardService`, và
 * truyền period_from/period_to rõ ràng cho `OperatingProfitReportService` —
 * service đó KHÔNG đọc tham số `month`, đi qua dashboard là nó bỏ luôn bộ lọc
 * tháng (xem mục "Lợi nhuận vận hành" trong README).
 *
 * Dùng: php scripts/compare-reports-php.php 2026-02,2026-03 [building_id]
 */

$root = __DIR__ . '/../../rental-manager';
require $root . '/vendor/autoload.php';

$app = require $root . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Domain\Rental\Services\CashBalanceReportService;
use App\Domain\Rental\Services\DepositReportService;
use App\Domain\Rental\Services\MonthlyExpenseReportService;
use App\Domain\Rental\Services\MonthlyRevenueReportService;
use App\Domain\Rental\Services\OperatingProfitReportService;
use Carbon\CarbonImmutable;

$months = explode(',', $argv[1] ?? CarbonImmutable::now()->format('Y-m'));
$buildingId = isset($argv[2]) && $argv[2] !== '' ? (int) $argv[2] : null;

$out = [];

foreach ($months as $month) {
    $start = CarbonImmutable::createFromFormat('Y-m', $month, 'Asia/Ho_Chi_Minh')->startOfMonth();
    $end = $start->endOfMonth();

    $byMonth = ['building_id' => $buildingId, 'month' => $month];
    $byRange = [
        'building_id' => $buildingId,
        'period_from' => $start->toDateString(),
        'period_to' => $end->toDateString(),
    ];

    $revenue = app(MonthlyRevenueReportService::class)->build($byMonth);
    $expenses = app(MonthlyExpenseReportService::class)->build($byMonth);
    $operating = app(OperatingProfitReportService::class)->build($byRange);
    $deposits = app(DepositReportService::class)->build($byMonth);
    $cash = app(CashBalanceReportService::class)->build($byMonth);

    $out[$month] = [
        'revenue' => [
            'breakdown' => $revenue['breakdown'],
            'totalBill' => $revenue['total_bill'],
            'paidTotal' => $revenue['paid_total'],
            'outstandingTotal' => $revenue['outstanding_total'],
            'debtTotal' => $revenue['debt_total'],
        ],
        'expenses' => [
            'breakdown' => $expenses['breakdown'],
            'total' => $expenses['total'],
        ],
        'operating' => [
            'incomeBreakdown' => $operating['income_breakdown'],
            'incomeTotal' => $operating['income_total'],
            'expenseBreakdown' => $operating['expense_breakdown'],
            'expenseTotal' => $operating['expense_total'],
            'operatingProfit' => $operating['operating_profit'],
        ],
        'deposits' => [
            'collected' => $deposits['collected'],
            'holding' => $deposits['holding'],
            'refunded' => $deposits['refunded'],
            'deducted' => $deposits['deducted'],
            'forfeited' => $deposits['forfeited'],
        ],
        'cash' => [
            'openingBalance' => $cash['opening_balance'],
            'billPaymentInflow' => $cash['bill_payment_inflow'],
            'depositCollectInflow' => $cash['deposit_collect_inflow'],
            'expensesOutflow' => $cash['expenses_outflow'],
            'depositRefundOutflow' => $cash['deposit_refund_outflow'],
            'ownerWithdrawalOutflow' => $cash['owner_withdrawal_outflow'],
            'adjustmentNet' => $cash['adjustment_net'],
            'closingBalance' => $cash['closing_balance'],
        ],
    ];
}

echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
