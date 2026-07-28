'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateBillDisplayPeriod } from '@/server/actions/bills';
import { buttonClass, inputClass, labelClass } from '@/components/ui';

/**
 * Sửa kỳ chốt in trên bill.
 *
 * Chỉ đổi chữ hiển thị, không đổi tiền: kỳ dùng để tính toán nằm ở cột khác và
 * không đụng tới. Dùng thẳng `input type="date"` để trên điện thoại bung đúng
 * bộ chọn ngày của hệ điều hành, khỏi thư viện lịch nào.
 */
export function DisplayPeriodForm({
  billId,
  from,
  to,
}: {
  billId: number;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({ from, to });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateBillDisplayPeriod(billId, values.from, values.to);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSaved(true);
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <div className="no-print mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm font-medium text-brand-600 underline-offset-2 hover:underline"
        >
          Sửa kỳ chốt in trên bill
        </button>
        {saved ? <span className="text-sm text-emerald-600">Đã lưu ✓</span> : null}
      </div>
    );
  }

  return (
    <div className="no-print mt-3 rounded-lg border border-brand-100 bg-brand-50 p-3">
      <p className="mb-2 text-xs text-slate-500">
        Chỉ đổi ngày in trên bill. Tiền phòng, tiền điện và hạn thanh toán giữ nguyên.
      </p>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,11rem)_minmax(0,11rem)_auto] sm:items-end">
        <label className="block">
          <span className={labelClass}>Từ ngày</span>
          <input
            type="date"
            value={values.from}
            onChange={(event) => setValues({ ...values, from: event.target.value })}
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className={labelClass}>Đến ngày</span>
          <input
            type="date"
            value={values.to}
            min={values.from}
            onChange={(event) => setValues({ ...values, to: event.target.value })}
            className={inputClass}
          />
        </label>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className={buttonClass()}
          >
            {pending ? 'Đang lưu…' : 'Lưu'}
          </button>
          <button
            type="button"
            onClick={() => {
              setValues({ from, to });
              setError(null);
              setOpen(false);
            }}
            className={buttonClass('secondary')}
          >
            Huỷ
          </button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-sm text-rose-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
