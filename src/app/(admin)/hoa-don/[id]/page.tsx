import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { buildBillDisplay } from '@/domain/bill-display';
import { rentalConfig } from '@/domain/config';
import { getBillForDisplay } from '@/server/queries';
import { BillActions } from './bill-actions';
import { DisplayPeriodForm } from './display-period-form';
import { MeterEditForm } from './meter-edit-form';

export const metadata = { title: 'Chi tiết hoá đơn' };

/**
 * Tờ bill — chép lại mẫu PDF cũ (`resources/views/pdf/bill.blade.php`).
 *
 * Màn hình và bản in dùng CHUNG khối HTML này: thấy sao in vậy. Kiểu dáng nằm
 * trong `.bill-*` ở globals.css, viết bằng CSS thuần để đối chiếu 1:1 với file
 * blade cũ. In bằng `window.print()` chứ không dựng PDF trên server — dompdf
 * hay chromium đều vừa nặng vừa cold-start lâu trên serverless.
 */
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
  const locked = data.bill.status === 'cancelled';
  const electricityItem = data.bill.items.find((item) => item.type === 'electricity');
  const electricityOld = Number(electricityItem?.meta?.old_reading ?? electricityItem?.meta?.old ?? 0);
  const electricityNew = Number(electricityItem?.meta?.new_reading ?? electricityItem?.meta?.new ?? 0);

  const { companyName, companyPhone, companyEmail, companyAddress, pdfFooterNote } =
    rentalConfig.defaults;
  const contact = [companyPhone, companyEmail].filter(Boolean).join(' · ');

  const location = [display.buildingName ?? 'Chưa có nhà', display.floorName, display.roomCode]
    .filter(Boolean)
    .join(' / ');

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
          pdfFilename={display.pdfFilename}
        />
      </div>

      <article className="bill-sheet print-sheet mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="bill-top">
          <div className="bill-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" className="bill-logo" />
            <div className="bill-company">
              <h1>{companyName}</h1>
              {companyAddress ? <p>{companyAddress}</p> : null}
              {contact ? <p>{contact}</p> : null}
            </div>
          </div>

          <div className="bill-title">
            <h2>Hóa đơn tiền phòng</h2>
            <p>{display.subtitle}</p>
          </div>
        </div>

        <div className="bill-rule" />

        <div className="bill-meta">
          <div>
            <p className="bill-label">Kỳ chốt</p>
            <p className="bill-value">
              {display.readingFromLabel} → {display.readingToLabel}
            </p>
          </div>
          <div>
            <p className="bill-label">Hạn thanh toán</p>
            <p className="bill-value">{display.summary.dueDateLabel}</p>
          </div>
          <div>
            <p className="bill-label">Khách thuê</p>
            <p className="bill-value">{display.tenantName}</p>
          </div>
          <div>
            <p className="bill-label">Nhà / Tầng / Phòng</p>
            <p className="bill-value">{location}</p>
          </div>
          <div>
            <p className="bill-label">Trạng thái</p>
            <p className="bill-value">
              <span className="bill-status">{display.statusLabel}</span>
            </p>
          </div>
          <div>
            <p className="bill-label">Đơn trước</p>
            <p className="bill-value">{display.previousBillAmountLabel}</p>
          </div>
        </div>

        {canEdit && data.bill.status !== 'cancelled' ? (
          <DisplayPeriodForm
            billId={data.bill.id}
            from={data.bill.display_period_from ?? data.bill.period_from}
            to={data.bill.display_period_to ?? data.bill.period_to}
          />
        ) : null}

        {canEdit && (data.bill.status === 'draft' || data.bill.status === 'adjusting') ? (
          <MeterEditForm
            billId={data.bill.id}
            status={data.bill.status}
            electricityOld={electricityOld}
            electricityNew={electricityNew}
          />
        ) : null}

        {display.electricitySummary ? (
          <div className="bill-meter">
            <div>
              <p className="bill-label">Số điện cũ</p>
              <p className="bill-value tabular">{display.electricitySummary.oldLabel}</p>
            </div>
            <div>
              <p className="bill-label">Số điện mới</p>
              <p className="bill-value tabular">{display.electricitySummary.newLabel}</p>
            </div>
            <div>
              <p className="bill-label">Tiêu thụ</p>
              <p className="bill-value tabular">{display.electricitySummary.usageLabel}</p>
            </div>
            <div>
              <p className="bill-label">Tiền điện kỳ này</p>
              <p className="bill-value tabular">{display.electricitySummary.amountLabel}</p>
            </div>
          </div>
        ) : null}

        {/* Màn hẹp thì cuộn ngang bảng, đừng để cả trang bị đẩy rộng ra. */}
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="bill-items">
            <thead>
              <tr>
                <th style={{ width: '42%' }}>Khoản thu</th>
                <th style={{ width: '16%' }}>Số lượng</th>
                <th style={{ width: '20%' }} className="right">
                  Đơn giá
                </th>
                <th style={{ width: '22%' }} className="right">
                  Thành tiền
                </th>
              </tr>
            </thead>
            <tbody>
              {display.items.map((item) => (
                <tr key={item.key}>
                  <td>
                    <p className="name">{item.name}</p>
                    {item.detailLines.length > 0 ? (
                      <p className="subtext">{item.detailLines.join(' · ')}</p>
                    ) : null}
                  </td>
                  <td className="tabular">{item.quantityLabel}</td>
                  <td className="right tabular">{item.unitPriceLabel}</td>
                  <td className="right tabular">
                    <strong>{item.amountLabel}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bill-summary">
          <div>
            <p className="sum-label">Tổng bill</p>
            <p className="sum-value tabular">{display.summary.totalAmountLabel}</p>
          </div>
          <div>
            <p className="sum-label">Đã thu</p>
            <p className="sum-value tabular">{display.summary.paidAmountLabel}</p>
          </div>
          <div className="due">
            <p className="sum-label">Còn lại phải thanh toán</p>
            <p className="sum-value tabular">{display.summary.outstandingAmountLabel}</p>
          </div>
        </div>

        {display.paymentQr ? (
          <div className="bill-payment">
            <p className="payment-title">VietQR thanh toán — quét để chuyển khoản</p>
            <div className="payment-body">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={display.paymentQr.imageSrc}
                alt="Mã QR chuyển khoản"
                className="payment-qr"
              />
              <div className="payment-info">
                <p className="pay-amount">
                  <span className="pay-label">Số tiền</span>{' '}
                  <strong className="tabular">{display.paymentQr.amountLabel}</strong>
                </p>
                <p>
                  <span className="pay-label">Nội dung CK</span>{' '}
                  <strong>{display.paymentQr.transferContent}</strong>
                </p>
                <p>
                  <span className="pay-label">Tên chủ TK</span>{' '}
                  <strong>{display.paymentQr.accountName}</strong>
                </p>
                <p>
                  <span className="pay-label">Số TK</span>{' '}
                  <strong className="tabular">{display.paymentQr.accountNo}</strong>
                </p>
                <p>
                  <span className="pay-label">Ngân hàng</span>{' '}
                  <strong>{display.paymentQr.bankName}</strong>
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {display.notes.length > 0 || !display.paymentQr ? (
          <div className="bill-notes">
            <strong>Ghi chú:</strong>
            <p>{display.notes.length > 0 ? display.notes.join(' | ') : 'Không có ghi chú thêm.'}</p>
          </div>
        ) : null}

        <div className="bill-footer">
          <div>Đơn vị: VNĐ. {pdfFooterNote}</div>
          {contact ? <div>Liên hệ hỗ trợ: {contact}</div> : null}
        </div>
      </article>
    </>
  );
}
