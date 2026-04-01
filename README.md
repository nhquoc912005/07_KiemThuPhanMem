# Hệ thống quản lý và điều phối lộ trình xe trung chuyển

Project sinh viên gồm:

- Backend: `Node.js + Express + SQL Server`
- Frontend: `React + TypeScript + Vite`

Project dùng để demo các luồng chính:

- đăng nhập nhân viên điều phối / tài xế
- lập lộ trình trung chuyển từ vé cần xe
- điều chỉnh và theo dõi lộ trình
- cập nhật trạng thái đón / trả khách
- báo cáo tổng hợp theo ngày

## Cấu trúc thư mục

```text
.
├─ database/
│  └─ database.sql
├─ docs/
├─ scripts/
│  ├─ fix/
│  ├─ seed/
│  └─ test/
├─ src/
│  ├─ constants/
│  ├─ middleware/
│  ├─ routes/
│  ├─ utils/
│  ├─ db.js
│  └─ server.js
├─ frontend/
│  ├─ src/
│  │  ├─ api/
│  │  ├─ auth/
│  │  ├─ components/
│  │  ├─ constants/
│  │  └─ pages/
│  ├─ .env
│  └─ package.json
├─ .env
├─ .env.example
├─ package.json
└─ README.md
```

## Yêu cầu môi trường

- Node.js `18+`
- SQL Server chạy local hoặc cùng mạng
- tài khoản SQL Server có quyền tạo database / bảng

## Cấu hình môi trường

### Backend

Tạo file `.env` từ `.env.example`:

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

Tạo file `frontend/.env` từ `frontend/.env.example`:

```env
VITE_API_BASE_URL=http://localhost:5000/api/v1
```

Nếu không cấu hình `VITE_API_BASE_URL`, frontend sẽ mặc định gọi `http://<hostname>:5000/api/v1`.

## Tạo hoặc reset database

1. Mở SQL Server Management Studio hoặc Azure Data Studio.
2. Chạy toàn bộ file `database/database.sql`.

Script này sẽ:

- tạo database `TrungChuyenDB` nếu chưa có
- drop và tạo lại toàn bộ bảng
- thêm constraint/index cơ bản cho demo local
- seed dữ liệu mẫu và tài khoản đăng nhập

## Tài khoản demo

- Điều phối:
  - username: `dieuphoi1`
  - password: `123456`
- Tài xế:
  - username: `taixe1`
  - password: `123456`

Mật khẩu trong script seed đã được hash bcrypt.

## Cài dependency

### Backend

```bash
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
npm start
```

Backend chạy ở `http://localhost:5000`.

Health check:

```bash
http://localhost:5000/health
```

### Frontend

```bash
cd frontend
npm run dev
```

Frontend thường chạy ở `http://localhost:3000` hoặc `http://localhost:5173` tùy Vite.

## Build frontend

```bash
cd frontend
npm run build
```

## Smoke test API

Chạy khi backend đang mở:

```bash
npm run smoke
```

Script smoke sẽ kiểm tra tối thiểu:

- login điều phối
- login tài xế
- báo cáo tổng hợp
- tạo lộ trình
- cleanup bằng cách hủy route test vừa tạo

Có thể đổi endpoint hoặc tài khoản bằng biến môi trường:

```bash
SMOKE_API_BASE_URL=http://localhost:5000/api/v1
SMOKE_DISPATCHER_USERNAME=dieuphoi1
SMOKE_DISPATCHER_PASSWORD=123456
SMOKE_DRIVER_USERNAME=taixe1
SMOKE_DRIVER_PASSWORD=123456
```

## Seed bổ sung

Các script seed bổ sung nằm trong `scripts/seed/` và đã được gắn npm scripts:

```bash
npm run seed:customers
npm run seed:dashboard
npm run seed:driver-demo
```

Lưu ý: các script này thêm dữ liệu demo phục vụ màn hình hoặc luồng test, không phải migration chính thức.

## Auth hiện tại

Auth đang ở mức phù hợp đồ án / demo local:

- login dùng bcrypt để verify password
- backend cấp JWT access token tối thiểu
- API nội bộ có `requireAuth` và `requireRole`
- frontend có `ProtectedRoute`
- forgot/reset password vẫn là luồng demo, OTP không trả về client mà chỉ in ra log backend

## API chính cho demo

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/forgot-password`
- `POST /api/v1/auth/reset-password`
- `GET /api/v1/tickets`
- `GET /api/v1/vehicles`
- `GET /api/v1/drivers`
- `GET /api/v1/customers`
- `GET /api/v1/routes`
- `GET /api/v1/routes/:id`
- `POST /api/v1/routes`
- `PUT /api/v1/routes/:id`
- `PATCH /api/v1/routes/:routeId/stops/:stopId/status`
- `POST /api/v1/routes/:id/incident`
- `GET /api/v1/reports/summary`

## Luồng demo gợi ý

1. Đăng nhập bằng `dieuphoi1 / 123456`
2. Vào `Lập kế hoạch lộ trình` để chọn vé, xe, tài xế
3. Vào `Điều chỉnh lộ trình` hoặc `Theo dõi trạng thái`
4. Xem `Báo cáo`
5. Đăng xuất
6. Đăng nhập bằng `taixe1 / 123456`
7. Vào danh sách chuyến để cập nhật trạng thái đón / trả khách

## Ghi chú

- Repo đã được dọn theo hướng `database/`, `scripts/`, `docs/`.
- `node_modules`, build output, cache và log đã được ignore trong `.gitignore`.
- Nếu muốn reset dữ liệu sạch hoàn toàn, cách nhanh nhất là chạy lại `database/database.sql`.
