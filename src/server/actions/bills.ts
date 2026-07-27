'use server';

import { revalidatePath } from 'next/cache';
import type { JSONValue } from 'postgres';
import { sql } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import {
  assertManualReasonWhenNeeded,
  previewBill,
  type BillRowInput,
} from '@/domain/bill-calculator';
import { formatMY, type CivilDate } from '@/domain/date';
import { FieldError } from '@/domain/electricity';
import type { BillItemType } from '@/domain/enums';
import { logAudit } from './audit';

/**
 * Ghi bill.
 *
 * Bám đúng `BillCalculator::createForLease()` bên Laravel: chốt số điện vào
 * `meter_readings`, tạo `bills` + 6 dòng `bill_items`, ghi audit log — tất cả
 * trong MỘT transaction, hỏng bước nào thì không còn dấu vết nào.
 */

export type ActionResult =
  | { ok: true; message: string; billId?: number }
  | { ok: false; field?: string; message: string };

export async function createBillForLease(
  leaseId: number,
  periodFrom: CivilDate,
  periodTo: CivilDate,
  row: BillRowInput,
): Promise<ActionResult> {
  const session = await requireRole('admin', 'staff');

  const leases = await sql<
    {
      id: number;
      tenant_id: number;
      room_id: number;
      room_code: string;
      start_date: CivilDate;
      expected_end_date: CivilDate | null;
      actual_end_date: CivilDate | null;
      monthly_rent: number;
      due_day: number | null;
      water_fee: number | null;
      service_fee: number | null;
      electricity_unit_price: number | null;
      occupants_count: number | null;
      building_electricity_unit_price: number;
    }[]
  >`
    select l.id, l.tenant_id, l.room_id, l.start_date, l.expected_end_date, l.actual_end_date,
           l.monthly_rent, l.due_day, l.water_fee, l.service_fee, l.electricity_unit_price,
           l.occupants_count,
           r.room_code,
           b.default_electricity_unit_price as building_electricity_unit_price
    from leases l
    join rooms r on r.id = l.room_id
    join buildings b on b.id = r.building_id
    where l.id = ${leaseId}
    limit 1
  `;

  const lease = leases[0];
  if (!lease) return { ok: false, message: 'Hợp đồng không tồn tại.' };

  // Chặn trùng bill trước khi tính, y như ensureBillDoesNotExist().
  const existing = await sql<{ id: number }[]>`
    select id from bills
    where lease_id = ${leaseId} and period_from = ${periodFrom} and period_to = ${periodTo}
    limit 1
  `;
  if (existing.length > 0) {
    return { ok: false, message: 'Đã có bill cho hợp đồng này trong kỳ đã chọn.' };
  }

  try {
    assertManualReasonWhenNeeded(row);
  } catch (error) {
    if (error instanceof FieldError) return { ok: false, field: error.field, message: error.message };
    throw error;
  }

  const preview = previewBill(lease, periodFrom, periodTo, row, {
    default_electricity_unit_price: lease.building_electricity_unit_price,
  });

  if (preview.electricityError !== null) {
    return { ok: false, field: 'electricity_new', message: preview.electricityError };
  }

  if (preview.electricity === null || preview.totalAmount === null) {
    return { ok: false, field: 'electricity_new', message: 'Vui lòng nhập số điện mới.' };
  }

  const electricity = preview.electricity;
  const periodLabel = formatMY(preview.periodTo);
  const meterNote = stringOrNull(row.meter_note);
  const manualReason = stringOrNull(row.manual_reason);
  const note = stringOrNull(row.note);

  const billId = await sql.begin(async (tx) => {
    // Chốt chỉ số điện của kỳ — kỳ sau lấy số này làm số cũ.
    await tx`
      insert into meter_readings
        (room_id, period_month, electricity_old, electricity_new, electricity_usage,
         electricity_unit_price, electricity_amount, note, created_at, updated_at)
      values
        (${lease.room_id}, ${preview.periodFrom}, ${electricity.old}, ${electricity.new},
         ${electricity.usage}, ${electricity.unitPrice}, ${electricity.amount}, ${meterNote},
         now(), now())
      on conflict (room_id, period_month) do update set
        electricity_old = excluded.electricity_old,
        electricity_new = excluded.electricity_new,
        electricity_usage = excluded.electricity_usage,
        electricity_unit_price = excluded.electricity_unit_price,
        electricity_amount = excluded.electricity_amount,
        note = excluded.note,
        updated_at = now()
    `;

    const inserted = await tx<{ id: number }[]>`
      insert into bills
        (lease_id, tenant_id, room_id, period_from, period_to,
         display_period_from, display_period_to, due_date,
         total_amount, paid_amount, outstanding_amount,
         original_calculated_amount, manual_amount, status,
         is_manual_override, manual_reason, note, created_at, updated_at)
      values
        (${lease.id}, ${lease.tenant_id}, ${lease.room_id}, ${preview.periodFrom}, ${preview.periodTo},
         ${preview.periodFrom}, ${preview.periodTo}, ${preview.dueDate},
         ${preview.totalAmount}, 0, ${preview.totalAmount},
         ${preview.originalCalculatedAmount}, ${preview.manualAmount}, 'draft',
         ${preview.isManualOverride}, ${manualReason}, ${note}, now(), now())
      returning id
    `;

    const newBillId = inserted[0].id;

    const items = buildBillItems(preview, lease.monthly_rent, periodLabel);
    for (const item of items) {
      await tx`
        insert into bill_items
          (bill_id, type, description, quantity, unit_price, amount, meta, created_at, updated_at)
        values
          (${newBillId}, ${item.type}, ${item.description}, ${item.quantity},
           ${item.unitPrice}, ${item.amount}, ${tx.json(item.meta)}, now(), now())
      `;
    }

    await logAudit(tx, {
      userId: session.userId,
      action: 'bill.created',
      subjectType: 'App\\Models\\Bill',
      subjectId: newBillId,
      newValues: {
        lease_id: lease.id,
        period_from: preview.periodFrom,
        period_to: preview.periodTo,
        total_amount: preview.totalAmount,
        status: 'draft',
      },
      note: 'Tạo bill tháng',
    });

    return newBillId;
  });

  revalidatePath('/bill-thang');
  revalidatePath('/hoa-don');
  revalidatePath('/dashboard');

  return {
    ok: true,
    billId,
    message: `Đã chốt bill cho phòng ${lease.room_code} tháng ${periodLabel}.`,
  };
}

/** Đổi trạng thái bill. Bill đã thu tiền hoặc đã huỷ thì không cho đổi. */
export async function setBillStatus(
  billId: number,
  next: 'draft' | 'sent',
): Promise<ActionResult> {
  const session = await requireRole('admin', 'staff');

  const rows = await sql<{ paid_amount: number; status: string }[]>`
    select paid_amount, status from bills where id = ${billId} limit 1
  `;
  const bill = rows[0];
  if (!bill) return { ok: false, message: 'Không tìm thấy bill.' };

  if (bill.paid_amount > 0 || bill.status === 'cancelled') {
    return {
      ok: false,
      message: 'Bill đã có thanh toán hoặc đã huỷ nên không thể đổi trạng thái.',
    };
  }

  await sql.begin(async (tx) => {
    await tx`update bills set status = ${next}, updated_at = now() where id = ${billId}`;
    await logAudit(tx, {
      userId: session.userId,
      action: next === 'draft' ? 'bill.drafted' : 'bill.finalized',
      subjectType: 'App\\Models\\Bill',
      subjectId: billId,
      oldValues: { status: bill.status },
      newValues: { status: next },
      note: next === 'draft' ? 'Đưa bill về trạng thái nháp' : 'Chốt bill',
    });
  });

  revalidatePath(`/hoa-don/${billId}`);
  revalidatePath('/hoa-don');

  return {
    ok: true,
    message: next === 'draft' ? 'Đã lưu bill ở trạng thái nháp.' : 'Đã chốt bill.',
  };
}

type BuiltItem = {
  type: BillItemType;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  meta: Record<string, JSONValue>;
};

/** 6 dòng bill cố định, giữ nguyên thứ tự và `meta` như bản Laravel. */
function buildBillItems(
  preview: ReturnType<typeof previewBill>,
  monthlyRent: number,
  periodLabel: string,
): BuiltItem[] {
  const electricity = preview.electricity!;

  return [
    {
      type: 'rent',
      description: `Tiền phòng tháng ${periodLabel}`,
      quantity: preview.rent.occupiedDays,
      unitPrice: monthlyRent,
      amount: preview.rent.amount,
      meta: {
        monthly_rent: monthlyRent,
        days_in_period: preview.rent.daysInPeriod,
        occupied_days: preview.rent.occupiedDays,
        bill_start: preview.rent.billStart,
        bill_end: preview.rent.billEnd,
        calculated_amount: preview.rent.calculatedAmount,
        manual_amount: preview.rent.manualAmount,
        prorate_mode: preview.rent.prorateMode,
      },
    },
    {
      type: 'electricity',
      description: `Tiền điện tháng ${periodLabel}`,
      quantity: electricity.usage,
      unitPrice: electricity.unitPrice,
      amount: electricity.amount,
      meta: {
        old: electricity.old,
        old_reading: electricity.old,
        new: electricity.new,
        new_reading: electricity.new,
        usage: electricity.usage,
        unit_price: electricity.unitPrice,
        unit: 'số',
        calculated_amount: electricity.amount,
      },
    },
    {
      type: 'water',
      description: `Tiền nước tháng ${periodLabel}`,
      quantity: 1,
      unitPrice: preview.water.amount,
      amount: preview.water.amount,
      meta: {
        calculated_amount: preview.water.calculatedAmount,
        manual_amount: preview.water.manualAmount,
      },
    },
    {
      type: 'service',
      description: `Phí dịch vụ tháng ${periodLabel}`,
      quantity: 1,
      unitPrice: preview.service.amount,
      amount: preview.service.amount,
      meta: {
        calculated_amount: preview.service.calculatedAmount,
        manual_amount: preview.service.manualAmount,
      },
    },
    {
      type: 'surcharge',
      description: `Phụ thu tháng ${periodLabel}`,
      quantity: 1,
      unitPrice: preview.surcharge.amount,
      amount: preview.surcharge.amount,
      meta: {
        calculated_amount: preview.surcharge.calculatedAmount,
        manual_amount: preview.surcharge.manualAmount,
      },
    },
    {
      type: 'discount',
      description: `Giảm trừ tháng ${periodLabel}`,
      quantity: 1,
      unitPrice: preview.discount.amount,
      amount: preview.discount.amount,
      meta: {
        calculated_amount: preview.discount.calculatedAmount,
        manual_amount: preview.discount.manualAmount,
      },
    },
  ];
}

function stringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
