package pages;

import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.time.Duration;
import java.util.List;

public class DriverTripsPage {
    private WebDriver driver;
    private WebDriverWait wait;

    // Locators
    private By listTrips = By.xpath("//table/tbody/tr");
    private By rejectPopup = By.xpath("//div[contains(text(), 'Nhập lý do từ chối')]");
    private By inputRejectReason = By.cssSelector("textarea[placeholder='Nhập lý do vào đây']");
    private By btnCancelReject = By.xpath("//button[text()='Hủy']");
    private By btnSubmitReject = By.xpath("//button[text()='Gửi']");

    public DriverTripsPage(WebDriver driver) {
        this.driver = driver;
        this.wait = new WebDriverWait(driver, Duration.ofSeconds(10));
    }

    // Nhấn nút More (3 chấm) của dòng chuyến xe đầu tiên
    public void clickMoreOptionsFirstTrip() {
        // Nút 3 chấm nằm ở cuối cùng của cột Hành động
        By moreBtn = By.xpath("(//table/tbody/tr)[1]//td[last()]//button[last()]");
        WebElement btn = wait.until(ExpectedConditions.presenceOfElementLocated(moreBtn));
        ((org.openqa.selenium.JavascriptExecutor) driver).executeScript("arguments[0].click();", btn);
    }

    public void clickRejectTripMenu() {
        By rejectMenu = By.xpath("//button[contains(., 'Từ chối chuyến')]");
        WebElement btn = wait.until(ExpectedConditions.presenceOfElementLocated(rejectMenu));
        ((org.openqa.selenium.JavascriptExecutor) driver).executeScript("arguments[0].click();", btn);
    }

    public void clickViewRouteMenu() {
        By viewRouteBtn = By.xpath("(//table/tbody/tr)[1]//button[contains(text(), 'Xem lộ trình')]");
        WebElement btn = wait.until(ExpectedConditions.presenceOfElementLocated(viewRouteBtn));
        ((org.openqa.selenium.JavascriptExecutor) driver).executeScript("arguments[0].click();", btn);
    }

    public boolean isRejectPopupDisplayed() {
        try {
            return wait.until(ExpectedConditions.visibilityOfElementLocated(rejectPopup)).isDisplayed();
        } catch (Exception e) {
            return false;
        }
    }

    public boolean waitUntilRejectPopupDisappears() {
        try {
            return wait.until(ExpectedConditions.invisibilityOfElementLocated(rejectPopup));
        } catch (Exception e) {
            return false;
        }
    }

    public void enterRejectReason(String reason) {
        WebElement input = wait.until(ExpectedConditions.elementToBeClickable(inputRejectReason));
        input.click();
        input.clear();
        try { Thread.sleep(300); } catch (Exception e) {}
        input.sendKeys(reason);
        try { Thread.sleep(300); } catch (Exception e) {}
    }

    public void clickCancelReject() {
        try { Thread.sleep(500); } catch (Exception e) {}
        WebElement btn = wait.until(ExpectedConditions.presenceOfElementLocated(btnCancelReject));
        ((org.openqa.selenium.JavascriptExecutor) driver).executeScript("arguments[0].click();", btn);
    }

    public void clickSubmitReject() {
        try { Thread.sleep(500); } catch (Exception e) {}
        WebElement btn = wait.until(ExpectedConditions.presenceOfElementLocated(btnSubmitReject));
        ((org.openqa.selenium.JavascriptExecutor) driver).executeScript("arguments[0].click();", btn);
    }

    public String getFirstTripId() {
        By firstTripIdLocator = By.xpath("(//table/tbody/tr)[1]/td[2]");
        return wait.until(ExpectedConditions.visibilityOfElementLocated(firstTripIdLocator)).getText().trim();
    }

    public void clickCancelledTripsTab() {
        By cancelledTab = By.xpath("//div[contains(text(), 'Danh sách chuyến đã hủy')]");
        wait.until(ExpectedConditions.elementToBeClickable(cancelledTab)).click();
    }

    public boolean isTripInList(String tripId) {
        By tripRow = By.xpath("//table/tbody/tr[td[2][contains(text(), '" + tripId + "')]]");
        try {
            return wait.until(ExpectedConditions.visibilityOfElementLocated(tripRow)).isDisplayed();
        } catch (Exception e) {
            return false;
        }
    }

    public String getTripStatus(String tripId) {
        By statusLocator = By.xpath("//table/tbody/tr[td[2][contains(text(), '" + tripId + "')]]/td[6]");
        return wait.until(ExpectedConditions.visibilityOfElementLocated(statusLocator)).getText().trim();
    }

    public boolean isTripActionDisabled(String tripId) {
        By actionBadgeLocator = By.xpath("//table/tbody/tr[td[2][contains(text(), '" + tripId
                + "')]]/td[7]//div[contains(text(), 'Đã từ chối')]");
        try {
            return wait.until(ExpectedConditions.visibilityOfElementLocated(actionBadgeLocator)).isDisplayed();
        } catch (Exception e) {
            return false;
        }
    }
}