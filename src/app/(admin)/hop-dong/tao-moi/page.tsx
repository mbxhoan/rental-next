import { ButtonLink, Card, PageHeader } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { listLeaseRoomOptions, listTenantOptions } from '@/server/queries';
import { NewContractForm } from '../new-contract-form';

export const metadata = { title: 'Tạo hợp đồng — Quản lý nhà trọ' };

export default async function NewLeasePage() {
  await requireRole('admin', 'staff');
  const [tenants, rooms] = await Promise.all([listTenantOptions(), listLeaseRoomOptions()]);

  return (
    <>
      <PageHeader title="Tạo hợp đồng mới" subtitle="Tạo khách mới hoặc chọn khách đã có để thuê phòng." action={<ButtonLink href="/hop-dong" variant="secondary">← Danh sách hợp đồng</ButtonLink>} />
      <NewContractForm tenants={tenants} rooms={rooms} />
      <Card className="mt-4 p-4 text-sm text-slate-600">
        <p className="font-semibold text-slate-800">Sau khi lưu</p>
        <p className="mt-1">Kiểm tra phòng chuyển sang Đã thuê/Đã giữ chỗ, sau đó nhập mốc điện thực tế nếu cần trước khi tạo bill tháng đầu. Tiền cọc ở đây chỉ là số tiền dự kiến của hợp đồng, chưa được ghi nhận là đã thu.</p>
      </Card>
    </>
  );
}
