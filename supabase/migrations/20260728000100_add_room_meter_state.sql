-- Nguồn schema chính của rental-next: Supabase Postgres.
-- Migration này an toàn khi chạy trên DB đang có dữ liệu.

alter table public.rooms
  add column if not exists current_electricity_reading integer,
  add column if not exists electricity_reading_updated_at timestamptz;

-- Chỉ backfill từ bill đã chốt. Bill nháp/đang điều chỉnh không được làm
-- thay đổi số điện chính thức của phòng.
update public.rooms as r
set
  current_electricity_reading = latest.electricity_new,
  electricity_reading_updated_at = now()
from (
  select distinct on (b.room_id)
    b.room_id,
    nullif(coalesce(bi.meta ->> 'new_reading', bi.meta ->> 'new'), '')::integer as electricity_new
  from public.bills as b
  join public.bill_items as bi
    on bi.bill_id = b.id
   and bi.type = 'electricity'
  where b.status in ('sent', 'partial', 'paid', 'overdue')
    and nullif(coalesce(bi.meta ->> 'new_reading', bi.meta ->> 'new'), '') is not null
  order by b.room_id, b.period_to desc, b.id desc
) as latest
where r.id = latest.room_id
  and latest.electricity_new is not null;
