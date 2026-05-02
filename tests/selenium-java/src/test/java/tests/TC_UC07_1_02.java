package tests;
import org.openqa.selenium.*;
import org.openqa.selenium.chrome.*;
import org.openqa.selenium.support.ui.*;
import org.testng.annotations.*;
import java.time.Duration;

public class TC_UC07_1_02 {
    private WebDriver driver;
    private WebDriverWait wait;

    @BeforeMethod
    public void setUp() {
        io.github.bonigarcia.wdm.WebDriverManager.chromedriver().setup();
        ChromeOptions options = new ChromeOptions();
        options.addArguments("--start-maximized");
        driver = new ChromeDriver(options);
        wait = new WebDriverWait(driver, Duration.ofSeconds(20));
    }

    @Test(description = "UC07.1.02 - Xem chi tiết lộ trình trung chuyển")
    public void testViewRouteDetail() {
        driver.get("http://localhost:3000/login");
        
        // Login
        wait.until(ExpectedConditions.visibilityOfElementLocated(By.cssSelector("[placeholder='Nhập tên đăng nhập']"))).sendKeys("taixe1");
        driver.findElement(By.cssSelector("[placeholder='Nhập mật khẩu']")).sendKeys("123456");
        driver.findElement(By.xpath("//button[contains(., '\u0110\u0102NG NH\u1eacP')]")).click();

        // Wait for list page
        wait.until(ExpectedConditions.urlContains("/driver/trips/assigned"));

        // Click "Xem lộ trình" using JavaScript to ensure it triggers
        WebElement viewRouteBtn = wait.until(ExpectedConditions.presenceOfElementLocated(By.xpath("//button[contains(., 'Xem l\u1ed9 tr\u00ecnh')]")));
        ((JavascriptExecutor) driver).executeScript("arguments[0].scrollIntoView(true);", viewRouteBtn);
        ((JavascriptExecutor) driver).executeScript("arguments[0].click();", viewRouteBtn);

        // Wait for navigation
        wait.until(ExpectedConditions.urlContains("/driver/trips/"));
        wait.until(ExpectedConditions.not(ExpectedConditions.urlContains("assigned")));

        // Verify map
        WebElement map = wait.until(ExpectedConditions.visibilityOfElementLocated(By.className("leaflet-container")));
        assert map.isDisplayed();

        System.out.println("TC_UC07.1_02: PASSED");
    }

    @AfterMethod
    public void tearDown() {
        if (driver != null) driver.quit();
    }
}
