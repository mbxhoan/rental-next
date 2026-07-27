# rental-next — bản Next.js của Rental Manager

Bản viết lại bằng Next.js của [`../rental-manager`](../rental-manager) (Laravel + Livewire),
để deploy lên Vercel. **Dùng chung một database Supabase với bản Laravel** — không đổi
schema, không migrate dữ liệu, hai app chạy song song được.

---

## 1. Nguyên tắc quan trọng nhất

> Laravel vẫn là chủ của schema. App này chỉ đọc/ghi, **không có migration**.

Mọi thay đổi cấu trúc bảng làm bên `rental-manager` bằng `php artisan migrate`.
Bên này chỉ chỉnh lại type trong [`src/server/queries.ts`](src/server/queries.ts) cho khớp.

---

## 2. Chạy local

```bash
npm install
cp .env.example .env.local     # rồi điền DATABASE_URL + SESSION_SECRET
npm run dev
```

Đăng nhập bằng đúng tài khoản đang dùng ở bản Laravel — mật khẩu bcrypt `$2y$`
đọc được trực tiếp, không phải đặt lại.

---

## 3. Lệnh

```bash
npm run dev         # chạy dev
npm run build       # build production
npm test            # unit test công thức tiền (node --test, không cần framework)
npm run typecheck   # tsc --noEmit
npm run difftest    # so công thức TS với service PHP gốc trên 2.040 ca sinh tự động
npm run compare -- 2026-07   # so kết quả trên DỮ LIỆU THẬT với Laravel, theo kỳ
```

`difftest` và `compare` cần có PHP + `rental-manager/vendor` (chạy `composer install`
bên Laravel). Thiếu thì script tự bỏ qua.

---

## 4. Cấu trúc

```text
src/
├── domain/          # Công thức tiền — port 1:1 từ app/Domain/Rental/Services
│   ├── date.ts            # Ngày lịch thuần, KHÔNG timezone (xem mục 6)
│   ├── money.ts           # Làm tròn VND, chuẩn hoá số người dùng nhập
│   ├── config.ts          # Bản sao config/rental.php, đọc env RENTAL_*
│   ├── enums.ts           # Bản sao Domain/Rental/Enums + nhãn tiếng Việt
│   ├── prorated-rent.ts   # ProratedRentCalculator
│   ├── electricity.ts     # ElectricityChargeCalculator
│   ├── fee-settings.ts    # FeeSettingResolver
│   ├── billing-cycle.ts   # BillingCycleResolver
│   ├── bill-status.ts     # BillStatusResolver
│   ├── bill-calculator.ts # BillCalculator::preview()
│   └── bill-display.ts    # BillDisplayBuilder
├── lib/             # db (postgres.js), session (JWT cookie), auth (bcrypt)
├── server/
│   ├── queries.ts   # Toàn bộ truy vấn đọc
│   └── actions/     # Ghi dữ liệu — mỗi hàm bọc một transaction
├── components/      # Nav + mảnh UI dùng lại
└── app/             # App Router
```

**Quy ước giữ từ dự án gốc:** không tính tiền trong component. Mọi công thức nằm
trong `src/domain/`, màn hình chỉ hiển thị.

---

## 5. Màn hình đã có

| Đường dẫn | Màn hình | Quyền |
|---|---|---|
| `/dang-nhap` | Đăng nhập | công khai |
| `/dashboard` | Tổng quan (phòng, công nợ, đã thu trong tháng) | mọi role |
| `/so-do-phong` | Sơ đồ phòng theo nhà/tầng | admin, staff |
| `/khach-thue` | Danh sách + tìm khách thuê | mọi role |
| `/hop-dong` | Danh sách hợp đồng, lọc theo trạng thái | admin, staff |
| `/bill-thang` | **Lên bill tháng** — nhập số điện, chốt từng phòng | admin, staff |
| `/hoa-don` | Danh sách hoá đơn | mọi role |
| `/hoa-don/[id]` | Chi tiết bill + sửa kỳ chốt in ra + in PDF + Zalo + QR | mọi role |
| `/thanh-toan` | Ghi nhận thu tiền + lịch sử phiếu thu | admin, staff |
| `/them` | Menu phụ + hướng dẫn cài app + đăng xuất | mọi role |

### Bày theo lưới

Mọi màn danh sách đều là lưới thẻ, không phải bảng: điện thoại 1 cột, màn rộng
tự thêm cột. Số cột do trình duyệt quyết theo bề ngang thật
(`repeat(auto-fit, minmax(...))` trong [`Grid`](src/components/ui.tsx)), không
phải đoán theo breakpoint. Điều hướng trên điện thoại là thanh tab dưới đáy —
ngón cái với tới được; máy tính vẫn là thanh ngang trên đầu.

### Kỳ chốt in trên bill sửa được

Ở màn chi tiết bill có nút **Sửa kỳ chốt in trên bill**. Nó chỉ ghi vào
`display_period_from/to` — hai cột riêng cho phần hiển thị. Kỳ dùng để tính
tiền (`period_from/to`) không đụng tới, nên đổi ngày ở đây **không bao giờ làm
lệch một đồng nào**. Bản Laravel khoá tính năng này khi bill đã thu tiền; bản
này vẫn cho sửa (vì là chữ in, không phải tiền), chỉ khoá khi bill đã huỷ.

### Chưa port (vẫn dùng bên Laravel)

Import Excel, checkout/tất toán cọc, chi phí vận hành, báo cáo tháng, nhật ký,
quản lý tài khoản ngân hàng, tạo/sửa nhà–tầng–phòng, tạo hợp đồng.

Chung DB nên cứ mở bản Laravel làm mấy việc đó, bản Next đọc thấy ngay.

---

## 6. Hai chỗ dễ sai đã xử lý sẵn

**Ngày tháng.** Cột ngày trong DB là `date` (không giờ). Nếu để `Date` của JS
tự parse thì tuỳ timezone máy chủ mà lệch ±1 ngày — lệch 1 ngày là lệch tiền
thuê. Nên [`src/domain/date.ts`](src/domain/date.ts) làm việc trên chuỗi
`'YYYY-MM-DD'` và số học UTC, không đụng tới timezone. Driver cũng được cấu
hình trả cột `date` về dạng chuỗi thay vì `Date`.

**Số tiền.** Cột tiền là `bigint`, driver mặc định trả về **chuỗi**. Đã ép về
`number` trong [`src/lib/db.ts`](src/lib/db.ts) — tiền VND luôn nhỏ hơn
`Number.MAX_SAFE_INTEGER` nên không mất chính xác.

---

## 7. Cài như app trên điện thoại (PWA)

Vào **Thêm → Cài app vào điện thoại**, trang đó tự nhận máy đang dùng và hiện
đúng các bước (Chrome hiện nút bấm thẳng, iPhone thì chỉ đường qua nút Chia sẻ
của Safari — Chrome trên iPhone không cài được, đó là giới hạn của iOS).

Chỉ chạy được trên HTTPS. Tức là **trên Vercel thì cài được, chạy
`npm run dev` ở `localhost` cũng được, còn mở qua IP LAN kiểu
`http://192.168.x.x:3000` thì không.**

Gồm:

- [`src/app/manifest.ts`](src/app/manifest.ts) — tên app, icon, mở thẳng vào `/dashboard`.
- [`public/sw.js`](public/sw.js) — service worker **cố ý không cache gì**. Đây là
  app tiền bạc; một trang bill cũ nằm lại trong cache rồi hiện ra lúc đang đối
  soát thì nguy hiểm hơn nhiều so với việc phải chờ mạng. Nó tồn tại chỉ để
  trình duyệt coi đây là app cài được. Hệ quả: **mất mạng là không dùng được**.
- Icon sinh bằng [`scripts/make-icons.mjs`](scripts/make-icons.mjs) (chạy một
  lần, kết quả commit sẵn). Đổi hình thì sửa script rồi chạy `node scripts/make-icons.mjs`.

---

## 8. Deploy Vercel

```bash
npm i -g vercel
vercel link
vercel --prod
```

Khai báo biến môi trường trong **Project Settings → Environment Variables**
(chép từ `.env.example`, nhớ `DATABASE_URL` và `SESSION_SECRET`).

### Bắt buộc: đặt region Singapore

[`vercel.json`](vercel.json) đã ghim `"regions": ["sin1"]`. **Đừng bỏ dòng này.**
Vercel mặc định chạy function ở `iad1` (Washington DC); DB thì ở Singapore, mỗi
truy vấn phải vòng qua Mỹ ~200ms, một trang bill gọi cả chục truy vấn → app sẽ
chậm hơn hẳn bản Laravel chạy máy nhà. Gói Hobby chỉ được chọn **một** region,
và `sin1` là gần Việt Nam nhất.

### Lưu ý về gói Hobby

Gói Hobby của Vercel [chỉ cho dùng phi thương mại](https://vercel.com/docs/limits/fair-use-guidelines).
App quản lý nhà trọ có thu tiền, về nguyên tắc là thương mại. Bạn đã chọn chấp
nhận rủi ro này — nên giữ sẵn:

- backup DB định kỳ (`pg_dump` từ Supabase),
- bản Laravel vẫn chạy được để quay về khi cần.

Code không dùng API riêng của Vercel, nên chuyển sang Cloudflare Workers
(qua OpenNext) hay Netlify chỉ là đổi adapter.

---

## 9. Đối chiếu số trước khi tin

Trước khi dùng bản Next để chốt bill thật, chạy:

```bash
npm run compare -- 2026-07
```

Script chạy **cùng một kỳ** qua hai đường — truy vấn + công thức của Next.js, và
model + service của Laravel trên đúng dữ liệu thật trong DB — rồi so từng giá
trị: kỳ chốt, ngày chốt, số điện cũ, tiền phòng, số ngày ở, hạn thanh toán,
tiền nước, phí dịch vụ. Lệch một chỗ là in ra ngay và thoát mã lỗi.

Đã chạy qua các kỳ 2026-05 → 2027-02: **khớp tuyệt đối**.
