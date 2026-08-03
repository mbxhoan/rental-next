'use client';

import { useState, useTransition } from 'react';
import { saveMeterBaselines } from '@/server/actions/meter-baselines';
import { buttonClass, inputClass } from '@/components/ui';

export type MeterBaselineFormRow = {
  roomId: number;
  roomCode: string;
  floorName: string;
  tenantName: string;
  effectiveFrom: string;
  currentReading: number;
};

export function MeterBaselineForm({ rows }: { rows: MeterBaselineFormRow[] }) {
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<Record<number, string>>(() =>
    Object.fromEntries(rows.map((row) => [row.roomId, String(row.currentReading)])),
  );
  const [changed, setChanged] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const changedRows = rows.filter((row) => changed.has(row.roomId));

  function update(roomId: number, value: string) {
    setValues((current) => ({ ...current, [roomId]: value }));
    setChanged((current) => new Set(current).add(roomId));
  }

  function submit() {
    if (changedRows.length === 0) {
      setError('Hãy sửa ít nhất một số điện trước khi lưu.');
      return;
    }
    if (!confirm(`Cập nhật mốc điện cho ${changedRows.length} phòng? Bill đã chốt sẽ không bị sửa.`)) return;

    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await saveMeterBaselines(
          changedRows.map((row) => ({
            roomId: row.roomId,
            effectiveFrom: row.effectiveFrom,
            electricityReading: values[row.roomId] ?? '',
          })),
        );
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setMessage(result.message);
        setChanged(new Set());
      } catch {
        setError('Không thể lưu mốc điện lúc này. Hãy kiểm tra kết nối rồi thử lại. Nếu vẫn lỗi, liên hệ quản trị viên.');
      }
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Chỉ sửa những phòng bạn đã đối chiếu. Nhập số nguyên, ví dụ <strong>4027</strong>, không nhập dấu chấm.
      </p>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {rows.map((row) => (
          <div key={row.roomId} className="grid gap-2 border-b border-slate-100 px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-center sm:gap-4">
            <div className="min-w-0">
              <p className="font-semibold text-brand-700">{row.roomCode} · {row.tenantName}</p>
              <p className="text-xs text-slate-500">
                {row.floorName} · mốc áp dụng từ kỳ {row.effectiveFrom.slice(8, 10)}/{row.effectiveFrom.slice(5, 7)}/{row.effectiveFrom.slice(0, 4)}
              </p>
            </div>
            <label>
              <span className="mb-1 block text-xs font-semibold text-slate-600">Số điện cũ chuẩn</span>
              <input
                inputMode="numeric"
                value={values[row.roomId] ?? ''}
                onChange={(event) => update(row.roomId, event.target.value)}
                className={`tabular ${inputClass}`}
                aria-label={`Số điện cũ chuẩn phòng ${row.roomCode}`}
              />
            </label>
          </div>
        ))}
      </div>

      {error ? <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {message ? <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">{message}</p> : null}

      <button type="button" onClick={submit} disabled={pending} className={`${buttonClass()} w-full sm:w-auto`}>
        {pending ? 'Đang lưu…' : `Lưu ${changedRows.length > 0 ? `${changedRows.length} mốc điện` : 'mốc điện'}`}
      </button>
    </div>
  );
}
