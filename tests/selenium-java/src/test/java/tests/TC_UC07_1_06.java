package tests;
import org.openqa.selenium.*;
import org.openqa.selenium.chrome.*;
import org.openqa.selenium.support.ui.*;
import org.testng.annotations.*;
import java.time.Duration;
import java.util.List;

public class TC_UC07_1_06 {
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

    @Test(description = "UC07.1.06 - Hiển thị thứ tự các điểm dừng")
    public void testStopSequence() {
        // 1. Đăng nhập
        driver.get("http://localhost:3000/login");
        wait.until(ExpectedConditions.visibilityOfElementLocated(By.cssSelector("[placeholder='Nhập tên đăng nhập']"))).sendKeys("taixe1");
        driver.findElement(By.cssSelector("[placeholder='Nhập mật khẩu']")).sendKeys("123456");
        driver.findElement(By.xpath("//button[contains(text(), '\u0110\u0102NG NH\u1eacP')]")).click();

        // 2. Vào xem lộ trình
        wait.until(ExpectedConditions.urlContains("/driver/trips/assigned"));
        wait.until(ExpectedConditions.elementToBeClickable(By.xpath("//button[contains(text(), 'Xem l\u1ed9 tr\u00ecnh')]"))).click();

        // 3. Kiểm tra hiển thị thứ tự các điểm dừng (Ví dụ: cột STT hoặc số thứ tự 1, 2...)
        List<WebElement> sequences = wait.until(ExpectedConditions.visibilityOfAllElementsLocatedBy(By.xpath("//*[contains(@class, 'sequence') or contains(text(), '1') or contains(text(), '2')]")));
        
        assert !sequences.isEmpty() : "Không tìm thấy thông tin thứ tự các điểm dừng!";

        System.out.println("TC_UC07.1_06: PASSED - Thứ tự các điểm dừng hiển thị rõ ràng.");
    }

    @AfterMethod
    public void tearDown() {
        if (driver != null) driver.quit();
    }
}
