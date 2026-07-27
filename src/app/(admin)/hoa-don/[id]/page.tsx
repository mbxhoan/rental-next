import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { buildBillDisplay } from '@/domain/bill-display';
import { rentalConfig } from '@/domain/config';
import { getBillForDisplay } from '@/server/queries';
import { BillActions } from './bill-actions';

export const metadata = { title: 'Chi tiết hoá đơn' };

export default async function BillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireRole('admin', 'staff', 'viewer');
  const { id } = await params;

  const data = await getBillForDisplay(Number(id));
  if (!data) notFound();

  const display = buildBillDisplay(data.bill, data.previousBill, data.pendingQr);
  const canEdit = session.role === 'admin' || session.role === 'staff';
  const locked = data.bill.paid_amount > 0 || data.bill.status === 'cancelled';

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{display.title}</h1>
          <p className="text-sm text-slate-500">{display.subtitle}</p>
        </div>
        <BillActions
          billId={data.bill.id}
          status={data.bill.status}
          locked={locked || !canEdit}
          zaloMessage={display.zaloMessage}
        />
      </div>

      {/* Vùng in ra PDF. Trình duyệt lo phần render, server không cần thư viện PDF. */}
      <article className="print-sheet mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <header className="mb-5 border-b border-slate-200 pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-lg font-bold text-slate-900">
                {rentalConfig.defaults.companyName}
              </p>
              <p className="text-sm text-slate-600">
                {display.buildingName}
                {display.floorName ? ` · ${display.floorName}` : ''}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-500">Hoá đơn tháng</p>
              <p className="text-lg font-semibold text-slate-900">{display.periodLabel}</p>
              <span
                className={`no-print mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${display.statusBadgeClass}`}
              >
                {display.statusLabel}
              </span>
            </div>
          </div>

          <dl className="mt-4 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <Row label="Khách thuê" value={display.tenantName} />
            <Row label="Phòng" value={display.roomCode} />
            <Row
              label="Kỳ chốt"
              value={`${display.readingFromLabel} → ${display.readingToLabel}`}
            />
            <Row label="Hạn thanh toán" value={display.summary.dueDateLabel} />
            <Row label={display.previousBillLabel} value={display.previousBillAmountLabel} />
          </dl>
        </header>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 font-medium">Khoản mục</th>
              <th className="py-2 text-right font-medium">SL</th>
              <th className="py-2 text-right font-medium">Đơn giá</th>
              <th className="py-2 text-right font-medium">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {display.items.map((item) => (
              <tr key={item.key} className="border-b border-slate-100 align-top">
                <td className="py-2">
                  <span className="font-medium text-slate-800">{item.name}</span>
                  {item.detailLines.length > 0 ? (
                    <span className="block text-xs text-slate-500">
                      {item.detailLines.join(' · ')}
                    </span>
                  ) : null}
                  {item.hint ? (
                    <span className="block text-xs text-slate-400">{item.hint}</span>
                  ) : null}
                </td>
                <td className="tabular py-2 text-right text-slate-600">{item.quantityLabel}</td>
                <td className="tabular py-2 text-right text-slate-600">{item.unitPriceLabel}</td>
                <td className="tabular py-2 text-right font-medium text-slate-900">
                  {item.amountLabel}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="py-3 text-right font-semibold text-slate-700">
                Tổng cộng
              </td>
              <td className="tabular py-3 text-right text-lg font-bold text-slate-900">
                {display.summary.totalAmountLabel}
              </td>
            </tr>
            {display.summary.paidAmount > 0 ? (
              <>
                <tr>
                  <td colSpan={3} className="py-1 text-right text-slate-600">
                    Đã thanh toán
                  </td>
                  <td className="tabular py-1 text-right text-emerald-700">
                    {display.summary.paidAmountLabel}
                  </td>
                </tr>
                <tr>
                  <td colSpan={3} className="py-1 text-right font-semibold text-slate-700">
                    Còn lại
                  </td>
                  <td className="tabular py-1 text-right font-bold text-rose-700">
                    {display.summary.outstandingAmountLabel}
                  </td>
                </tr>
              </>
            ) : null}
          </tfoot>
        </table>

        {display.electricitySummary ? (
          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <span className="font-medium text-slate-700">Chi tiết điện: </span>
            số cũ {display.electricitySummary.oldLabel} → số mới{' '}
            {display.electricitySummary.newLabel}, dùng {display.electricitySummary.usageLabel} ×{' '}
            {display.electricitySummary.unitPriceLabel} = {display.electricitySummary.amountLabel}
          </div>
        ) : null}

        {display.notes.length > 0 ? (
          <div className="mt-4 text-sm">
            <p className="font-medium text-slate-700">Ghi chú</p>
            <ul className="mt-1 list-inside list-disc text-slate-600">
              {display.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {display.paymentQr ? (
          <div className="mt-5 flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={display.paymentQr.imageSrc}
              alt="Mã QR chuyển khoản"
              className="h-40 w-40 object-contain"
            />
            <div className="text-sm">
              <p className="font-medium text-slate-800">{display.paymentQr.bankName}</p>
              <p className="text-slate-600">{display.paymentQr.accountNo}</p>
              <p className="text-slate-600">{display.paymentQr.accountName}</p>
              <p className="mt-1 text-slate-600">
                Số tiền: <span className="tabular font-medium">{display.paymentQr.amountLabel}</span>
              </p>
              <p className="text-slate-600">Nội dung: {display.paymentQr.transferContent}</p>
            </div>
          </div>
        ) : null}

        <footer className="mt-6 border-t border-slate-200 pt-3 text-xs text-slate-500">
          {rentalConfig.defaults.pdfFooterNote}
        </footer>
      </article>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 sm:block">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800">{value}</dd>
    </div>
  );
}
