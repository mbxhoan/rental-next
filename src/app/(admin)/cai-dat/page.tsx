import { requireRole } from '@/lib/auth';
import { Card, EmptyState, PageHeader } from '@/components/ui';
import { listBankAccounts } from '@/server/queries';
import { BankAccountsForm } from './bank-accounts-form';

export const metadata = { title: 'Tài khoản thanh toán — Quản lý nhà trọ' };

export default async function BankAccountsPage() {
  await requireRole('admin');
  const accounts = await listBankAccounts();

  return (
    <>
      <PageHeader
        title="Tài khoản thanh toán"
        subtitle="Đổi tài khoản nhận tiền và cập nhật VietQR cho bill đang chờ thanh toán."
      />
      {accounts.length === 0 ? (
        <Card className="mb-4">
          <EmptyState
            title="Chưa có tài khoản nhận tiền"
            description="Thêm tài khoản đầu tiên để tạo VietQR cho khách thuê."
          />
        </Card>
      ) : null}
      <BankAccountsForm accounts={accounts} />
    </>
  );
}
