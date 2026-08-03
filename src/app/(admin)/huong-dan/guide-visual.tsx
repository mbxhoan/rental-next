import type { ReactNode } from 'react';

export type GuideVisualKind = 'meter' | 'close' | 'period' | 'extra' | 'account' | 'payment' | 'tenant' | 'lease';

const TITLES: Record<GuideVisualKind, string> = {
  meter: 'Chỉnh mốc điện',
  close: 'Lên bill tháng',
  period: 'Sửa kỳ chốt hiển thị',
  extra: 'Phụ thu / giảm trừ',
  account: 'Tài khoản thanh toán',
  payment: 'Ghi nhận thanh toán',
  tenant: 'Khách thuê mới',
  lease: 'Kết thúc hợp đồng',
};

/** Minh hoạ màn hình nội bộ, không phụ thuộc ảnh/link bên ngoài. */
export function GuideVisual({ kind }: { kind: GuideVisualKind }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-inner" role="img" aria-label={`Minh hoạ màn hình ${TITLES[kind]}`}>
      <div className="flex items-center gap-1 border-b border-slate-200 bg-white px-3 py-2">
        <span className="size-2 rounded-full bg-rose-300" />
        <span className="size-2 rounded-full bg-amber-300" />
        <span className="size-2 rounded-full bg-emerald-300" />
        <span className="ml-2 truncate text-[10px] font-medium text-slate-400">Nhà trọ · {TITLES[kind]}</span>
      </div>
      <div className="min-h-44 p-3 text-[10px] text-slate-600 sm:min-h-48">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-bold text-brand-700"><span className="size-4 rounded bg-brand-100" /> Nhà trọ</div>
          <div className="rounded bg-brand-700 px-2 py-1 text-[9px] font-semibold text-white">{TITLES[kind]}</div>
        </div>
        {kind === 'meter' ? <MeterVisual /> : null}
        {kind === 'close' ? <CloseVisual /> : null}
        {kind === 'period' ? <PeriodVisual /> : null}
        {kind === 'extra' ? <ExtraVisual /> : null}
        {kind === 'account' ? <AccountVisual /> : null}
        {kind === 'payment' ? <PaymentVisual /> : null}
        {kind === 'tenant' ? <TenantVisual /> : null}
        {kind === 'lease' ? <LeaseVisual /> : null}
      </div>
    </div>
  );
}

function Box({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded border border-slate-200 bg-white p-2 ${className}`}>{children}</div>;
}

function MeterVisual() {
  return <>
    <div className="mb-2 flex gap-2"><Box className="flex-1"><p className="text-[8px] text-slate-400">Kỳ chốt</p><p className="font-semibold">Tháng 7/2026</p></Box><Box className="flex-1"><p className="text-[8px] text-slate-400">Nhà</p><p className="font-semibold">Nhà trọ JA</p></Box></div>
    <Box><p className="mb-2 font-semibold text-slate-800">JA-201 · Hải Long - Tammie</p><div className="flex items-end gap-2"><div className="flex-1"><p className="text-[8px]">Số điện cũ chuẩn</p><div className="mt-1 rounded border border-brand-300 px-2 py-1">4028</div></div><div className="rounded bg-brand-700 px-2 py-1 font-semibold text-white">Lưu mốc điện</div></div></Box>
  </>;
}

function CloseVisual() {
  return <Box><div className="mb-2 flex items-center justify-between"><p className="font-semibold text-slate-800">JA-202 · Uyên Vũng Tàu</p><span className="rounded bg-brand-50 px-2 py-0.5 font-semibold text-brand-700">Tạm tính</span></div><div className="grid grid-cols-3 gap-2"><div><p className="text-[8px]">Số điện cũ</p><div className="mt-1 rounded bg-slate-100 px-2 py-1">4027</div></div><div><p className="text-[8px]">Số điện mới *</p><div className="mt-1 rounded border border-brand-300 px-2 py-1">4119</div></div><div><p className="text-[8px]">Tiền điện</p><div className="mt-1 rounded bg-accent-50 px-2 py-1 text-accent-600">340.400</div></div></div><div className="mt-2 flex justify-end"><span className="rounded bg-brand-700 px-3 py-1 font-semibold text-white">✓ Chốt bill</span></div></Box>;
}

function PeriodVisual() {
  return <Box><div className="mb-2 flex items-center justify-between"><p className="font-semibold text-slate-800">Hoá đơn tiền phòng · JA-202</p><span className="rounded border border-brand-200 bg-brand-50 px-2 py-0.5 text-brand-700">Đã chốt</span></div><p className="mb-2 text-[9px] text-slate-500">Kỳ chốt hiện tại: 02/06/2026 → 02/07/2026</p><div className="flex items-end gap-2"><div className="flex-1"><p className="text-[8px]">Từ ngày</p><div className="mt-1 rounded border border-brand-300 px-2 py-1">30/06/2026</div></div><div className="flex-1"><p className="text-[8px]">Đến ngày</p><div className="mt-1 rounded border border-brand-300 px-2 py-1">31/07/2026</div></div><span className="rounded bg-brand-700 px-3 py-1 font-semibold text-white">Lưu</span></div></Box>;
}

function ExtraVisual() {
  return <Box><p className="mb-2 font-semibold text-slate-800">Thêm phụ thu / giảm trừ / ghi chú</p><div className="grid grid-cols-2 gap-2"><div><p className="text-[8px]">Phụ thu</p><div className="mt-1 rounded border border-brand-300 px-2 py-1">150.000</div></div><div><p className="text-[8px]">Giảm trừ</p><div className="mt-1 rounded border border-slate-200 px-2 py-1">0</div></div></div><div className="mt-2 flex justify-between"><span className="text-slate-400">Lý do điều chỉnh</span><span className="rounded bg-brand-700 px-3 py-1 font-semibold text-white">Chốt bill</span></div></Box>;
}

function AccountVisual() {
  return <Box><div className="flex items-center justify-between"><div><p className="font-semibold text-slate-800">VIB</p><p className="mt-1">902124033 · HKD J.A SHOP</p><p className="mt-1 text-[8px] text-slate-400">Tài khoản nhận tiền mặc định</p></div><span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">Mặc định</span></div><div className="mt-3 flex gap-2"><span className="rounded border border-slate-200 px-2 py-1">Sửa</span><span className="rounded bg-brand-700 px-2 py-1 font-semibold text-white">Đặt mặc định</span></div></Box>;
}

function PaymentVisual() {
  return <div className="grid gap-2 sm:grid-cols-2"><Box><p className="font-semibold text-slate-800">Ghi nhận thanh toán</p><p className="mt-2 text-[8px]">Số tiền</p><div className="mt-1 rounded border border-brand-300 px-2 py-1">5.590.400</div><div className="mt-2 rounded bg-emerald-600 px-2 py-1 text-center font-semibold text-white">Ghi nhận thanh toán</div></Box><Box><div className="flex justify-between"><p className="font-semibold text-slate-800">Lịch sử thanh toán</p><span className="text-[8px] text-slate-400">Đã thu 0</span></div><p className="mt-3 text-slate-400">Chưa có khoản thanh toán nào.</p></Box></div>;
}

function TenantVisual() {
  return <Box><div className="mb-2 flex items-center justify-between"><p className="font-semibold text-slate-800">Khách thuê</p><span className="rounded bg-slate-100 px-2 py-1 text-[9px] text-slate-500">Đang xem danh sách</span></div><div className="rounded border border-amber-200 bg-amber-50 p-2 text-amber-800"><p className="font-semibold">Chưa có form thêm khách/hợp đồng</p><p className="mt-1 text-[9px]">Không xoá hoặc sửa trực tiếp dữ liệu.</p></div></Box>;
}

function LeaseVisual() {
  return <Box><div className="mb-2 flex items-center justify-between"><p className="font-semibold text-slate-800">Hợp đồng</p><span className="rounded bg-slate-100 px-2 py-1 text-[9px] text-slate-500">Đang xem danh sách</span></div><div className="flex items-center justify-between rounded border border-slate-200 p-2"><div><p className="font-semibold">JA-201 · Hải Long - Tammie</p><p className="mt-1 text-[9px] text-slate-500">Đang thuê · 5.500.000/tháng</p></div><span className="rounded bg-sky-100 px-2 py-0.5 font-semibold text-sky-700">Đang thuê</span></div><p className="mt-2 text-[9px] text-amber-700">Hiện chưa có nút Kết thúc / Huỷ hợp đồng.</p></Box>;
}
