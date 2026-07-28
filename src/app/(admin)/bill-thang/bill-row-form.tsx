'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { formatMoney, normalizeMoneyInput } from '@/domain/money';
import { totalOf } from '@/domain/bill-calculator';
import { createBillForLease } from '@/server/actions/bills';
import { buttonClass, inputClass } from '@/components/ui';

/**
 * Một dòng bill = một phòng.
 *
 * Tổng tiền hiện ra ngay khi gõ số điện, không chờ server — đây là chỗ bản
 * Livewire cũ phải round-trip mỗi lần gõ. Số tiền phòng/nước/dịch vụ đã được
 * server tính sẵn và truyền xuống, ở đây chỉ cộng lại, nên không có nguy cơ
 * client và server ra hai kết quả khác nhau.
 *
 * Khi bấm "Chốt bill", server tính lại toàn bộ từ đầu rồi mới ghi.
 */
export function BillRowForm({
  leaseId,
  roomCode,
  floorName,
  tenantName,
  periodFrom,
  periodTo,
  periodLabel,
  isInitialPartialPeriod,
  electricityOld,
  electricityUnitPrice,
  monthlyRent,
  rentPreview,
  waterAmount,
  serviceAmount,
}: {
  leaseId: number;
  roomCode: string;
  floorName: string;
  tenantName: string;
  periodFrom: string;
  periodTo: string;
  periodLabel: string;
  isInitialPartialPeriod: boolean;
  electricityOld: number;
  electricityUnitPrice: number;
  monthlyRent: number;
  rentPreview: { amount: number; occupiedDays: number; daysInPeriod: number };
  waterAmount: number;
  serviceAmount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [electricityNew, setElectricityNew] = useState('');
  const [surcharge, setSurcharge] = useState('');
  const [discount, setDiscount] = useState('');
  const [manualReason, setManualReason] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const newReading = normalizeMoneyInput(electricityNew);
  const surchargeAmount = normalizeMoneyInput(surcharge);
  const discountAmount = normalizeMoneyInput(discount);
  const hasManualOverride = surchargeAmount !== null || discountAmount !== null;

  const usage = newReading === null ? null : newReading - electricityOld;
  const readingInvalid = usage !== null && usage < 0;
  const electricityAmount = usage !== null && usage >= 0 ? usage * electricityUnitPrice : null;

  const total =
    electricityAmount === null
      ? null
      : totalOf([
          { type: 'rent', amount: rentPreview.amount },
          { type: 'electricity', amount: electricityAmount },
          { type: 'water', amount: waterAmount },
          { type: 'service', amount: serviceAmount },
          { type: 'surcharge', amount: surchargeAmount ?? 0 },
          { type: 'discount', amount: discountAmount ?? 0 },
        ]);

  const canSubmit = newReading !== null && !readingInvalid && !pending;

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createBillForLease(leaseId, periodFrom, periodTo, {
        electricity_old: electricityOld,
        electricity_new: electricityNew,
        electricity_unit_price: electricityUnitPrice,
        manual_surcharge_amount: surcharge,
        manual_discount_amount: discount,
        manual_reason: manualReason,
        note,
        force_prorated_rent: isInitialPartialPeriod,
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      router.refresh();
    });
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/50">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-100 bg-brand-50/60 px-4 py-3">
        <div className="min-w-0">
          <p className="font-bold text-brand-700">
            {roomCode} · {tenantName}
          </p>
          <p className="text-xs text-slate-500">
            {floorName} · kỳ {periodLabel}
            {isInitialPartialPeriod ? ' · kỳ đầu (tính theo ngày)' : ''}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs text-slate-500">Tạm tính</p>
          <p
            className={`tabular text-lg font-bold ${total === null ? 'text-slate-300' : 'text-brand-700'}`}
          >
            {total === null ? '—' : formatMoney(total)}
          </p>
        </div>
      </div>

      <div className="grid gap-3 px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Số điện cũ">
          <output className="tabular block rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
            {electricityOld}
          </output>
        </Field>

        <Field label="Số điện mới" required>
          <input
            inputMode="numeric"
            value={electricityNew}
            onChange={(event) => setElectricityNew(event.target.value)}
            aria-invalid={readingInvalid}
            className={`tabular ${inputClass} ${
              readingInvalid ? 'border-rose-400 bg-rose-50' : ''
            }`}
          />
          {readingInvalid ? (
            <p className="mt-1 text-xs text-rose-600">
              Số điện mới không được nhỏ hơn số điện cũ.
            </p>
          ) : null}
        </Field>

        <Field label={`Tiêu thụ (×${formatMoney(electricityUnitPrice)})`}>
          <output className="tabular block rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
            {usage === null || readingInvalid ? '—' : `${usage} số`}
          </output>
        </Field>

        <Field label="Tiền điện">
          <output className="tabular block rounded-lg bg-accent-50 px-3 py-2 text-sm font-semibold text-accent-600">
            {electricityAmount === null ? '—' : formatMoney(electricityAmount)}
          </output>
        </Field>
      </div>

      <div className="grid gap-x-4 gap-y-1 border-t border-slate-100 px-4 py-2 text-sm sm:grid-cols-3">
        <Line
          label="Tiền phòng"
          value={formatMoney(rentPreview.amount)}
          hint={
            rentPreview.occupiedDays < rentPreview.daysInPeriod
              ? `${rentPreview.occupiedDays}/${rentPreview.daysInPeriod} ngày · ${formatMoney(monthlyRent)}/tháng`
              : undefined
          }
        />
        <Line label="Tiền nước" value={formatMoney(waterAmount)} />
        <Line label="Phí dịch vụ" value={formatMoney(serviceAmount)} />
      </div>

      {open ? (
        <div className="grid gap-3 border-t border-slate-100 px-4 py-3 sm:grid-cols-2">
          <Field label="Phụ thu">
            <input
              inputMode="numeric"
              value={surcharge}
              onChange={(event) => setSurcharge(event.target.value)}
              placeholder="0"
              className={`tabular ${inputClass}`}
            />
          </Field>
          <Field label="Giảm trừ">
            <input
              inputMode="numeric"
              value={discount}
              onChange={(event) => setDiscount(event.target.value)}
              placeholder="0"
              className={`tabular ${inputClass}`}
            />
          </Field>
          {hasManualOverride ? (
            <Field label="Lý do điều chỉnh" required>
              <input
                value={manualReason}
                onChange={(event) => setManualReason(event.target.value)}
                className={inputClass}
              />
            </Field>
          ) : null}
          <Field label="Ghi chú">
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mx-4 mb-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="text-left text-sm font-medium text-brand-600 underline-offset-2 hover:underline"
        >
          {open ? 'Ẩn phụ thu / ghi chú' : 'Thêm phụ thu / giảm trừ / ghi chú'}
        </button>

        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className={`${buttonClass()} w-full shrink-0 sm:w-auto`}
        >
          {pending ? 'Đang chốt…' : '✓ Chốt bill'}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-slate-600">
        {label}
        {required ? <span className="text-rose-500"> *</span> : null}
      </label>
      {children}
    </div>
  );
}

function Line({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <span className="text-slate-500">
        {label}
        {hint ? <span className="ml-1 text-xs text-slate-400">({hint})</span> : null}
      </span>
      <span className="tabular font-medium text-slate-800">{value}</span>
    </div>
  );
}
