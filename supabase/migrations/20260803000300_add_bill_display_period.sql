-- Kỳ hiển thị trên hoá đơn tách khỏi kỳ dùng để tính tiền.
-- Ví dụ: bill tháng 7 có thể in kỳ 30/06 -> 31/07 mà không đổi bất kỳ số tiền nào.

alter table public.bills
  add column if not exists display_period_from date,
  add column if not exists display_period_to date;

-- Bill cũ chưa có giá trị riêng thì hiển thị đúng kỳ tính tiền hiện tại.
update public.bills
set
  display_period_from = coalesce(display_period_from, period_from),
  display_period_to = coalesce(display_period_to, period_to)
where display_period_from is null
   or display_period_to is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bills_display_period_order_check'
      and conrelid = 'public.bills'::regclass
  ) then
    alter table public.bills
      add constraint bills_display_period_order_check
      check (
        display_period_from is null
        or display_period_to is null
        or display_period_to >= display_period_from
      );
  end if;
end $$;
