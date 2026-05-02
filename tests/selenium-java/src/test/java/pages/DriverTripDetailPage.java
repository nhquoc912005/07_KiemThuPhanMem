package pages;

import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.Select;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.time.Duration;
import java.util.List;

public class DriverTripDetailPage {
    private WebDriver driver;
    private WebDriverWait wait;

    // Locators
    private By btnStartTrip = By.xpath("//button[text()='Bắt đầu chuyến']");
    private By btnCompleteTrip = By.xpath("//button[text()='Hoàn thành']");
    private By btnReportIncident = By.xpath("//button[text()='Báo cáo sự cố']");
    private By btnCustomerList = By.xpath("//button[text()='Danh sách khách hàng']");
    
    // Locators for Customer status dropdowns
    private By customerStatusSelects = By.xpath("//select");

    // Incident Modal Locators
    private By incidentModalTitle = By.xpath("//h3[text()='Báo cáo sự cố lộ trình']");
    private By inputIncidentDesc = By.cssSelector("textarea[placeholder='Nhập mô tả sự cố']");
    private By btnCancelIncident = By.xpath("//button[text()='Hủy']");
    private By btnSubmitIncident = By.xpath("//button[text()='Gửi']");

    // Toast / Message Locators
    private By successMessage = By.xpath("//div[contains(@style, 'background: #DCFCE7') or contains(@style, 'rgb(220, 252, 231)')]");
    private By errorMessage = By.xpath("//div[contains(@style, 'color: #B91C1C') or contains(@style, 'rgb(185, 28, 28)')]");

    public DriverTripDetailPage(WebDriver driver) {
        this.driver = driver;
        this.wait = new WebDriverWait(driver, Duration.ofSeconds(10));
    }

    public void clickStartTrip() {
        try { Thread.sleep(500); } catch (Exception e) {}
        WebElement btn = wait.until(ExpectedConditions.presenceOfElementLocated(btnStartTrip));
        ((org.openqa.selenium.JavascriptExecutor) driver).executeScript("arguments[0].click();", btn);
    }

    public void clickCompleteTrip() {
        try { Thread.sleep(500); } catch (Exception e) {}
        WebElement btn = wait.until(ExpectedConditions.presenceOfElementLocated(btnCompleteTrip));
        ((org.openqa.selenium.JavascriptExecutor) driver).executeScript("arguments[0].click();", btn);
    }

    public boolean isCompleteButtonDisabled() {
        WebElement btn = wait.until(ExpectedConditions.visibilityOfElementLocated(btnCompleteTrip));
        return !btn.isEnabled() || btn.getAttribute("disabled") != null || btn.getCssValue("cursor").equals("not-allowed");
    }

    public boolean isStartButtonDisplayed() {
        try {
            return driver.findElement(btnStartTrip).isDisplayed();
        } catch (Exception e) {
            return false;
        }
    }

    public void updateCustomerStatus(int customerIndex, String visibleTextStatus) {
        List<WebElement> selects = wait.until(ExpectedConditions.presenceOfAllElementsLocatedBy(customerStatusSelects));
        if (customerIndex < selects.size()) {
            Select select = new Select(selects.get(customerIndex));
            select.selectByVisibleText(visibleTextStatus);
        }
    }

    public boolean areCustomerDropdownsDisabled() {
        List<WebElement> selects = driver.findElements(customerStatusSelects);
        if (selects.isEmpty()) return true;
        for (WebElement select : selects) {
            if (select.isEnabled()) return false;
        }
        return true;
    }

    public boolean isReportIncidentButtonDisabled() {
        WebElement btn = driver.findElement(btnReportIncident);
        return !btn.isEnabled() || btn.getAttribute("disabled") != null;
    }

    public void clickReportIncident() {
        try { Thread.sleep(500); } catch (Exception e) {}
        WebElement btn = wait.until(ExpectedConditions.presenceOfElementLocated(btnReportIncident));
        ((org.openqa.selenium.JavascriptExecutor) driver).executeScript("arguments[0].click();", btn);
    }

    public boolean isIncidentModalDisplayed() {
        try {
            return wait.until(ExpectedConditions.visibilityOfElementLocated(incidentModalTitle)).isDisplayed();
        } catch (Exception e) {
            return false;
        }
    }

    public void enterIncidentDescription(String desc) {
        wait.until(ExpectedConditions.visibilityOfElementLocated(inputIncidentDesc)).sendKeys(desc);
    }

    public void clickCancelIncident() {
        WebElement btn = wait.until(ExpectedConditions.presenceOfElementLocated(btnCancelIncident));
        ((org.openqa.selenium.JavascriptExecutor) driver).executeScript("arguments[0].click();", btn);
    }

    public void clickSubmitIncident() {
        WebElement btn = wait.until(ExpectedConditions.presenceOfElementLocated(btnSubmitIncident));
        ((org.openqa.selenium.JavascriptExecutor) driver).executeScript("arguments[0].click();", btn);
    }

    public void clickCustomerListTab() {
        WebElement btn = wait.until(ExpectedConditions.presenceOfElementLocated(btnCustomerList));
        ((org.openqa.selenium.JavascriptExecutor) driver).executeScript("arguments[0].click();", btn);
    }

    public String getSuccessMessageText() {
        return wait.until(ExpectedConditions.visibilityOfElementLocated(successMessage)).getText();
    }

    public String getErrorMessageText() {
        return wait.until(ExpectedConditions.visibilityOfElementLocated(errorMessage)).getText();
    }
}
