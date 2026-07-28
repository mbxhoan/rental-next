import { endOfMonth, formatMonthLabel, startOfMonth, today } from '@/domain/date';
import { formatMoney } from '@/domain/money';
import { rentalConfig } from '@/domain/config';
import { ButtonLink, Card, EmptyState, Grid, PageHeader, StatCard } from '@/components/ui';
import { getDashboardSummary, hasBuildings } from '@/server/queries';

export const metadata = { title: 'Tổng quan — Quản lý nhà trọ' };

export default async function DashboardPage() {
  const ready = await hasBuildings();

  if (!ready) {
    return (
      <>
        <PageHeader title="Tổng quan" />
        <Card>
          <EmptyState
            title="Chưa có nhà nào trong hệ thống"
            description="Tạo nhà và tầng trước, rồi thêm phòng để bắt đầu lên bill."
            action={<ButtonLink href="/so-do-phong">Đi tới sơ đồ phòng</ButtonLink>}
          />
        </Card>
      </>
    );
  }

  const now = today(rentalConfig.timezone);
  const summary = await getDashboardSummary(startOfMonth(now), endOfMonth(now));

  const vacant = summary.rooms_total - summary.rooms_occupied;

  return (
    <>
      <PageHeader
        title="Tổng quan"
        subtitle={`Số liệu tính tới ngày ${now.slice(8, 10)}/${now.slice(5, 7)}/${now.slice(0, 4)}`}
        action={<ButtonLink href="/bill-thang">Lên bill tháng</ButtonLink>}
      />

      <Grid min="13rem">
        <StatCard
          label="Phòng đang thuê"
          value={`${summary.rooms_occupied}/${summary.rooms_total}`}
          hint={`Còn trống ${vacant} phòng`}
          icon="🏠"
          tone="brand"
        />
        <StatCard
          label="Bill chưa thu xong"
          value={String(summary.unpaid_count)}
          hint="Không tính bill nháp và đã huỷ"
          icon="🧾"
          tone={summary.unpaid_count > 0 ? 'amber' : 'slate'}
        />
        <StatCard
          label="Còn phải thu"
          value={formatMoney(summary.outstanding_total)}
          hint="Tổng công nợ đang treo"
          icon="⏳"
          tone={summary.outstanding_total > 0 ? 'rose' : 'emerald'}
        />
        <StatCard
          label={`Đã thu tháng ${formatMonthLabel(now)}`}
          value={formatMoney(summary.collected_in_month)}
          hint="Chỉ tính phiếu thu đã xác nhận"
          icon="💵"
          tone="emerald"
        />
      </Grid>

      <p className="mt-4 text-xs text-slate-400">{rentalConfig.helperTexts.depositNotRevenue}</p>
    </>
  );
}
