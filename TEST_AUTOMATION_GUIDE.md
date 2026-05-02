# Hướng Dẫn Từng Bước: Triển Khai Kiểm Thử Tự Động (Test Automation) Với Java Selenium

Tài liệu này hướng dẫn chi tiết quy trình xây dựng, thực thi và quản lý kiểm thử tự động cho dự án bằng **Java, Selenium, TestNG và Maven**. Tất cả thành viên trong nhóm hãy đọc kỹ để thiết lập môi trường thống nhất.

---

## 1. Phân Tích Yêu Cầu & Viết Test Case

Trước khi viết code, bạn cần xác định rõ **cái gì cần test** qua việc viết Test Case thủ công.

### Cách phân tích một tính năng:
- **Happy Path:** Luồng cơ bản nhất, người dùng nhập đúng tất cả dữ liệu và thành công.
- **Unhappy Path:** Người dùng nhập sai dữ liệu (sai định dạng email, bỏ trống trường bắt buộc).
- **Edge Cases:** Các trường hợp biên (nhập đúng số ký tự tối đa, thao tác khi rớt mạng).

### Chuẩn viết Test Case:
Mỗi Test Case (TC) cần có các trường sau:
1. **TC ID:** Mã định danh (VD: `TC_UC01_001`).
2. **Title:** Mô tả ngắn gọn (VD: *Đăng nhập thành công với tài khoản hợp lệ*).
3. **Pre-conditions (Tiền điều kiện):** Dữ liệu/Trạng thái cần có sẵn trong DB (VD: *Tài khoản taixe1 đã được tạo, đã có chuyến CX00000100*).
4. **Steps (Các bước):** 
   - *B1: Mở trang đăng nhập.*
   - *B2: Nhập username 'taixe1'.* (đối với điều phối thì dùng username là 'dieuphoi1')
   - *B3: Nhập mật khẩu '123456'.*
   - *B4: Click nút Đăng nhập.*
5. **Expected Result (Kết quả mong đợi):** *Chuyển hướng sang trang Dashboard.*
6. **Priority (Độ ưu tiên):** High (Cao), Medium (Trung bình), Low (Thấp).

---

## 2. Tổ Chức Thư Mục (Page Object Model - POM)

**Quy tắc Vàng:** Để dễ bảo trì khi UI thay đổi, dự án áp dụng mô hình Page Object Model (POM).
Toàn bộ source code test nằm trong thư mục `tests/selenium-java`.

```text
/tests/selenium-java
  /src/test/java
     /base              # Chứa file setup/teardown trình duyệt (BaseTest.java)
     /pages             # Chứa class khai báo giao diện, nút bấm (LoginPage.java, TripPage.java)
     /tests             # Chứa kịch bản test thực tế chạy bằng TestNG (TripStatusTest.java)
  pom.xml               # File cấu hình thư viện Maven
  testng.xml            # File cấu hình danh sách test sẽ chạy
```

---

## 3. Cấu Hình Môi Trường Test Local trên IntelliJ IDEA

Tất cả thành viên cần làm theo các bước sau để setup môi trường code:

1. **Cài đặt công cụ:** Đảm bảo máy bạn đã cài **Java 17+** và **IntelliJ IDEA**.
2. **Mở dự án:** Trong IntelliJ, chọn *File > Open* và trỏ tới thư mục `e:\07_KiemThuPhanMem\tests\selenium-java` (chứa file `pom.xml`). chỗ thư mục tùy mọi người đặt ở mô nha, nhưng mà hắn phải là `tests/selenium-java` nha.
3. **Tải thư viện:** Khi IntelliJ hỏi "Load Maven Project", hãy đồng ý. Hoặc nhấn icon chữ **M** có vòng lặp cập nhật ở góc phải. Hệ thống sẽ tự động tải Selenium 4 và TestNG về máy.
4. **Chuẩn bị Dữ Liệu Test (Quan Trọng):**
   > [!WARNING]
   > Automation Test chạy rất nhanh và có thể làm sai lệch dữ liệu của người khác. 
   Trước khi chạy test, **bắt buộc** phải chạy kịch bản tạo dữ liệu ảo bằng Node.js.
   Mở terminal tại thư mục gốc dự án và chạy:
   ```bash
   cd scripts/seed
   node seed_taixe.js
   ```
   Lệnh này sẽ reset và tạo mới dữ liệu tài xế `taixe1` và chuyến xe `CX00000100` để các script test có cái để chạy.

---

## 4. Cách Viết Script Test Automation (Java Selenium)

### Bước 1: Viết Page Object (`pages/LoginPage.java`)
Gom tất cả các locator (`By.id`, `By.xpath`) vào đây.
```java
package pages;

import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;
import java.time.Duration;

public class LoginPage {
    private WebDriver driver;
    private WebDriverWait wait;

    // Locators
    private By inputUsername = By.id("username");
    private By inputPassword = By.id("password");
    private By btnLogin = By.cssSelector("button[type='submit']");

    public LoginPage(WebDriver driver) {
        this.driver = driver;
        this.wait = new WebDriverWait(driver, Duration.ofSeconds(10));
    }

    public void login(String username, String password) {
        // Luôn dùng wait.until để đợi UI xuất hiện thay vì Thread.sleep()
        wait.until(ExpectedConditions.visibilityOfElementLocated(inputUsername)).sendKeys(username);
        driver.findElement(inputPassword).sendKeys(password);
        driver.findElement(btnLogin).click();
    }
}
```

### Bước 2: Viết Test Script (`tests/LoginTest.java`)
Kế thừa `BaseTest` và viết các hàm test với `@Test`.
```java
package tests;

import base.BaseTest;
import org.testng.Assert;
import org.testng.annotations.Test;
import pages.LoginPage;

public class LoginTest extends BaseTest {

    @Test(priority = 1, description = "Đăng nhập thành công với tài xế")
    public void testLoginSuccess() {
        driver.get(BASE_URL + "/login");
        
        LoginPage loginPage = new LoginPage(driver);
        loginPage.login("taixe1", "123456");
        
        // Đoạn code kiểm tra (Assert) kết quả
        String currentUrl = driver.getCurrentUrl();
        Assert.assertTrue(currentUrl.contains("/driver/trips"), "Chuyển trang thất bại!");
    }
}
```

---

## 5. Cách Chạy Test

- Trước khi chạy test thì phải chạy backend và frontend trước nha. Còn không nó sẽ báo lỗi 404 á.
Cụ thể như sau:
	•	Mở Terminal 1 -> Chạy cd backend (npm run dev).
	•	Mở Terminal 2 -> Chạy cd frontend (npm run dev).
	•	Mở Terminal 3 -> Di chuyển vào thư mục backend và chạy lệnh tạo dữ liệu test: npm run seed:driver-demo (Lệnh này tương đương với node ../scripts/seed/seed_taixe.js).
	•	Cuối cùng mới chạy kịch bản Test bằng IntelliJ hoặc Maven.

Bạn có 3 cách để chạy test tùy vào nhu cầu:

### Cách 1: Chạy trực tiếp từ IntelliJ (Khi đang debug)
- Mở file `.java` trong thư mục `tests` (VD: `TripStatusTest.java`).
- Bấm vào icon hình **tam giác màu xanh lá cây** ngay cạnh chữ `@Test` hoặc cạnh tên Class để chạy.

### Cách 2: Chạy theo cụm (Test Suite)
- Chuột phải vào file `testng.xml` -> Chọn **Run '...\testng.xml'**. Cách này cho phép chạy hàng loạt test class cùng lúc theo cấu hình định sẵn.

### Cách 3: Chạy bằng Terminal (Chuẩn bị cho CI/CD)
Mở terminal tại thư mục `tests/selenium-java` và chạy lệnh Maven:
```bash
mvn clean test
```

---

## 6. Đọc Kết Quả & Xử Lý Khi Test Fail

Khi test fail, TestNG sẽ in ra log **Stack Trace** màu đỏ.
- **AssertionError:** Lỗi do kết quả thực tế không khớp với Assert (Code app bị lỗi bug thật sự, hoặc dữ liệu DB chưa đúng).
- **TimeoutException / NoSuchElementException:** Selenium không tìm thấy nút bấm. -> *Nguyên nhân: Dev vừa đổi tên ID/Class ở giao diện, hoặc mạng bị lag nên phần tử chưa kịp xuất hiện.*

> [!TIP]
> **Quy trình xử lý Test Fail:** 
> 1. Đọc dòng chữ xanh báo lỗi ở dòng code số mấy trong file `.java`.
> 2. Mở trình duyệt chạy tay (Manual) lại đúng luồng đó xem chức năng app có bị lỗi thật không.
> 3. Nếu chạy tay bình thường nhưng tool fail -> Cập nhật lại XPath/CSS Locator trong thư mục `pages/`.

---

## 7. Best Practices (Bắt Buộc Tuân Thủ Khi Làm Việc Nhóm)

1. **Tuyệt đối không dùng `Thread.sleep(5000)`:**
   - Việc chờ cứng 5s làm test chạy rất chậm. Hãy dùng **Explicit Wait** (`wait.until(ExpectedConditions...)`) như trong code mẫu.

2. **Dữ Liệu Test Độc Lập (Setup/Teardown):**
   - Các bài test tính năng Sửa/Xóa/Thay đổi trạng thái không được dùng chung dữ liệu. Nên tuân thủ việc chạy script seed dữ liệu trước khi chạy Automation.

3. **Luôn dùng Page Object Model:**
   - Không được phép viết mã `driver.findElement(By.id("..."))` trong thư mục `tests`. Tất cả mã tìm Element phải vứt sang thư mục `pages`.

4. **Độc Lập Test Case:**
   - `@Test` số 2 không được kỳ vọng `@Test` số 1 phải chạy thành công. Mỗi hàm `@Test` phải có khả năng chạy riêng lẽ độc lập. Mọi setup cần thiết hãy nhét vào hàm `@BeforeMethod`.
