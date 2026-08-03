'use client';

import { useEffect, useState, useTransition } from 'react';
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
  const [method, setMethod] = useState<PaymentMethod>('bank_transfer');
  const [note, setNote] = useState('');
  const [voidReason, setVoidReason] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const canRecord = canManage && !['draft', 'adjusting', 'cancelled'].includes(status) && outstanding > 0;

  useEffect(() => {
    const open = () => setMobileOpen(true);
    window.addEventListener('rental:open-bill-payment', open);
    return () => window.removeEventListener('rental:open-bill-payment', open);
  }, []);

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

  function paymentForm(suffix: string) {
    if (!canRecord) return null;

    return (
      <Card className="p-4">
        <h2 className="font-semibold text-slate-900">Ghi nhận thanh toán</h2>
        <p className="mt-1 text-xs text-slate-500">Mặc định điền số còn phải thu: {formatMoney(outstanding)}.</p>

        <div className="mt-3 space-y-3">
          <div>
            <label htmlFor={`bill-payment-amount-${suffix}`} className={labelClass}>Số tiền *</label>
            <input
              id={`bill-payment-amount-${suffix}`}
              inputMode="numeric"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className={`tabular ${inputClass}`}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`bill-payment-date-${suffix}`} className={labelClass}>Ngày thu</label>
              <input
                id={`bill-payment-date-${suffix}`}
                type="date"
                value={paidDate}
                onChange={(event) => setPaidDate(event.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor={`bill-payment-method-${suffix}`} className={labelClass}>Hình thức</label>
              <select
                id={`bill-payment-method-${suffix}`}
                value={method}
                onChange={(event) => setMethod(event.target.value as PaymentMethod)}
                className={inputClass}
              >
                {PAYMENT_METHODS.map((value) => <option key={value} value={value}>{PAYMENT_METHOD_LABELS[value]}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor={`bill-payment-note-${suffix}`} className={labelClass}>Ghi chú</label>
            <input id={`bill-payment-note-${suffix}`} value={note} onChange={(event) => setNote(event.target.value)} className={inputClass} />
          </div>
          <button type="button" onClick={submit} disabled={pending} className={`${buttonClass()} w-full`}>
            {pending ? 'Đang lưu…' : 'Ghi nhận thanh toán'}
          </button>
        </div>
      </Card>
    );
  }

  function history() {
    const confirmedTotal = Math.max(0, payments.filter((payment) => payment.status === 'confirmed').reduce((sum, payment) => sum + payment.amount, 0));

    return (
      <Card className="p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-900">Lịch sử thanh toán</h2>
          <span className="text-sm font-semibold text-slate-500">Đã thu {formatMoney(confirmedTotal)}</span>
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
    );
  }

  return (
    <>
      <section className="no-print hidden space-y-4 lg:sticky lg:top-20 lg:block">
        {paymentForm('desktop')}
        {history()}
        {message ? <p role="alert" className={`rounded-lg px-3 py-2 text-sm ${message.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{message.text}</p> : null}
      </section>

      {mobileOpen ? (
        <div className="no-print fixed inset-0 z-50 bg-slate-950/45 p-3 lg:hidden" role="dialog" aria-modal="true" aria-labelledby="mobile-payment-title">
          <div className="mx-auto flex max-h-[calc(100vh-1.5rem)] max-w-lg flex-col overflow-hidden rounded-xl bg-slate-50 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
              <h2 id="mobile-payment-title" className="font-semibold text-slate-900">Thanh toán bill</h2>
              <button type="button" onClick={() => setMobileOpen(false)} className={buttonClass('secondary')}>Đóng</button>
            </div>
            <div className="space-y-4 overflow-y-auto p-3">
              {paymentForm('mobile')}
              {history()}
              {message ? <p role="alert" className={`rounded-lg px-3 py-2 text-sm ${message.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{message.text}</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
