import 'server-only';

import { randomUUID } from 'node:crypto';
import type { Sql, TransactionSql } from 'postgres';

type Db = Sql | TransactionSql;

export type PaymentQrData = {
  amount: number;
  transferContent: string;
  accountName: string;
  accountNo: string;
  bankName: string;
  qrImageUrl: string;
  qrDataUrl: string;
};

/**
 * Tạo lại yêu cầu VietQR đang chờ theo đúng số dư hiện tại của bill.
 * Yêu cầu cũ không bị xoá để vẫn giữ lịch sử; chỉ đánh dấu cancelled.
 */
export async function syncBillPaymentRequest(
  db: Db,
  input: { billId: number; amount: number; roomCode: string; periodTo: string },
): Promise<PaymentQrData | null> {
  const accounts = await db<{
    id: number;
    bank_name: string;
    bank_code: string | null;
    acq_id: string | null;
    account_no: string;
    account_name: string;
  }[]>`
    select id, bank_name, bank_code, acq_id, account_no, account_name
    from bank_accounts
    order by is_default desc, updated_at desc
    limit 1
  `;

  const account = accounts[0];
  if (!account || input.amount <= 0) {
    if (input.amount <= 0) {
      await db`
        update payment_requests
        set status = 'cancelled', cancelled_at = now(), cancel_reason = 'Bill không còn số dư.', updated_at = now()
        where bill_id = ${input.billId} and type = 'bill_payment' and status = 'pending'
      `;
    }
    return null;
  }

  const providerCode = (account.bank_code || account.acq_id || '').trim();
  if (!providerCode || !account.account_no || !account.account_name) return null;

  const transferContent = `BILL P${input.roomCode.toUpperCase()} T${input.periodTo.slice(5, 7)}${input.periodTo.slice(0, 4)}`;
  const encoded = (value: string) => encodeURIComponent(value);
  const qrImageUrl =
    `https://img.vietqr.io/image/${encoded(providerCode)}-${encoded(account.account_no)}-compact.png` +
    `?amount=${input.amount}&addInfo=${encoded(transferContent)}&accountName=${encoded(account.account_name)}`;
  const payload = `bank=${providerCode}|account_no=${account.account_no}|account_name=${account.account_name}|amount=${input.amount}|content=${transferContent}`;
  const qrDataUrl = `https://quickchart.io/qr?text=${encoded(payload)}&size=320`;

  const pending = await db<{ id: number }[]>`
    select id from payment_requests
    where bill_id = ${input.billId} and type = 'bill_payment' and status = 'pending'
    order by id desc limit 1
  `;
  if (pending[0]) {
    await db`
      update payment_requests
      set amount = ${input.amount}, bank_account_id = ${account.id},
          transfer_content = ${transferContent}, qr_payload = ${payload},
          qr_image_url = ${qrImageUrl}, qr_data_url = ${qrDataUrl}, updated_at = now()
      where id = ${pending[0].id}
    `;
  } else {
    await db`
      insert into payment_requests
        (code, type, tenant_id, lease_id, bill_id, amount, bank_account_id,
         transfer_content, qr_payload, qr_image_url, qr_data_url, status, created_at, updated_at)
      select
        ${`PR${Date.now()}${randomUUID().replaceAll('-', '').slice(0, 8)}`},
        'bill_payment', b.tenant_id, b.lease_id, b.id, ${input.amount}, ${account.id},
        ${transferContent}, ${payload}, ${qrImageUrl}, ${qrDataUrl}, 'pending', now(), now()
      from bills b
      where b.id = ${input.billId}
    `;
  }

  return {
    amount: input.amount,
    transferContent,
    accountName: account.account_name,
    accountNo: account.account_no,
    bankName: account.bank_name,
    qrImageUrl,
    qrDataUrl,
  };
}

export function buildFallbackPaymentQr(input: {
  amount: number;
  roomCode: string;
  periodTo: string;
  bankName: string;
  bankCode: string;
  accountNo: string;
  accountName: string;
}): PaymentQrData {
  const transferContent = `BILL P${input.roomCode.toUpperCase()} T${input.periodTo.slice(5, 7)}${input.periodTo.slice(0, 4)}`;
  const encoded = (value: string) => encodeURIComponent(value);
  const qrImageUrl =
    `https://img.vietqr.io/image/${encoded(input.bankCode)}-${encoded(input.accountNo)}-compact.png` +
    `?amount=${input.amount}&addInfo=${encoded(transferContent)}&accountName=${encoded(input.accountName)}`;

  return {
    amount: input.amount,
    transferContent,
    accountName: input.accountName,
    accountNo: input.accountNo,
    bankName: input.bankName,
    qrImageUrl,
    qrDataUrl: qrImageUrl,
  };
}
