'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { BillStatus } from '@/domain/enums';
import { deleteBillDraft, setBillStatus } from '@/server/actions/bills';
import { buttonClass } from '@/components/ui';

/**
 * In / chốt / mở lại bill + copy tin nhắn Zalo.
 *
 * "In / lưu PDF" gọi thẳng hộp in của trình duyệt: người dùng chọn "Save as
 * PDF". Không cần dompdf hay chromium trên server — thứ vừa nặng vừa cold-start
 * lâu trên serverless.
 */
export function BillActions({
  billId,
  status,
  locked,
  zaloMessage,
  pdfFilename,
}: {
  billId: number;
  status: BillStatus;
  locked: boolean;
  zaloMessage: string;
  pdfFilename: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function changeStatus(next: 'draft' | 'sent' | 'adjusting') {
    const question =
      next === 'sent'
        ? 'Chốt bill này? Sau khi chốt sẽ gửi cho khách.'
        : next === 'adjusting'
          ? 'Mở bill để điều chỉnh số điện và tiền bill?'
          : 'Đưa bill về trạng thái chờ chốt?';
    if (!confirm(question)) return;

    setError(null);
    startTransition(async () => {
      const result = await setBillStatus(billId, next);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  function removeDraft() {
    if (!confirm('Huỷ bill đang chờ chốt này? Bill vẫn được lưu trong lịch sử ở trạng thái Đã huỷ.')) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteBillDraft(billId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push('/bill-thang');
    });
  }

  /**
   * Trình duyệt lấy tiêu đề trang làm tên file khi lưu PDF. Mượn đúng tên mà
   * định dạng tên file (`hoa-don-ten-khach-phong-thang.pdf`), rồi trả lại tiêu đề
   * cũ để tab không bị đổi tên vĩnh viễn.
   */
  function print() {
    const original = document.title;
    document.title = pdfFilename.replace(/\.pdf$/, '');

    const restore = () => {
      document.title = original;
      window.removeEventListener('afterprint', restore);
    };
    window.addEventListener('afterprint', restore);

    window.print();
  }

  async function copyZalo() {
    try {
      await navigator.clipboard.writeText(zaloMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Trình duyệt không cho copy. Bạn chọn tay giúp nhé.');
    }
  }

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <button
          type="button"
          onClick={copyZalo}
          className={buttonClass('secondary')}
        >
          {copied ? 'Đã copy ✓' : '💬 Copy tin nhắn Zalo'}
        </button>

        <button
          type="button"
          onClick={print}
          className={buttonClass('secondary')}
        >
          🖨 In / lưu PDF
        </button>

        {!locked && (status === 'draft' || status === 'adjusting') ? (
          <button
            type="button"
            onClick={() => changeStatus('sent')}
            disabled={pending}
            className={buttonClass()}
          >
            {pending ? 'Đang lưu…' : 'Chốt bill'}
          </button>
        ) : null}

        {!locked && status !== 'draft' && status !== 'adjusting' ? (
          <button
            type="button"
            onClick={() => changeStatus('adjusting')}
            disabled={pending}
            className={buttonClass('secondary')}
          >
            Mở để điều chỉnh
          </button>
        ) : null}

        {!locked && status === 'draft' ? (
          <button type="button" onClick={removeDraft} disabled={pending} className={buttonClass('secondary')}>
            Huỷ bill nháp
          </button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
