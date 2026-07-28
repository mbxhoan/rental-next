# Rental Next

Ứng dụng quản lý nhà trọ chạy bằng Next.js trên Vercel và kết nối trực tiếp tới
Supabase Postgres. `rental-next` là ứng dụng vận hành duy nhất; không cần
Laravel, PHP hoặc mã nguồn ở repo khác để chạy, build hay deploy.

## Chạy local

```bash
npm install
cp .env.example .env.local
# điền DATABASE_URL và SESSION_SECRET
npm run dev
```

`DATABASE_URL` lấy tại Supabase → Project Settings → Database → Connection
string. Với Vercel nên dùng pooler Singapore; cổng `6543` phù hợp cho serverless.

## Lệnh

```bash
npm run dev
npm run typecheck
npm test
npm run build
```

Migration Supabase nằm trong [`supabase/migrations`](supabase/migrations). Chạy
bằng Supabase CLI hoặc dán SQL vào Supabase SQL Editor trước khi deploy bản code
đang dùng cột mới.

Migration hiện tại thêm số điện chính thức theo phòng và backfill an toàn từ bill
đã chốt. Bill `Chờ chốt` hoặc `Đang điều chỉnh` không làm thay đổi số điện chính
thức của phòng.

## Luồng bill và số điện

- `Chờ chốt`: bill nháp, có thể sửa hoặc xoá; nháp được lưu cả trên Supabase và
  trình duyệt để khôi phục khi reload.
- `Đã chốt`: bill đã gửi/xác nhận; số điện mới được ghi vào phòng và làm số cũ
  cho kỳ sau.
- `Đang điều chỉnh`: bill đã mở lại để sửa, áp dụng cho admin và staff.
- `Đã thanh toán một phần`, `Đã thanh toán`, `Quá hạn`, `Đã huỷ`: trạng thái
  thanh toán tương ứng.

Khi số mới thấp hơn số cũ, người dùng phải chọn `Đồng hồ thay/reset`; khi đó số
cũ của kỳ được coi là `0`. Nếu bill đã thu một phần, tổng mới không được thấp
hơn số đã thu.

VietQR được đồng bộ từ tài khoản ngân hàng mặc định trong Supabase. Khi bill
được chốt hoặc số tiền thay đổi, mã QR được tạo/cập nhật lại.

## Các màn hình

- `/dashboard`: tổng quan phòng và công nợ.
- `/bill-thang`: nhập số điện nhanh bằng bàn phím, tự lưu nháp và chốt bill.
- `/hoa-don`: danh sách, trạng thái và chi tiết bill; sửa kỳ hiển thị, chỉ số,
  VietQR và in PDF.
- `/thanh-toan`: ghi nhận và huỷ phiếu thu.
- `/khach-thue`, `/hop-dong`, `/so-do-phong`, `/bao-cao`: tra cứu và tổng hợp
  dữ liệu từ Supabase.

Các nghiệp vụ ghi dữ liệu mới phải đặt trong `src/server/actions`; công thức
tiền phải đặt trong `src/domain`, không tính trong component giao diện.

## Deploy Vercel

```bash
npm install -g vercel
vercel link
vercel --prod
```

Khai báo `DATABASE_URL`, `DATABASE_POOL_MAX`, `SESSION_SECRET` và các biến
`RENTAL_*` trong Vercel Project Settings → Environment Variables. Giữ region
`sin1` trong `vercel.json` để giảm độ trễ tới Supabase Singapore.

## An toàn dữ liệu

Trước khi chạy migration trên production, tạo backup Supabase. Không xoá bảng
hoặc reset database; migration số điện chỉ thêm cột và cập nhật số điện phòng
từ các bill đã chốt.
