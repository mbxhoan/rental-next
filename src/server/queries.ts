import 'server-only';
import { sql } from '@/lib/db';
import { buildFallbackPaymentQr } from './services/bill-payment-request';
import type { CivilDate } from '@/domain/date';
import type { BillItemRow, BillForDisplay, PendingPaymentQr, PreviousBillSummary } from '@/domain/bill-display';
import type { LeaseForBilling } from '@/domain/bill-calculator';
import type { BillStatus, LeaseStatus, RoomStatus } from '@/domain/enums';

/**
 * Truy vấn đọc. Ghi nằm ở `src/server/actions/`.
 *
 * Dùng schema Supabase hiện tại; giữ snake_case theo tên cột trong database.
 */

export type BuildingRow = {
  id: number;
  name: string;
  address: string | null;
  default_billing_day: number;
  default_electricity_unit_price: number;
};

export type FloorRow = { id: number; building_id: number; name: string; sort_order: number };

export type RoomRow = {
  id: number;
  building_id: number;
  floor_id: number;
  room_code: string;
  default_rent: number;
  status: RoomStatus;
  note: string | null;
  billing_day_override: number | null;
  billing_period_start_day: number | null;
};

export async function listBuildings(): Promise<BuildingRow[]> {
  return sql<BuildingRow[]>`
    select id, name, address, default_billing_day, default_electricity_unit_price
    from buildings
    order by name
  `;
}

export async function listFloors(): Promise<FloorRow[]> {
  return sql<FloorRow[]>`
    select id, building_id, name, sort_order
    from floors
    order by building_id, sort_order, name
  `;
}

export async function listRooms(): Promise<RoomRow[]> {
  return sql<RoomRow[]>`
    select id, building_id, floor_id, room_code, default_rent, status, note,
           billing_day_override, billing_period_start_day
    from rooms
    order by building_id, floor_id, room_code
  `;
}

export type RoomMapEntry = RoomRow & {
  building_name: string;
  floor_name: string;
  tenant_id: number | null;
  tenant_name: string | null;
  lease_id: number | null;
  monthly_rent: number | null;
  lease_start_date: CivilDate | null;
  outstanding_total: number;
};

/** Sơ đồ phòng: mỗi phòng kèm khách đang ở và công nợ còn lại. */
export async function getRoomMap(): Promise<RoomMapEntry[]> {
  return sql<RoomMapEntry[]>`
    select
      r.id, r.building_id, r.floor_id, r.room_code, r.default_rent, r.status, r.note,
      r.billing_day_override, r.billing_period_start_day,
      b.name as building_name,
      f.name as floor_name,
      l.id as lease_id,
      l.monthly_rent,
      l.start_date as lease_start_date,
      t.id as tenant_id,
      t.full_name as tenant_name,
      coalesce(debt.outstanding_total, 0) as outstanding_total
    from rooms r
    join buildings b on b.id = r.building_id
    join floors f on f.id = r.floor_id
    left join lateral (
      select l.* from leases l
      where l.room_id = r.id and l.status in ('active', 'ending_soon', 'reserved')
      order by case l.status when 'active' then 0 when 'ending_soon' then 1 else 2 end,
               l.start_date desc
      limit 1
    ) l on true
    left join tenants t on t.id = l.tenant_id
    left join lateral (
      select sum(bl.outstanding_amount) as outstanding_total
      from bills bl
      where bl.room_id = r.id and bl.status not in ('paid', 'cancelled', 'draft', 'adjusting')
    ) debt on true
    order by b.name, f.sort_order, f.name, r.room_code
  `;
}

export type TenantListRow = {
  id: number;
  full_name: string;
  phone: string | null;
  citizen_id: string | null;
  occupation: string | null;
  note: string | null;
  code: string | null;
  lease_id: number | null;
  lease_status: LeaseStatus | null;
  room_code: string | null;
  building_name: string | null;
  outstanding_total: number;
};

export async function listTenants(search = ''): Promise<TenantListRow[]> {
  const term = search.trim();
  const pattern = `%${term}%`;

  return sql<TenantListRow[]>`
    select
      t.id, t.full_name, t.phone, t.citizen_id, t.occupation, t.note, t.code,
      l.id as lease_id,
      l.status as lease_status,
      r.room_code,
      b.name as building_name,
      coalesce(debt.outstanding_total, 0) as outstanding_total
    from tenants t
    left join lateral (
      select l.* from leases l
      where l.tenant_id = t.id and l.status in ('active', 'ending_soon', 'reserved')
      order by case l.status when 'active' then 0 when 'ending_soon' then 1 else 2 end,
               l.start_date desc
      limit 1
    ) l on true
    left join rooms r on r.id = l.room_id
    left join buildings b on b.id = r.building_id
    left join lateral (
      select sum(bl.outstanding_amount) as outstanding_total
      from bills bl
      where bl.tenant_id = t.id and bl.status not in ('paid', 'cancelled', 'draft', 'adjusting')
    ) debt on true
    ${term === '' ? sql`` : sql`where t.full_name ilike ${pattern} or t.phone ilike ${pattern} or t.citizen_id ilike ${pattern}`}
    order by t.full_name
    limit 300
  `;
}

export type LeaseListRow = {
  id: number;
  code: string | null;
  tenant_id: number;
  tenant_name: string;
  room_id: number;
  room_code: string;
  building_name: string;
  floor_name: string;
  start_date: CivilDate;
  expected_end_date: CivilDate | null;
  actual_end_date: CivilDate | null;
  monthly_rent: number;
  deposit_amount: number;
  occupants_count: number;
  status: LeaseStatus;
  outstanding_total: number;
};

export async function listLeases(status = ''): Promise<LeaseListRow[]> {
  return sql<LeaseListRow[]>`
    select
      l.id, l.code, l.tenant_id, l.room_id, l.start_date, l.expected_end_date,
      l.actual_end_date, l.monthly_rent, l.deposit_amount, l.occupants_count, l.status,
      t.full_name as tenant_name,
      r.room_code,
      b.name as building_name,
      f.name as floor_name,
      coalesce(debt.outstanding_total, 0) as outstanding_total
    from leases l
    join tenants t on t.id = l.tenant_id
    join rooms r on r.id = l.room_id
    join buildings b on b.id = r.building_id
    join floors f on f.id = r.floor_id
    left join lateral (
      select sum(bl.outstanding_amount) as outstanding_total
      from bills bl
      where bl.lease_id = l.id and bl.status not in ('paid', 'cancelled', 'draft', 'adjusting')
    ) debt on true
    ${status === '' ? sql`` : sql`where l.status = ${status}`}
    order by b.name, f.sort_order, r.room_code
    limit 500
  `;
}

/** Hợp đồng đang hiệu lực trong kỳ, kèm dữ liệu cần để lên bill. */
export type BillableLease = LeaseForBilling & {
  code: string | null;
  status: LeaseStatus;
  tenant_id: number;
  tenant_name: string;
  room_id: number;
  room_code: string;
  floor_name: string;
  building_id: number;
  building_name: string;
  building_billing_day: number;
  building_electricity_unit_price: number;
  billing_day_override: number | null;
  billing_period_start_day: number | null;
  latest_bill_period_to: CivilDate | null;
  existing_bill_id: number | null;
  existing_bill_status: BillStatus | null;
  existing_electricity_old: number | null;
  existing_electricity_new: number | null;
};

export async function listBillableLeases(
  periodFrom: CivilDate,
  periodTo: CivilDate,
): Promise<BillableLease[]> {
  return sql<BillableLease[]>`
    select
      l.id, l.code, l.status, l.start_date, l.expected_end_date, l.actual_end_date,
      l.monthly_rent, l.due_day, l.water_fee, l.service_fee, l.electricity_unit_price,
      l.occupants_count, l.tenant_id, l.room_id,
      t.full_name as tenant_name,
      r.room_code, r.billing_day_override, r.billing_period_start_day,
      f.name as floor_name,
      b.id as building_id, b.name as building_name,
      b.default_billing_day as building_billing_day,
      b.default_electricity_unit_price as building_electricity_unit_price,
      latest.period_to as latest_bill_period_to,
      existing.id as existing_bill_id, existing.status as existing_bill_status,
      existing.electricity_old as existing_electricity_old,
      existing.electricity_new as existing_electricity_new
    from leases l
    join tenants t on t.id = l.tenant_id
    join rooms r on r.id = l.room_id
    join floors f on f.id = r.floor_id
    join buildings b on b.id = r.building_id
    left join lateral (
      select max(bl.period_to) as period_to
      from bills bl
      where bl.lease_id = l.id and bl.status <> 'cancelled'
    ) latest on true
    left join lateral (
      select bl.id, bl.status,
             (bi.meta->>'old_reading')::int as electricity_old,
             (bi.meta->>'new_reading')::int as electricity_new
      from bills bl
      left join bill_items bi on bi.bill_id = bl.id and bi.type = 'electricity'
      where bl.lease_id = l.id
        and bl.period_from = ${periodFrom}
        and bl.period_to = ${periodTo}
        and bl.status <> 'cancelled'
      order by bl.id desc
      limit 1
    ) existing on true
    where l.status in ('active', 'ending_soon', 'reserved')
      and l.start_date <= ${periodTo}
      and (l.actual_end_date is null or l.actual_end_date >= ${periodFrom})
    order by b.name, f.sort_order, r.room_code
  `;
}

/**
 * Số điện làm mốc cho một kỳ bill cụ thể.
 *
 * Bill đã chốt luôn giữ nguyên. Khi cần sửa mốc sau khi rà soát công tơ,
 * người dùng tạo một `room_meter_baselines` mới; mốc này chỉ ảnh hưởng những
 * kỳ từ ngày hiệu lực trở về sau.
 */
export type ElectricityReadingAsOf = {
  electricity_reading: number;
  recorded_on: CivilDate;
  source: 'baseline' | 'bill' | 'meter_reading';
};

export async function getRoomElectricityReadingAsOf(
  roomId: number,
  periodFrom: CivilDate,
): Promise<ElectricityReadingAsOf | null> {
  const rows = await sql<ElectricityReadingAsOf[]>`
    select electricity_reading, recorded_on, source
    from (
      select
        b.period_to as recorded_on,
        nullif(coalesce(bi.meta->>'new_reading', bi.meta->>'new'), '')::int as electricity_reading,
        'bill'::text as source,
        b.id as source_id
      from bills b
      join bill_items bi on bi.bill_id = b.id and bi.type = 'electricity'
      where b.room_id = ${roomId}
        and b.status in ('sent', 'partial', 'paid', 'overdue')
        and b.period_to <= ${periodFrom}
        and nullif(coalesce(bi.meta->>'new_reading', bi.meta->>'new'), '') is not null

      union all

      select
        mr.period_month as recorded_on,
        mr.electricity_new as electricity_reading,
        'meter_reading'::text as source,
        mr.id as source_id
      from meter_readings mr
      where mr.room_id = ${roomId}
        and mr.period_month <= ${periodFrom}
        and not exists (
          select 1 from bills linked_bill
          where linked_bill.room_id = mr.room_id
            and linked_bill.period_from = mr.period_month
        )

      union all

      select
        mb.effective_from as recorded_on,
        mb.electricity_reading,
        'baseline'::text as source,
        mb.id as source_id
      from room_meter_baselines mb
      where mb.room_id = ${roomId}
        and mb.effective_from <= ${periodFrom}
    ) readings
    order by
      recorded_on desc,
      case source when 'baseline' then 3 when 'bill' then 2 else 1 end desc,
      source_id desc
    limit 1
  `;

  return rows[0] ?? null;
}

export type BillListRow = {
  id: number;
  code: string | null;
  tenant_name: string;
  room_code: string;
  building_name: string;
  period_from: CivilDate;
  period_to: CivilDate;
  display_period_from: CivilDate | null;
  display_period_to: CivilDate | null;
  due_date: CivilDate | null;
  total_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  status: BillStatus;
};

export async function listBills(limit = 200): Promise<BillListRow[]> {
  return sql<BillListRow[]>`
    select
      bl.id, bl.code, bl.period_from, bl.period_to,
      bl.display_period_from, bl.display_period_to, bl.due_date,
      bl.total_amount, bl.paid_amount, bl.outstanding_amount, bl.status,
      t.full_name as tenant_name,
      r.room_code,
      b.name as building_name
    from bills bl
    join tenants t on t.id = bl.tenant_id
    join rooms r on r.id = bl.room_id
    join buildings b on b.id = r.building_id
    order by bl.period_to desc, b.name, r.room_code
    limit ${limit}
  `;
}

/** Bill kèm mọi thứ cần cho màn chi tiết + bản in. */
export async function getBillForDisplay(billId: number): Promise<{
  bill: BillForDisplay;
  previousBill: PreviousBillSummary;
  pendingQr: PendingPaymentQr;
  leaseId: number;
  tenantId: number;
} | null> {
  const rows = await sql<
    (BillForDisplay & { lease_id: number; tenant_id: number })[]
  >`
    select
      bl.id, bl.code, bl.period_from, bl.period_to,
      bl.display_period_from, bl.display_period_to, bl.due_date,
      bl.total_amount, bl.paid_amount, bl.outstanding_amount, bl.status,
      bl.is_manual_override, bl.manual_reason, bl.note,
      bl.lease_id, bl.tenant_id,
      t.full_name as tenant_name,
      r.room_code,
      f.name as floor_name,
      b.name as building_name,
      l.monthly_rent
    from bills bl
    join leases l on l.id = bl.lease_id
    join tenants t on t.id = bl.tenant_id
    join rooms r on r.id = bl.room_id
    join floors f on f.id = r.floor_id
    join buildings b on b.id = r.building_id
    where bl.id = ${billId}
    limit 1
  `;

  const bill = rows[0];
  if (!bill) return null;

  const [items, previousBills, pendingRequests, defaultAccounts] = await Promise.all([
    sql<BillItemRow[]>`
      select type, description, quantity, unit_price, amount, meta
      from bill_items where bill_id = ${billId} order by id
    `,
    sql<{ period_to: CivilDate; total_amount: number }[]>`
      select period_to, total_amount from bills
      where lease_id = ${bill.lease_id} and period_to < ${bill.period_from}
      order by period_to desc limit 1
    `,
    sql<NonNullable<PendingPaymentQr>[]>`
      select pr.qr_image_url, pr.qr_data_url, pr.amount, pr.transfer_content,
             ba.account_name, ba.account_no, ba.bank_name
      from payment_requests pr
      left join bank_accounts ba on ba.id = pr.bank_account_id
      where pr.bill_id = ${billId} and pr.type = 'bill_payment' and pr.status = 'pending'
      order by pr.id desc limit 1
    `,
    sql<{ bank_name: string; bank_code: string | null; acq_id: string | null; account_no: string; account_name: string }[]>`
      select bank_name, bank_code, acq_id, account_no, account_name
      from bank_accounts order by is_default desc, updated_at desc limit 1
    `,
  ]);

  const pendingQr = pendingRequests[0] ?? (() => {
    const account = defaultAccounts[0];
    const bankCode = account?.bank_code || account?.acq_id;
    if (!account || !bankCode || bill.outstanding_amount <= 0 || bill.status === 'adjusting' || bill.status === 'draft') return null;
    const fallback = buildFallbackPaymentQr({
      amount: bill.outstanding_amount,
      roomCode: bill.room_code,
      periodTo: bill.period_to,
      bankName: account.bank_name,
      bankCode,
      accountNo: account.account_no,
      accountName: account.account_name,
    });
    return { qr_image_url: fallback.qrImageUrl, qr_data_url: fallback.qrDataUrl, amount: fallback.amount, transfer_content: fallback.transferContent, account_name: fallback.accountName, account_no: fallback.accountNo, bank_name: fallback.bankName };
  })();

  return {
    bill: { ...bill, items },
    previousBill: previousBills[0] ?? null,
    pendingQr,
    leaseId: bill.lease_id,
    tenantId: bill.tenant_id,
  };
}

export type PaymentRow = {
  id: number;
  bill_id: number;
  paid_date: CivilDate;
  amount: number;
  method: string;
  status: string;
  note: string | null;
  voided_at: string | null;
  void_reason: string | null;
  tenant_name: string;
  room_code: string;
};

export async function listPayments(limit = 200): Promise<PaymentRow[]> {
  return sql<PaymentRow[]>`
    select p.id, p.bill_id, p.paid_date, p.amount, p.method, p.status, p.note,
           p.voided_at, p.void_reason,
           t.full_name as tenant_name, r.room_code
    from payments p
    join tenants t on t.id = p.tenant_id
    join bills bl on bl.id = p.bill_id
    join rooms r on r.id = bl.room_id
    order by p.paid_date desc, p.id desc
    limit ${limit}
  `;
}

export type DashboardSummary = {
  rooms_total: number;
  rooms_occupied: number;
  unpaid_count: number;
  outstanding_total: number;
  collected_in_month: number;
};

/** Tổng hợp công nợ và số phòng cho dashboard. */
export async function getDashboardSummary(monthStart: CivilDate, monthEnd: CivilDate) {
  const rows = await sql<DashboardSummary[]>`
    select
      (select count(*) from rooms)::int as rooms_total,
      (select count(*) from rooms where status = 'occupied')::int as rooms_occupied,
      (select count(*) from bills where status not in ('paid', 'cancelled', 'draft', 'adjusting'))::int as unpaid_count,
      (select coalesce(sum(outstanding_amount), 0) from bills
         where status not in ('paid', 'cancelled', 'draft', 'adjusting')) as outstanding_total,
      (select coalesce(sum(amount), 0) from payments
         where status = 'confirmed' and paid_date between ${monthStart} and ${monthEnd}) as collected_in_month
  `;

  return rows[0];
}

export async function hasBuildings(): Promise<boolean> {
  const rows = await sql<{ exists: boolean }[]>`select exists(select 1 from buildings) as exists`;
  return rows[0]?.exists ?? false;
}

export type BankAccountRow = {
  id: number;
  bank_name: string;
  bank_code: string | null;
  acq_id: string | null;
  account_no: string;
  account_name: string;
  is_default: boolean;
};

export async function listBankAccounts(): Promise<BankAccountRow[]> {
  return sql<BankAccountRow[]>`
    select id, bank_name, bank_code, acq_id, account_no, account_name, is_default
    from bank_accounts
    order by is_default desc, updated_at desc
  `;
}
