'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateBillDisplayPeriod } from '@/server/actions/bills';

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
          className="text-sm text-slate-500 underline-offset-2 hover:underline"
        >
          Sửa kỳ chốt in trên bill
        </button>
        {saved ? <span className="text-sm text-emerald-600">Đã lưu ✓</span> : null}
      </div>
    );
  }

  return (
    <div className="no-print mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="mb-2 text-xs text-slate-500">
        Chỉ đổi ngày in trên bill. Tiền phòng, tiền điện và hạn thanh toán giữ nguyên.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Từ ngày</span>
          <input
            type="date"
            value={values.from}
            onChange={(event) => setValues({ ...values, from: event.target.value })}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Đến ngày</span>
          <input
            type="date"
            value={values.to}
            min={values.from}
            onChange={(event) => setValues({ ...values, to: event.target.value })}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </label>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
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
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-white"
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
