'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { BillStatus } from '@/domain/enums';
import { updateBillElectricity } from '@/server/actions/bills';
import { buttonClass, inputClass } from '@/components/ui';

export function MeterEditForm({
  billId,
  status,
  electricityOld,
  electricityNew: initialNew,
}: {
  billId: number;
  status: BillStatus;
  electricityOld: number;
  electricityNew: number;
}) {
  const router = useRouter();
  const [value, setValue] = useState(String(initialNew));
  const [reset, setReset] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const next = Number(value.replace(/[,\.\s]/g, ''));
  const lower = Number.isFinite(next) && next < electricityOld;

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateBillElectricity(billId, value, reset);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="no-print mt-3 rounded-xl border border-violet-200 bg-violet-50 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-600">Số điện mới</span>
          <input inputMode="numeric" value={value} onChange={(event) => setValue(event.target.value)} className={`tabular ${inputClass}`} />
        </label>
        <button type="button" onClick={save} disabled={pending || (lower && !reset)} className={buttonClass()}>
          {pending ? 'Đang lưu…' : status === 'adjusting' ? 'Lưu điều chỉnh' : 'Lưu số điện'}
        </button>
      </div>
      {lower ? (
        <label className="mt-2 flex items-start gap-2 text-xs text-rose-700">
          <input type="checkbox" checked={reset} onChange={(event) => setReset(event.target.checked)} />
          <span>Đồng hồ thay/reset — kỳ này tính số điện sử dụng từ 0.</span>
        </label>
      ) : null}
      {error ? <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p> : null}
    </div>
  );
}
