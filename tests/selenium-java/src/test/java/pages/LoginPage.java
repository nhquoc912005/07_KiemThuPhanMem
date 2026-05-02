package pages;

import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.time.Duration;

public class LoginPage {
    private WebDriver driver;
    private WebDriverWait wait;

    // Locators dựa trên placeholder vì UI React không set ID
    private By inputUsername = By.cssSelector("input[placeholder='Nhập tên đăng nhập']");
    private By inputPassword = By.cssSelector("input[placeholder='Nhập mật khẩu']");
    private By btnLogin = By.cssSelector("button[type='submit']");

    public LoginPage(WebDriver driver) {
        this.driver = driver;
        this.wait = new WebDriverWait(driver, Duration.ofSeconds(10));
    }

    public void login(String username, String password) {
        wait.until(ExpectedConditions.visibilityOfElementLocated(inputUsername)).sendKeys(username);
        driver.findElement(inputPassword).sendKeys(password);
        driver.findElement(btnLogin).click();
        
        // Đợi chuyển trang thành công (Tùy thuộc vào user là tài xế hay điều phối mà url sẽ khác nhau)
        // Ví dụ tạm thời:
        wait.until(ExpectedConditions.not(ExpectedConditions.urlContains("/login")));
    }
}
