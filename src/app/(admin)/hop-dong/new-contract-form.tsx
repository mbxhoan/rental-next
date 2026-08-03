'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { today } from '@/domain/date';
import { formatMoney } from '@/domain/money';
import type { LeaseRoomOptionRow, TenantOptionRow } from '@/server/queries';
import { createLeaseWithTenant } from '@/server/actions/lease-lifecycle';
import { buttonClass, Card, inputClass, labelClass } from '@/components/ui';

type FormState = {
  tenantId: string;
  fullName: string;
  phone: string;
  citizenId: string;
  dateOfBirth: string;
  citizenIdIssuedDate: string;
  occupation: string;
  tenantNote: string;
  roomId: string;
  startDate: string;
  expectedEndDate: string;
  monthlyRent: string;
  dueDay: string;
  occupantsCount: string;
  depositAmount: string;
  electricityUnitPrice: string;
  waterFee: string;
  serviceFee: string;
  electricityStart: string;
  status: 'active' | 'reserved';
  note: string;
};

function initialForm(defaultDate: string, tenants: TenantOptionRow[], rooms: LeaseRoomOptionRow[]): FormState {
  const room = rooms[0];
  return {
    tenantId: tenants[0] ? String(tenants[0].id) : '',
    fullName: '', phone: '', citizenId: '', dateOfBirth: '', citizenIdIssuedDate: '', occupation: '', tenantNote: '',
    roomId: room ? String(room.id) : '',
    startDate: defaultDate, expectedEndDate: '',
    monthlyRent: room ? String(room.default_rent) : '',
    dueDay: '5', occupantsCount: '1', depositAmount: '7500000',
    electricityUnitPrice: room ? String(room.default_electricity_unit_price) : '3700',
    waterFee: '100000', serviceFee: '150000', electricityStart: '0',
    status: 'active', note: '',
  };
}

export function NewContractForm({
  tenants,
  rooms,
  defaultDate,
}: {
  tenants: TenantOptionRow[];
  rooms: LeaseRoomOptionRow[];
  defaultDate?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'existing' | 'new'>(tenants.length ? 'existing' : 'new');
  const [form, setForm] = useState<FormState>(() => initialForm(defaultDate ?? today(), tenants, rooms));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function selectRoom(value: string) {
    const room = rooms.find((item) => String(item.id) === value);
    setForm((current) => ({
      ...current,
      roomId: value,
      monthlyRent: room ? String(room.default_rent) : current.monthlyRent,
      electricityUnitPrice: room ? String(room.default_electricity_unit_price) : current.electricityUnitPrice,
    }));
  }

  function submit() {
    setMessage(null);
    if (mode === 'new' && !form.fullName.trim()) {
      setMessage({ ok: false, text: 'Vui lòng nhập họ tên khách thuê mới.' });
      return;
    }
    startTransition(async () => {
      const result = await createLeaseWithTenant({
        tenantId: mode === 'existing' ? form.tenantId : '',
        newTenant: {
          fullName: form.fullName,
          phone: form.phone,
          citizenId: form.citizenId,
          dateOfBirth: form.dateOfBirth,
          citizenIdIssuedDate: form.citizenIdIssuedDate,
          occupation: form.occupation,
          note: form.tenantNote,
        },
        roomId: form.roomId,
        startDate: form.startDate,
        expectedEndDate: form.expectedEndDate,
        monthlyRent: form.monthlyRent,
        dueDay: form.dueDay,
        occupantsCount: form.occupantsCount,
        depositAmount: form.depositAmount,
        electricityUnitPrice: form.electricityUnitPrice,
        waterFee: form.waterFee,
        serviceFee: form.serviceFee,
        electricityStart: form.electricityStart,
        status: form.status,
        note: form.note,
      });
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) router.push('/hop-dong');
    });
  }

  return (
    <div className="space-y-4">
      <Card className="border-amber-200 bg-amber-50/60 p-4 text-sm text-amber-900">
        <p className="font-semibold">Lưu ý an toàn</p>
        <p className="mt-1">Lưu hợp đồng không tạo bill và không ghi nhận thu cọc. Số điện ngày vào chỉ tạo mốc cho các kỳ sau; bill đã chốt không bị thay đổi.</p>
      </Card>

      <Card className="p-4">
        <h2 className="font-bold text-slate-800">1. Thông tin khách thuê</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={buttonClass(mode === 'existing' ? 'primary' : 'secondary')} onClick={() => setMode('existing')} disabled={!tenants.length || pending}>Chọn khách đã có</button>
          <button type="button" className={buttonClass(mode === 'new' ? 'primary' : 'secondary')} onClick={() => setMode('new')} disabled={pending}>Tạo khách mới</button>
        </div>

        {mode === 'existing' ? (
          tenants.length ? (
            <label className="mt-4 block">
              <span className={labelClass}>Khách thuê *</span>
              <select value={form.tenantId} onChange={(event) => update('tenantId', event.target.value)} className={inputClass} disabled={pending}>
                {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.full_name}{tenant.phone ? ` · ${tenant.phone}` : ''}</option>)}
              </select>
            </label>
          ) : <p className="mt-3 text-sm text-slate-500">Chưa có khách cũ. Hãy chọn Tạo khách mới.</p>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Họ và tên *" value={form.fullName} onChange={(value) => update('fullName', value)} disabled={pending} />
              <Field label="Số điện thoại" value={form.phone} onChange={(value) => update('phone', value)} disabled={pending} />
              <Field label="CCCD/CMND" value={form.citizenId} onChange={(value) => update('citizenId', value)} disabled={pending} />
              <Field label="Ngày sinh" type="date" value={form.dateOfBirth} onChange={(value) => update('dateOfBirth', value)} disabled={pending} />
              <Field label="Ngày cấp CCCD/CMND" type="date" value={form.citizenIdIssuedDate} onChange={(value) => update('citizenIdIssuedDate', value)} disabled={pending} />
              <Field label="Nghề nghiệp" value={form.occupation} onChange={(value) => update('occupation', value)} disabled={pending} />
            </div>
            <Field label="Ghi chú khách thuê" value={form.tenantNote} onChange={(value) => update('tenantNote', value)} disabled={pending} />
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="font-bold text-slate-800">2. Thông tin hợp đồng</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label><span className={labelClass}>Phòng *</span><select value={form.roomId} onChange={(event) => selectRoom(event.target.value)} className={inputClass} disabled={pending || !rooms.length}><option value="">— Chọn phòng trống —</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.room_code} · {room.building_name} · {room.floor_name} · {formatMoney(room.default_rent)} đ</option>)}</select></label>
          <Field label="Ngày bắt đầu *" type="date" value={form.startDate} onChange={(value) => update('startDate', value)} disabled={pending} />
          <Field label="Ngày kết thúc dự kiến" type="date" value={form.expectedEndDate} onChange={(value) => update('expectedEndDate', value)} disabled={pending} />
          <Field label="Giá phòng/tháng *" value={form.monthlyRent} onChange={(value) => update('monthlyRent', value)} disabled={pending} inputMode="numeric" hint="Ví dụ 5.000.000" />
          <Field label="Hạn thanh toán sau ngày chốt *" value={form.dueDay} onChange={(value) => update('dueDay', value)} disabled={pending} inputMode="numeric" hint="Từ ngày 1 đến 28" />
          <Field label="Số người ở *" value={form.occupantsCount} onChange={(value) => update('occupantsCount', value)} disabled={pending} inputMode="numeric" />
          <Field label="Tiền cọc dự kiến" value={form.depositAmount} onChange={(value) => update('depositAmount', value)} disabled={pending} inputMode="numeric" hint="Chưa phải giao dịch thu cọc" />
          <Field label="Đơn giá điện/kWh *" value={form.electricityUnitPrice} onChange={(value) => update('electricityUnitPrice', value)} disabled={pending} inputMode="numeric" />
          <Field label="Số điện ngày vào *" value={form.electricityStart} onChange={(value) => update('electricityStart', value)} disabled={pending} inputMode="numeric" />
          <Field label="Tiền nước/tháng" value={form.waterFee} onChange={(value) => update('waterFee', value)} disabled={pending} inputMode="numeric" />
          <Field label="Phí dịch vụ/tháng" value={form.serviceFee} onChange={(value) => update('serviceFee', value)} disabled={pending} inputMode="numeric" />
          <label><span className={labelClass}>Trạng thái ban đầu *</span><select value={form.status} onChange={(event) => update('status', event.target.value as FormState['status'])} className={inputClass} disabled={pending}><option value="active">Đang ở</option><option value="reserved">Đặt trước</option></select></label>
        </div>
        <div className="mt-3"><Field label="Ghi chú hợp đồng" value={form.note} onChange={(value) => update('note', value)} disabled={pending} /></div>
        {!rooms.length ? <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">Hiện không có phòng trống để tạo hợp đồng.</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={buttonClass()} onClick={submit} disabled={pending || !rooms.length}>{pending ? 'Đang lưu…' : 'Lưu hợp đồng'}</button>
          <button type="button" className={buttonClass('secondary')} onClick={() => router.push('/hop-dong')} disabled={pending}>Huỷ</button>
        </div>
        {message ? <p role="alert" className={`mt-3 rounded-lg px-3 py-2 text-sm ${message.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{message.text}</p> : null}
      </Card>
    </div>
  );
}

function Field({ label, value, onChange, disabled, type = 'text', inputMode, hint }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; type?: 'text' | 'date'; inputMode?: 'numeric'; hint?: string }) {
  return <label className="block"><span className={labelClass}>{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} className={`${inputClass} ${inputMode === 'numeric' ? 'tabular' : ''}`} inputMode={inputMode} disabled={disabled} />{hint ? <span className="mt-1 block text-[11px] text-slate-400">{hint}</span> : null}</label>;
}
