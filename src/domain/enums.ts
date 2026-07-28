/**
 * Bản sao các enum trong `app/Domain/Rental/Enums/`.
 *
 * Giá trị chuỗi phải khớp tuyệt đối với DB vì hai app dùng chung bảng.
 */

export const BILL_STATUSES = ['draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled'] as const;
export type BillStatus = (typeof BILL_STATUSES)[number];

export const BILL_ITEM_TYPES = [
  'rent',
  'electricity',
  'water',
  'service',
  'surcharge',
  'discount',
  'deposit_deduction',
  'manual_adjustment',
] as const;
export type BillItemType = (typeof BILL_ITEM_TYPES)[number];

export const LEASE_STATUSES = ['reserved', 'active', 'ending_soon', 'ended', 'cancelled'] as const;
export type LeaseStatus = (typeof LEASE_STATUSES)[number];

export const ROOM_STATUSES = ['vacant', 'occupied', 'reserved', 'maintenance', 'inactive'] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];

export const PAYMENT_METHODS = ['cash', 'bank_transfer', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ['pending', 'confirmed', 'voided'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_REQUEST_STATUSES = ['pending', 'confirmed', 'cancelled'] as const;
export type PaymentRequestStatus = (typeof PAYMENT_REQUEST_STATUSES)[number];

export const PAYMENT_REQUEST_TYPES = [
  'bill_payment',
  'deposit_collect',
  'checkout_due',
  'other',
] as const;
export type PaymentRequestType = (typeof PAYMENT_REQUEST_TYPES)[number];

export const USER_ROLES = ['admin', 'staff', 'viewer'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Thứ tự giữ nguyên `ExpenseCategory::inputCategories()` để báo cáo bày cùng thứ tự. */
export const EXPENSE_CATEGORIES = [
  'electricity_actual',
  'water_actual',
  'internet',
  'cleaning',
  'trash',
  'repair',
  'supplies',
  'agency_commission',
  'other',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const DEPOSIT_TRANSACTION_TYPES = [
  'collect',
  'refund',
  'deduct',
  'forfeited',
  'adjustment',
] as const;
export type DepositTransactionType = (typeof DEPOSIT_TRANSACTION_TYPES)[number];

export const CASH_TRANSACTION_TYPES = [
  'inflow',
  'outflow',
  'adjustment',
  'tenant_payment',
  'deposit_collect',
  'deposit_refund',
  'owner_withdrawal',
] as const;
export type CashTransactionType = (typeof CASH_TRANSACTION_TYPES)[number];

export const DEPOSIT_STATUSES = ['holding', 'settled', 'refunded', 'cancelled'] as const;
export type DepositStatus = (typeof DEPOSIT_STATUSES)[number];

// --- Nhãn tiếng Việt ---

export const BILL_STATUS_LABELS: Record<BillStatus, string> = {
  draft: 'Nháp',
  sent: 'Đã chốt',
  partial: 'Thanh toán một phần',
  paid: 'Đã thanh toán',
  overdue: 'Quá hạn',
  cancelled: 'Đã huỷ',
};

export const BILL_STATUS_BADGE_CLASSES: Record<BillStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  sent: 'bg-blue-100 text-blue-700',
  partial: 'bg-amber-100 text-amber-700',
  paid: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-rose-100 text-rose-700',
  cancelled: 'bg-slate-200 text-slate-600',
};

export const ROOM_STATUS_LABELS: Record<RoomStatus, string> = {
  vacant: 'Trống',
  occupied: 'Đã thuê',
  reserved: 'Đã giữ chỗ',
  maintenance: 'Bảo trì',
  inactive: 'Ngưng sử dụng',
};

export const ROOM_STATUS_BADGE_CLASSES: Record<RoomStatus, string> = {
  vacant: 'bg-emerald-100 text-emerald-700',
  occupied: 'bg-sky-100 text-sky-700',
  reserved: 'bg-amber-100 text-amber-700',
  maintenance: 'bg-rose-100 text-rose-700',
  inactive: 'bg-slate-200 text-slate-600',
};

/**
 * Tông màu nhấn của thẻ, đi kèm với badge ở trên. Đổi màu một trạng thái thì
 * sửa ở đây, cả app đổi theo.
 */
export type AccentTone = 'brand' | 'accent' | 'emerald' | 'amber' | 'rose' | 'slate';

export const ROOM_STATUS_ACCENTS: Record<RoomStatus, AccentTone> = {
  vacant: 'emerald',
  occupied: 'brand',
  reserved: 'amber',
  maintenance: 'rose',
  inactive: 'slate',
};

export const BILL_STATUS_ACCENTS: Record<BillStatus, AccentTone> = {
  draft: 'slate',
  sent: 'brand',
  partial: 'amber',
  paid: 'emerald',
  overdue: 'rose',
  cancelled: 'slate',
};

export const LEASE_STATUS_ACCENTS: Record<LeaseStatus, AccentTone> = {
  reserved: 'accent',
  active: 'emerald',
  ending_soon: 'amber',
  ended: 'slate',
  cancelled: 'slate',
};

export const LEASE_STATUS_BADGE_CLASSES: Record<LeaseStatus, string> = {
  reserved: 'bg-accent-50 text-accent-600',
  active: 'bg-emerald-100 text-emerald-700',
  ending_soon: 'bg-amber-100 text-amber-700',
  ended: 'bg-slate-200 text-slate-600',
  cancelled: 'bg-slate-200 text-slate-500',
};

export const LEASE_STATUS_LABELS: Record<LeaseStatus, string> = {
  reserved: 'Đã giữ chỗ',
  active: 'Đang thuê',
  ending_soon: 'Sắp hết hạn',
  ended: 'Đã kết thúc',
  cancelled: 'Đã huỷ',
};

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  electricity_actual: 'Điện thực tế',
  water_actual: 'Nước thực tế',
  internet: 'Internet',
  cleaning: 'Dọn dẹp',
  trash: 'Rác',
  repair: 'Sửa chữa',
  supplies: 'Vật tư',
  agency_commission: 'Hoa hồng môi giới',
  other: 'Khác',
};

export const BILL_ITEM_TYPE_LABELS: Record<string, string> = {
  rent: 'Tiền phòng',
  electricity: 'Tiền điện',
  water: 'Tiền nước',
  service: 'Phí dịch vụ',
  surcharge: 'Phụ thu',
  discount: 'Giảm trừ',
  manual_adjustment: 'Điều chỉnh tay',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Tiền mặt',
  bank_transfer: 'Chuyển khoản',
  other: 'Khác',
};

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Quản trị',
  staff: 'Nhân viên',
  viewer: 'Người xem',
};

export function canManageFinance(role: UserRole): boolean {
  return role === 'admin' || role === 'staff';
}

export function canManageCriticalData(role: UserRole): boolean {
  return role === 'admin';
}
