# Danh sách Test Case (Cập nhật - Thêm Tiền Điều Kiện & Độ Ưu Tiên)

**Module:** Quản lý lộ trình trung chuyển  
**Chức năng:** Cập nhật trạng thái trung chuyển của khách hàng & trạng thái chuyến

### 📌 Tiền điều kiện chung (Test Data Setup):
Để tự động hóa các script này, hệ thống/API cần chạy file `seed_taixe.js` để tạo sẵn dữ liệu chuẩn trong Database trước mỗi lần chạy test:
- **Tài khoản test:** Tài xế Nguyễn Văn A (Tên đăng nhập: `taixe1`, Pass: `123456`).
- **Tài khoản điều phối:** Tên đăng nhập: `dieuphoi1`, Pass: `123456`.
- **Dữ liệu chuyến:** Một chuyến xe (ID: `CX00000100`) được phân công cho `taixe1`.
- **Danh sách khách:** Chuyến xe `CX00000100` có khách hàng `Hành Khách VIP 1` (Mã vé tương ứng) đang ở trạng thái `Đang chờ`. (Lưu ý: Nếu test case cần thao tác trên nhiều khách, script seed cần được điều chỉnh để tạo 2 khách hàng cho chuyến `CX00000100`).

---

| TC_ID | Mức độ Ưu tiên | Tiền điều kiện (Riêng) | Mô tả | Bước thực hiện | Kết quả mong đợi |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TC_UC07.3_01** | High | Chuyến xe `CX00000100` đang ở trạng thái "Chưa thực hiện". | Mở form nhập lý do từ chối chuyến. | 1. Đăng nhập hệ thống với tài khoản `taixe1`/`123456`.<br>2. Ở màn hình "Danh sách chuyến được phân công", nhấn vào nút 3 chấm (More) của chuyến `CX00000100`.<br>3. Chọn chức năng "Từ chối chuyến". | Hệ thống hiển thị Popup "Nhập lý do từ chối" với ô nhập liệu có placeholder "Nhập lý do vào đây", cùng 2 nút `Hủy` và `Gửi`. |
| **TC_UC07.3_02** | Medium | Popup "Từ chối chuyến" của chuyến `CX00000100` đang mở. | Hủy thao tác từ chối chuyến. | 1. Tại Popup Từ chối, nhập lý do `"Xe đang bảo dưỡng"`.<br>2. Nhấn nút `Hủy`. | Popup đóng lại, không lưu dữ liệu. Trạng thái chuyến xe giữ nguyên (vẫn nằm trong danh sách phân công). |
| **TC_UC07.3_03** | High | Popup "Từ chối chuyến" của chuyến `CX00000100` đang mở. | Từ chối chuyến thành công. | 1. Mở Popup Từ chối, nhập lý do hợp lệ: `"Xe đang hỏng lốp, không thể chạy"`.<br>2. Nhấn nút `Gửi`.<br>3. Chuyển sang Tab "Danh sách chuyến đã hủy". | - Popup đóng lại, có thông báo thành công.<br>- Chuyến xe `CX00000100` được chuyển sang danh sách đã hủy với trạng thái hiển thị mặc định là "Đã từ chối".<br>- Nút thao tác của chuyến này bị disable. |
| **TC_UC07.3_04** | High | Chuyến xe `CX00000100` ở trạng thái "Chưa thực hiện". | Kiểm tra chặn thao tác khách hàng khi chưa bắt đầu chuyến. | 1. Đăng nhập hệ thống tài xế `taixe1`.<br>2. Chọn xem chi tiết chuyến `CX00000100`.<br>3. Kiểm tra trạng thái các nút và dropdown khách hàng. | Các dropdown trạng thái khách, nút "Báo cáo sự cố" và thao tác cập nhật "Danh sách khách hàng" phải ở trạng thái disabled. |
| **TC_UC07.3_05** | High | Chuyến xe `CX00000100` ở trạng thái "Chưa thực hiện". | Bắt đầu chuyến xe. | 1. Đăng nhập hệ thống `taixe1`.<br>2. Mở chi tiết chuyến `CX00000100`.<br>3. Click nút `Bắt đầu chuyến`. | - Trạng thái chuyến đổi thành "Đang thực hiện".<br>- Nút "Báo cáo sự cố" và các dropdown trạng thái khách hàng được enable. |
| **TC_UC07.3_06** | High | Chuyến xe `CX00000100` ở trạng thái "Đang thực hiện". Khách `Hành Khách VIP 1` đang ở "Đang chờ". | Cập nhật trạng thái đón/trả khách thành công. | 1. Mở chi tiết chuyến `CX00000100`.<br>2. Chọn dropdown trạng thái của khách `Hành Khách VIP 1`.<br>3. Lần lượt chọn: `Đã đến` -> `Đã đón` -> `Đã trả khách`. | - Badge UI trạng thái cập nhật đúng sau mỗi lần chọn.<br>- Khi đổi thành `Đã trả khách`, điểm đón/trả trên bản đồ được đánh dấu hoàn thành/đổi màu. |
| **TC_UC07.3_07** | Medium | Chuyến xe `CX00000100` ở trạng thái "Đang thực hiện". Khách hàng đang ở "Đang chờ". | Cập nhật trạng thái Khách hủy. | 1. Mở chi tiết chuyến `CX00000100`.<br>2. Chọn dropdown trạng thái của khách hàng.<br>3. Chọn trạng thái `Khách hủy`. | UI trạng thái của khách đổi thành "Khách hủy". Hệ thống ẩn/bỏ qua điểm đón tương ứng trên bản đồ lộ trình. |
| **TC_UC07.3_08** | High | Chuyến xe `CX00000100` ở trạng thái "Đang thực hiện". Vẫn còn khách ở trạng thái "Đang chờ" hoặc "Đã đón". | Chặn hoàn thành khi chưa xử lý hết khách. | 1. Mở chi tiết chuyến `CX00000100`.<br>2. Kiểm tra trạng thái nút `Hoàn thành chuyến`. | Nút "Hoàn thành chuyến" bị disabled, hệ thống không cho phép click. |
| **TC_UC07.3_09** | Medium | Chuyến xe `CX00000100` ở trạng thái "Đang thực hiện". | Hủy thao tác báo cáo sự cố. | 1. Mở chi tiết chuyến `CX00000100`.<br>2. Click nút `Báo cáo sự cố`.<br>3. Click nút `Hủy` trên Popup. | Popup báo cáo đóng lại. Trạng thái chuyến giữ nguyên "Đang thực hiện". |
| **TC_UC07.3_10** | High | Chuyến xe `CX00000100` ở trạng thái "Đang thực hiện". | Báo cáo sự cố thành công. | 1. Mở chi tiết chuyến `CX00000100`.<br>2. Click nút `Báo cáo sự cố`.<br>3. Nhập `"Xe bị ngập nước không qua được"` vào textarea.<br>4. Click `Gửi`. | Trạng thái chuyến cập nhật thành "Đang gặp sự cố". Có toast thông báo gửi thành công. |
| **TC_UC07.3_11** | High | Chuyến xe `CX00000100` đang thực hiện. Khách `Hành Khách VIP 1` đã được chuyển sang "Đã trả khách" hoặc "Khách hủy" (tất cả khách đều đã xử lý xong). | Hoàn thành chuyến xe. | 1. Mở chi tiết chuyến `CX00000100`.<br>2. Click nút `Hoàn thành chuyến`. | Hệ thống cập nhật trạng thái chuyến thành "Hoàn thành". |
| **TC_UC07.3_12** | Low | Chuyến xe `CX00000100` đang thực hiện. | Lỗi mạng khi cập nhật trạng thái (Giả lập). | 1. Tắt kết nối internet của máy tính/trình duyệt (Giả lập Offline network).<br>2. Thử đổi trạng thái khách thành "Đã đến". | Trạng thái không được lưu. Hiển thị Toast thông báo: "Cập nhật trạng thái không thành công, vui lòng thử lại". |
