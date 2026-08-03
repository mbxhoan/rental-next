'use server';

import { revalidatePath } from 'next/cache';
import type { TransactionSql } from 'postgres';
import { requireRole } from '@/lib/auth';
import { sql } from '@/lib/db';
import { logAudit } from './audit';
import { syncBillPaymentRequest } from '../services/bill-payment-request';

export type BankAccountInput = {
  id?: number;
  bankName: string;
  bankCode?: string;
  acqId?: string;
  accountNo: string;
  accountName: string;
  isDefault: boolean;
  note?: string;
};

export type BankAccountActionResult =
  | { ok: true; message: string }
  | { ok: false; field?: string; message: string };

type BankAccountSnapshot = {
  id: number;
  bank_name: string;
  bank_code: string | null;
  acq_id: string | null;
  account_no: string;
  account_name: string;
  is_default: boolean;
  note: string | null;
};

/** Thêm hoặc sửa tài khoản nhận tiền. Chỉ admin được thay đổi cài đặt này. */
export async function saveBankAccount(input: BankAccountInput): Promise<BankAccountActionResult> {
  const session = await requireRole('admin');
  const parsed = parseInput(input);
  if (!parsed.ok) return parsed;

  try {
    let refreshedCount = 0;
    await sql.begin(async (tx) => {
      const existing = input.id
        ? (await tx<BankAccountSnapshot[]>`
            select id, bank_name, bank_code, acq_id, account_no, account_name, is_default, note
            from bank_accounts where id = ${input.id} for update
          `)[0]
        : null;

      if (input.id && !existing) throw new Error('BANK_ACCOUNT_NOT_FOUND');
      if (existing?.is_default && !parsed.value.isDefault) throw new Error('DEFAULT_ACCOUNT_REQUIRED');

      const noAccounts = (await tx<{ count: number }[]>`
        select count(*)::int as count from bank_accounts
      `)[0].count === 0;
      const makeDefault = parsed.value.isDefault || noAccounts;

      if (makeDefault) {
        await tx`update bank_accounts set is_default = false, updated_at = now()`;
      }

      const rows = input.id
        ? await tx<{ id: number }[]>`
            update bank_accounts
            set bank_name = ${parsed.value.bankName}, bank_code = ${parsed.value.bankCode},
                acq_id = ${parsed.value.acqId}, account_no = ${parsed.value.accountNo},
                account_name = ${parsed.value.accountName}, is_default = ${makeDefault},
                note = ${parsed.value.note}, updated_at = now()
            where id = ${input.id}
            returning id
          `
        : await tx<{ id: number }[]>`
            insert into bank_accounts
              (bank_name, bank_code, acq_id, account_no, account_name, is_default, note, created_at, updated_at)
            values
              (${parsed.value.bankName}, ${parsed.value.bankCode}, ${parsed.value.acqId},
               ${parsed.value.accountNo}, ${parsed.value.accountName}, ${makeDefault},
               ${parsed.value.note}, now(), now())
            returning id
          `;

      const accountId = rows[0]?.id;
      if (!accountId) throw new Error('BANK_ACCOUNT_SAVE_FAILED');

      const isNowDefault = makeDefault || existing?.is_default === true;
      if (isNowDefault) refreshedCount = await refreshPendingBillQrs(tx);

      await logAudit(tx, {
        userId: session.userId,
        action: existing ? 'bank_account.updated' : 'bank_account.created',
        subjectType: 'App\\Models\\BankAccount',
        subjectId: accountId,
        oldValues: existing ? snapshotValues(existing) : null,
        newValues: {
          bank_name: parsed.value.bankName, bank_code: parsed.value.bankCode,
          acq_id: parsed.value.acqId, account_no: parsed.value.accountNo,
          account_name: parsed.value.accountName, is_default: makeDefault, note: parsed.value.note,
        },
        note: existing ? 'Cập nhật tài khoản nhận tiền' : 'Thêm tài khoản nhận tiền',
      });
    });

    revalidateBankAccountPaths();
    return {
      ok: true,
      message: `${input.id ? 'Đã cập nhật' : 'Đã thêm'} tài khoản nhận tiền.${refreshedCount > 0 ? ` Đã cập nhật QR cho ${refreshedCount} bill đang chờ thanh toán.` : ''}`,
    };
  } catch (error) {
    return { ok: false, message: bankAccountErrorMessage(error) };
  }
}

/** Đặt tài khoản mặc định và đồng bộ QR của các bill còn nợ. */
export async function setDefaultBankAccount(accountId: number): Promise<BankAccountActionResult> {
  const session = await requireRole('admin');
  if (!Number.isInteger(accountId) || accountId <= 0) return { ok: false, message: 'Tài khoản nhận tiền không hợp lệ.' };

  try {
    let refreshedCount = 0;
    await sql.begin(async (tx) => {
      const account = (await tx<{ id: number }[]>`
        select id from bank_accounts where id = ${accountId} for update
      `)[0];
      if (!account) throw new Error('BANK_ACCOUNT_NOT_FOUND');

      await tx`update bank_accounts set is_default = false, updated_at = now()`;
      await tx`update bank_accounts set is_default = true, updated_at = now() where id = ${accountId}`;
      refreshedCount = await refreshPendingBillQrs(tx);

      await logAudit(tx, {
        userId: session.userId,
        action: 'bank_account.default_changed',
        subjectType: 'App\\Models\\BankAccount',
        subjectId: accountId,
        newValues: { bank_account_id: accountId, is_default: true },
        note: 'Đổi tài khoản nhận tiền mặc định',
      });
    });

    revalidateBankAccountPaths();
    return {
      ok: true,
      message: `Đã đổi tài khoản mặc định.${refreshedCount > 0 ? ` Đã cập nhật QR cho ${refreshedCount} bill đang chờ thanh toán.` : ''}`,
    };
  } catch (error) {
    return { ok: false, message: bankAccountErrorMessage(error) };
  }
}

/** Chỉ xoá tài khoản chưa từng được dùng để giữ nguyên lịch sử QR cũ. */
export async function deleteBankAccount(accountId: number): Promise<BankAccountActionResult> {
  const session = await requireRole('admin');
  if (!Number.isInteger(accountId) || accountId <= 0) return { ok: false, message: 'Tài khoản nhận tiền không hợp lệ.' };

  try {
    await sql.begin(async (tx) => {
      const account = (await tx<BankAccountSnapshot[]>`
        select id, bank_name, bank_code, acq_id, account_no, account_name, is_default, note
        from bank_accounts where id = ${accountId} for update
      `)[0];
      if (!account) throw new Error('BANK_ACCOUNT_NOT_FOUND');
      if (account.is_default) throw new Error('DEFAULT_ACCOUNT_CANNOT_DELETE');

      const usage = (await tx<{ count: number }[]>`
        select count(*)::int as count from payment_requests where bank_account_id = ${accountId}
      `)[0].count;
      if (usage > 0) throw new Error('BANK_ACCOUNT_IN_USE');

      await tx`delete from bank_accounts where id = ${accountId}`;
      await logAudit(tx, {
        userId: session.userId,
        action: 'bank_account.deleted',
        subjectType: 'App\\Models\\BankAccount',
        subjectId: accountId,
        oldValues: snapshotValues(account),
        note: 'Xoá tài khoản nhận tiền',
      });
    });

    revalidateBankAccountPaths();
    return { ok: true, message: 'Đã xoá tài khoản nhận tiền.' };
  } catch (error) {
    return { ok: false, message: bankAccountErrorMessage(error) };
  }
}

async function refreshPendingBillQrs(tx: TransactionSql): Promise<number> {
  const bills = await tx<{ id: number; amount: number; room_code: string; period_to: string }[]>`
    select distinct b.id, b.outstanding_amount as amount, r.room_code, b.period_to
    from payment_requests pr
    join bills b on b.id = pr.bill_id
    join rooms r on r.id = b.room_id
    where pr.type = 'bill_payment' and pr.status = 'pending'
      and b.outstanding_amount > 0
      and b.status not in ('draft', 'adjusting', 'cancelled', 'paid')
  `;

  for (const bill of bills) {
    await syncBillPaymentRequest(tx, {
      billId: bill.id, amount: Number(bill.amount), roomCode: bill.room_code, periodTo: bill.period_to,
    });
  }
  return bills.length;
}

function parseInput(input: BankAccountInput):
  | { ok: true; value: { bankName: string; bankCode: string | null; acqId: string | null; accountNo: string; accountName: string; isDefault: boolean; note: string | null } }
  | { ok: false; field?: string; message: string } {
  const bankName = clean(input.bankName);
  const bankCode = nullable(input.bankCode);
  const acqId = nullable(input.acqId);
  const accountNo = clean(input.accountNo);
  const accountName = clean(input.accountName);
  const note = nullable(input.note);

  if (!bankName) return { ok: false, field: 'bankName', message: 'Vui lòng nhập tên ngân hàng.' };
  if (!bankCode && !acqId) return { ok: false, field: 'bankCode', message: 'Vui lòng nhập Bank code hoặc Acq ID để tạo VietQR.' };
  if (!accountNo) return { ok: false, field: 'accountNo', message: 'Vui lòng nhập số tài khoản.' };
  if (!accountName) return { ok: false, field: 'accountName', message: 'Vui lòng nhập tên chủ tài khoản.' };
  if (bankName.length > 120 || accountName.length > 120) return { ok: false, message: 'Tên ngân hàng và tên chủ tài khoản không vượt quá 120 ký tự.' };
  if ((bankCode && bankCode.length > 40) || (acqId && acqId.length > 40)) return { ok: false, message: 'Bank code và Acq ID không vượt quá 40 ký tự.' };
  if (accountNo.length > 60) return { ok: false, field: 'accountNo', message: 'Số tài khoản không vượt quá 60 ký tự.' };
  if (note && note.length > 1000) return { ok: false, field: 'note', message: 'Ghi chú không vượt quá 1000 ký tự.' };

  return { ok: true, value: { bankName, bankCode, acqId, accountNo, accountName, isDefault: input.isDefault === true, note } };
}

function clean(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function nullable(value: unknown): string | null { const cleaned = clean(value); return cleaned === '' ? null : cleaned; }

function snapshotValues(account: BankAccountSnapshot) {
  return {
    bank_name: account.bank_name, bank_code: account.bank_code, acq_id: account.acq_id,
    account_no: account.account_no, account_name: account.account_name,
    is_default: account.is_default, note: account.note,
  };
}

function revalidateBankAccountPaths(): void {
  revalidatePath('/cai-dat'); revalidatePath('/hoa-don'); revalidatePath('/thanh-toan');
}

function bankAccountErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  if (code === 'BANK_ACCOUNT_NOT_FOUND') return 'Không tìm thấy tài khoản nhận tiền.';
  if (code === 'DEFAULT_ACCOUNT_REQUIRED') return 'Hãy đặt tài khoản khác làm mặc định trước khi bỏ tài khoản này.';
  if (code === 'DEFAULT_ACCOUNT_CANNOT_DELETE') return 'Không thể xoá tài khoản đang mặc định. Hãy đặt tài khoản khác làm mặc định trước.';
  if (code === 'BANK_ACCOUNT_IN_USE') return 'Không thể xoá tài khoản đã được dùng cho yêu cầu thanh toán cũ.';
  if (code === 'BANK_ACCOUNT_SAVE_FAILED') return 'Không thể lưu tài khoản nhận tiền.';
  return 'Không thể cập nhật tài khoản nhận tiền. Hãy thử lại.';
}
