<?php

/**
 * Chạy các service gốc của Laravel trên bộ ca kiểm thử đọc từ stdin,
 * in kết quả ra stdout dạng JSON để so với bản port TypeScript.
 *
 * Dùng: php scripts/difftest-php.php < cases.json > php-out.json
 */

$root = __DIR__ . '/../../rental-manager';
require $root . '/vendor/autoload.php';

$app = require $root . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Domain\Rental\Services\BillingCycleResolver;
use App\Domain\Rental\Services\ElectricityChargeCalculator;
use App\Domain\Rental\Services\FeeSettingResolver;
use App\Domain\Rental\Services\Money;
use App\Domain\Rental\Services\ProratedRentCalculator;
use App\Models\Building;
use App\Models\Lease;
use App\Models\Room;

$cases = json_decode(file_get_contents('php://stdin'), true, 512, JSON_THROW_ON_ERROR);

$proratedRentCalculator = new ProratedRentCalculator();
$electricityChargeCalculator = new ElectricityChargeCalculator();
$feeSettingResolver = new FeeSettingResolver();
$billingCycleResolver = new BillingCycleResolver($feeSettingResolver);

$out = ['prorate' => [], 'cycle' => [], 'electricity' => [], 'money' => [], 'fees' => [], 'bill' => []];

foreach ($cases['prorate'] as $case) {
    // ProratedRentCalculator đọc mode làm tròn từ config, còn prorate mode
    // thì nhận qua tham số — set config để hai bên cùng điều kiện.
    config(['rental.defaults.money_rounding' => 'nearest_1000']);

    try {
        $result = $proratedRentCalculator->calculate(
            periodStart: $case['periodStart'],
            periodEnd: $case['periodEnd'],
            leaseStartDate: $case['leaseStartDate'],
            expectedEndDate: $case['expectedEndDate'],
            actualEndDate: $case['actualEndDate'],
            monthlyRent: $case['monthlyRent'],
            manualRentAmount: $case['manualRentAmount'],
            prorateMode: $case['prorateMode'],
            forceProratedRent: $case['forceProratedRent'],
        );

        $out['prorate'][] = [
            'bill_start' => $result['bill_start'],
            'bill_end' => $result['bill_end'],
            'days_in_period' => $result['days_in_period'],
            'occupied_days' => $result['occupied_days'],
            'denominator_days' => $result['denominator_days'],
            'calculated_amount' => $result['calculated_amount'],
            'amount' => $result['amount'],
            'prorate_mode' => $result['prorate_mode'],
        ];
    } catch (\Throwable $e) {
        $out['prorate'][] = ['error' => $e->getMessage()];
    }
}

foreach ($cases['cycle'] as $case) {
    config(['rental.defaults.default_billing_day' => 24]);

    $building = new Building();
    if ($case['buildingBillingDay'] !== null) {
        $building->default_billing_day = $case['buildingBillingDay'];
    }

    $room = new Room();
    $room->setRelation('building', $building);
    if ($case['roomBillingDayOverride'] !== null) {
        $room->billing_day_override = $case['roomBillingDayOverride'];
    }
    if ($case['roomPeriodStartDay'] !== null) {
        $room->billing_period_start_day = $case['roomPeriodStartDay'];
    }

    try {
        $period = $billingCycleResolver->calculatePeriod($room, $case['month']);

        $lease = new Lease();
        $lease->start_date = $case['leaseStartDate'];
        $lease->setRelation('room', $room);

        $leasePeriod = $billingCycleResolver->calculatePeriodForLease(
            $lease,
            $case['month'],
            hasExistingBills: $case['hasExistingBills'],
        );

        $out['cycle'][] = [
            'period_from' => $period['period_from']->toDateString(),
            'period_to' => $period['period_to']->toDateString(),
            'period_start_day' => $period['period_start_day'],
            'billing_day' => $period['billing_day'],
            'lease_period_from' => $leasePeriod['period_from']->toDateString(),
            'lease_period_to' => $leasePeriod['period_to']->toDateString(),
            'lease_billing_day' => $leasePeriod['billing_day'],
            'lease_is_initial_partial' => (bool) ($leasePeriod['is_initial_partial_period'] ?? false),
        ];
    } catch (\Throwable $e) {
        $out['cycle'][] = ['error' => $e->getMessage()];
    }
}

foreach ($cases['electricity'] as $case) {
    try {
        $result = $electricityChargeCalculator->calculate(
            oldReading: $case['oldReading'],
            newReading: $case['newReading'],
            unitPrice: $case['unitPrice'],
        );
        $out['electricity'][] = $result;
    } catch (\Throwable $e) {
        $out['electricity'][] = ['error' => 'invalid'];
    }
}

foreach ($cases['money'] as $case) {
    $out['money'][] = Money::roundVnd($case['amount'], $case['mode']);
}

foreach ($cases['fees'] as $case) {
    $out['fees'][] = [
        'water' => $feeSettingResolver->resolveWaterFee($case['occupantsCount']),
        'service' => $feeSettingResolver->resolveServiceFee($case['occupantsCount']),
    ];
}

$billCalculator = app(App\Domain\Rental\Services\BillCalculator::class);

foreach ($cases['bill'] as $case) {
    config([
        'rental.defaults.money_rounding' => 'nearest_1000',
        'rental.defaults.prorate_mode' => 'fixed_30_days',
        'rental.defaults.default_electricity_unit_price' => 3700,
        'rental.defaults.default_due_day' => 5,
    ]);

    $lease = Lease::make($case['lease']);

    $building = new Building();
    if ($case['buildingElectricityUnitPrice'] !== null) {
        $building->default_electricity_unit_price = $case['buildingElectricityUnitPrice'];
    }
    $room = new Room();
    $room->setRelation('building', $building);
    $lease->setRelation('room', $room);

    try {
        $preview = $billCalculator->preview(
            $lease,
            $case['periodStart'],
            $case['periodEnd'],
            array_filter($case['row'], fn ($value) => $value !== null),
        );

        $out['bill'][] = [
            'due_date' => $preview['due_date'],
            'rent_amount' => $preview['rent']['amount'],
            'rent_calculated' => $preview['rent']['calculated_amount'],
            'occupied_days' => $preview['rent']['occupied_days'],
            'electricity_amount' => $preview['electricity']['amount'] ?? null,
            'water_amount' => $preview['water']['amount'],
            'service_amount' => $preview['service']['amount'],
            'surcharge_amount' => $preview['surcharge']['amount'],
            'discount_amount' => $preview['discount']['amount'],
            'original_calculated_amount' => $preview['original_calculated_amount'],
            'manual_amount' => $preview['manual_amount'],
            'total_amount' => $preview['total_amount'],
            'is_manual_override' => $preview['is_manual_override'],
            'electricity_error' => $preview['electricity_error'],
        ];
    } catch (\Throwable $e) {
        $out['bill'][] = ['error' => $e->getMessage()];
    }
}

echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
