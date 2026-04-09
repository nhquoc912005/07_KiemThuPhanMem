# Test Plan (vừa đủ cho đồ án)

## 1. Mục tiêu

- Xác nhận các luồng demo chính chạy đúng (login, lập lộ trình, theo dõi trạng thái, báo cáo).
- Có tài liệu test để trình bày theo môn Kiểm thử phần mềm mà không cần automation nặng.

## 2. Phạm vi

- In-scope: smoke test API, manual test theo luồng UI, kiểm thử phân quyền cơ bản.
- Out-of-scope (để sau): performance/security chuyên sâu, CI/CD, coverage, e2e automation đầy đủ.

## 3. Môi trường

- Node.js 18+
- SQL Server local/cùng mạng
- Backend chạy ở `APP_PORT` (mặc định 5000)
- Frontend chạy Vite (mặc định 5173)

## 4. Tiêu chí pass/fail

- Pass: tất cả test case quan trọng (P0) chạy đúng, không lỗi block demo.
- Fail: không login được, không gọi được API cốt lõi, hoặc lỗi phân quyền nghiêm trọng.

## 5. Deliverables

- `docs/test-cases.md` (manual test cases)
- `scripts/smoke/smoke.js` (smoke API)

