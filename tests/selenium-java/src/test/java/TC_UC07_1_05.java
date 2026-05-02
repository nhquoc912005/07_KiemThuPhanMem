import org.openqa.selenium.*;
import org.openqa.selenium.chrome.*;
import org.openqa.selenium.support.ui.*;
import org.testng.annotations.*;
import java.time.Duration;
import java.util.List;

public class TC_UC07_1_05 {
    private WebDriver driver;
    private WebDriverWait wait;

    @BeforeMethod
    public void setUp() {
        io.github.bonigarcia.wdm.WebDriverManager.chromedriver().setup();
        ChromeOptions options = new ChromeOptions();
        options.addArguments("--start-maximized");
        driver = new ChromeDriver(options);
        wait = new WebDriverWait(driver, Duration.ofSeconds(15));
    }

    @Test(description = "UC07.1.05 - Không cho phép tài xế chỉnh sửa lộ trình")
    public void testDriverPermissions() {
        // 1. Đăng nhập
        driver.get("http://localhost:3000/login");
        wait.until(ExpectedConditions.visibilityOfElementLocated(By.cssSelector("[placeholder='Nhập tên đăng nhập']"))).sendKeys("taixe1");
        driver.findElement(By.cssSelector("[placeholder='Nhập mật khẩu']")).sendKeys("123456");
        driver.findElement(By.xpath("//button[contains(text(), '\u0110\u0102NG NH\u1eacP')]")).click();

        // 2. Vào xem lộ trình
        wait.until(ExpectedConditions.urlContains("/driver/trips/assigned"));
        wait.until(ExpectedConditions.elementToBeClickable(By.xpath("//button[contains(text(), 'Xem l\u1ed9 tr\u00ecnh')]"))).click();

        // 3. Kiểm tra tính "chỉ đọc": Không được có các nút "Sửa", "Xóa", "Thêm" vốn dành cho điều phối viên
        // Chúng ta tìm các button có các text này
        List<WebElement> forbiddenButtons = driver.findElements(By.xpath("//button[contains(text(), 'S\u1eeda') or contains(text(), 'X\u00f3a') or contains(text(), 'Th\u00eam')]"));
        
        assert forbiddenButtons.isEmpty() : "Phát hiện nút chức năng dành cho quản trị/điều phối hiển thị với tài xế!";

        System.out.println("TC_UC07.1_05: PASSED - Tài xế không có quyền chỉnh sửa lộ trình.");
    }

    @AfterMethod
    public void tearDown() {
        if (driver != null) driver.quit();
    }
}
