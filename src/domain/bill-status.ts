/**
 * Bản sao của `app/Domain/Rental/Services/BillStatusResolver.php`.
 *
 * Thứ tự xét quan trọng: đã huỷ giữ nguyên, trả đủ là paid, trả một phần là
 * partial, chưa trả mà còn nháp thì vẫn nháp, quá hạn mới thành overdue.
 */

import type { CivilDate } from './date.ts';
import type { BillStatus } from './enums.ts';

export function resolveBillStatus(
  bill: {
    status: BillStatus;
    total_amount: number;
    paid_amount: number;
    due_date: CivilDate | null;
  },
  today: CivilDate,
): BillStatus {
  if (bill.status === 'cancelled') return 'cancelled';
  if (bill.status === 'adjusting') return 'adjusting';

  const totalAmount = Math.trunc(Number(bill.total_amount)) || 0;
  const paidAmount = Math.trunc(Number(bill.paid_amount)) || 0;

  if (totalAmount > 0 && paidAmount >= totalAmount) return 'paid';
  if (paidAmount > 0) return 'partial';
  if (bill.status === 'draft') return 'draft';

  if (bill.due_date !== null && today > bill.due_date) return 'overdue';

  return 'sent';
}
