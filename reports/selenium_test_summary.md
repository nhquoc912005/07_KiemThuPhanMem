# Selenium Test Summary

- Thời gian chạy: 22:27:58 24/4/2026
- Frontend framework: React 19 + TypeScript + Vite
- Backend framework: Node.js + Express
- Database: SQL Server
- Frontend URL: http://127.0.0.1:3000
- API Backend URL: http://127.0.0.1:5000/api/v1
- Tổng số test case: 68
- Số PASS: 52
- Số FAIL: 3
- Số BLOCKED: 4
- Số NOT RUN: 9

## Tài khoản test
- Nhân viên điều phối: dispatcher_test / Test@12345
- Tài xế không có chuyến: driver_test / Test@12345
- Tài xế có chuyến/map: driver_assigned_test / Test@12345
- Tài xế route thiếu tọa độ: driver_missing_map_test / Test@12345

## Danh sách lỗi nghiêm trọng
- DRIVER_APP_007 - Màn hình tài xế: Waiting for element to be located By(xpath, //*[contains(normalize-space(.), 'Đã trả khách')])
Wait timed out after 15179ms | Screenshot: reports\screenshots\DRIVER_APP_007_20260424152715.png | TimeoutError: Waiting for element to be located By(xpath, //*[contains(normalize-space(.), 'Đã trả khách')]) | Wait timed out after 15179ms |     at D:\KiemThuPhanMem\07_KiemThuPhanMem\tests\selenium\node_modules\selenium-webdriver\lib\webdriver.js:929:22 |     at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
- MAP_007 - Map và chỉ đường: Waiting for element to be located By(xpath, //*[contains(normalize-space(.), 'Thiếu tọa độ điểm đón hoặc điểm trả')])
Wait timed out after 15214ms | Screenshot: reports\screenshots\MAP_007_20260424152734.png | TimeoutError: Waiting for element to be located By(xpath, //*[contains(normalize-space(.), 'Thiếu tọa độ điểm đón hoặc điểm trả')]) | Wait timed out after 15214ms |     at D:\KiemThuPhanMem\07_KiemThuPhanMem\tests\selenium\node_modules\selenium-webdriver\lib\webdriver.js:929:22 |     at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
- MAP_008 - Map và chỉ đường: Waiting for element to be located By(xpath, //*[contains(normalize-space(.), 'Thiếu tọa độ điểm đón hoặc điểm trả')])
Wait timed out after 15162ms | Screenshot: reports\screenshots\MAP_008_20260424152749.png | TimeoutError: Waiting for element to be located By(xpath, //*[contains(normalize-space(.), 'Thiếu tọa độ điểm đón hoặc điểm trả')]) | Wait timed out after 15162ms |     at D:\KiemThuPhanMem\07_KiemThuPhanMem\tests\selenium\node_modules\selenium-webdriver\lib\webdriver.js:929:22 |     at process.processTicksAndRejections (node:internal/process/task_queues:105:5)

## Danh sách màn hình/chức năng chưa automation được
- CUSTOMER_005 - Quản lý khách hàng: Màn hình CustomersPage hiện không có control tìm kiếm/lọc trên UI dù backend GET /customers có query keyword.
- DRIVER_005 - Quản lý tài xế: Màn hình DispatcherDriversPage hiện không có control tìm kiếm/lọc trên UI.
- VEHICLE_005 - Quản lý xe: Màn hình VehiclesPage hiện không có control tìm kiếm/lọc trên UI.
- TRIP_002 - Quản lý chuyến trung chuyển: Project hiện chưa có màn hình tạo vé trung chuyển riêng qua UI; phần tạo route từ vé đã được cover ở ASSIGN_001.
- TRIP_003 - Quản lý chuyến trung chuyển: Không có màn hình tạo vé độc lập qua UI để thao tác thiếu khách hàng.
- TRIP_004 - Quản lý chuyến trung chuyển: Không có màn hình tạo vé độc lập qua UI; validation địa chỉ khách hàng đã được cover ở CUSTOMER_003.
- ASSIGN_002 - Phân công tài xế: Đã được cover chung trong ASSIGN_001 cùng lúc với chọn tài xế.
- ASSIGN_003 - Phân công tài xế: UI hiện không có selector/test-id ổn định để nhắm riêng tài xế bận trong wizard khi danh sách thay đổi; cần bổ sung data-testid.
- ASSIGN_004 - Phân công tài xế: UI hiện không có selector/test-id ổn định để nhắm riêng xe bận trong wizard khi danh sách thay đổi; cần bổ sung data-testid.
- ASSIGN_005 - Phân công tài xế: Màn hình AdjustRoutePage có luồng điều chỉnh nhưng thiếu selector ổn định cho combobox đổi tài xế; chưa automation an toàn bằng Selenium.
- ASSIGN_006 - Phân công tài xế: UI hiện biểu diễn hủy ở mức trạng thái route, chưa có action riêng "hủy phân công".
- DRIVER_APP_006 - Màn hình tài xế: UI hiện không có option cập nhật riêng "Đang đến điểm trả"; RouteMap chỉ suy diễn stage sau khi khách đã được đón.
- DRIVER_APP_008 - Màn hình tài xế: Cần data-testid hoặc route riêng để kiểm tra luồng trạng thái âm tính ổn định.

## Đề xuất thứ tự ưu tiên sửa lỗi
- Ưu tiên 2: Sửa luồng điều phối, chuyến tài xế và map vì ảnh hưởng trực tiếp vận hành trung chuyển.
- Ưu tiên 3: Sửa CRUD dữ liệu nền khách hàng/tài xế/xe để ổn định dữ liệu cho điều phối.
