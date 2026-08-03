'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { today, type CivilDate } from '@/domain/date';
import type { LeaseStatus } from '@/domain/enums';
import { buttonClass, inputClass, labelClass } from '@/components/ui';
import { cancelLease, endLease } from '@/server/actions/lease-lifecycle';

export function LeaseLifecycleActions({
  leaseId,
  roomCode,
  tenantName,
  status,
  startDate,
}: {
  leaseId: number;
  roomCode: string;
  tenantName: string;
  status: LeaseStatus;
  startDate: CivilDate;
}) {
  const router = useRouter();
  const [endOpen, setEndOpen] = useState(false);
  const [endDate, setEndDate] = useState(today());
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function cancel() {
    if (!confirm(`Huỷ hợp đồng phòng ${roomCode} của ${tenantName}? Chỉ thực hiện được nếu chưa có bill, thanh toán hoặc giao dịch cọc.`)) return;
    setMessage(null);
    startTransition(async () => {
      const result = await cancelLease(leaseId);
      setMessage(result.message);
      if (result.ok) router.refresh();
    });
  }

  function finish() {
    if (endDate < startDate) {
      setMessage('Ngày kết thúc không thể trước ngày bắt đầu.');
      return;
    }
    if (!confirm(`Kết thúc hợp đồng phòng ${roomCode} của ${tenantName} ngày ${endDate}? Hệ thống sẽ không tự xoá bill, thanh toán hoặc tiền cọc.`)) return;
    setMessage(null);
    startTransition(async () => {
      const result = await endLease(leaseId, endDate);
      setMessage(result.message);
      if (result.ok) {
        setEndOpen(false);
        router.refresh();
      }
    });
  }

  if (!['reserved', 'active', 'ending_soon'].includes(status)) return null;

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <div className="flex flex-wrap gap-2">
        {status === 'reserved' ? <button type="button" className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-40" onClick={cancel} disabled={pending}>Huỷ hợp đồng</button> : <button type="button" className={buttonClass('secondary')} onClick={() => { setMessage(null); setEndDate(today()); setEndOpen((value) => !value); }} disabled={pending}>{endOpen ? 'Đóng kết thúc' : 'Kết thúc hợp đồng'}</button>}
      </div>
      {endOpen ? <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3"><label><span className={labelClass}>Ngày rời phòng *</span><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className={inputClass} disabled={pending} /></label><p className="mt-2 text-[11px] text-amber-800">Chỉ kết thúc sau khi bill nháp đã xử lý, công nợ đã thu và số dư cọc đã hoàn/trừ. Dữ liệu lịch sử sẽ được giữ nguyên.</p><button type="button" className="mt-2 inline-flex items-center justify-center rounded-lg bg-rose-700 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-600 disabled:opacity-40" onClick={finish} disabled={pending}>{pending ? 'Đang xử lý…' : 'Xác nhận kết thúc'}</button></div> : null}
      {message ? <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{message}</p> : null}
    </div>
  );
}
