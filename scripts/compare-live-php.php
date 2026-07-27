<?php

/**
 * Chạy logic lên bill của Laravel trên DỮ LIỆU THẬT trong DB, in ra JSON.
 *
 * Dùng để đối chiếu với bản Next.js: cùng một kỳ, cùng một hợp đồng thì phải
 * ra cùng kỳ chốt, cùng số điện cũ, cùng tiền phòng.
 *
 * Dùng: php scripts/compare-live-php.php 2026-07 > php.json
 */

$root = __DIR__ . '/../../rental-manager';
require $root . '/vendor/autoload.php';

$app = require $root . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Domain\Rental\Services\BillCalculator;
use App\Domain\Rental\Services\BillingCycleResolver;
use App\Models\Lease;
use App\Models\MeterReading;
use Carbon\CarbonImmutable;

$month = $argv[1] ?? CarbonImmutable::now()->format('Y-m');
$reference = CarbonImmutable::parse($month . '-01');

$billingCycleResolver = app(BillingCycleResolver::class);
$billCalculator = app(BillCalculator::class);

$leases = Lease::query()
    ->with(['tenant', 'room.floor', 'room.building'])
    ->whereIn('status', ['active', 'ending_soon', 'reserved'])
    ->orderBy('id')
    ->get();

$out = [];

foreach ($leases as $lease) {
    $cycle = $billingCycleResolver->calculatePeriodForLease($lease, $reference);

    // Số điện cũ = chỉ số chốt của kỳ gần nhất trước kỳ này.
    $lastMeter = MeterReading::query()
        ->where('room_id', $lease->room_id)
        ->where('period_month', '<', $cycle['period_to']->toDateString())
        ->orderByDesc('period_month')
        ->first();

    $electricityOld = (int) ($lastMeter?->electricity_new ?? 0);

    $preview = $billCalculator->preview(
        $lease,
        $cycle['period_from'],
        $cycle['period_to'],
        [
            'electricity_old' => $electricityOld,
            'force_prorated_rent' => (bool) ($cycle['is_initial_partial_period'] ?? false),
        ],
    );

    $out[] = [
        'lease_id' => (int) $lease->id,
        'room_code' => (string) $lease->room->room_code,
        'tenant_name' => (string) $lease->tenant->full_name,
        'period_from' => $cycle['period_from']->toDateString(),
        'period_to' => $cycle['period_to']->toDateString(),
        'billing_day' => $cycle['billing_day'],
        'is_initial_partial' => (bool) ($cycle['is_initial_partial_period'] ?? false),
        'electricity_old' => $electricityOld,
        'due_date' => $preview['due_date'],
        'rent_amount' => $preview['rent']['amount'],
        'occupied_days' => $preview['rent']['occupied_days'],
        'days_in_period' => $preview['rent']['days_in_period'],
        'denominator_days' => $preview['rent']['denominator_days'],
        'water_amount' => $preview['water']['amount'],
        'service_amount' => $preview['service']['amount'],
    ];
}

echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
