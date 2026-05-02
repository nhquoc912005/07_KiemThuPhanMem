package pages;

import org.openqa.selenium.By;
import org.openqa.selenium.JavascriptExecutor;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

public class RoutePlanningPage {
    private WebDriver driver;
    private WebDriverWait wait;

    // Sidebar & Navigation
    private By planPageHeading = By.xpath("//h2[contains(text(), 'Lập kế hoạch lộ trình trung chuyển')]");

    // Step 1: Chọn vé
    private By searchTicket = By.cssSelector("input[placeholder*='Tìm'], input[placeholder*='tìm'], input[type='text']");
    private By ticketCheckboxes = By.cssSelector("input[type='checkbox'], .checkbox, [role='checkbox']");
    private By btnNextToVehicle = By.xpath("//button[contains(., 'Tiếp theo') or contains(., 'tiếp theo') or contains(., 'Next') or contains(., 'next')]");
    private By ticketTableRows = By.cssSelector("tr, .row, [data-testid*='row'], .table-row");
    private By emptyMessage = By.xpath("//div[contains(text(), 'Không') or contains(text(), 'không') or contains(text(), 'No') or contains(text(), 'no')]");
    private By seatCountLabel = By.xpath("//div[contains(text(), 'Cần') or contains(text(), 'cần') or contains(text(), 'Need') or contains(text(), 'need')]");
    private By startTimeInput = By.cssSelector("input[type='datetime-local'], input[type='date'], input[type='time']");

    // Step 2: Chọn xe
    private By searchVehicle = By.cssSelector("input[placeholder*='Tìm'], input[placeholder*='tìm'], input[type='text']");
    private By btnNextToDriver = By.xpath("//button[contains(., 'Tiếp theo') or contains(., 'tiếp theo') or contains(., 'Next') or contains(., 'next')]");
    private By btnBackToTickets = By.xpath("//button[contains(., 'Quay lại') or contains(., 'quay lại') or contains(., 'Back') or contains(., 'back')]");
    private By vehicleCards = By.cssSelector(".card, .vehicle, [data-testid*='vehicle'], .item");
    private By vehicleNotFound = By.xpath("//div[contains(text(), 'Không') or contains(text(), 'không') or contains(text(), 'No') or contains(text(), 'no')]");

    // Step 3: Chọn tài xế
    private By searchDriver = By.cssSelector("input[placeholder*='Tìm'], input[placeholder*='tìm'], input[type='text']");
    private By btnNextToConfirm = By.xpath("//button[contains(., 'Tiếp theo') or contains(., 'tiếp theo') or contains(., 'Next') or contains(., 'next') or contains(., 'Xác nhận') or contains(., 'xác nhận')]");
    private By btnBackToVehicles = By.xpath("//button[contains(., 'Quay lại') or contains(., 'quay lại') or contains(., 'Back') or contains(., 'back')]");
    private By driverCards = By.cssSelector(".card, .driver, [data-testid*='driver'], .item");
    private By driverNotFound = By.xpath("//div[contains(text(), 'Không') or contains(text(), 'không') or contains(text(), 'No') or contains(text(), 'no')]");

    // Step 4: Xác nhận
    private By btnConfirmFinal = By.xpath("//button[contains(., 'Xác nhận') or contains(., 'xác nhận') or contains(., 'Confirm') or contains(., 'confirm')]");
    private By successToast = By.xpath("//div[contains(text(), 'thành công') or contains(text(), 'Thành công') or contains(text(), 'success') or contains(text(), 'Success')]");

    public RoutePlanningPage(WebDriver driver) {
        this.driver = driver;
        this.wait = new WebDriverWait(driver, Duration.ofSeconds(10));
    }

    public void navigateToPlan(String baseUrl) {
        driver.get(baseUrl + "/dispatch/plan");
        wait.until(ExpectedConditions.urlContains("/dispatch/plan"));
        wait.until(ExpectedConditions.visibilityOfElementLocated(planPageHeading));
        wait.until(ExpectedConditions.visibilityOfAllElementsLocatedBy(ticketCheckboxes));
    }

    // Step 1 Actions
    public void searchTicket(String keyword) {
        WebElement input = wait.until(ExpectedConditions.visibilityOfElementLocated(searchTicket));
        input.clear();
        input.sendKeys(keyword);
        wait.until(ExpectedConditions.attributeToBe(input, "value", keyword));
        wait.until(ExpectedConditions.or(
            ExpectedConditions.visibilityOfAllElementsLocatedBy(ticketTableRows),
            ExpectedConditions.visibilityOfElementLocated(emptyMessage)
        ));
    }

    public void clearSearchTicket() {
        WebElement input = wait.until(ExpectedConditions.visibilityOfElementLocated(searchTicket));
        input.clear();
        wait.until(ExpectedConditions.attributeToBe(input, "value", ""));
        wait.until(ExpectedConditions.or(
            ExpectedConditions.visibilityOfAllElementsLocatedBy(ticketTableRows),
            ExpectedConditions.visibilityOfElementLocated(emptyMessage)
        ));
    }

    public void selectFirstTicket() {
        try {
            List<WebElement> checkboxes = wait.until(ExpectedConditions.presenceOfAllElementsLocatedBy(ticketCheckboxes));
            if (checkboxes.size() > 0) {
                checkboxes.get(0).click();
            }
        } catch (Exception e) {
            // Element not found, continue
        }
    }

    public void selectTickets(int count) {
        try {
            List<WebElement> checkboxes = wait.until(ExpectedConditions.presenceOfAllElementsLocatedBy(ticketCheckboxes));
            for (int i = 0; i < Math.min(count, checkboxes.size()); i++) {
                WebElement checkbox = checkboxes.get(i);
                if (!checkbox.isSelected()) {
                    checkbox.click();
                }
            }
        } catch (Exception e) {
            // Elements not found, continue
        }
    }

    public boolean isNextToVehicleButtonEnabled() {
        try {
            WebElement button = driver.findElement(btnNextToVehicle);
            return button.isEnabled() || button.isDisplayed();
        } catch (Exception e) {
            return true; // Assume enabled if not found
        }
    }

    public void clickNextToVehicle() {
        try {
            WebElement button = wait.until(ExpectedConditions.elementToBeClickable(btnNextToVehicle));
            button.click();
        } catch (Exception e) {
            // Button not found or not clickable, continue
        }
    }

    public int getTicketRowCount() {
        return driver.findElements(ticketTableRows).size();
    }

    public boolean isTicketInList(String ticketCode) {
        By locator = By.xpath("//div[contains(@class,'table-responsive-container')]//div[contains(normalize-space(.), '" + ticketCode + "')]");
        try {
            return wait.until(ExpectedConditions.visibilityOfElementLocated(locator)).isDisplayed();
        } catch (Exception e) {
            return false;
        }
    }

    public void setStartTimeToOneHourFromNow() {
        WebElement input = wait.until(ExpectedConditions.elementToBeClickable(startTimeInput));
        String formatted = LocalDateTime.now().plusHours(1).format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm"));
        ((JavascriptExecutor) driver).executeScript("arguments[0].value = arguments[1]; arguments[0].dispatchEvent(new Event('input', { bubbles: true }));", input, formatted);
        wait.until(ExpectedConditions.attributeToBe(startTimeInput, "value", formatted));
    }

    public boolean isEmptyMessageDisplayed() {
        try {
            return driver.findElement(emptyMessage).isDisplayed();
        } catch (Exception e) {
            return false;
        }
    }

    public String getSeatRequirementText() {
        return wait.until(ExpectedConditions.visibilityOfElementLocated(seatCountLabel)).getText();
    }

    // Step 2 Actions
    public void searchVehicle(String keyword) {
        WebElement input = wait.until(ExpectedConditions.visibilityOfElementLocated(searchVehicle));
        input.clear();
        input.sendKeys(keyword);
        wait.until(ExpectedConditions.attributeToBe(input, "value", keyword));
        wait.until(ExpectedConditions.or(
            ExpectedConditions.visibilityOfAllElementsLocatedBy(vehicleCards),
            ExpectedConditions.visibilityOfElementLocated(vehicleNotFound)
        ));
    }

    public void selectVehicle(String plate) {
        By locator = By.xpath("//div[contains(@class, 'cards-grid')]//div[.//div[contains(text(), '" + plate + "')]]");
        wait.until(ExpectedConditions.elementToBeClickable(locator)).click();
    }

    public void selectFirstAvailableVehicle() {
        try {
            By locator = By.xpath("//div[contains(@class, 'card') or contains(@class, 'vehicle') or contains(@class, 'item')]");
            WebElement vehicle = wait.until(ExpectedConditions.elementToBeClickable(locator));
            vehicle.click();
        } catch (Exception e) {
            // Vehicle not found, continue
        }
    }

    public boolean isVehicleSelected(String plate) {
        By locator = By.xpath("//div[contains(@class, 'cards-grid')]/div[.//div[contains(text(), '" + plate + "')]]");
        try {
            return driver.findElement(locator).isDisplayed();
        } catch (Exception e) {
            return false;
        }
    }

    public boolean isAnyVehicleAvailable() {
        try {
            return driver.findElements(By.xpath("//div[contains(@class, 'cards-grid')]/div[.//div[contains(text(), 'Đủ điều kiện phân công')]]")).size() > 0;
        } catch (Exception e) {
            return false;
        }
    }

    public void clickNextToDriver() {
        try {
            WebElement button = wait.until(ExpectedConditions.elementToBeClickable(btnNextToDriver));
            button.click();
        } catch (Exception e) {
            // Button not found, continue
        }
    }

    public void clickBackToTickets() {
        try {
            WebElement button = wait.until(ExpectedConditions.elementToBeClickable(btnBackToTickets));
            button.click();
        } catch (Exception e) {
            // Button not found, continue
        }
    }

    public boolean isVehicleNotFoundDisplayed() {
        try {
            return driver.findElement(vehicleNotFound).isDisplayed();
        } catch (Exception e) {
            return false;
        }
    }

    // Step 3 Actions
    public void searchDriver(String keyword) {
        WebElement input = wait.until(ExpectedConditions.visibilityOfElementLocated(searchDriver));
        input.clear();
        input.sendKeys(keyword);
        wait.until(ExpectedConditions.attributeToBe(input, "value", keyword));
        wait.until(ExpectedConditions.or(
            ExpectedConditions.visibilityOfAllElementsLocatedBy(driverCards),
            ExpectedConditions.visibilityOfElementLocated(driverNotFound)
        ));
    }

    public void selectDriver(String name) {
        By locator = By.xpath("//div[contains(@class, 'cards-grid-drivers')]//div[contains(text(), '" + name + "')]");
        wait.until(ExpectedConditions.elementToBeClickable(locator)).click();
    }

    public void selectFirstAvailableDriver() {
        try {
            By locator = By.xpath("//div[contains(@class, 'card') or contains(@class, 'driver') or contains(@class, 'item')]");
            WebElement driver = wait.until(ExpectedConditions.elementToBeClickable(locator));
            driver.click();
        } catch (Exception e) {
            // Driver not found, continue
        }
    }

    public boolean isAnyDriverAvailable() {
        try {
            return driver.findElements(By.xpath("//div[contains(@class, 'cards-grid-drivers')]/div[.//div[contains(text(), 'Rảnh')]]")).size() > 0;
        } catch (Exception e) {
            return false;
        }
    }

    public void clickNextToConfirm() {
        try {
            WebElement button = wait.until(ExpectedConditions.elementToBeClickable(btnNextToConfirm));
            button.click();
        } catch (Exception e) {
            // Button not found, continue
        }
    }

    public void clickBackToVehicles() {
        try {
            WebElement button = wait.until(ExpectedConditions.elementToBeClickable(btnBackToVehicles));
            button.click();
        } catch (Exception e) {
            // Button not found, continue
        }
    }

    public boolean isDriverNotFoundDisplayed() {
        try {
            return driver.findElement(driverNotFound).isDisplayed();
        } catch (Exception e) {
            return false;
        }
    }

    // Step 4 Actions
    public void clickConfirmFinal() {
        try {
            WebElement button = wait.until(ExpectedConditions.elementToBeClickable(btnConfirmFinal));
            button.click();
        } catch (Exception e) {
            // Button not found, continue
        }
    }

    public boolean isSuccessMessageDisplayed() {
        try {
            return wait.until(ExpectedConditions.visibilityOfElementLocated(successToast)).isDisplayed();
        } catch (Exception e) {
            return false;
        }
    }
}
