'use server';

import { revalidatePath } from 'next/cache';
import type { JSONValue, TransactionSql } from 'postgres';
import { sql } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import {
  assertManualReasonWhenNeeded,
  previewBill,
  type BillRowInput,
} from '@/domain/bill-calculator';
import { formatMY, isCivilDate, type CivilDate } from '@/domain/date';
import { FieldError } from '@/domain/electricity';
import { resolveBillStatus } from '@/domain/bill-status';
import type { BillItemType, BillStatus } from '@/domain/enums';
import { rentalConfig } from '@/domain/config';
import { today } from '@/domain/date';
import { logAudit } from './audit';
import { syncBillPaymentRequest } from '../services/bill-payment-request';

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
  const result = await persistBillDraft(session.userId, leaseId, periodFrom, periodTo, row, true);
  if (!result.ok) return result;

  revalidatePath('/bill-thang');
  revalidatePath('/hoa-don');
  revalidatePath('/dashboard');

  return {
    ok: true,
    billId: result.billId,
    message: `Đã chốt bill cho phòng ${result.roomCode} tháng ${formatMY(periodTo)}.`,
  };
}

/** Lưu nháp tự động; chưa cập nhật số điện chính thức của phòng. */
export async function saveBillDraft(
  leaseId: number,
  periodFrom: CivilDate,
  periodTo: CivilDate,
  row: BillRowInput,
): Promise<ActionResult> {
  const session = await requireRole('admin', 'staff');
  const result = await persistBillDraft(session.userId, leaseId, periodFrom, periodTo, row, false);
  if (!result.ok) return result;
  revalidatePath('/bill-thang');
  revalidatePath('/hoa-don');
  return { ok: true, billId: result.billId, message: 'Đã lưu nháp.' };
}

/** Huỷ mềm nháp chưa chốt; lịch sử bill luôn được giữ lại. */
export async function deleteBillDraft(billId: number): Promise<ActionResult> {
  const session = await requireRole('admin', 'staff');
  const rows = await sql<{ status: BillStatus; paid_amount: number; has_payment: boolean }[]>`
    select status, paid_amount, exists(select 1 from payments p where p.bill_id = bills.id) as has_payment
    from bills where id = ${billId} limit 1
  `;
  const bill = rows[0];
  if (!bill) return { ok: false, message: 'Không tìm thấy bill.' };
  if (bill.status !== 'draft' || bill.paid_amount > 0 || bill.has_payment) {
    return { ok: false, message: 'Chỉ có thể huỷ bill đang ở trạng thái Chờ chốt và chưa thanh toán.' };
  }
  await sql.begin(async (tx) => {
    await tx`
      update payment_requests
      set status = 'cancelled', cancelled_at = now(), cancel_reason = 'Huỷ bill nháp.', updated_at = now()
      where bill_id = ${billId} and status = 'pending'
    `;
    await tx`
      update bills
      set status = 'cancelled', updated_at = now()
      where id = ${billId} and status = 'draft'
    `;
    await logAudit(tx, {
      userId: session.userId, action: 'bill.draft_cancelled', subjectType: 'App\\Models\\Bill', subjectId: billId,
      oldValues: { status: 'draft' }, newValues: { status: 'cancelled' }, note: 'Huỷ bill chờ chốt',
    });
  });
  revalidatePath('/bill-thang'); revalidatePath('/hoa-don'); revalidatePath(`/hoa-don/${billId}`);
  return { ok: true, message: 'Đã huỷ bill chờ chốt. Lịch sử vẫn được lưu lại.' };
}

/** Đổi trạng thái bill; bill đã thu tiền được mở sang “Đang điều chỉnh”. */
export async function setBillStatus(
  billId: number,
  next: 'draft' | 'sent' | 'adjusting',
): Promise<ActionResult> {
  const session = await requireRole('admin', 'staff');

  const rows = await sql<{
    id: number; paid_amount: number; total_amount: number; status: BillStatus;
    room_id: number; room_code: string; period_from: CivilDate; period_to: CivilDate;
    electricity_old: number | null; electricity_new: number | null; electricity_usage: number | null;
    electricity_unit_price: number | null; electricity_amount: number | null;
    due_date: CivilDate | null;
  }[]>`
    select b.id, b.paid_amount, b.total_amount, b.status, b.room_id, r.room_code,
           b.period_from, b.period_to, b.due_date,
           (bi.meta->>'old_reading')::int as electricity_old,
           (bi.meta->>'new_reading')::int as electricity_new,
           (bi.meta->>'usage')::int as electricity_usage,
           bi.unit_price as electricity_unit_price, bi.amount as electricity_amount
    from bills b
    join rooms r on r.id = b.room_id
    left join bill_items bi on bi.bill_id = b.id and bi.type = 'electricity'
    where b.id = ${billId}
    limit 1
  `;
  const bill = rows[0];
  if (!bill) return { ok: false, message: 'Không tìm thấy bill.' };
  if (bill.status === 'cancelled') return { ok: false, message: 'Bill đã huỷ nên không thể đổi trạng thái.' };
  if (next === 'draft' && bill.paid_amount > 0) {
    return { ok: false, message: 'Bill đã có thanh toán. Hãy dùng trạng thái “Đang điều chỉnh”.' };
  }
  if (next === 'sent' && (bill.electricity_new === null || bill.electricity_old === null)) {
    return { ok: false, message: 'Bill chưa có số điện mới.' };
  }

  await sql.begin(async (tx) => {
    if (next === 'draft' || next === 'adjusting') {
      await rollbackRoomMeterIfLatest(tx, bill);
      await tx`update bills set status = ${next}, updated_at = now() where id = ${billId}`;
      await syncBillPaymentRequest(tx, { billId, amount: 0, roomCode: bill.room_code, periodTo: bill.period_to });
    } else {
      await tx`
        insert into meter_readings
          (room_id, period_month, electricity_old, electricity_new, electricity_usage,
           electricity_unit_price, electricity_amount, created_at, updated_at)
        values (${bill.room_id}, ${bill.period_from}, ${bill.electricity_old}, ${bill.electricity_new},
                ${bill.electricity_usage}, ${bill.electricity_unit_price}, ${bill.electricity_amount}, now(), now())
        on conflict (room_id, period_month) do update set
          electricity_old = excluded.electricity_old, electricity_new = excluded.electricity_new,
          electricity_usage = excluded.electricity_usage, electricity_unit_price = excluded.electricity_unit_price,
          electricity_amount = excluded.electricity_amount, updated_at = now()
      `;
      await tx`
        update rooms set current_electricity_reading = ${bill.electricity_new},
          electricity_reading_updated_at = now() where id = ${bill.room_id}
          and not exists (
            select 1 from bills later
            where later.room_id = ${bill.room_id} and later.id <> ${bill.id}
              and later.status in ('sent', 'partial', 'paid', 'overdue')
              and later.period_to > ${bill.period_to}
          )
      `;
      const nextStatus = resolveBillStatus(
        { status: bill.status === 'adjusting' ? 'sent' : bill.status, total_amount: bill.total_amount, paid_amount: bill.paid_amount, due_date: bill.due_date },
        today(rentalConfig.timezone),
      );
      await tx`update bills set status = ${nextStatus}, updated_at = now() where id = ${billId}`;
      await syncBillPaymentRequest(tx, { billId, amount: Math.max(0, bill.total_amount - bill.paid_amount), roomCode: bill.room_code, periodTo: bill.period_to });
    }
    await logAudit(tx, {
      userId: session.userId,
      action: next === 'draft' ? 'bill.drafted' : next === 'adjusting' ? 'bill.adjusting' : 'bill.finalized',
      subjectType: 'App\\Models\\Bill',
      subjectId: billId,
      oldValues: { status: bill.status },
      newValues: { status: next },
      note: next === 'draft' ? 'Đưa bill về trạng thái chờ chốt' : next === 'adjusting' ? 'Mở bill để điều chỉnh' : 'Chốt bill',
    });
  });

  revalidatePath(`/hoa-don/${billId}`);
  revalidatePath('/hoa-don');

  return {
    ok: true,
    message: next === 'draft' ? 'Đã đưa bill về chờ chốt.' : next === 'adjusting' ? 'Bill đang điều chỉnh.' : 'Đã chốt bill.',
  };
}

/** Cập nhật số điện cho bill draft/adjusting, có chặn tổng mới thấp hơn đã thu. */
export async function updateBillElectricity(
  billId: number,
  electricityNewInput: unknown,
  meterReset: boolean,
): Promise<ActionResult> {
  const session = await requireRole('admin', 'staff');
  const newReading = normalizeReading(electricityNewInput);
  if (newReading === null) return { ok: false, field: 'electricity_new', message: 'Vui lòng nhập số điện mới.' };

  const rows = await sql<{
    status: BillStatus; room_id: number; room_code: string; period_to: CivilDate;
    total_amount: number; paid_amount: number; original_calculated_amount: number | null;
    manual_amount: number | null; electricity_old: number; electricity_new: number;
    electricity_unit_price: number; electricity_amount: number;
  }[]>`
    select b.status, b.room_id, r.room_code, b.period_to, b.total_amount, b.paid_amount,
           b.original_calculated_amount, b.manual_amount,
           (bi.meta->>'old_reading')::int as electricity_old,
           (bi.meta->>'new_reading')::int as electricity_new,
           bi.unit_price as electricity_unit_price, bi.amount as electricity_amount
    from bills b join rooms r on r.id = b.room_id
    join bill_items bi on bi.bill_id = b.id and bi.type = 'electricity'
    where b.id = ${billId} limit 1
  `;
  const bill = rows[0];
  if (!bill) return { ok: false, message: 'Không tìm thấy bill.' };
  if (bill.status !== 'draft' && bill.status !== 'adjusting') {
    return { ok: false, message: 'Hãy đưa bill về “Chờ chốt” hoặc “Đang điều chỉnh” trước khi sửa số điện.' };
  }

  const oldReading = meterReset ? 0 : bill.electricity_old;
  if (newReading < oldReading) {
    return { ok: false, field: 'electricity_new', message: 'Số điện mới thấp hơn số cũ. Hãy chọn “Đồng hồ thay/reset”.' };
  }
  const usage = newReading - oldReading;
  const electricityAmount = usage * bill.electricity_unit_price;
  const totalAmount = bill.total_amount - bill.electricity_amount + electricityAmount;
  if (totalAmount < bill.paid_amount) {
    return { ok: false, field: 'electricity_new', message: `Tổng bill mới (${totalAmount.toLocaleString('vi-VN')} đ) thấp hơn số đã thu (${bill.paid_amount.toLocaleString('vi-VN')} đ).` };
  }

  await sql.begin(async (tx) => {
    await tx`
      update bill_items
      set quantity = ${usage}, amount = ${electricityAmount},
          meta = ${tx.json({ old: oldReading, old_reading: oldReading, new: newReading, new_reading: newReading, usage, unit_price: bill.electricity_unit_price, unit: 'số', calculated_amount: electricityAmount })},
          updated_at = now()
      where bill_id = ${billId} and type = 'electricity'
    `;
    const outstanding = Math.max(0, totalAmount - bill.paid_amount);
    await tx`
      update bills
      set total_amount = ${totalAmount}, outstanding_amount = ${outstanding},
          original_calculated_amount = ${bill.original_calculated_amount === null ? null : bill.original_calculated_amount - bill.electricity_amount + electricityAmount},
          manual_amount = ${bill.manual_amount === null ? null : bill.manual_amount - bill.electricity_amount + electricityAmount},
          updated_at = now()
      where id = ${billId}
    `;
    if (bill.status === 'draft') {
      await syncBillPaymentRequest(tx, { billId, amount: outstanding, roomCode: bill.room_code, periodTo: bill.period_to });
    }
    await logAudit(tx, {
      userId: session.userId,
      action: 'bill.electricity_updated',
      subjectType: 'App\\Models\\Bill', subjectId: billId,
      oldValues: { old_reading: bill.electricity_old, new_reading: bill.electricity_new, total_amount: bill.total_amount },
      newValues: { old_reading: oldReading, new_reading: newReading, total_amount: totalAmount, meter_reset: meterReset },
      note: 'Cập nhật chỉ số điện',
    });
  });
  revalidatePath(`/hoa-don/${billId}`); revalidatePath('/hoa-don'); revalidatePath('/bill-thang'); revalidatePath('/dashboard');
  return { ok: true, message: 'Đã cập nhật số điện và tính lại bill.' };
}

type LeaseRow = {
  id: number; tenant_id: number; room_id: number; room_code: string; start_date: CivilDate;
  expected_end_date: CivilDate | null; actual_end_date: CivilDate | null; monthly_rent: number;
  due_day: number | null; water_fee: number | null; service_fee: number | null;
  electricity_unit_price: number | null; occupants_count: number | null; building_electricity_unit_price: number;
  room_electricity_reading: number | null;
};

async function persistBillDraft(userId: number, leaseId: number, periodFrom: CivilDate, periodTo: CivilDate, row: BillRowInput, finalize: boolean): Promise<({ ok: true; billId: number; roomCode: string } | { ok: false; field?: string; message: string })> {
  const leases = await sql<LeaseRow[]>`
    select l.id, l.tenant_id, l.room_id, l.start_date, l.expected_end_date, l.actual_end_date,
      l.monthly_rent, l.due_day, l.water_fee, l.service_fee, l.electricity_unit_price, l.occupants_count,
      r.room_code, b.default_electricity_unit_price as building_electricity_unit_price,
      coalesce(
        (select (bi.meta->>'new_reading')::int
         from bills b2
         join bill_items bi on bi.bill_id = b2.id and bi.type = 'electricity'
         where b2.room_id = r.id
           and b2.status in ('sent', 'partial', 'paid', 'overdue')
           and b2.period_to <= ${periodFrom}
         order by b2.period_to desc, b2.id desc
         limit 1),
        (select mr.electricity_new
         from meter_readings mr
         where mr.room_id = r.id and mr.period_month < ${periodFrom}
         order by mr.period_month desc, mr.id desc
         limit 1),
        0
      ) as room_electricity_reading
    from leases l join rooms r on r.id = l.room_id join buildings b on b.id = r.building_id
    where l.id = ${leaseId} limit 1
  `;
  const lease = leases[0];
  if (!lease) return { ok: false, message: 'Hợp đồng không tồn tại.' };
  try { assertManualReasonWhenNeeded(row); } catch (error) {
    if (error instanceof FieldError) return { ok: false, field: error.field, message: error.message };
    throw error;
  }
  const normalizedRow = normalizeResetInput({ ...row, electricity_old: lease.room_electricity_reading ?? 0 });
  const preview = previewBill(lease, periodFrom, periodTo, normalizedRow, { default_electricity_unit_price: lease.building_electricity_unit_price });
  if (preview.electricityError) return { ok: false, field: 'electricity_new', message: preview.electricityError };
  if (!preview.electricity || preview.totalAmount === null) return { ok: false, field: 'electricity_new', message: 'Vui lòng nhập số điện mới.' };
  const electricity = preview.electricity;
  const totalAmount = preview.totalAmount;
  const items = buildBillItems(preview, lease.monthly_rent, formatMY(preview.periodTo));
  const result = await sql.begin(async (tx) => {
    const existing = await tx<{ id: number; status: BillStatus; paid_amount: number }[]>`
      select id, status, paid_amount
      from bills
      where lease_id = ${leaseId}
        and period_from = ${periodFrom}
        and period_to = ${periodTo}
        and status <> 'cancelled'
      for update
    `;
    if (existing[0] && existing[0].status !== 'draft' && existing[0].status !== 'adjusting') {
      return { ok: false as const, message: 'Kỳ này đã có bill đã chốt, hãy mở bill để điều chỉnh.' };
    }
    let billId = existing[0]?.id;
    if (billId) {
      await tx`update bills set total_amount = ${totalAmount}, paid_amount = ${existing[0].paid_amount}, outstanding_amount = ${Math.max(0, totalAmount - existing[0].paid_amount)}, original_calculated_amount = ${preview.originalCalculatedAmount}, manual_amount = ${preview.manualAmount}, status = 'draft', is_manual_override = ${preview.isManualOverride}, manual_reason = ${stringOrNull(row.manual_reason)}, note = ${stringOrNull(row.note)}, updated_at = now() where id = ${billId}`;
      await tx`delete from bill_items where bill_id = ${billId}`;
    } else {
      const inserted = await tx<{ id: number }[]>`insert into bills (lease_id, tenant_id, room_id, period_from, period_to, display_period_from, display_period_to, due_date, total_amount, paid_amount, outstanding_amount, original_calculated_amount, manual_amount, status, is_manual_override, manual_reason, note, created_at, updated_at) values (${lease.id}, ${lease.tenant_id}, ${lease.room_id}, ${preview.periodFrom}, ${preview.periodTo}, ${preview.periodFrom}, ${preview.periodTo}, ${preview.dueDate}, ${totalAmount}, 0, ${totalAmount}, ${preview.originalCalculatedAmount}, ${preview.manualAmount}, 'draft', ${preview.isManualOverride}, ${stringOrNull(row.manual_reason)}, ${stringOrNull(row.note)}, now(), now()) returning id`;
      billId = inserted[0].id;
    }
    for (const item of items) await tx`insert into bill_items (bill_id, type, description, quantity, unit_price, amount, meta, created_at, updated_at) values (${billId}, ${item.type}, ${item.description}, ${item.quantity}, ${item.unitPrice}, ${item.amount}, ${tx.json(item.meta)}, now(), now())`;
    if (finalize) {
      await tx`insert into meter_readings (room_id, period_month, electricity_old, electricity_new, electricity_usage, electricity_unit_price, electricity_amount, note, created_at, updated_at) values (${lease.room_id}, ${preview.periodFrom}, ${electricity.old}, ${electricity.new}, ${electricity.usage}, ${electricity.unitPrice}, ${electricity.amount}, ${stringOrNull(row.meter_note)}, now(), now()) on conflict (room_id, period_month) do update set electricity_old = excluded.electricity_old, electricity_new = excluded.electricity_new, electricity_usage = excluded.electricity_usage, electricity_unit_price = excluded.electricity_unit_price, electricity_amount = excluded.electricity_amount, note = excluded.note, updated_at = now()`;
      await tx`update rooms set current_electricity_reading = ${electricity.new}, electricity_reading_updated_at = now() where id = ${lease.room_id} and not exists (select 1 from bills later where later.room_id = ${lease.room_id} and later.id <> ${billId} and later.status in ('sent', 'partial', 'paid', 'overdue') and later.period_to > ${preview.periodTo})`;
      await tx`update bills set status = 'sent', updated_at = now() where id = ${billId}`;
      await syncBillPaymentRequest(tx, { billId, amount: totalAmount, roomCode: lease.room_code, periodTo: preview.periodTo });
    } else {
      await syncBillPaymentRequest(tx, { billId, amount: totalAmount, roomCode: lease.room_code, periodTo: preview.periodTo });
    }
    await logAudit(tx, { userId, action: finalize ? 'bill.finalized' : 'bill.draft_saved', subjectType: 'App\\Models\\Bill', subjectId: billId, newValues: { total_amount: totalAmount, status: finalize ? 'sent' : 'draft', electricity_new: electricity.new }, note: finalize ? 'Chốt bill' : 'Tự động lưu nháp' });
    return { ok: true as const, billId: billId!, roomCode: lease.room_code };
  });
  return result;
}

function normalizeResetInput(row: BillRowInput): BillRowInput {
  const old = normalizeReading(row.electricity_old);
  const next = normalizeReading(row.electricity_new);
  if (row.meter_reset && old !== null && next !== null && next < old) return { ...row, electricity_old: 0 };
  return row;
}

function normalizeReading(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

async function rollbackRoomMeterIfLatest(tx: TransactionSql, bill: { id: number; room_id: number; period_from: CivilDate; period_to: CivilDate; electricity_old: number | null }) {
  const later = await tx<{ exists: boolean }[]>`select exists(select 1 from bills where room_id = ${bill.room_id} and id <> ${bill.id} and status in ('sent', 'partial', 'paid', 'overdue') and period_to > ${bill.period_to}) as exists`;
  if (later[0]?.exists) return;
  const previous = await tx<{ electricity_new: number }[]>`select (bi.meta->>'new_reading')::int as electricity_new from bills b join bill_items bi on bi.bill_id = b.id and bi.type = 'electricity' where b.room_id = ${bill.room_id} and b.id <> ${bill.id} and b.status in ('sent', 'partial', 'paid', 'overdue') and b.period_to < ${bill.period_from} order by b.period_to desc, b.id desc limit 1`;
  await tx`update rooms set current_electricity_reading = ${previous[0]?.electricity_new ?? bill.electricity_old ?? 0}, electricity_reading_updated_at = now() where id = ${bill.room_id}`;
  await tx`delete from meter_readings where room_id = ${bill.room_id} and period_month = ${bill.period_from}`;
}

/**
 * Sửa kỳ chốt IN TRÊN BILL.
 *
 * Chỉ đụng `display_period_from/to` — hai cột riêng dành cho việc hiển thị.
 * `period_from/to` (thứ đã dùng để tính tiền phòng, tiền điện và để chặn trùng
 * bill) giữ nguyên, nên sửa ngày ở đây không bao giờ làm lệch một đồng nào.
 *
 * Kỳ hiển thị tách khỏi kỳ tính tiền, nên có thể sửa cả khi bill đã thu tiền.
 * Bill đã huỷ
 * thì vẫn khoá — hồ sơ đã đóng.
 */
export async function updateBillDisplayPeriod(
  billId: number,
  from: string,
  to: string,
): Promise<ActionResult> {
  const session = await requireRole('admin', 'staff');

  if (!isCivilDate(from)) {
    return { ok: false, field: 'display_period_from', message: 'Ngày bắt đầu kỳ chốt không hợp lệ.' };
  }
  if (!isCivilDate(to)) {
    return { ok: false, field: 'display_period_to', message: 'Ngày kết thúc kỳ chốt không hợp lệ.' };
  }
  // So sánh chuỗi được vì 'YYYY-MM-DD' xếp theo bảng chữ cái đúng bằng xếp theo thời gian.
  if (to < from) {
    return {
      ok: false,
      field: 'display_period_to',
      message: 'Ngày kết thúc kỳ chốt phải sau hoặc bằng ngày bắt đầu.',
    };
  }

  const rows = await sql<
    {
      status: string;
      period_from: CivilDate;
      period_to: CivilDate;
      display_period_from: CivilDate | null;
      display_period_to: CivilDate | null;
    }[]
  >`
    select status, period_from, period_to, display_period_from, display_period_to
    from bills where id = ${billId} limit 1
  `;

  const bill = rows[0];
  if (!bill) return { ok: false, message: 'Không tìm thấy bill.' };
  if (bill.status === 'cancelled') {
    return { ok: false, message: 'Bill đã huỷ nên không sửa được kỳ chốt.' };
  }

  await sql.begin(async (tx) => {
    await tx`
      update bills
      set display_period_from = ${from}, display_period_to = ${to}, updated_at = now()
      where id = ${billId}
    `;

    await logAudit(tx, {
      userId: session.userId,
      action: 'bill.display_period_updated',
      subjectType: 'App\\Models\\Bill',
      subjectId: billId,
      oldValues: {
        display_period_from: bill.display_period_from ?? bill.period_from,
        display_period_to: bill.display_period_to ?? bill.period_to,
      },
      newValues: { display_period_from: from, display_period_to: to },
      note: 'Cập nhật kỳ chốt hiển thị trên bill',
    });
  });

  revalidatePath(`/hoa-don/${billId}`);

  return { ok: true, message: 'Đã cập nhật kỳ chốt hiển thị trên bill.' };
}

type BuiltItem = {
  type: BillItemType;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  meta: Record<string, JSONValue>;
};

/** 6 dòng bill cố định, giữ nguyên thứ tự và metadata trong Supabase. */
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
