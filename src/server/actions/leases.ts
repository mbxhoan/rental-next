'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { sql } from '@/lib/db';
import { normalizeMoneyInput } from '@/domain/money';
import { logAudit } from './audit';

export type LeaseRentActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

/**
 * Cập nhật giá thuê của hợp đồng đang dùng.
 * Bill đã chốt là lịch sử nên không sửa; bill mới sẽ lấy giá mới từ hợp đồng.
 */
export async function updateLeaseRent(
  leaseId: number,
  monthlyRentInput: string | number,
): Promise<LeaseRentActionResult> {
  const session = await requireRole('admin', 'staff');
  const monthlyRent = normalizeMoneyInput(monthlyRentInput);

  if (!Number.isInteger(leaseId) || leaseId <= 0) {
    return { ok: false, message: 'Hợp đồng không hợp lệ.' };
  }
  if (monthlyRent === null || monthlyRent <= 0) {
    return { ok: false, message: 'Giá phòng phải là số tiền lớn hơn 0.' };
  }

  try {
    const result = await sql.begin(async (tx) => {
      const leases = await tx<{
        id: number;
        room_code: string;
        status: string;
        monthly_rent: number;
      }[]>`
        select l.id, l.monthly_rent, l.status, r.room_code
        from leases l
        join rooms r on r.id = l.room_id
        where l.id = ${leaseId}
        for update
      `;
      const lease = leases[0];

      if (!lease) return { ok: false as const, message: 'Không tìm thấy hợp đồng.' };
      if (!['active', 'ending_soon', 'reserved'].includes(lease.status)) {
        return { ok: false as const, message: 'Chỉ được sửa giá hợp đồng đang có hiệu lực.' };
      }
      if (Number(lease.monthly_rent) === monthlyRent) {
        return { ok: true as const, message: 'Giá phòng không thay đổi.' };
      }

      await tx`
        update leases
        set monthly_rent = ${monthlyRent}, updated_at = now()
        where id = ${leaseId}
      `;

      await logAudit(tx, {
        userId: session.userId,
        action: 'lease.updated',
        subjectType: 'App\\Models\\Lease',
        subjectId: leaseId,
        oldValues: { monthly_rent: Number(lease.monthly_rent) },
        newValues: { monthly_rent: monthlyRent },
        note: `Cập nhật giá phòng ${lease.room_code}. Bill đã chốt không bị thay đổi.`,
      });

      return {
        ok: true as const,
        message: `Đã cập nhật giá phòng ${lease.room_code} thành ${monthlyRent.toLocaleString('vi-VN')} đ/tháng.`,
      };
    });

    if (!result.ok) return result;

    revalidatePath('/hop-dong');
    revalidatePath('/so-do-phong');
    revalidatePath('/bill-thang');
    revalidatePath('/hoa-don');
    revalidatePath('/dashboard');

    return result;
  } catch (error) {
    console.error('Không thể cập nhật giá hợp đồng:', error);
    return { ok: false, message: 'Không thể cập nhật giá phòng. Hãy thử lại.' };
  }
}
