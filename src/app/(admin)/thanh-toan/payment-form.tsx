'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from '@/domain/enums';
import { formatMoney, normalizeMoneyInput } from '@/domain/money';
import { recordBillPayment } from '@/server/actions/payments';
import { buttonClass, inputClass, labelClass } from '@/components/ui';

/** Form thu tiền. Chọn bill là tự điền sẵn số còn nợ cho đỡ gõ. */
export function PaymentForm({
  bills,
}: {
  bills: { id: number; label: string; outstanding: number }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [billId, setBillId] = useState('');
  const [amount, setAmount] = useState('');
  const [paidDate, setPaidDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState('bank_transfer');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const selected = bills.find((bill) => String(bill.id) === billId);
  const parsedAmount = normalizeMoneyInput(amount);
  const overpay = selected !== undefined && parsedAmount !== null && parsedAmount > selected.outstanding;

  function chooseBill(value: string) {
    setBillId(value);
    const bill = bills.find((item) => String(item.id) === value);
    setAmount(bill ? String(bill.outstanding) : '');
  }

  function submit() {
    setMessage(null);

    if (!selected) {
      setMessage({ ok: false, text: 'Vui lòng chọn bill cần thu.' });
      return;
    }
    if (!confirm(`Ghi nhận thu ${formatMoney(parsedAmount ?? 0)} cho ${selected.label}?`)) return;

    startTransition(async () => {
      const result = await recordBillPayment({
        billId: selected.id,
        amount,
        paidDate,
        method,
        note,
      });

      setMessage({ ok: result.ok, text: result.message });

      if (result.ok) {
        setBillId('');
        setAmount('');
        setNote('');
        router.refresh();
      }
    });
  }

  if (bills.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200/80 bg-white p-4 text-center text-sm text-slate-500 shadow-sm">
        Không còn bill nào phải thu.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/50">
      <div>
        <label htmlFor="bill" className={labelClass}>
          Bill <span className="text-rose-500">*</span>
        </label>
        <select
          id="bill"
          value={billId}
          onChange={(event) => chooseBill(event.target.value)}
          className={inputClass}
        >
          <option value="">— Chọn bill —</option>
          {bills.map((bill) => (
            <option key={bill.id} value={bill.id}>
              {bill.label} — còn {formatMoney(bill.outstanding)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="amount" className={labelClass}>
          Số tiền <span className="text-rose-500">*</span>
        </label>
        <input
          id="amount"
          inputMode="numeric"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          className={`tabular ${inputClass}`}
        />
        {overpay ? (
          <p className="mt-1 text-xs text-amber-600">
            Số tiền lớn hơn số còn nợ ({formatMoney(selected!.outstanding)}). Vẫn ghi nhận được.
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="paid_date" className={labelClass}>
            Ngày thu
          </label>
          <input
            id="paid_date"
            type="date"
            value={paidDate}
            onChange={(event) => setPaidDate(event.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="method" className={labelClass}>
            Hình thức
          </label>
          <select
            id="method"
            value={method}
            onChange={(event) => setMethod(event.target.value)}
            className={inputClass}
          >
            {PAYMENT_METHODS.map((value) => (
              <option key={value} value={value}>
                {PAYMENT_METHOD_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="note" className={labelClass}>
          Ghi chú
        </label>
        <input
          id="note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className={inputClass}
        />
      </div>

      {message ? (
        <p
          role="alert"
          className={`rounded-lg px-3 py-2 text-sm ${
            message.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
          }`}
        >
          {message.text}
        </p>
      ) : null}

      <button
        type="button"
        onClick={submit}
        disabled={pending || !selected}
        className={`${buttonClass()} w-full py-2.5`}
      >
        {pending ? 'Đang ghi nhận…' : 'Ghi nhận thu tiền'}
      </button>
    </div>
  );
}
