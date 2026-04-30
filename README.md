# Hệ thống quản lý và điều phối lộ trình xe trung chuyển

Project này là ứng dụng demo quản lý xe trung chuyển. Hệ thống có backend API để quản lý dữ liệu, xác thực người dùng và nghiệp vụ điều phối; frontend web để điều phối viên và tài xế đăng nhập, lập lộ trình, theo dõi trạng thái chuyến và xem báo cáo.

## Công nghệ sử dụng

Backend:

- Node.js
- Express
- Supabase PostgreSQL, kết nối qua thư viện `pg`
- JWT xác thực qua `jsonwebtoken`
- Hash mật khẩu bằng `bcryptjs`
- `dotenv` để đọc biến môi trường

Frontend:

- React
- TypeScript
- Vite
- React Router
- Axios
- Leaflet và `react-leaflet` để hiển thị bản đồ

Script hỗ trợ:

- Seed dữ liệu trong `scripts/seed/`
- Smoke test API trong `scripts/smoke/smoke.js`
- QA/UI script trong `scripts/qa/`

## Cấu trúc thư mục

```text
.
├── backend/
│   ├── src/
│   │   ├── app.js              # Khởi tạo Express app và khai báo route
│   │   ├── server.js           # Entry chạy API server
│   │   ├── db.js               # Cấu hình kết nối PostgreSQL/Supabase
│   │   ├── routes/             # Các endpoint API
│   │   ├── middleware/         # Middleware xác thực/phân quyền
│   │   ├── services/           # Logic nghiệp vụ dùng lại
│   │   ├── utils/              # Hàm tiện ích
│   │   └── constants/          # Hằng số trạng thái
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── auth/               # Lưu và đọc session/token phía client
│   │   ├── components/         # Layout, route guard, map, search input
│   │   ├── pages/              # Màn hình login, dispatcher, driver
│   │   ├── services/api/       # Axios client gọi backend
│   │   └── utils/              # Tiện ích frontend
│   ├── public/
│   ├── package.json
│   └── .env.example
├── database/
│   ├── database.sql            # Script SQL Server cũ, giữ để tham chiếu
│   ├── supabase-postgres.sql   # Tạo/reset schema demo trên Supabase PostgreSQL
│   └── migrations/             # Script migration bổ sung
├── docs/                       # Tài liệu API, kiến trúc, test plan
├── scripts/
│   ├── seed/                   # Script seed dữ liệu bổ sung
│   ├── smoke/                  # Smoke test API
│   └── qa/                     # Script kiểm thử UI/QA
├── reports/                    # Kết quả chạy test/log được sinh ra
└── README.md
```

## Điều kiện trước khi chạy

- Node.js 18 trở lên. Smoke test dùng `fetch` toàn cục, nên Node.js 18+ là lựa chọn an toàn.
- npm, đi kèm Node.js.
- Một project Supabase có PostgreSQL database.
- Supabase SQL Editor để chạy script `database/supabase-postgres.sql`.
- Không hardcode mật khẩu database trong source; backend đọc chuỗi kết nối từ `DATABASE_URL`.

## Cài dependencies

Mở terminal tại thư mục gốc project, sau đó cài riêng backend và frontend:

```bash
cd backend
npm install
```

```bash
cd frontend
npm install
```

Project không có `package.json` ở thư mục gốc, vì vậy không chạy `npm install` tại root để thay thế cho hai lệnh trên.

## Cấu hình biến môi trường

Không commit file `.env` thật lên Git. Project dùng `.env.example` để mô tả các biến cần có với giá trị mẫu.

### Backend

Tạo file `backend/.env` từ `backend/.env.example`:

```bash
copy backend\.env.example backend\.env
```

Trên macOS/Linux:

```bash
cp backend/.env.example backend/.env
```

Các biến chính:

```env
APP_PORT=5000
DATABASE_URL=postgresql://postgres.vbbfjdfizcgxomdhalmm:YOUR_PASSWORD@aws-1-ap-south-1.pooler.supabase.com:6543/postgres
JWT_SECRET=your_secret_key
JWT_EXPIRES_IN=12h
PASSWORD_CHANGE_TOKEN_EXPIRES_IN=15m
```

Lưu ý:

- Không dùng giá trị mẫu cho `JWT_SECRET` ở môi trường thật.
- Thay `YOUR_PASSWORD` trong `DATABASE_URL` bằng mật khẩu Supabase thật ở môi trường local/deploy, không commit mật khẩu thật.
- `APP_PORT` nên đặt `5000` để khớp với cấu hình frontend mẫu.

### Frontend

Tạo file `frontend/.env` từ `frontend/.env.example`:

```bash
copy frontend\.env.example frontend\.env
```

Trên macOS/Linux:

```bash
cp frontend/.env.example frontend/.env
```

Biến chính:

```env
VITE_API_BASE_URL=http://localhost:5000/api/v1
```

Nếu mở frontend từ thiết bị khác trong cùng mạng LAN, đổi host thành IP máy đang chạy backend, ví dụ:

```env
VITE_API_BASE_URL=http://192.168.1.10:5000/api/v1
```

Frontend cũng có logic tự đổi `localhost` sang host hiện tại khi truy cập bằng IP mạng nội bộ, nhưng cấu hình đúng ngay từ `.env` vẫn dễ kiểm soát hơn.

## Tạo hoặc reset database Supabase

1. Mở Supabase Dashboard.
2. Vào SQL Editor của project.
3. Chạy toàn bộ file `database/supabase-postgres.sql`.

Script này tạo lại các bảng nghiệp vụ và seed dữ liệu demo trực tiếp trong database `postgres` của Supabase. Nếu database đã có dữ liệu quan trọng, đọc kỹ script trước khi chạy vì file có các đoạn `DROP TABLE ... CASCADE`.

Sau khi cấu hình xong, có thể kiểm tra kết nối backend bằng endpoint:

```text
GET http://localhost:5000/health
```

Kết quả thành công có dạng:

```json
{
  "status": "ok",
  "db": "connected"
}
```

## Chạy môi trường development

Mở 2 terminal.

Terminal 1, chạy backend:

```bash
cd backend
npm run dev
```

Nếu không cần auto reload bằng `nodemon`, có thể chạy:

```bash
cd backend
npm start
```

Backend lắng nghe trên port trong `APP_PORT`. Với cấu hình mẫu, API chạy tại:

```text
http://localhost:5000
```

Terminal 2, chạy frontend:

```bash
cd frontend
npm run dev
```

Vite đang được cấu hình port `3000` trong `frontend/vite.config.ts`, nên frontend thường chạy tại:

```text
http://localhost:3000
```

## Build và chạy production

Build frontend:

```bash
cd frontend
npm run build
```

Xem thử bản build frontend bằng Vite preview:

```bash
cd frontend
npm run preview
```

Chạy backend ở chế độ thông thường:

```bash
cd backend
npm start
```

Project hiện chưa có script build riêng cho backend. Khi deploy production, cần tự cấu hình process manager hoặc môi trường chạy Node.js phù hợp, đồng thời dùng `JWT_SECRET` mạnh và `DATABASE_URL` Supabase thật qua biến môi trường.

## API chính

Base URL mặc định:

```text
http://localhost:5000/api/v1
```

Response API chính dùng wrapper dạng:

```json
{
  "success": true,
  "message": "OK",
  "data": {},
  "errorCode": null
}
```

Frontend trong `frontend/src/services/api/client.ts` tự unwrap trường `data`.

### Health check

- `GET /health`

### Auth

- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/forgot-password`
- `POST /api/v1/auth/change-password-first-login`
- `POST /api/v1/auth/reset-password`

Các endpoint nghiệp vụ bên dưới yêu cầu header:

```http
Authorization: Bearer <access_token>
```

### Điều phối viên

Các nhóm này yêu cầu đăng nhập và có quyền điều phối:

- `GET /api/v1/tickets`
- `GET /api/v1/customers`
- `GET /api/v1/customers/:id`
- `POST /api/v1/customers`
- `PUT /api/v1/customers/:id`
- `DELETE /api/v1/customers/:id`
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
- `GET /api/v1/reports/summary`

### Lộ trình

- `POST /api/v1/route-plans`
- `GET /api/v1/routes`
- `GET /api/v1/routes/by-driver/:driverId`
- `GET /api/v1/routes/:id`
- `GET /api/v1/routes/:id/sync-events`
- `POST /api/v1/routes`
- `PUT /api/v1/routes/:id`
- `PATCH /api/v1/routes/:routeId/stops/:stopId/status`
- `POST /api/v1/routes/:id/incident`

## Sử dụng giao diện

Luồng sử dụng cơ bản:

1. Chạy `database/supabase-postgres.sql` trong Supabase SQL Editor.
2. Chạy backend.
3. Chạy frontend.
4. Mở frontend tại `http://localhost:3000`.
5. Đăng nhập bằng tài khoản đã được seed trong database hoặc tài khoản tự tạo qua màn hình đăng ký.
6. Điều phối viên có thể xem khách hàng, xe, tài xế, vé cần trung chuyển, lập kế hoạch và xem báo cáo.
7. Tài xế có thể xem chuyến được phân công và cập nhật trạng thái đón/trả khách.

README này không ghi mật khẩu thật hoặc secret thật. Nếu cần biết tài khoản demo trong môi trường local, hãy kiểm tra dữ liệu seed trong `database/supabase-postgres.sql` hoặc tự tạo tài khoản mới qua chức năng đăng ký.

## Lệnh thường dùng

Backend, chạy trong thư mục `backend/`:

| Lệnh | Mục đích |
| --- | --- |
| `npm install` | Cài dependencies backend |
| `npm run dev` | Chạy backend bằng `nodemon` |
| `npm start` | Chạy backend bằng Node.js |
| `npm run smoke` | Chạy smoke test API khi backend đang mở |
| `npm run seed:customers` | Seed thêm dữ liệu khách hàng |
| `npm run seed:dashboard` | Seed dữ liệu dashboard |
| `npm run seed:driver-accounts` | Seed tài khoản tài xế còn thiếu |
| `npm run seed:driver-demo` | Seed tài xế demo |

Frontend, chạy trong thư mục `frontend/`:

| Lệnh | Mục đích |
| --- | --- |
| `npm install` | Cài dependencies frontend |
| `npm run dev` | Chạy Vite dev server |
| `npm run build` | Typecheck và build frontend |
| `npm run lint` | Chạy ESLint |
| `npm run preview` | Preview bản build |

Smoke test API:

```bash
cd backend
npm run smoke
```

Script smoke đọc các biến môi trường tùy chọn:

```env
SMOKE_API_BASE_URL=http://localhost:5000/api/v1
SMOKE_DISPATCHER_USERNAME=sample_dispatcher
SMOKE_DISPATCHER_PASSWORD=sample_password
SMOKE_DRIVER_USERNAME=sample_driver
SMOKE_DRIVER_PASSWORD=sample_password
```

## Lỗi thường gặp

### Frontend báo lỗi đăng nhập hoặc không gọi được API

Kiểm tra backend đã chạy chưa:

```text
http://localhost:5000/health
```

Nếu backend không chạy ở port `5000`, cập nhật lại `APP_PORT` hoặc `VITE_API_BASE_URL` cho khớp.

### Health check báo `DB connection failed`

Kiểm tra:

- `DATABASE_URL` trong `backend/.env` đã thay `YOUR_PASSWORD` bằng mật khẩu Supabase thật.
- Supabase project đang hoạt động và allow connection qua pooler host/port trong connection string.
- Đã chạy `database/supabase-postgres.sql` trong Supabase SQL Editor.

### Chạy frontend từ thiết bị khác trong LAN nhưng API lỗi

Không dùng `localhost` nếu thiết bị truy cập không phải máy đang chạy backend. Đổi:

```env
VITE_API_BASE_URL=http://localhost:5000/api/v1
```

thành IP máy backend:

```env
VITE_API_BASE_URL=http://192.168.1.10:5000/api/v1
```

### `npm run smoke` thất bại vì không có dữ liệu phù hợp

Smoke test cần dữ liệu vé, xe rảnh và tài xế rảnh. Chạy lại `database/supabase-postgres.sql` trên database demo hoặc tự seed thêm dữ liệu phù hợp.

### Cài dependency lỗi hoặc thiếu module

Xóa thư mục `node_modules` ở đúng phần bị lỗi rồi cài lại:

```bash
cd backend
npm install
```

hoặc:

```bash
cd frontend
npm install
```

Không commit `node_modules` lên Git.
