import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { Card, PageHeader } from '@/components/ui';
import { GuideVisual, type GuideVisualKind } from './guide-visual';

export const metadata = { title: 'Hướng dẫn — Quản lý nhà trọ' };

const GUIDES: {
  number: number;
  title: string;
  description: string;
  href: string;
  visual: GuideVisualKind;
  steps: string[];
  note?: string;
}[] = [
  {
    number: 1,
    title: 'Chỉnh mốc điện',
    description: 'Cập nhật số điện làm mốc chuẩn cho các bill từ kỳ đã chọn trở đi.',
    href: '/chi-so-dien',
    visual: 'meter',
    steps: ['Mở Thêm → Chỉnh mốc điện.', 'Chọn tháng và nhà cần chỉnh.', 'Nhập số điện cũ chuẩn cho từng phòng rồi bấm Lưu mốc điện.'],
    note: 'Mốc điện chỉ áp dụng cho bill từ kỳ đó trở đi; bill đã chốt và tiền đã thu không bị đổi.',
  },
  {
    number: 2,
    title: 'Chốt bill theo tháng',
    description: 'Tạo và chốt bill cho từng phòng trong một kỳ chốt.',
    href: '/bill-thang',
    visual: 'close',
    steps: ['Mở Bill tháng và chọn tháng chốt, nhà.', 'Nhập Số điện mới cho từng phòng; kiểm tra tiền tạm tính.', 'Bấm ✓ Chốt bill. Hệ thống sẽ tính lại bill ở máy chủ trước khi lưu.'],
    note: 'Nếu số mới thấp hơn số cũ, hãy kiểm tra lại hoặc đánh dấu đồng hồ thay/reset.',
  },
  {
    number: 3,
    title: 'Thay đổi kỳ chốt trên bill',
    description: 'Đổi khoảng ngày được in trên hoá đơn mà không đổi số tiền.',
    href: '/hoa-don',
    visual: 'period',
    steps: ['Mở Hoá đơn và chọn bill cần sửa.', 'Bấm Sửa kỳ chốt hiển thị.', 'Chọn Từ ngày, Đến ngày rồi bấm Lưu.'],
    note: 'Thao tác này chỉ đổi ngày hiển thị trên bill/hoá đơn; tiền phòng, tiền điện và hạn thanh toán giữ nguyên.',
  },
  {
    number: 4,
    title: 'Thêm chi phí phát sinh trong tháng',
    description: 'Ghi nhận phụ thu, giảm trừ hoặc ghi chú ngay lúc lên bill.',
    href: '/bill-thang',
    visual: 'extra',
    steps: ['Trong dòng phòng ở Bill tháng, bấm Thêm phụ thu / giảm trừ / ghi chú.', 'Nhập Phụ thu hoặc Giảm trừ; nếu có điều chỉnh, nhập Lý do điều chỉnh.', 'Kiểm tra tổng bill rồi bấm Chốt bill.'],
    note: 'Phụ thu cộng vào bill, giảm trừ trừ khỏi bill. Nên ghi lý do để dễ đối soát về sau.',
  },
  {
    number: 5,
    title: 'Xem tài khoản thanh toán',
    description: 'Kiểm tra tài khoản nhận tiền và tài khoản đang dùng cho VietQR.',
    href: '/cai-dat',
    visual: 'account',
    steps: ['Mở Thêm → Tài khoản thanh toán.', 'Xem ngân hàng, số tài khoản, tên chủ tài khoản.', 'Tài khoản có nhãn Mặc định là tài khoản được dùng cho VietQR mới.'],
    note: 'Chỉ tài khoản quản trị viên mới được thêm, sửa, xoá hoặc đặt mặc định.',
  },
  {
    number: 6,
    title: 'Đánh dấu bill đã thanh toán',
    description: 'Chốt bill và ghi nhận tiền thu ngay trong luồng của chính bill đó.',
    href: '/hoa-don',
    visual: 'payment',
    steps: ['Mở Hoá đơn → chọn bill đã chốt.', 'Trên máy tính, dùng cột bên phải; trên điện thoại bấm Ghi nhận thanh toán cạnh In / lưu PDF.', 'Nhập số tiền, ngày thu, hình thức rồi bấm Ghi nhận thanh toán. Kiểm tra Lịch sử thanh toán và trạng thái bill.'],
    note: 'Nếu khách trả nhiều lần, ghi nhận từng lần. Có thể huỷ phiếu thu sai ngay trong Lịch sử thanh toán; hệ thống tự tính lại số còn phải thu.',
  },
  {
    number: 7,
    title: 'Khách mới vào thuê phòng',
    description: 'Quy trình chuẩn để tạo hồ sơ khách và hợp đồng, tránh thiếu dữ liệu cho bill sau này.',
    href: '/khach-thue',
    visual: 'tenant',
    steps: [
      'Thu thập thông tin khách: họ tên, số điện thoại, CCCD và ghi chú liên hệ nếu cần.',
      'Chọn phòng, nhập ngày bắt đầu thuê, ngày dự kiến kết thúc và số người ở.',
      'Nhập giá phòng/tháng, tiền cọc, ngày hạn thanh toán; kiểm tra phí nước, phí dịch vụ và đơn giá điện.',
      'Lưu hợp đồng rồi kiểm tra phòng chuyển sang Đã thuê trước khi lên bill tháng đầu.',
    ],
    note: 'Tiền cọc là khoản giữ hộ, không phải doanh thu. Nên chốt mốc điện đầu kỳ trước khi tạo bill đầu tiên. Bản Next.js hiện chưa có form tạo mới; không nhập trực tiếp vào database.',
  },
  {
    number: 8,
    title: 'Khách huỷ hợp đồng hoặc đã rời đi',
    description: 'Phân biệt huỷ trước khi vào ở và kết thúc sau khi khách đã rời phòng.',
    href: '/hop-dong',
    visual: 'lease',
    steps: [
      'Nếu khách chưa vào ở hoặc hợp đồng tạo nhầm: dùng trạng thái Huỷ hợp đồng; không xoá hồ sơ để giữ lịch sử.',
      'Nếu khách đã rời đi: chốt số điện cuối, tạo bill cuối đến ngày rời đi, ghi nhận tiền còn thiếu và xử lý tiền cọc.',
      'Sau khi đối soát xong, ghi ngày rời đi thực tế và chuyển hợp đồng sang Đã kết thúc; phòng mới trở về Trống.',
      'Không huỷ một hợp đồng đang có bill hoặc đã thu tiền chỉ để làm mất lịch sử; nếu cần sửa, phải điều chỉnh từng chứng từ đúng quy trình.',
    ],
    note: 'Huỷ = chưa phát sinh việc thuê; Kết thúc = đã thuê và đã trả phòng. Khi quyết toán cọc: hoàn cọc nếu không phát sinh, hoặc khấu trừ đúng các khoản nợ/hư hỏng có ghi chú.',
  },
];

export default async function UserGuidePage() {
  const session = await requireUser();

  return (
    <>
      <PageHeader title="Hướng dẫn" subtitle={`${session.name} · thao tác nhanh trong quản lý nhà trọ`} />

      <Card className="mb-5 border-brand-200 bg-brand-50/70 p-4">
        <p className="font-semibold text-brand-700">Quy trình gợi ý mỗi tháng</p>
        <p className="mt-1 text-sm leading-6 text-slate-600">Chỉnh mốc điện → lên bill tháng → kiểm tra phụ thu/ghi chú → chốt bill → ghi nhận thanh toán khi khách trả tiền.</p>
      </Card>

      <Card className="mb-5 border-amber-200 bg-amber-50 p-4">
        <p className="font-semibold text-amber-900">Lưu ý về khách thuê và hợp đồng</p>
        <p className="mt-1 text-sm leading-6 text-amber-800">Hiện bản Next.js mới xem được danh sách Khách thuê/Hợp đồng và sửa giá phòng. Chưa có form tạo hợp đồng mới hoặc thao tác Huỷ/Kết thúc hợp đồng trên giao diện. Không nên xoá hoặc sửa trực tiếp dữ liệu vì có thể làm sai bill, tiền cọc và lịch sử thanh toán.</p>
      </Card>

      <div className="space-y-4">
        {GUIDES.map((guide) => (
          <Card key={guide.number} className="overflow-hidden p-4 sm:p-5">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,0.9fr)] lg:items-start">
              <div>
                <div className="flex items-start gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-700 text-sm font-bold text-white">{guide.number}</span>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">{guide.title}</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{guide.description}</p>
                  </div>
                </div>
                <ol className="mt-4 space-y-2 pl-11 text-sm text-slate-700">
                  {guide.steps.map((step) => <li key={step} className="list-decimal pl-1 leading-6">{step}</li>)}
                </ol>
                {guide.note ? <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">Lưu ý: {guide.note}</p> : null}
                <Link href={guide.href} className="mt-4 inline-flex text-sm font-semibold text-brand-600 hover:underline">Mở chức năng →</Link>
              </div>
              <GuideVisual kind={guide.visual} />
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
