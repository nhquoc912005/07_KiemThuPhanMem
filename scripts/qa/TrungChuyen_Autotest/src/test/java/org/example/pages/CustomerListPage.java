package org.example.pages;

import org.openqa.selenium.By;
import org.openqa.selenium.TimeoutException;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.time.Duration;
import java.util.List;

public class CustomerListPage {
    private final WebDriver driver;
    private final WebDriverWait wait;

    private final By viewRouteButton = By.xpath(
            "(//table//tbody//tr//button[contains(.,'Xem') or contains(.,'lộ trình') or contains(.,'lo trinh')])[1]"
    );
    private final By customerRows = By.cssSelector(
            "table tbody tr, .ant-table-tbody > tr, [data-testid='customer-row'], .customer-row, .list-group-item"
    );
    private final By startButton = By.xpath("//button[contains(.,'Bắt đầu') or contains(.,'Bat dau')]");
    private final By noTripMessage = By.xpath("//*[contains(.,'Chua co chuyen') or contains(.,'được phân công')]");

    public CustomerListPage(WebDriver driver, WebDriverWait wait) {
        this.driver = driver;
        this.wait = wait;
    }

    public void openAnyAssignedTrip() {
        if (!driver.findElements(startButton).isEmpty()) {
            return;
        }

        wait.until(ExpectedConditions.elementToBeClickable(viewRouteButton)).click();

        WebDriverWait longWait = new WebDriverWait(driver, Duration.ofSeconds(30));
        try {
            longWait.until(ExpectedConditions.or(
                    ExpectedConditions.visibilityOfElementLocated(startButton),
                    ExpectedConditions.visibilityOfElementLocated(noTripMessage)
            ));
        } catch (TimeoutException ignored) {
            // Fallback: continue so test assertions can show specific mismatches.
        }
    }

    public List<WebElement> getCustomerRows() {
        return driver.findElements(customerRows);
    }

    public boolean hasCustomerDataVisible() {
        return !driver.findElements(customerRows).isEmpty();
    }

    public boolean isStartButtonDisplayedAndEnabled() {
        List<WebElement> buttons = driver.findElements(startButton);
        if (buttons.isEmpty()) {
            return false;
        }
        WebElement button = buttons.get(0);
        return button.isDisplayed() && button.isEnabled();
    }

    public boolean isNoTripAssignedMessageVisible() {
        return !driver.findElements(noTripMessage).isEmpty();
    }
}
