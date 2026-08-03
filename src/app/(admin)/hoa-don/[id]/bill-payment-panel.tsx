'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { formatDMY } from '@/domain/date';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS, type PaymentMethod } from '@/domain/enums';
import { formatMoney, normalizeMoneyInput } from '@/domain/money';
import { recordBillPayment, voidBillPayment } from '@/server/actions/payments';
import { buttonClass, Card, inputClass, labelClass } from '@/components/ui';
import type { BillPaymentRow } from '@/server/queries';

export function BillPaymentPanel({
  billId,
  status,
  outstanding,
  payments,
  canManage,
}: {
  billId: number;
  status: string;
  outstanding: number;
  payments: BillPaymentRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState(outstanding > 0 ? String(outstanding) : '');
  const [paidDate, setPaidDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [note, setNote] = useState('');
  const [voidReason, setVoidReason] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const canRecord = canManage && !['draft', 'adjusting', 'cancelled'].includes(status) && outstanding > 0;

  function submit() {
    setMessage(null);
    const parsedAmount = normalizeMoneyInput(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      setMessage({ ok: false, text: 'Số tiền thanh toán phải lớn hơn 0.' });
      return;
    }
    if (!confirm(`Ghi nhận thu ${formatMoney(parsedAmount)} cho bill #${billId}?`)) return;

    startTransition(async () => {
      const result = await recordBillPayment({ billId, amount, paidDate, method, note });
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) {
        setAmount('');
        setNote('');
        router.refresh();
      }
    });
  }

  function voidPayment(payment: BillPaymentRow) {
    const reason = window.prompt('Nhập lý do huỷ phiếu thu:', voidReason);
    if (reason === null) return;
    setVoidReason(reason);
    if (!confirm(`Huỷ phiếu thu ${formatMoney(payment.amount)} ngày ${formatDMY(payment.paid_date)}?`)) return;

    startTransition(async () => {
      const result = await voidBillPayment(payment.id, reason);
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) router.refresh();
    });
  }

  return (
    <section className="no-print mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {canRecord ? (
        <Card className="p-4">
          <h2 className="font-semibold text-slate-900">Ghi nhận thanh toán</h2>
          <p className="mt-1 text-xs text-slate-500">Mặc định điền số còn phải thu: {formatMoney(outstanding)}.</p>

          <div className="mt-3 space-y-3">
            <div>
              <label htmlFor="bill-payment-amount" className={labelClass}>Số tiền *</label>
              <input
                id="bill-payment-amount"
                inputMode="numeric"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className={`tabular ${inputClass}`}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="bill-payment-date" className={labelClass}>Ngày thu</label>
                <input
                  id="bill-payment-date"
                  type="date"
                  value={paidDate}
                  onChange={(event) => setPaidDate(event.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="bill-payment-method" className={labelClass}>Hình thức</label>
                <select
                  id="bill-payment-method"
                  value={method}
                  onChange={(event) => setMethod(event.target.value as PaymentMethod)}
                  className={inputClass}
                >
                  {PAYMENT_METHODS.map((value) => <option key={value} value={value}>{PAYMENT_METHOD_LABELS[value]}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="bill-payment-note" className={labelClass}>Ghi chú</label>
              <input id="bill-payment-note" value={note} onChange={(event) => setNote(event.target.value)} className={inputClass} />
            </div>
            <button type="button" onClick={submit} disabled={pending} className={`${buttonClass()} w-full`}>
              {pending ? 'Đang lưu…' : 'Ghi nhận thanh toán'}
            </button>
          </div>
        </Card>
      ) : null}

      <Card className={`p-4 ${canRecord ? '' : 'lg:col-span-2'}`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-900">Lịch sử thanh toán</h2>
          <span className="text-sm font-semibold text-slate-500">Đã thu {formatMoney(Math.max(0, payments.filter((payment) => payment.status === 'confirmed').reduce((sum, payment) => sum + payment.amount, 0)))}</span>
        </div>
        {payments.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Chưa có khoản thanh toán nào.</p>
        ) : (
          <div className="mt-3 divide-y divide-slate-100">
            {payments.map((payment) => (
              <div key={payment.id} className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                <div>
                  <p className={`tabular font-semibold ${payment.status === 'voided' ? 'text-slate-400 line-through' : 'text-emerald-700'}`}>
                    {formatMoney(payment.amount)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatDMY(payment.paid_date)} · {PAYMENT_METHOD_LABELS[payment.method as PaymentMethod] ?? payment.method}
                    {payment.note ? ` · ${payment.note}` : ''}
                  </p>
                  {payment.void_reason ? <p className="text-xs text-rose-600">Đã huỷ: {payment.void_reason}</p> : null}
                </div>
                {canManage && payment.status === 'confirmed' ? (
                  <button type="button" onClick={() => voidPayment(payment)} disabled={pending} className={buttonClass('secondary')}>
                    Huỷ phiếu thu
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      {message ? (
        <p role="alert" className={`lg:col-span-2 rounded-lg px-3 py-2 text-sm ${message.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
