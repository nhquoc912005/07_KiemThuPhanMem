import org.openqa.selenium.*;
import org.openqa.selenium.chrome.*;
import org.openqa.selenium.support.ui.*;
import org.testng.annotations.*;
import java.time.Duration;

public class TC_UC07_1_01 {
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

    @Test(description = "UC07.1.01 - Mở chức năng xem lộ trình trung chuyển")
    public void testOpenRouteList() {
        driver.get("http://localhost:3000/login");

        // Nhập tên đăng nhập và mật khẩu
        wait.until(ExpectedConditions.visibilityOfElementLocated(By.cssSelector("[placeholder='Nhập tên đăng nhập']"))).sendKeys("taixe1");
        driver.findElement(By.cssSelector("[placeholder='Nhập mật khẩu']")).sendKeys("123456");
        
        // Click ĐĂNG NHẬP (Dùng Unicode cho chữ Đ)
        driver.findElement(By.xpath("//button[contains(text(), '\u0110\u0102NG NH\u1eacP')]")).click();

        // Đợi URL thay đổi
        wait.until(ExpectedConditions.urlContains("/driver/trips/assigned"));
        
        // Kiểm tra tiêu đề "Danh sách chuyến được phân công"
        String expectedTitle = "Danh s\u00e1ch chuy\u1ebfn \u0111\u01b0\u1ee3c ph\u00e2n c\u00f4ng";
        WebElement title = wait.until(ExpectedConditions.visibilityOfElementLocated(By.xpath("//*[contains(text(), '" + expectedTitle + "')]")));
        assert title.isDisplayed();
        
        System.out.println("TC_UC07.1_01: PASSED");
    }

    @AfterMethod
    public void tearDown() {
        if (driver != null) driver.quit();
    }
}
