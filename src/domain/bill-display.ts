/**
 * Bản sao của `app/Domain/Rental/Services/BillDisplayBuilder.php`.
 *
 * Hàm thuần: nhận dữ liệu đã nạp sẵn, trả về đúng cấu trúc mà màn hình chi
 * tiết bill, bản in PDF và tin nhắn Zalo cùng dùng — để ba nơi không bao giờ
 * hiển thị lệch nhau.
 */

import { type CivilDate, formatDMY, formatMonthLabel } from './date.ts';
import { rentalConfig } from './config.ts';
import {
  BILL_STATUS_BADGE_CLASSES,
  BILL_STATUS_LABELS,
  type BillItemType,
  type BillStatus,
} from './enums.ts';
import { formatMoney } from './money.ts';

export type BillItemRow = {
  type: BillItemType;
  description: string | null;
  quantity: number | string;
  unit_price: number;
  amount: number;
  meta: Record<string, unknown> | null;
};

export type BillForDisplay = {
  id: number;
  code: string | null;
  period_from: CivilDate;
  period_to: CivilDate;
  display_period_from: CivilDate | null;
  display_period_to: CivilDate | null;
  due_date: CivilDate | null;
  total_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  status: BillStatus;
  is_manual_override: boolean;
  manual_reason: string | null;
  note: string | null;
  tenant_name: string;
  room_code: string;
  floor_name: string | null;
  building_name: string | null;
  monthly_rent: number;
  items: BillItemRow[];
};

export type PreviousBillSummary = { period_to: CivilDate; total_amount: number } | null;

export type PendingPaymentQr = {
  qr_image_url: string | null;
  qr_data_url: string | null;
  amount: number;
  transfer_content: string | null;
  account_name: string | null;
  account_no: string | null;
  bank_name: string | null;
} | null;

export type DisplayRow = {
  key: string;
  name: string;
  quantityLabel: string;
  unitPriceLabel: string;
  amountLabel: string;
  hint: string | null;
  detailLines: string[];
};

export type BillDisplay = ReturnType<typeof buildBillDisplay>;

export function buildBillDisplay(
  bill: BillForDisplay,
  previousBill: PreviousBillSummary = null,
  pendingQr: PendingPaymentQr = null,
) {
  const rentItem = findItem(bill, 'rent');
  const waterItem = findItem(bill, 'water');
  const electricityItem = findItem(bill, 'electricity');
  const serviceItem = findItem(bill, 'service');
  const surchargeItem = findItem(bill, 'surcharge');
  const discountItem = findItem(bill, 'discount');

  const periodLabel = formatMonthLabel(bill.period_to ?? bill.period_from);
  const subtitle = `Phòng ${bill.tenant_name} ${bill.room_code} - tháng ${periodLabel}`;

  const periodFromDate = bill.display_period_from ?? bill.period_from;
  const periodToDate = bill.display_period_to ?? bill.period_to;

  const rentMeta = metaOf(rentItem);
  const electricityMeta = metaOf(electricityItem);
  const surchargeAmount = amountOf(surchargeItem);
  const discountAmount = amountOf(discountItem);
  const netAdjustmentAmount = surchargeAmount - discountAmount;

  const items: DisplayRow[] = [
    buildRentRow(bill, rentItem, rentMeta, previousBill),
    buildWaterRow(waterItem),
    buildElectricityRow(electricityItem, electricityMeta),
    buildZeroRow('Internet', '0/người'),
    buildServiceRow('Phí DV 1 ng', serviceItem, '1/phòng'),
    buildZeroRow('Phí DV 2 ng', '1/phòng'),
    buildAdjustmentRow(netAdjustmentAmount, surchargeAmount, discountAmount),
  ];

  const notes = [bill.manual_reason, bill.note]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => value !== '');

  const previousBillLabel = previousBill
    ? `Đơn trước (${formatDMY(previousBill.period_to)})`
    : 'Đơn trước';
  const previousBillAmountLabel = previousBill
    ? formatMoney(previousBill.total_amount)
    : 'Chưa có';

  const readingFromLabel = formatDate(periodFromDate);
  const readingToLabel = formatDate(periodToDate);
  const totalAmountLabel = formatMoney(bill.total_amount);
  const footerNote = rentalConfig.defaults.pdfFooterNote;

  return {
    title: 'Chốt hoá đơn',
    subtitle,
    periodLabel,
    buildingName: bill.building_name,
    floorName: bill.floor_name,
    tenantName: bill.tenant_name,
    roomCode: bill.room_code,
    statusLabel: BILL_STATUS_LABELS[bill.status],
    statusBadgeClass: BILL_STATUS_BADGE_CLASSES[bill.status],
    readingFromLabel,
    readingToLabel,
    previousBillLabel,
    previousBillAmount: previousBill?.total_amount ?? null,
    previousBillAmountLabel,
    electricitySummary: buildElectricitySummary(electricityItem, electricityMeta),
    paymentQr: buildPaymentQr(bill, pendingQr),
    items,
    notes,
    summary: {
      totalAmount: bill.total_amount,
      totalAmountLabel,
      paidAmount: bill.paid_amount,
      paidAmountLabel: formatMoney(bill.paid_amount),
      outstandingAmount: bill.outstanding_amount,
      outstandingAmountLabel: formatMoney(bill.outstanding_amount),
      dueDateLabel: formatDate(bill.due_date),
    },
    zaloMessage: buildZaloMessage({
      tenantName: bill.tenant_name,
      roomCode: bill.room_code,
      periodLabel,
      readingFromLabel,
      readingToLabel,
      previousBillLabel,
      previousBillAmountLabel,
      items,
      totalAmountLabel,
      notes,
      footerNote,
    }),
    pdfFilename: `${slug(`hoa-don-${bill.tenant_name}-${bill.room_code}-${periodLabel}`)}.pdf`,
  };
}

function buildRentRow(
  bill: BillForDisplay,
  item: BillItemRow | null,
  meta: Record<string, unknown>,
  previousBill: PreviousBillSummary,
): DisplayRow {
  const daysInPeriod = Number(meta.days_in_period ?? 0);
  const occupiedDays = Number(meta.occupied_days ?? 0);

  let quantityLabel = '1/phòng';
  let hint: string | null = null;

  if (daysInPeriod > 0 && occupiedDays > 0 && occupiedDays < daysInPeriod) {
    quantityLabel = `${occupiedDays}/${daysInPeriod} ngày`;
    hint = 'Đã tính theo số ngày thực ở trong kỳ.';
  }

  const unitPrice = item?.unit_price ?? bill.monthly_rent ?? 0;

  return {
    key: 'rent',
    name: 'Phòng',
    quantityLabel,
    unitPriceLabel: formatMoney(unitPrice),
    amountLabel: formatMoney(amountOf(item)),
    hint,
    detailLines: previousBill
      ? ['Đã tính theo bill gần nhất trước đó.']
      : ['Đơn đầu tiên của hợp đồng.'],
  };
}

function buildWaterRow(item: BillItemRow | null): DisplayRow {
  const amount = amountOf(item);
  return {
    key: 'water',
    name: 'Nước',
    quantityLabel: '1/phòng',
    unitPriceLabel: formatMoney(amount),
    amountLabel: formatMoney(amount),
    hint: null,
    detailLines: [],
  };
}

function buildElectricityRow(
  item: BillItemRow | null,
  meta: Record<string, unknown>,
): DisplayRow {
  const usage = Number(meta.usage ?? 0);
  const oldReading = meta.old_reading ?? meta.old ?? null;
  const newReading = meta.new_reading ?? meta.new ?? null;
  const unitPrice = Number(meta.unit_price ?? item?.unit_price ?? 0);

  return {
    key: 'electricity',
    name: 'Điện',
    quantityLabel: `${usage}/số`,
    unitPriceLabel: formatMoney(unitPrice),
    amountLabel: formatMoney(amountOf(item)),
    hint: null,
    detailLines: [
      oldReading !== null ? `Số cũ: ${oldReading}` : null,
      newReading !== null ? `Số mới: ${newReading}` : null,
    ].filter((line): line is string => line !== null),
  };
}

function buildElectricitySummary(item: BillItemRow | null, meta: Record<string, unknown>) {
  const oldReading = meta.old_reading ?? meta.old ?? null;
  const newReading = meta.new_reading ?? meta.new ?? null;

  if (oldReading === null && newReading === null) return null;

  const usage = Number(meta.usage ?? 0);
  const unit = String(meta.unit ?? 'số').trim() || 'số';
  const unitPrice = Number(meta.unit_price ?? item?.unit_price ?? 0);

  return {
    oldLabel: formatMeterReading(oldReading),
    newLabel: formatMeterReading(newReading),
    usageLabel: `${usage} ${unit}`,
    unitPriceLabel: formatMoney(unitPrice),
    amountLabel: formatMoney(amountOf(item)),
  };
}

function buildServiceRow(
  label: string,
  item: BillItemRow | null,
  quantityLabel: string,
): DisplayRow {
  const amount = amountOf(item);
  return {
    key: slug(label),
    name: label,
    quantityLabel,
    unitPriceLabel: formatMoney(amount),
    amountLabel: formatMoney(amount),
    hint: null,
    detailLines: [],
  };
}

function buildZeroRow(label: string, quantityLabel: string): DisplayRow {
  return {
    key: slug(label),
    name: label,
    quantityLabel,
    unitPriceLabel: '0',
    amountLabel: '0',
    hint: null,
    detailLines: [],
  };
}

function buildAdjustmentRow(
  netAmount: number,
  surchargeAmount: number,
  discountAmount: number,
): DisplayRow {
  return {
    key: 'adjustment',
    name: 'Phát sinh',
    quantityLabel: '1',
    unitPriceLabel: formatMoney(netAmount),
    amountLabel: formatMoney(netAmount),
    hint: null,
    detailLines: [
      surchargeAmount !== 0 ? `Phụ thu: ${formatMoney(surchargeAmount)}` : null,
      discountAmount !== 0 ? `Giảm trừ: -${formatMoney(discountAmount)}` : null,
    ].filter((line): line is string => line !== null),
  };
}

function buildPaymentQr(bill: BillForDisplay, pendingQr: PendingPaymentQr) {
  if (bill.outstanding_amount <= 0 || !pendingQr) return null;

  const imageSrc = pendingQr.qr_image_url || pendingQr.qr_data_url;
  if (typeof imageSrc !== 'string' || imageSrc.trim() === '') return null;

  return {
    imageSrc,
    amountLabel: formatMoney(pendingQr.amount),
    transferContent: pendingQr.transfer_content ?? '---',
    accountName: pendingQr.account_name ?? '---',
    accountNo: pendingQr.account_no ?? '---',
    bankName: pendingQr.bank_name ?? '---',
  };
}

function buildZaloMessage(input: {
  tenantName: string;
  roomCode: string;
  periodLabel: string;
  readingFromLabel: string;
  readingToLabel: string;
  previousBillLabel: string;
  previousBillAmountLabel: string;
  items: DisplayRow[];
  totalAmountLabel: string;
  notes: string[];
  footerNote: string;
}): string {
  const lines: string[] = [
    `Hoá đơn phòng ${input.tenantName} ${input.roomCode} - tháng ${input.periodLabel}`,
    '',
    `Kỳ chốt: ${input.readingFromLabel} → ${input.readingToLabel}`,
    `${input.previousBillLabel}: ${input.previousBillAmountLabel}`,
    '',
  ];

  for (const item of input.items) {
    if (item.name === 'Điện') {
      lines.push(`${item.name}: ${item.quantityLabel} x ${item.unitPriceLabel} = ${item.amountLabel}`);
      if (item.detailLines.length > 0) lines.push('  ' + item.detailLines.join(' · '));
      continue;
    }
    lines.push(`${item.name}: ${item.amountLabel}`);
  }

  lines.push('', `Tổng cộng: ${input.totalAmountLabel}`);

  if (input.notes.length > 0) {
    lines.push('', 'Ghi chú:');
    for (const note of input.notes) lines.push('- ' + note);
  }

  lines.push('', input.footerNote);

  return lines.join('\n');
}

function findItem(bill: BillForDisplay, type: BillItemType): BillItemRow | null {
  return bill.items.find((item) => item.type === type) ?? null;
}

function metaOf(item: BillItemRow | null): Record<string, unknown> {
  return item?.meta && typeof item.meta === 'object' ? item.meta : {};
}

function amountOf(item: BillItemRow | null): number {
  return Math.trunc(Number(item?.amount ?? 0)) || 0;
}

function formatDate(date: CivilDate | null): string {
  return date === null ? 'Chưa có' : formatDMY(date);
}

function formatMeterReading(reading: unknown): string {
  if (reading === null || reading === undefined) return 'Chưa có';
  return String(Math.trunc(Number(reading)) || 0);
}

/** Tương đương `Str::slug()` cho tiếng Việt — dùng đặt tên file PDF. */
export function slug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
