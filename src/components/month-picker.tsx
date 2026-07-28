'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { inputClass, labelClass } from '@/components/ui';

/**
 * Chọn tháng + nhà. Đổi là điều hướng luôn, không cần nút "Lọc".
 *
 * Dùng chung cho màn Bill tháng và Báo cáo — `basePath` quyết định đẩy về đâu.
 * `allowAllBuildings` để màn báo cáo xem gộp được tất cả các nhà.
 */
export function MonthPicker({
  month,
  buildingId,
  buildings,
  basePath,
  monthLabel = 'Tháng chốt',
  allowAllBuildings = false,
}: {
  month: string;
  buildingId: number | null;
  buildings: { id: number; name: string }[];
  basePath: string;
  monthLabel?: string;
  allowAllBuildings?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function update(key: 'thang' | 'nha', value: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set(key, value);
    startTransition(() => router.push(`${basePath}?${next.toString()}`));
  }

  return (
    <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,16rem)_auto] sm:items-end" aria-busy={pending}>
      <div>
        <label htmlFor="thang" className={labelClass}>
          {monthLabel}
        </label>
        <input
          id="thang"
          type="month"
          defaultValue={month}
          onChange={(event) => update('thang', event.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="nha" className={labelClass}>
          Nhà
        </label>
        <select
          id="nha"
          defaultValue={buildingId === null ? '' : String(buildingId)}
          onChange={(event) => update('nha', event.target.value)}
          className={inputClass}
        >
          {allowAllBuildings ? <option value="">Tất cả các nhà</option> : null}
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
