# Sổ thu chi cửa hàng (iPhone, offline)

Ứng dụng ghi sổ nội bộ cho cửa hàng mỳ trộn/cơm trộn. Không có chức năng bán hàng cho khách, đặt món hay thanh toán.

## Tính năng
- Ghi doanh thu theo mức giá và số suất; có thể tạo nhiều bản ghi trong một ngày.
- Ghi nhập nguyên liệu theo số lượng, đơn vị, đơn giá; tự tính thành tiền.
- Ghi các khoản chi khác.
- Sửa/xóa từng giao dịch.
- Báo cáo theo tháng: doanh thu, tiền chi thực tế, dòng tiền ròng và lãi ước tính.
- Cài giá vốn nguyên liệu trung bình cho một suất.
- Sao lưu/phục hồi JSON; xuất CSV để mở bằng Excel/Numbers.
- IndexedDB lưu dữ liệu trong trình duyệt; Service Worker cache giao diện để dùng offline sau lần mở trực tuyến thành công.

## Công thức
- Doanh thu = tổng (số suất ở từng mức giá × mức giá).
- Tiền thực chi = tổng nhập nguyên liệu + tổng khoản chi khác.
- Dòng tiền ròng = doanh thu − tiền thực chi.
- Lãi ước tính = doanh thu − (tổng suất × giá vốn nguyên liệu/suất) − chi phí khác.

**Chú ý kế toán:** khoản mua nguyên liệu dùng cho nhiều ngày được tính đầy đủ vào dòng tiền ngày mua. Báo cáo lãi ước tính dùng giá vốn/suất do người dùng đặt, không trừ toàn bộ tiền nhập hàng lần nữa. Chi phí khác được trừ khỏi cả dòng tiền và lãi ước tính. Đây là công cụ theo dõi đơn giản, không thay thế phần mềm kế toán.

## Chạy thử trên máy tính
Service Worker và cài đặt PWA cần chạy qua HTTP/HTTPS, không mở `index.html` trực tiếp bằng `file://`.

Nếu đã cài Python:
```bash
python -m http.server 8000
```
Mở `http://localhost:8000`. Trình duyệt cho phép Service Worker ở localhost.

## Triển khai miễn phí bằng GitHub Pages
1. Tạo repository GitHub mới.
2. Tải tất cả file trong thư mục này lên thư mục gốc repository.
3. Mở **Settings → Pages**.
4. Chọn **Deploy from a branch**, nhánh `main`, thư mục `/(root)`, nhấn Save.
5. Mở URL GitHub Pages do GitHub cấp bằng Safari trên iPhone, ví dụ `https://ten-tai-khoan.github.io/ten-repository/`.
6. Đợi tải trang thành công khi đang có Internet.
7. Trong Safari, nhấn **Chia sẻ → Thêm vào MH chính → Thêm**.
8. Mở ứng dụng từ biểu tượng mới. Sau lần tải thành công, thử bật chế độ máy bay và mở lại.

## Dữ liệu và sao lưu
- Dữ liệu nằm trong IndexedDB của trình duyệt trên thiết bị; không tự đồng bộ giữa iPhone và máy tính.
- Sao lưu định kỳ: tab **Dữ liệu → Sao lưu**. Lưu tệp JSON vào ứng dụng Tệp/iCloud Drive hoặc nơi an toàn.
- Phục hồi sẽ thay thế toàn bộ dữ liệu đang có.
- Xóa dữ liệu website, dữ liệu Safari hoặc sự cố thiết bị có thể làm mất dữ liệu. Không coi cache offline là bản sao lưu.
- Không có máy chủ, đăng nhập hoặc gửi dữ liệu tài chính lên dịch vụ bên ngoài từ mã nguồn này.

## Cấu trúc
- `index.html` — giao diện.
- `styles.css` — kiểu dáng mobile.
- `app.js` — xử lý giao dịch, báo cáo, IndexedDB và sao lưu.
- `sw.js` — cache offline.
- `manifest.json` — cấu hình PWA.
- `icon.svg` — biểu tượng.

## Lưu ý
Đây là bản nguồn khởi đầu hoàn chỉnh cho ghi chép cá nhân. Hãy nhập dữ liệu thử, sao lưu và kiểm tra khôi phục trước khi sử dụng làm sổ chính thức.
