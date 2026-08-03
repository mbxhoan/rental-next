'use server';

import { revalidatePath } from 'next/cache';
import { isCivilDate } from '@/domain/date';
import { normalizeMoneyInput } from '@/domain/money';
import { requireRole } from '@/lib/auth';
import { sql } from '@/lib/db';
import { logAudit } from './audit';

export type CreateLeaseInput = {
  tenantId: string | number;
  newTenant: {
    fullName: string;
    phone: string;
    citizenId: string;
    dateOfBirth: string;
    citizenIdIssuedDate: string;
    occupation: string;
    note: string;
  };
  roomId: string | number;
  startDate: string;
  expectedEndDate: string;
  monthlyRent: string | number;
  dueDay: string | number;
  occupantsCount: string | number;
  depositAmount: string | number;
  electricityUnitPrice: string | number;
  waterFee: string | number;
  serviceFee: string | number;
  electricityStart: string | number;
  status: 'reserved' | 'active';
  note: string;
};

export type LeaseLifecycleActionResult =
  | { ok: true; message: string; leaseId?: number }
  | { ok: false; message: string };

/**
 * Tạo khách (nếu là khách mới) và hợp đồng trong cùng một transaction.
 * Không tạo bill, payment hay giao dịch cọc: đây chỉ là bước thiết lập hợp đồng.
 */
export async function createLeaseWithTenant(
  input: CreateLeaseInput,
): Promise<LeaseLifecycleActionResult> {
  const session = await requireRole('admin', 'staff');
  const parsed = parseCreateInput(input);
  if (!parsed.ok) return parsed;

  try {
    const result = await sql.begin(async (tx) => {
      const rooms = await tx<{
        id: number;
        room_code: string;
        default_rent: number;
        status: string;
      }[]>`
        select id, room_code, default_rent, status
        from rooms
        where id = ${parsed.roomId}
        for update
      `;
      const room = rooms[0];
      if (!room) return { ok: false as const, message: 'Không tìm thấy phòng.' };
      if (room.status !== 'vacant') {
        return { ok: false as const, message: `Phòng ${room.room_code} không còn trống. Hãy tải lại danh sách phòng.` };
      }

      let tenantId = parsed.tenantId;
      let tenantName = parsed.newTenant.fullName;

      if (tenantId === null) {
        if (parsed.newTenant.fullName === '') {
          return { ok: false as const, message: 'Vui lòng nhập họ tên khách thuê mới.' };
        }
        if (parsed.newTenant.citizenId !== '') {
          const duplicate = await tx<{ id: number }[]>`
            select id from tenants where citizen_id = ${parsed.newTenant.citizenId} limit 1
          `;
          if (duplicate[0]) {
            return { ok: false as const, message: 'CCCD/CMND này đã tồn tại. Hãy chọn khách đã có hoặc kiểm tra lại thông tin.' };
          }
        }

        const createdTenants = await tx<{ id: number; full_name: string }[]>`
          insert into tenants (full_name, phone, citizen_id, date_of_birth, citizen_id_issued_date, occupation, note, created_at, updated_at)
          values (
            ${parsed.newTenant.fullName},
            ${nullable(parsed.newTenant.phone)},
            ${nullable(parsed.newTenant.citizenId)},
            ${parsed.newTenant.dateOfBirth || null},
            ${parsed.newTenant.citizenIdIssuedDate || null},
            ${nullable(parsed.newTenant.occupation)},
            ${nullable(parsed.newTenant.note)},
            now(), now()
          )
          returning id, full_name
        `;
        tenantId = createdTenants[0].id;
        tenantName = createdTenants[0].full_name;
      } else {
        const tenants = await tx<{ id: number; full_name: string }[]>`
          select id, full_name from tenants where id = ${tenantId} for update
        `;
        if (!tenants[0]) return { ok: false as const, message: 'Khách thuê không tồn tại.' };
        tenantName = tenants[0].full_name;
      }

      const existingTenantLease = await tx<{ id: number }[]>`
        select id
        from leases
        where tenant_id = ${tenantId}
          and status in ('reserved', 'active', 'ending_soon')
        limit 1
      `;
      if (existingTenantLease[0]) {
        return { ok: false as const, message: 'Khách này đang có hợp đồng còn hiệu lực, không thể tạo hợp đồng mới.' };
      }

      const requestedEnd = parsed.expectedEndDate || '9999-12-31';
      const overlappingLeases = await tx<{ id: number }[]>`
        select id
        from leases
        where room_id = ${parsed.roomId}
          and status in ('reserved', 'active', 'ending_soon')
          and start_date <= ${requestedEnd}
          and coalesce(actual_end_date, expected_end_date, '9999-12-31') >= ${parsed.startDate}
        limit 1
      `;
      if (overlappingLeases[0]) {
        return { ok: false as const, message: `Phòng ${room.room_code} đã có hợp đồng trùng thời gian.` };
      }

      const leases = await tx<{ id: number }[]>`
        insert into leases (
          tenant_id, room_id, start_date, expected_end_date, monthly_rent, due_day,
          water_fee, service_fee, electricity_unit_price, occupants_count,
          deposit_amount, status, note, created_at, updated_at
        ) values (
          ${tenantId}, ${parsed.roomId}, ${parsed.startDate}, ${parsed.expectedEndDate || null},
          ${parsed.monthlyRent}, ${parsed.dueDay}, ${parsed.waterFee}, ${parsed.serviceFee},
          ${parsed.electricityUnitPrice}, ${parsed.occupantsCount}, ${parsed.depositAmount},
          ${parsed.status}, ${nullable(parsed.note)}, now(), now()
        )
        returning id
      `;
      const leaseId = leases[0].id;

      await tx`
        update rooms
        set status = ${parsed.status === 'reserved' ? 'reserved' : 'occupied'}, updated_at = now()
        where id = ${parsed.roomId}
      `;

      await tx`
        insert into room_meter_baselines
          (room_id, effective_from, electricity_reading, note, created_by, created_at, updated_at)
        values
          (${parsed.roomId}, ${parsed.startDate}, ${parsed.electricityStart},
           'Mốc điện ngày vào hợp đồng.', ${session.userId}, now(), now())
        on conflict (room_id, effective_from) do update set
          electricity_reading = excluded.electricity_reading,
          note = excluded.note,
          created_by = excluded.created_by,
          updated_at = now()
      `;

      await tx`
        update rooms
        set current_electricity_reading = ${parsed.electricityStart},
            electricity_reading_updated_at = now()
        where id = ${parsed.roomId}
      `;

      await logAudit(tx, {
        userId: session.userId,
        action: 'lease.created',
        subjectType: 'App\\Models\\Lease',
        subjectId: leaseId,
        newValues: {
          tenant_id: tenantId,
          room_id: parsed.roomId,
          start_date: parsed.startDate,
          expected_end_date: parsed.expectedEndDate || null,
          monthly_rent: parsed.monthlyRent,
          deposit_amount: parsed.depositAmount,
          electricity_start: parsed.electricityStart,
          status: parsed.status,
        },
        note: `Tạo hợp đồng cho ${tenantName}, chưa ghi nhận thu cọc hoặc tạo bill.`,
      });

      return {
        ok: true as const,
        leaseId,
        message: `Đã tạo hợp đồng cho ${tenantName} tại phòng ${room.room_code}. Bill và thanh toán cũ không bị thay đổi.`,
      };
    });

    if (!result.ok) return result;
    revalidateLeasePaths();
    return result;
  } catch (error) {
    console.error('Không thể tạo hợp đồng:', error);
    return { ok: false, message: databaseErrorMessage(error) };
  }
}

/** Huỷ hợp đồng đặt trước chưa phát sinh bill, payment hoặc giao dịch cọc. */
export async function cancelLease(leaseId: number): Promise<LeaseLifecycleActionResult> {
  const session = await requireRole('admin', 'staff');
  if (!validId(leaseId)) return { ok: false, message: 'Hợp đồng không hợp lệ.' };

  try {
    const result = await sql.begin(async (tx) => {
      const leases = await tx<{ id: number; room_id: number; room_code: string; status: string }[]>`
        select l.id, l.room_id, r.room_code, l.status
        from leases l join rooms r on r.id = l.room_id
        where l.id = ${leaseId}
        for update
      `;
      const lease = leases[0];
      if (!lease) return { ok: false as const, message: 'Không tìm thấy hợp đồng.' };
      if (lease.status !== 'reserved') {
        return { ok: false as const, message: 'Chỉ được huỷ hợp đồng đang ở trạng thái Đặt trước. Hợp đồng đã ở thì phải Kết thúc.' };
      }

      const activity = await tx<{ has_bill: boolean; has_payment: boolean; has_deposit: boolean }[]>`
        select
          exists(select 1 from bills where lease_id = ${leaseId} and status <> 'cancelled') as has_bill,
          exists(select 1 from payments where lease_id = ${leaseId} and status <> 'voided') as has_payment,
          exists(
            select 1 from deposit_transactions dt
            join deposits d on d.id = dt.deposit_id
            where d.lease_id = ${leaseId}
          ) as has_deposit
      `;
      const row = activity[0];
      if (row.has_bill || row.has_payment || row.has_deposit) {
        return { ok: false as const, message: 'Không thể huỷ vì hợp đồng đã phát sinh bill, thanh toán hoặc giao dịch cọc. Hãy giữ nguyên lịch sử và dùng quy trình Kết thúc.' };
      }

      await tx`update leases set status = 'cancelled', actual_end_date = null, updated_at = now() where id = ${leaseId}`;
      await tx`
        update rooms
        set status = case
          when exists (select 1 from leases where room_id = ${lease.room_id} and id <> ${leaseId} and status in ('active', 'ending_soon')) then 'occupied'
          when exists (select 1 from leases where room_id = ${lease.room_id} and id <> ${leaseId} and status = 'reserved') then 'reserved'
          else 'vacant'
        end,
        updated_at = now()
        where id = ${lease.room_id}
      `;
      await logAudit(tx, {
        userId: session.userId,
        action: 'lease.cancelled',
        subjectType: 'App\\Models\\Lease',
        subjectId: leaseId,
        oldValues: { status: 'reserved' },
        newValues: { status: 'cancelled' },
        note: `Huỷ hợp đồng đặt trước phòng ${lease.room_code}; không xoá dữ liệu lịch sử.`,
      });
      return { ok: true as const, message: `Đã huỷ hợp đồng phòng ${lease.room_code}. Không có bill hay thanh toán nào bị xoá.` };
    });
    if (!result.ok) return result;
    revalidateLeasePaths();
    return result;
  } catch (error) {
    console.error('Không thể huỷ hợp đồng:', error);
    return { ok: false, message: databaseErrorMessage(error) };
  }
}

/**
 * Kết thúc hợp đồng đã ở. Không tự động sửa bill, xoá payment hay trừ/hoàn cọc.
 * Nếu còn nghĩa vụ tài chính, bắt buộc xử lý checkout trước.
 */
export async function endLease(
  leaseId: number,
  actualEndDate: string,
): Promise<LeaseLifecycleActionResult> {
  const session = await requireRole('admin', 'staff');
  if (!validId(leaseId) || !isCivilDate(actualEndDate)) {
    return { ok: false, message: 'Ngày kết thúc hoặc hợp đồng không hợp lệ.' };
  }

  try {
    const result = await sql.begin(async (tx) => {
      const leases = await tx<{
        id: number;
        room_id: number;
        room_code: string;
        status: string;
        start_date: string;
      }[]>`
        select l.id, l.room_id, r.room_code, l.status, l.start_date
        from leases l join rooms r on r.id = l.room_id
        where l.id = ${leaseId}
        for update
      `;
      const lease = leases[0];
      if (!lease) return { ok: false as const, message: 'Không tìm thấy hợp đồng.' };
      if (!['active', 'ending_soon'].includes(lease.status)) {
        return { ok: false as const, message: 'Chỉ được kết thúc hợp đồng đang ở hoặc sắp kết thúc.' };
      }
      if (actualEndDate < lease.start_date) {
        return { ok: false as const, message: 'Ngày kết thúc không thể trước ngày bắt đầu hợp đồng.' };
      }

      const billState = await tx<{ unpaid_amount: number; draft_count: number }[]>`
        select
          coalesce(sum(case when status <> 'cancelled' and outstanding_amount > 0 then outstanding_amount else 0 end), 0) as unpaid_amount,
          count(*) filter (where status in ('draft', 'adjusting'))::int as draft_count
        from bills
        where lease_id = ${leaseId}
      `;
      const bills = billState[0];
      if (Number(bills.unpaid_amount) > 0 || Number(bills.draft_count) > 0) {
        return {
          ok: false as const,
          message: `Chưa thể kết thúc: còn ${Number(bills.unpaid_amount).toLocaleString('vi-VN')} đ bill chưa thu hoặc ${bills.draft_count} bill nháp. Hãy chốt/thu hoặc huỷ bill nháp trước; hệ thống không tự sửa lịch sử.`,
        };
      }

      const deposits = await tx<{ current_balance: number }[]>`
        select current_balance from deposits where lease_id = ${leaseId} for update
      `;
      if (Number(deposits[0]?.current_balance ?? 0) > 0) {
        return { ok: false as const, message: `Chưa thể kết thúc: tiền cọc còn ${Number(deposits[0].current_balance).toLocaleString('vi-VN')} đ. Hãy hoàn/trừ cọc trong quy trình trả phòng trước.` };
      }

      await tx`update leases set status = 'ended', actual_end_date = ${actualEndDate}, updated_at = now() where id = ${leaseId}`;
      await tx`
        update rooms
        set status = case
          when exists (select 1 from leases where room_id = ${lease.room_id} and id <> ${leaseId} and status in ('active', 'ending_soon')) then 'occupied'
          when exists (select 1 from leases where room_id = ${lease.room_id} and id <> ${leaseId} and status = 'reserved') then 'reserved'
          else 'vacant'
        end,
        updated_at = now()
        where id = ${lease.room_id}
      `;
      await logAudit(tx, {
        userId: session.userId,
        action: 'lease.ended',
        subjectType: 'App\\Models\\Lease',
        subjectId: leaseId,
        oldValues: { status: lease.status, actual_end_date: null },
        newValues: { status: 'ended', actual_end_date: actualEndDate },
        note: `Kết thúc hợp đồng phòng ${lease.room_code}; bill, payment và giao dịch cọc được giữ nguyên.`,
      });
      return { ok: true as const, message: `Đã kết thúc hợp đồng phòng ${lease.room_code}. Bill, thanh toán và lịch sử cọc không bị thay đổi.` };
    });
    if (!result.ok) return result;
    revalidateLeasePaths();
    return result;
  } catch (error) {
    console.error('Không thể kết thúc hợp đồng:', error);
    return { ok: false, message: databaseErrorMessage(error) };
  }
}

function parseCreateInput(input: CreateLeaseInput):
  | { ok: true; tenantId: number | null; newTenant: CreateLeaseInput['newTenant']; roomId: number; startDate: string; expectedEndDate: string; monthlyRent: number; dueDay: number; occupantsCount: number; depositAmount: number; electricityUnitPrice: number; waterFee: number; serviceFee: number; electricityStart: number; status: 'reserved' | 'active'; note: string }
  | { ok: false; message: string } {
  const tenantId = integer(input.tenantId);
  const roomId = integer(input.roomId);
  const monthlyRent = normalizeMoneyInput(input.monthlyRent);
  const dueDay = integer(input.dueDay);
  const occupantsCount = integer(input.occupantsCount);
  const depositAmount = normalizeMoneyInput(input.depositAmount);
  const electricityUnitPrice = normalizeMoneyInput(input.electricityUnitPrice);
  const waterFee = normalizeMoneyInput(input.waterFee);
  const serviceFee = normalizeMoneyInput(input.serviceFee);
  const electricityStart = integer(input.electricityStart);
  const startDate = input.startDate.trim();
  const expectedEndDate = input.expectedEndDate.trim();
  const dateOfBirth = input.newTenant.dateOfBirth.trim();
  const citizenIdIssuedDate = input.newTenant.citizenIdIssuedDate.trim();

  const rawTenantId = String(input.tenantId ?? '').trim();
  if (rawTenantId !== '' && tenantId === null) return { ok: false, message: 'Khách thuê không hợp lệ.' };
  if (tenantId === null && !input.newTenant) return { ok: false, message: 'Thiếu thông tin khách thuê.' };
  if (tenantId !== null && tenantId <= 0) return { ok: false, message: 'Khách thuê không hợp lệ.' };
  if (roomId === null || roomId <= 0) return { ok: false, message: 'Vui lòng chọn phòng.' };
  if (!isCivilDate(startDate) || (expectedEndDate !== '' && !isCivilDate(expectedEndDate))) return { ok: false, message: 'Ngày bắt đầu hoặc ngày kết thúc không hợp lệ.' };
  if (expectedEndDate !== '' && expectedEndDate < startDate) return { ok: false, message: 'Ngày kết thúc dự kiến phải sau hoặc bằng ngày bắt đầu.' };
  if ((dateOfBirth !== '' && !isCivilDate(dateOfBirth)) || (citizenIdIssuedDate !== '' && !isCivilDate(citizenIdIssuedDate))) return { ok: false, message: 'Ngày sinh hoặc ngày cấp CCCD/CMND không hợp lệ.' };
  if (monthlyRent === null || monthlyRent <= 0) return { ok: false, message: 'Giá phòng phải lớn hơn 0.' };
  if (dueDay === null || dueDay < 1 || dueDay > 28) return { ok: false, message: 'Ngày hạn thanh toán phải từ 1 đến 28.' };
  if (occupantsCount === null || occupantsCount < 1 || occupantsCount > 20) return { ok: false, message: 'Số người ở phải từ 1 đến 20.' };
  if (depositAmount === null || depositAmount < 0 || electricityUnitPrice === null || electricityUnitPrice < 0 || waterFee === null || waterFee < 0 || serviceFee === null || serviceFee < 0) return { ok: false, message: 'Tiền cọc và các đơn giá không hợp lệ.' };
  if (electricityStart === null || electricityStart < 0) return { ok: false, message: 'Số điện ngày vào phải là số nguyên không âm.' };
  if (!['reserved', 'active'].includes(input.status)) return { ok: false, message: 'Trạng thái hợp đồng không hợp lệ.' };

  return {
    ok: true,
    tenantId,
      newTenant: {
        fullName: input.newTenant.fullName.trim(),
        phone: input.newTenant.phone.trim(),
        citizenId: input.newTenant.citizenId.trim(),
        dateOfBirth,
        citizenIdIssuedDate,
        occupation: input.newTenant.occupation.trim(),
      note: input.newTenant.note.trim(),
    },
    roomId,
    startDate,
    expectedEndDate,
    monthlyRent,
    dueDay,
    occupantsCount,
    depositAmount,
    electricityUnitPrice,
    waterFee,
    serviceFee,
    electricityStart,
    status: input.status,
    note: input.note.trim(),
  };
}

function integer(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

function nullable(value: string): string | null {
  return value.trim() || null;
}

function validId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function revalidateLeasePaths(): void {
  revalidatePath('/hop-dong');
  revalidatePath('/khach-thue');
  revalidatePath('/so-do-phong');
  revalidatePath('/bill-thang');
  revalidatePath('/hoa-don');
  revalidatePath('/dashboard');
}

function databaseErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  if (code === '42P01') return 'Cơ sở dữ liệu chưa có bảng cần thiết. Hãy chạy migration Next.js trước.';
  if (code === '23505') return 'Dữ liệu bị trùng. Hãy tải lại trang rồi kiểm tra khách/phòng.';
  return 'Không thể lưu hợp đồng. Dữ liệu chưa bị thay đổi; hãy thử lại.';
}
