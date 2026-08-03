'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { buttonClass, Card, inputClass, labelClass } from '@/components/ui';

type BuildingOption = {
  id: number;
  name: string;
};

export function BillingPeriodPicker({
  defaultMonth,
  defaultBuildingId,
  buildings,
}: {
  defaultMonth: string;
  defaultBuildingId: number;
  buildings: BuildingOption[];
}) {
  const router = useRouter();
  const [month, setMonth] = useState(defaultMonth);
  const [buildingId, setBuildingId] = useState(String(defaultBuildingId));
  const [pending, startTransition] = useTransition();

  function openBills(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const params = new URLSearchParams({
      thang: month,
      nha: buildingId,
    });

    startTransition(() => {
      router.push(`/bill-thang?${params.toString()}`);
    });
  }

  return (
    <Card className="mx-auto max-w-2xl overflow-hidden border-brand-200 shadow-md shadow-brand-100/60">
      <div className="border-b border-brand-100 bg-brand-50 px-5 py-5 sm:px-7 sm:py-6">
        <p className="text-sm font-bold tracking-wide text-brand-700 uppercase">Bước 1</p>
        <h2 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">Chọn kỳ cần lên bill</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Danh sách phòng chỉ mở sau khi bạn xác nhận kỳ chốt, giúp tránh chốt nhầm tháng.
        </p>
      </div>

      <form className="p-5 sm:p-7" onSubmit={openBills} aria-busy={pending}>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="bill-month" className={`${labelClass} text-sm`}>
              Tháng chốt
            </label>
            <input
              id="bill-month"
              name="thang"
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              required
              className={`${inputClass} min-h-14 px-4 text-base font-semibold sm:text-lg`}
            />
          </div>

          <div>
            <label htmlFor="bill-building" className={`${labelClass} text-sm`}>
              Nhà
            </label>
            <select
              id="bill-building"
              name="nha"
              value={buildingId}
              onChange={(event) => setBuildingId(event.target.value)}
              required
              className={`${inputClass} min-h-14 px-4 text-base font-semibold sm:text-lg`}
            >
              {buildings.map((building) => (
                <option key={building.id} value={building.id}>
                  {building.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="submit"
          disabled={pending || !month || !buildingId}
          className={`${buttonClass()} mt-6 min-h-14 w-full px-5 text-base sm:text-lg`}
        >
          {pending ? 'Đang mở danh sách bill…' : 'Mở danh sách bill'}
        </button>
      </form>
    </Card>
  );
}
