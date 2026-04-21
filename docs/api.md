# API Notes

Base URL: `http://localhost:<APP_PORT>/api/v1`

Mọi endpoint chính hiện đã thống nhất response wrapper:

```json
{
  "success": true,
  "message": "OK",
  "data": {},
  "errorCode": null
}
```

Frontend trong `frontend/src/services/api/client.ts` sẽ tự unwrap `data`.

## Auth

### `POST /auth/login`

Đăng nhập và nhận access token.

Request:

```json
{
  "username": "dieuphoi1",
  "password": "123456"
}
```

Response `data`:

```json
{
  "accessToken": "jwt-token",
  "expiresIn": "12h",
  "user": {
    "MaTaiKhoan": 1,
    "TenDangNhap": "dieuphoi1",
    "VaiTro": "Điều phối",
    "SoDienThoai": "0901234567",
    "HoTen": "Nhân viên điều phối 1",
    "MaTaiXe": null,
    "MaNhanVien": 1
  }
}
```

### `GET /auth/me`

Lấy hồ sơ hiện tại từ database theo token đăng nhập. Dùng cho `ProfilePage`.

Yêu cầu header:

```http
Authorization: Bearer <access_token>
```

### `POST /auth/logout`

Backend xác nhận logout theo contract chung. Frontend vẫn xóa session/token local sau khi gọi endpoint này.

### `POST /auth/register`

Đăng ký tài khoản.

- `role = "dispatcher"`: tạo `TaiKhoanNguoiDung` + `NhanVienDieuPhoi`
- `role = "driver"`: dùng chung service tạo `TaiKhoanNguoiDung` + `TaiXe` + `external_drivers`

Request driver:

```json
{
  "role": "driver",
  "fullName": "Trần Văn Hùng",
  "username": "taixe2",
  "phoneNumber": "0912345678",
  "password": "Driver@123",
  "cccd": "012345678901",
  "licenseType": "D"
}
```

### `POST /auth/forgot-password`

Sinh OTP demo cho số điện thoại đã đăng ký. OTP hiện chỉ lưu bộ nhớ server và in ra log backend.

### `POST /auth/reset-password`

Đặt lại mật khẩu bằng OTP.

## Dispatcher APIs

Các endpoint dưới đây yêu cầu đăng nhập và role `Điều phối`.

### Tickets

- `GET /tickets`

### Vehicles

- `GET /vehicles`
- `GET /vehicles/:id`
- `POST /vehicles`
- `PUT /vehicles/:id`
- `DELETE /vehicles/:id`

Biển số xe hiện dùng chuẩn thống nhất: `51A-12345`.

### Drivers

- `GET /drivers`
- `GET /drivers/:id`
- `POST /drivers`
- `PUT /drivers/:id`
- `DELETE /drivers/:id`

`POST /drivers` hiện dùng cùng service với đăng ký tài xế để tạo đồng bộ:

- `TaiKhoanNguoiDung`
- `TaiXe`
- `external_drivers`

Response `data` trả về cả hồ sơ tài xế và tài khoản đăng nhập vừa tạo.

### Customers

- `GET /customers`
- `GET /customers/:id`
- `POST /customers`
- `PUT /customers/:id`
- `DELETE /customers/:id`

Số điện thoại khách hàng được normalize về chuẩn `0xxxxxxxxx` trước khi lưu database.

### Reports

- `GET /reports/summary`

Hỗ trợ filter theo `fromDate` và `toDate`.

## Route Planning / Operations

### `POST /route-plans`

Tạo kế hoạch điều phối từ màn hình dispatch plan.

Giải pháp hiện tại:

- `LoTrinhTrungChuyen` và `ChiTietLoTrinh` là source of truth vận hành
- `route_plans*` được đồng bộ như projection để không phá vỡ UI/luồng dispatch đang có

### Routes

- `GET /routes`
- `GET /routes/:id`
- `GET /routes/by-driver/:driverId`
- `POST /routes`
- `PUT /routes/:id`
- `PATCH /routes/:routeId/stops/:stopId/status`
- `POST /routes/:id/incident`

Các cập nhật sau đều sync ngược projection `route_plans*`:

- tạo route
- cập nhật route/status
- cập nhật stop status
- báo sự cố

### Stop Status Enum

Enum stop status đã thống nhất giữa frontend, backend và dữ liệu mới:

- `Đã đến điểm đón`
- `Đã đón khách`
- `Đã trả khách`
- `Khách hủy`

Một chuyến chỉ hoàn thành khi toàn bộ stop là:

- `Đã trả khách`
- hoặc `Khách hủy`
