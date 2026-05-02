package tests;
import org.openqa.selenium.*;
import org.openqa.selenium.chrome.*;
import org.openqa.selenium.support.ui.*;
import org.testng.annotations.*;
import java.time.Duration;

public class TC_UC07_1_03 {
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

    @Test(description = "UC07.1.03 - Hi\u1ec3n th\u1ecb c\u00e1c \u0111i\u1ec3m \u0111\u00f3n tr\u1ea3")
    public void testShowStops() throws InterruptedException {
        driver.get("http://localhost:3000/login");

        // Login
        wait.until(ExpectedConditions.visibilityOfElementLocated(By.cssSelector("[placeholder='Nh\u1eadp t\u00ean \u0111\u0103ng nh\u1eadp']"))).sendKeys("taixe1");
        driver.findElement(By.cssSelector("[placeholder='Nh\u1eadp m\u1eadt kh\u1ea9u']")).sendKeys("123456");
        driver.findElement(By.xpath("//button[contains(., '\u0110\u0102NG NH\u1eacP')]")).click();

        // Wait for list page and click "Xem lo trinh"
        wait.until(ExpectedConditions.urlContains("/driver/trips/assigned"));
        WebElement viewRouteBtn = wait.until(ExpectedConditions.presenceOfElementLocated(By.xpath("//button[contains(., 'Xem l\u1ed9 tr\u00ecnh')]")));
        ((JavascriptExecutor) driver).executeScript("arguments[0].scrollIntoView(true);", viewRouteBtn);
        ((JavascriptExecutor) driver).executeScript("arguments[0].click();", viewRouteBtn);

        // Wait for detail page navigation
        wait.until(ExpectedConditions.urlContains("/driver/trips/"));
        wait.until(ExpectedConditions.not(ExpectedConditions.urlContains("assigned")));
        Thread.sleep(3000); // Wait for page content and API data to fully render

        // Scroll down to reveal the map and stop details below the fold
        ((JavascriptExecutor) driver).executeScript("window.scrollTo({top: document.body.scrollHeight, behavior: 'smooth'});");
        Thread.sleep(2000);

        // Verify pickup point using JavaScript to avoid XPath text node issues
        Boolean hasPickup = (Boolean) wait.until(d -> {
            return (Boolean) ((JavascriptExecutor) d).executeScript(
                "return document.body.innerText.includes('Chu M\u1ea1nh Trinh');");
        });
        assert hasPickup : "Pickup stop 'Chu Manh Trinh' not found on page";

        // Verify drop-off point
        Boolean hasDropoff = (Boolean) wait.until(d -> {
            return (Boolean) ((JavascriptExecutor) d).executeScript(
                "return document.body.innerText.includes('B\u1ebfn xe \u0110\u00e0 N\u1eb5ng');");
        });
        assert hasDropoff : "Dropoff stop 'Ben xe Da Nang' not found on page";

        // Scroll to map and verify it is displayed
        WebElement map = wait.until(ExpectedConditions.presenceOfElementLocated(By.className("leaflet-container")));
        ((JavascriptExecutor) driver).executeScript("arguments[0].scrollIntoView({block: 'center'});", map);
        Thread.sleep(1000);
        assert map.isDisplayed() : "Map is not displayed";

        System.out.println("TC_UC07.1_03: PASSED");
    }

    @AfterMethod
    public void tearDown() {
        if (driver != null) driver.quit();
    }
}
