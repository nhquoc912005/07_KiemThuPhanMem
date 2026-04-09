# Architecture (Tổng quan)

## Thành phần

- `backend/`: REST API (Node.js + Express) kết nối SQL Server.
- `frontend/`: UI (React + TypeScript + Vite) gọi API.
- `database/`: script SQL để tạo/reset dữ liệu demo.
- `scripts/`: seed/smoke test phục vụ demo.

## Luồng chính (high-level)

1. Người dùng đăng nhập từ frontend.
2. Frontend gọi `POST /api/v1/auth/login` để lấy JWT.
3. Frontend gọi các API nghiệp vụ kèm `Authorization: Bearer <token>`.
4. Backend kiểm tra `requireAuth` + `requireRole` (nếu cần), sau đó query SQL Server và trả JSON.

## Mục tiêu cấu trúc thư mục

- Tách rõ **transport layer** (routes/controller) và các phần có thể test độc lập (service/validator/utils).
- Chừa sẵn `backend/tests/` và `docs/test-*` để bổ sung kiểm thử dần theo tiến độ đồ án.

