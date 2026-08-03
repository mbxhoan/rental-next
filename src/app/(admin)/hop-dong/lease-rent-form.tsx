'use client';

import { useState, useTransition } from 'react';
import { formatMoney, normalizeMoneyInput } from '@/domain/money';
import { updateLeaseRent } from '@/server/actions/leases';
import { buttonClass, inputClass } from '@/components/ui';

export function LeaseRentForm({ leaseId, monthlyRent }: { leaseId: number; monthlyRent: number }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(monthlyRent));
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setMessage(null);
    const amount = normalizeMoneyInput(value);
    if (amount === null || amount <= 0) {
      setMessage('Giá phòng phải là số tiền lớn hơn 0.');
      return;
    }

    startTransition(async () => {
      const result = await updateLeaseRent(leaseId, value);
      setMessage(result.message);
      if (result.ok) {
        setValue(String(amount));
        setOpen(false);
        window.location.reload();
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        className="text-xs font-semibold text-brand-600 hover:text-brand-800 hover:underline"
        onClick={() => {
          setMessage(null);
          setValue(String(monthlyRent));
          setOpen(true);
        }}
      >
        Sửa giá
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-brand-200 bg-brand-50/60 p-2">
      <label htmlFor={`lease-rent-${leaseId}`} className="text-xs font-medium text-slate-600">
        Giá mới/tháng
      </label>
      <div className="mt-1 flex flex-wrap gap-2">
        <input
          id={`lease-rent-${leaseId}`}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          inputMode="numeric"
          className={`tabular min-w-0 flex-1 ${inputClass}`}
          placeholder="5.000.000"
          disabled={pending}
        />
        <button type="button" className={buttonClass()} onClick={submit} disabled={pending}>
          {pending ? 'Đang lưu…' : 'Lưu'}
        </button>
        <button
          type="button"
          className={buttonClass('secondary')}
          onClick={() => setOpen(false)}
          disabled={pending}
        >
          Huỷ
        </button>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">Có thể nhập 5000000 hoặc 5.000.000.</p>
      {message ? <p className="mt-1 text-xs text-rose-600">{message}</p> : null}
    </div>
  );
}
