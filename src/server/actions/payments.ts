'use server';

import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { resolveBillStatus } from '@/domain/bill-status';
import { rentalConfig } from '@/domain/config';
import { civil, today } from '@/domain/date';
import { PAYMENT_METHODS, type BillStatus, type PaymentMethod } from '@/domain/enums';
import { normalizeMoneyInput } from '@/domain/money';
import { logAudit } from './audit';
import { syncBillPaymentRequest } from '../services/bill-payment-request';
import type { ActionResult } from './bills';

/**
 * Ghi nhận khách trả tiền.
 *
 * Bám `RecordBillPayment::execute()` bên Laravel: tạo `payments`, ghi
 * `cash_transactions` (dòng tiền vào), tính lại `paid_amount` /
 * `outstanding_amount` / `status` của bill — trong MỘT transaction.
 *
 * Tiền đã trả luôn tính lại bằng SUM các phiếu thu đã xác nhận, không cộng
 * dồn vào cột cũ — làm vậy thì huỷ phiếu hay chạy trùng cũng không lệch sổ.
 */
export async function recordBillPayment(input: {
  billId: number;
  amount: unknown;
  paidDate: string;
  method: string;
  note?: string;
}): Promise<ActionResult> {
  const session = await requireRole('admin', 'staff');

  const amount = normalizeMoneyInput(input.amount) ?? 0;
  if (amount <= 0) {
    return { ok: false, field: 'amount', message: 'Số tiền thanh toán phải lớn hơn 0.' };
  }

  let paidDate: string;
  try {
    paidDate = civil(input.paidDate);
  } catch {
    return { ok: false, field: 'paid_date', message: 'Ngày thanh toán không hợp lệ.' };
  }

  const method: PaymentMethod = PAYMENT_METHODS.includes(input.method as never)
    ? (input.method as PaymentMethod)
    : 'cash';

  const note = typeof input.note === 'string' && input.note.trim() !== '' ? input.note.trim() : null;

  const bills = await sql<
    { id: number; lease_id: number; tenant_id: number; total_amount: number; status: BillStatus; due_date: string | null; period_to: string; room_code: string }[]
  >`
    select b.id, b.lease_id, b.tenant_id, b.total_amount, b.status, b.due_date, b.period_to, r.room_code
    from bills b join rooms r on r.id = b.room_id where b.id = ${input.billId} limit 1
  `;

  const bill = bills[0];
  if (!bill) return { ok: false, message: 'Không tìm thấy bill.' };

  if (bill.status === 'cancelled') {
    return { ok: false, message: 'Bill đã bị huỷ, không thể ghi nhận thanh toán.' };
  }
  if (bill.status === 'adjusting') {
    return { ok: false, message: 'Bill đang điều chỉnh, hãy chốt lại trước khi ghi nhận thanh toán.' };
  }

  await sql.begin(async (tx) => {
    // Khoá dòng bill để hai phiếu thu ghi cùng lúc không đè số của nhau.
    await tx`select id from bills where id = ${bill.id} for update`;

    const inserted = await tx<{ id: number }[]>`
      insert into payments
        (bill_id, lease_id, tenant_id, paid_date, amount, method, status, note, created_at, updated_at)
      values
        (${bill.id}, ${bill.lease_id}, ${bill.tenant_id}, ${paidDate}, ${amount},
         ${method}, 'confirmed', ${note}, now(), now())
      returning id
    `;
    const paymentId = inserted[0].id;

    await tx`
      insert into cash_transactions
        (transaction_date, type, amount, note, source_type, source_id, created_at, updated_at)
      values
        (${paidDate}, 'inflow', ${amount}, ${`Khách thanh toán bill #${bill.id}.`},
         'App\\Models\\Payment', ${paymentId}, now(), now())
    `;

    const sums = await tx<{ paid: number }[]>`
      select coalesce(sum(amount), 0) as paid
      from payments where bill_id = ${bill.id} and status = 'confirmed'
    `;
    const paidAmount = Number(sums[0].paid);
    const outstanding = Math.max(0, bill.total_amount - paidAmount);
    const nextStatus = resolveBillStatus(
      { ...bill, paid_amount: paidAmount },
      today(rentalConfig.timezone),
    );

    await tx`
      update bills
      set paid_amount = ${paidAmount},
          outstanding_amount = ${outstanding},
          status = ${nextStatus},
          updated_at = now()
      where id = ${bill.id}
    `;
    await syncBillPaymentRequest(tx, {
      billId: bill.id,
      amount: outstanding,
      roomCode: bill.room_code,
      periodTo: bill.period_to,
    });

    await logAudit(tx, {
      userId: session.userId,
      action: 'payment.recorded',
      subjectType: 'App\\Models\\Payment',
      subjectId: paymentId,
      newValues: { bill_id: bill.id, amount, method, paid_date: paidDate },
      note,
    });
  });

  revalidatePath(`/hoa-don/${bill.id}`);
  revalidatePath('/thanh-toan');
  revalidatePath('/dashboard');

  return { ok: true, message: 'Đã ghi nhận thanh toán.' };
}

/**
 * Huỷ một phiếu thu ghi nhầm.
 *
 * Không xoá dòng nào — đánh dấu `voided` rồi ghi một dòng tiền ra bù lại, để
 * sổ quỹ vẫn khớp và vẫn tra được lịch sử.
 */
export async function voidBillPayment(
  paymentId: number,
  reason: string,
): Promise<ActionResult> {
  const session = await requireRole('admin', 'staff');

  const trimmedReason = reason.trim();
  if (trimmedReason === '') {
    return { ok: false, field: 'void_reason', message: 'Vui lòng nhập lý do huỷ thanh toán.' };
  }

  const payments = await sql<
    { id: number; bill_id: number; amount: number; status: string }[]
  >`select id, bill_id, amount, status from payments where id = ${paymentId} limit 1`;

  const payment = payments[0];
  if (!payment) return { ok: false, message: 'Không tìm thấy phiếu thu.' };
  if (payment.status !== 'confirmed') {
    return {
      ok: false,
      message: 'Chỉ có thể huỷ thanh toán đang ở trạng thái đã xác nhận.',
    };
  }

  await sql.begin(async (tx) => {
    await tx`
      update payments
      set status = 'voided', voided_at = now(), void_reason = ${trimmedReason}, updated_at = now()
      where id = ${paymentId}
    `;

    await tx`
      insert into cash_transactions
        (transaction_date, type, amount, note, source_type, source_id, created_at, updated_at)
      values
        (${today(rentalConfig.timezone)}, 'outflow', ${payment.amount},
         ${`Huỷ thanh toán bill #${payment.bill_id}. Lý do: ${trimmedReason}`},
         'App\\Models\\Payment', ${paymentId}, now(), now())
    `;

    // Khoá dòng bill trong transaction, giống lockForUpdate() bên Laravel —
    // tránh hai người cùng huỷ/ghi thu một lúc làm lệch số đã trả.
    const bills = await tx<
      { id: number; total_amount: number; status: BillStatus; due_date: string | null; period_to: string; room_code: string }[]
    >`select b.id, b.total_amount, b.status, b.due_date, b.period_to, r.room_code from bills b join rooms r on r.id = b.room_id where b.id = ${payment.bill_id} for update`;
    const bill = bills[0];

    const sums = await tx<{ paid: number }[]>`
      select coalesce(sum(amount), 0) as paid
      from payments where bill_id = ${payment.bill_id} and status = 'confirmed'
    `;
    const paidAmount = Number(sums[0].paid);
    const outstanding = Math.max(0, bill.total_amount - paidAmount);
    const nextStatus = resolveBillStatus(
      { ...bill, paid_amount: paidAmount },
      today(rentalConfig.timezone),
    );

    await tx`
      update bills
      set paid_amount = ${paidAmount},
          outstanding_amount = ${outstanding},
          status = ${nextStatus},
          updated_at = now()
      where id = ${payment.bill_id}
    `;
    await syncBillPaymentRequest(tx, {
      billId: payment.bill_id,
      amount: outstanding,
      roomCode: bill.room_code,
      periodTo: bill.period_to,
    });

    await logAudit(tx, {
      userId: session.userId,
      action: 'payment.voided',
      subjectType: 'App\\Models\\Payment',
      subjectId: paymentId,
      oldValues: { status: 'confirmed', amount: payment.amount },
      newValues: { status: 'voided' },
      note: trimmedReason,
    });
  });

  revalidatePath(`/hoa-don/${payment.bill_id}`);
  revalidatePath('/thanh-toan');
  revalidatePath('/dashboard');

  return { ok: true, message: 'Đã huỷ phiếu thu.' };
}
