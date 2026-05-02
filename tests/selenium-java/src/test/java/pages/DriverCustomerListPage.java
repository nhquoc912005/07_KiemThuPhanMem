package pages;

import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

public class DriverCustomerListPage {
    private WebDriver driver;
    private WebDriverWait wait;

    // Locators based on inspection
    private By tableBody = By.cssSelector("table tbody");
    private By tableRows = By.cssSelector("tbody tr");
    private By searchInput = By.cssSelector("input[placeholder*='Tìm theo tên']");
    private By btnToggleMap = By.xpath("//button[contains(.,'Xem bản đồ')]");
    private By mapContainer = By.className("leaflet-container");
    private By emptyStateMessage = By.xpath("//div[contains(text(), 'Chưa có khách hàng')]");
    private By btnStartTrip = By.xpath("//button[contains(text(), 'Bắt đầu chuyến')]");

    public DriverCustomerListPage(WebDriver driver) {
        this.driver = driver;
        this.wait = new WebDriverWait(driver, Duration.ofSeconds(10));
    }

    public List<WebElement> getCustomerRows() {
        wait.until(ExpectedConditions.presenceOfElementLocated(tableBody));
        wait.until(webDriver -> !webDriver.findElements(tableRows).isEmpty());
        return findDataRows();
    }

    public int getCustomerCount() {
        try {
            return getCustomerRows().size();
        } catch (Exception e) {
            return 0;
        }
    }

    public String getCustomerName(int rowIndex) {
        return getCustomerCellText(rowIndex, 1);
    }

    public String getCustomerPhone(int rowIndex) {
        return getCustomerCellText(rowIndex, 2);
    }

    public String getCustomerSTT(int rowIndex) {
        return getCustomerCellText(rowIndex, 0);
    }

    public String getCustomerPickPoint(int rowIndex) {
        return getCustomerCellText(rowIndex, 3);
    }

    public String getCustomerDropPoint(int rowIndex) {
        return getCustomerCellText(rowIndex, 4);
    }

    public String getCustomerSeat(int rowIndex) {
        return getCustomerCellText(rowIndex, 5);
    }

    public String getCustomerTime(int rowIndex) {
        return getCustomerCellText(rowIndex, 6);
    }

    public String getCustomerStatus(int rowIndex) {
        return getCustomerCellText(rowIndex, 7);
    }

    private List<WebElement> findDataRows() {
        List<WebElement> dataRows = new ArrayList<>();

        for (WebElement row : driver.findElements(tableRows)) {
            List<WebElement> cells = row.findElements(By.cssSelector("td"));
            boolean emptyStateRow = !row.findElements(By.cssSelector("td[colspan]")).isEmpty();

            if (row.isDisplayed() && cells.size() >= 8 && !emptyStateRow) {
                dataRows.add(row);
            }
        }

        return dataRows;
    }

    private String getCustomerCellText(int rowIndex, int columnIndex) {
        List<WebElement> rows = getCustomerRows();

        if (rowIndex < 0 || rowIndex >= rows.size()) {
            throw new IndexOutOfBoundsException("Customer row index out of range: " + rowIndex);
        }

        List<WebElement> cells = rows.get(rowIndex).findElements(By.cssSelector("td"));
        if (columnIndex < 0 || columnIndex >= cells.size()) {
            throw new IndexOutOfBoundsException("Customer column index out of range: " + columnIndex);
        }

        return cells.get(columnIndex).getText().trim();
    }

    public boolean isStartTripButtonEnabled() {
        try {
            WebElement btn = driver.findElement(btnStartTrip);
            return btn.isDisplayed() && btn.isEnabled();
        } catch (Exception e) {
            return false;
        }
    }

    public boolean isStartTripButtonDisplayed() {
        try {
            return driver.findElement(btnStartTrip).isDisplayed();
        } catch (Exception e) {
            return false;
        }
    }
    
    public String getStartTripButtonColor() {
        try {
            return driver.findElement(btnStartTrip).getCssValue("background-color");
        } catch (Exception e) {
            return "";
        }
    }

    public void searchCustomer(String name) {
        WebElement input = wait.until(ExpectedConditions.elementToBeClickable(searchInput));
        input.clear();
        input.sendKeys(name);
    }

    public void clickToggleMap() {
        WebElement btn = wait.until(ExpectedConditions.elementToBeClickable(btnToggleMap));
        ((org.openqa.selenium.JavascriptExecutor) driver).executeScript("arguments[0].click();", btn);
    }

    public boolean isMapDisplayed() {
        try {
            // Give the map a bit more time to initialize/render in Selenium environment
            return new WebDriverWait(driver, Duration.ofSeconds(15))
                    .until(ExpectedConditions.visibilityOfElementLocated(mapContainer)).isDisplayed();
        } catch (Exception e) {
            return false;
        }
    }

    public boolean hasEditButtons() {
        // Check for any button with text 'Sửa', 'Edit', or icons commonly used for editing
        List<WebElement> editButtons = driver.findElements(By.xpath("//button[contains(.,'Sửa') or contains(.,'Edit')]"));
        return !editButtons.isEmpty();
    }

    public boolean isEmptyStateDisplayed() {
        try {
            return wait.until(ExpectedConditions.visibilityOfElementLocated(emptyStateMessage)).isDisplayed();
        } catch (Exception e) {
            return false;
        }
    }
}
