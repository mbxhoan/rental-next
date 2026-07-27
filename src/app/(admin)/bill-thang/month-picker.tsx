'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

/** Chọn tháng + nhà. Đổi là điều hướng luôn, không cần nút "Lọc". */
export function MonthPicker({
  month,
  buildingId,
  buildings,
}: {
  month: string;
  buildingId: number;
  buildings: { id: number; name: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function update(key: 'thang' | 'nha', value: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set(key, value);
    startTransition(() => router.push(`/bill-thang?${next.toString()}`));
  }

  return (
    <div className="flex flex-wrap items-end gap-3" aria-busy={pending}>
      <div>
        <label htmlFor="thang" className="mb-1 block text-xs font-medium text-slate-600">
          Tháng chốt
        </label>
        <input
          id="thang"
          type="month"
          defaultValue={month}
          onChange={(event) => update('thang', event.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label htmlFor="nha" className="mb-1 block text-xs font-medium text-slate-600">
          Nhà
        </label>
        <select
          id="nha"
          defaultValue={String(buildingId)}
          onChange={(event) => update('nha', event.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          {buildings.map((building) => (
            <option key={building.id} value={building.id}>
              {building.name}
            </option>
          ))}
        </select>
      </div>

      {pending ? <span className="pb-2 text-sm text-slate-400">Đang tải…</span> : null}
    </div>
  );
}
