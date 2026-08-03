'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteBankAccount, saveBankAccount, setDefaultBankAccount } from '@/server/actions/bank-accounts';
import type { BankAccountRow } from '@/server/queries';
import { buttonClass, Card, inputClass, labelClass } from '@/components/ui';

type FormState = {
  id?: number;
  bankName: string;
  bankCode: string;
  acqId: string;
  accountNo: string;
  accountName: string;
  isDefault: boolean;
  note: string;
};

const EMPTY_FORM: FormState = {
  bankName: '', bankCode: '', acqId: '', accountNo: '', accountName: '', isDefault: false, note: '',
};

export function BankAccountsForm({ accounts }: { accounts: BankAccountRow[] }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function edit(account: BankAccountRow) {
    setMessage(null);
    setForm({
      id: account.id,
      bankName: account.bank_name,
      bankCode: account.bank_code ?? '',
      acqId: account.acq_id ?? '',
      accountNo: account.account_no,
      accountName: account.account_name,
      isDefault: account.is_default,
      note: account.note ?? '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function reset() {
    setForm(EMPTY_FORM);
    setMessage(null);
  }

  function submit() {
    setMessage(null);
    startTransition(async () => {
      const result = await saveBankAccount(form);
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) {
        setForm(EMPTY_FORM);
        router.refresh();
      }
    });
  }

  function makeDefault(account: BankAccountRow) {
    if (!confirm(`Đặt ${account.bank_name} · ${account.account_no} làm tài khoản nhận tiền mặc định? QR của bill đang chờ sẽ được cập nhật.`)) return;
    setMessage(null);
    startTransition(async () => {
      const result = await setDefaultBankAccount(account.id);
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) router.refresh();
    });
  }

  function remove(account: BankAccountRow) {
    if (!confirm(`Xoá tài khoản ${account.bank_name} · ${account.account_no}?`)) return;
    setMessage(null);
    startTransition(async () => {
      const result = await deleteBankAccount(account.id);
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) {
        if (form.id === account.id) setForm(EMPTY_FORM);
        router.refresh();
      }
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.2fr)]">
      <Card className="p-4">
        <div>
          <h2 className="font-bold text-slate-800">{form.id ? 'Sửa tài khoản' : 'Thêm tài khoản'}</h2>
          <p className="mt-1 text-sm text-slate-500">Nhập Bank code hoặc Acq ID để tạo VietQR.</p>
        </div>
        <div className="mt-4 space-y-3">
          <Field label="Tên ngân hàng" value={form.bankName} onChange={(value) => update('bankName', value)} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Bank code" value={form.bankCode} onChange={(value) => update('bankCode', value)} />
            <Field label="Acq ID" value={form.acqId} onChange={(value) => update('acqId', value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Số tài khoản" value={form.accountNo} onChange={(value) => update('accountNo', value)} />
            <Field label="Tên chủ tài khoản" value={form.accountName} onChange={(value) => update('accountName', value)} />
          </div>
          <label>
            <span className={labelClass}>Ghi chú</span>
            <textarea value={form.note} onChange={(event) => update('note', event.target.value)} rows={3} className={inputClass} />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.isDefault} onChange={(event) => update('isDefault', event.target.checked)} />
            Đặt làm tài khoản mặc định
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={submit} disabled={pending} className={buttonClass()}>
              {pending ? 'Đang lưu…' : form.id ? 'Cập nhật tài khoản' : 'Thêm tài khoản'}
            </button>
            {form.id ? <button type="button" onClick={reset} disabled={pending} className={buttonClass('secondary')}>Huỷ sửa</button> : null}
          </div>
        </div>
      </Card>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold tracking-wide text-slate-500 uppercase">Danh sách tài khoản</h2>
          <span className="text-xs text-slate-400">{accounts.length} tài khoản</span>
        </div>
        <div className="space-y-3">
          {accounts.map((account) => (
            <Card key={account.id} className="p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900">{account.bank_name}</p>
                    {account.is_default ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">Mặc định</span> : null}
                  </div>
                  <p className="mt-1 text-sm text-slate-700">{account.account_no} · {account.account_name}</p>
                  <p className="mt-1 text-xs text-slate-500">Bank code: {account.bank_code ?? '—'} · Acq ID: {account.acq_id ?? '—'}</p>
                  <p className="mt-1 text-xs text-slate-500">Đã dùng cho {account.payment_requests_count} yêu cầu thanh toán</p>
                  {account.note ? <p className="mt-1 text-sm text-slate-500">{account.note}</p> : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {!account.is_default ? <button type="button" onClick={() => makeDefault(account)} disabled={pending} className={buttonClass('secondary')}>Đặt mặc định</button> : null}
                  <button type="button" onClick={() => edit(account)} disabled={pending} className={buttonClass('secondary')}>Sửa</button>
                  <button type="button" onClick={() => remove(account)} disabled={pending} className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white px-3.5 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40">Xoá</button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {message ? (
        <p role="alert" className={`lg:col-span-2 rounded-lg px-3 py-2 text-sm ${message.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      <span className={labelClass}>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className={inputClass} />
    </label>
  );
}
