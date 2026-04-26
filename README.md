# Hệ thống quản lý và điều phối lộ trình xe trung chuyển

Project demo gồm:

- Backend: `Node.js + Express + SQL Server`
- Frontend: `React + TypeScript + Vite`

Các luồng chính đang có:

- đăng nhập điều phối / tài xế
- đăng ký tài khoản điều phối / tài xế
- lập kế hoạch điều phối từ vé cần trung chuyển
- điều chỉnh, theo dõi và xử lý sự cố lộ trình
- tài xế cập nhật trạng thái đón / trả khách
- xem báo cáo tổng hợp
- xem hồ sơ người dùng từ database qua `GET /auth/me`

## Cấu trúc thư mục

```text
.
├─ backend/
│  ├─ src/
│  │  ├─ constants/
│  │  ├─ middleware/
│  │  ├─ routes/
│  │  ├─ services/
│  │  ├─ utils/
│  │  ├─ app.js
│  │  ├─ db.js
│  │  └─ server.js
│  ├─ tests/
│  ├─ .env.example
│  └─ package.json
├─ database/
│  └─ database.sql
├─ docs/
├─ scripts/
│  ├─ seed/
│  └─ smoke/
├─ frontend/
│  ├─ src/
│  │  ├─ auth/
│  │  ├─ components/
│  │  ├─ constants/
│  │  ├─ pages/
│  │  ├─ services/
│  │  │  └─ api/
│  │  └─ ...
│  ├─ tests/
│  ├─ .env.example
│  └─ package.json
└─ README.md
```

## Yêu cầu môi trường

- Node.js `18+`
- SQL Server local hoặc cùng mạng
- tài khoản SQL Server có quyền tạo database / bảng

## Cấu hình môi trường

### Backend

Tạo `backend/.env` từ `backend/.env.example`:

```env
APP_PORT=5000
SQL_SERVER=localhost
SQL_PORT=1433
SQL_DATABASE=TrungChuyenDB
SQL_USER=sa
SQL_PASSWORD=your_sql_password
SQL_ENCRYPT=false
SQL_TRUST_SERVER_CERTIFICATE=true
JWT_SECRET=change-me-for-your-machine
JWT_EXPIRES_IN=12h
```

### Frontend

Tạo `frontend/.env` từ `frontend/.env.example`:

```env
VITE_API_BASE_URL=http://localhost:5000/api/v1
```

Nếu không cấu hình `VITE_API_BASE_URL`, frontend mặc định gọi:

```text
http://<hostname>:5000/api/v1
```

Khi mo frontend bang IP noi bo trong mang LAN, khong nen khoa cung `localhost` trong `frontend/.env`.
Neu van de `VITE_API_BASE_URL=http://localhost:5000/api/v1`, thiet bi khac se goi API vao chinh no thay vi may chu.
Frontend hien da tu dong doi host `localhost` thanh host dang mo trang khi truy cap bang IP noi bo.

Frontend hiện dùng stack miễn phí:

- `Leaflet` + `react-leaflet` để render bản đồ
- `OpenStreetMap` tile layer để hiển thị nền bản đồ
- `OSRM` public API để tìm tuyến đường lái xe

Project không cần `Google Maps API key`, không cần bật billing và không phát sinh chi phí cho luồng demo/sinh viên.

Luồng map cho tài xế hiện tại:

- Backend chỉ trả dữ liệu chuyến, điểm đón, điểm trả và tọa độ tương ứng
- Frontend dùng `react-leaflet` để hiển thị marker điểm đón, marker điểm trả và polyline tuyến đường
- Frontend gọi `OSRM` để tính tuyến xe chạy ngắn nhất giữa `pickupLat/pickupLng` và `dropoffLat/dropoffLng`
- Tuyến đường chỉ được gọi lại khi tọa độ điểm đón hoặc điểm trả thay đổi, không lưu cứng polyline trong backend

Map chi tiết chuyến hiện không cần `Google Maps API key`, không cần billing và cũng không phụ thuộc quyền GPS của trình duyệt để vẽ tuyến giữa điểm đón và điểm trả.

Lưu ý thêm: `router.project-osrm.org` là dịch vụ public phù hợp cho demo hoặc tải nhẹ. Nếu triển khai production hoặc có lượng truy cập cao, nên dùng hạ tầng riêng hoặc dịch vụ có SLA.

## Tạo hoặc reset database

1. Mở SQL Server Management Studio hoặc Azure Data Studio.
2. Chạy toàn bộ file `database/database.sql`.

Script này sẽ:

- tạo database `TrungChuyenDB` nếu chưa có
- drop và tạo lại toàn bộ bảng
- tạo dữ liệu demo cho cả lớp legacy và external/dispatch
- seed tài khoản đăng nhập mẫu

## Tài khoản demo

- Điều phối:
  - username: `dieuphoi1`
  - password: `123456`
- Tài xế:
  - username: `taixe1`
  - password: `123456`

Mật khẩu trong seed được hash bằng bcrypt.

## Chuẩn dữ liệu đang dùng

### Biển số xe

Chuẩn thống nhất trên hệ thống là:

```text
51A-12345
```

Backend sẽ normalize một số biến thể nhập tay về chuẩn này trước khi validate/lưu.

### Số điện thoại

Số điện thoại khách hàng và tài khoản được lưu thống nhất theo chuẩn:

```text
0xxxxxxxxx
```

Các input kiểu `84xxxxxxxxx` hoặc `+84xxxxxxxxx` sẽ được normalize về chuẩn trên.

### Stop status

Enum trạng thái khách trên lộ trình:

- `Đã đến điểm đón`
- `Đã đón khách`
- `Đã trả khách`
- `Khách hủy`

Điều kiện hoàn thành chuyến:

- tất cả stop phải là `Đã trả khách`
- hoặc `Khách hủy`

## Cài dependency

### Backend

```bash
cd backend
npm install
```

### Frontend

```bash
cd frontend
npm install
```

## Chạy project

Mở 2 terminal.

### Backend

```bash
cd backend
npm start
```

Backend chạy ở `http://localhost:5000`.

Health check:

```text
http://localhost:5000/health
```

### Frontend

```bash
cd frontend
npm run dev
```

Frontend thường chạy ở `http://localhost:3000` hoặc `http://localhost:5173`.

## Build frontend

```bash
cd frontend
npm run build
```

## Smoke test API

Chạy khi backend đang mở:

```bash
cd backend
npm run smoke
```

Script smoke kiểm tra tối thiểu:

- login điều phối
- login tài xế
- lấy báo cáo
- tạo lộ trình
- cleanup route test

Có thể đổi endpoint hoặc tài khoản bằng biến môi trường:

```bash
SMOKE_API_BASE_URL=http://localhost:5000/api/v1
SMOKE_DISPATCHER_USERNAME=dieuphoi1
SMOKE_DISPATCHER_PASSWORD=123456
SMOKE_DRIVER_USERNAME=taixe1
SMOKE_DRIVER_PASSWORD=123456
```

## Seed bổ sung

Các script seed trong `scripts/seed/`:

```bash
cd backend
npm run seed:customers
npm run seed:dashboard
npm run seed:driver-accounts
npm run seed:driver-demo
```

`seed:driver-accounts` sẽ tạo tài khoản cho các bản ghi `TaiXe` chưa có `MaTaiKhoan`, với username theo dạng `taixe2`, `taixe3`... và mật khẩu demo `123456`.

Các script seed/demo hiện đã dùng cùng chuẩn dữ liệu mới:

- biển số xe: `51A-12345`
- stop status: `Đã đến điểm đón`, `Đã đón khách`, `Đã trả khách`, `Khách hủy`

## Kiến trúc dữ liệu hiện tại

Hệ thống đang có 2 lớp dữ liệu:

1. Legacy vận hành:
   - `TaiXe`
   - `XeTrungChuyen`
   - `KhachHang`
   - `VeTrungChuyen`
   - `LoTrinhTrungChuyen`
   - `ChiTietLoTrinh`
2. External / dispatch projection:
   - `external_*`
   - `route_plans*`

Giải pháp vá hiện tại để ít phá hệ thống:

- `LoTrinhTrungChuyen` + `ChiTietLoTrinh` là source of truth vận hành
- `route_plans*` được sync như projection khi:
  - tạo route
  - cập nhật route/status
  - cập nhật stop status
  - báo sự cố

## API chính

### Auth

- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/forgot-password`
- `POST /api/v1/auth/reset-password`

### Dispatcher

- `GET /api/v1/tickets`
- `GET /api/v1/vehicles`
- `GET /api/v1/vehicles/:id`
- `POST /api/v1/vehicles`
- `PUT /api/v1/vehicles/:id`
- `DELETE /api/v1/vehicles/:id`
- `GET /api/v1/drivers`
- `GET /api/v1/drivers/:id`
- `POST /api/v1/drivers`
- `PUT /api/v1/drivers/:id`
- `DELETE /api/v1/drivers/:id`
- `GET /api/v1/customers`
- `GET /api/v1/customers/:id`
- `POST /api/v1/customers`
- `PUT /api/v1/customers/:id`
- `DELETE /api/v1/customers/:id`
- `GET /api/v1/reports/summary`

### Route operations

- `POST /api/v1/route-plans`
- `GET /api/v1/routes`
- `GET /api/v1/routes/:id`
- `GET /api/v1/routes/by-driver/:driverId`
- `POST /api/v1/routes`
- `PUT /api/v1/routes/:id`
- `PATCH /api/v1/routes/:routeId/stops/:stopId/status`
- `POST /api/v1/routes/:id/incident`

## Luồng demo gợi ý

1. Đăng nhập `dieuphoi1 / 123456`
2. Vào `Lập kế hoạch lộ trình` để phân công xe và tài xế
3. Theo dõi `Điều chỉnh lộ trình` hoặc `Theo dõi trạng thái trung chuyển`
4. Xem `Báo cáo`
5. Đăng xuất
6. Đăng nhập `taixe1 / 123456`
7. Vào danh sách chuyến để cập nhật trạng thái `Đã đến`, `Đã đón`, `Đã trả khách`
8. Mở `Danh sách khách hàng` hoặc `Hồ sơ`

## Ghi chú

- Frontend gọi API qua `frontend/src/services/api/client.ts`
- Frontend tự unwrap response theo format `{ success, message, data, errorCode }`
- `ProfilePage` lấy dữ liệu thật từ `GET /auth/me`, không dùng session local làm nguồn profile chính
- `TrackStatusPage` hiện hiển thị vị trí ước tính theo điểm đón, không phải GPS live từ thiết bị tài xế
