-- Bill là chứng từ lịch sử: không bao giờ xoá vật lý.
-- App chuyển bill nháp sang `cancelled` để vẫn có thể lên bill mới cùng kỳ.

create or replace function public.prevent_bill_deletion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = 'Không được xoá bill. Hãy chuyển bill sang trạng thái cancelled để giữ lịch sử.';
end;
$$;

drop trigger if exists prevent_bill_deletion on public.bills;

create trigger prevent_bill_deletion
before delete on public.bills
for each row
execute function public.prevent_bill_deletion();

-- Đồng bộ cache số điện phòng từ bill đã chốt. Cache không được dùng làm
-- nguồn để suy đoán số điện cũ, vì thiếu mốc kỳ chốt có thể làm tính nhầm.
with latest_finalized_reading as (
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
)
update public.rooms as r
set
  current_electricity_reading = latest.electricity_new,
  electricity_reading_updated_at = now()
from latest_finalized_reading as latest
where r.id = latest.room_id;
