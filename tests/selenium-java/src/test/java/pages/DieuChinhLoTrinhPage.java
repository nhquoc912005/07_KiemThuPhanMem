package pages;

import org.openqa.selenium.By;
import org.openqa.selenium.JavascriptExecutor;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.time.Duration;

public class DieuChinhLoTrinhPage {
    private final WebDriver driver;
    private final WebDriverWait wait;

    private final By pageTitle = By.xpath("//h2[normalize-space()='Điều chỉnh lộ trình']");
    private final By routeListTitle = By.xpath("//div[normalize-space()='Danh sách lộ trình']");
    private final By anyRouteCard = By.xpath("//div[contains(@style,'cursor: pointer') and .//div[starts-with(normalize-space(), 'LT')]]");
    private final By detailTitle = By.xpath("//h3[contains(normalize-space(), 'Chi tiết lộ trình')]");
    
    // Inputs
    private final By startTimeInput = By.xpath("//div[normalize-space()='Thời gian bắt đầu']/following-sibling::input[@type='datetime-local']");
    private final By noteTextarea = By.xpath("//div[normalize-space()='Ghi chú điều phối']/following-sibling::textarea");
    private final By driverInput = By.xpath("//div[normalize-space()='Tài xế']/following-sibling::input");
    
    // Buttons
    private final By updateButton = By.xpath("//button[contains(normalize-space(), 'Cập nhật lộ trình')]");
    private final By cancelButton = By.xpath("//button[contains(normalize-space(), 'Cập nhật lộ trình')]/following-sibling::button[normalize-space()='Hủy']"); 
    
    // Search
    private final By searchInput = By.xpath("//input[@placeholder='Tìm theo mã LT, biển số, tài xế...']");
    private final By noResultMessage = By.xpath("//div[normalize-space()='Không tìm thấy lộ trình phù hợp.']");
    
    // Messages
    private final By successMessage = By.xpath("//div[contains(text(), 'Đã lưu điều chỉnh')]"); 
    private final By errorMessage = By.xpath("//div[contains(@style, 'rgb(254, 226, 226)') or contains(@style, 'rgb(254,226,226)') or contains(@style, '#FEE2E2')]");

    // Modal
    private final By modalTitle = By.xpath("//h3[normalize-space()='Xác nhận cập nhật lộ trình']");
    private final By modalConfirmButton = By.xpath("//h3[normalize-space()='Xác nhận cập nhật lộ trình']/following-sibling::div//button[normalize-space()='Xác nhận']");
    private final By modalCancelButton = By.xpath("//h3[normalize-space()='Xác nhận cập nhật lộ trình']/following-sibling::div//button[normalize-space()='Hủy']");

    public DieuChinhLoTrinhPage(WebDriver driver) {
        this.driver = driver;
        this.wait = new WebDriverWait(driver, Duration.ofSeconds(10));
    }

    public void waitForPageLoaded() {
        wait.until(ExpectedConditions.visibilityOfElementLocated(pageTitle));
        wait.until(ExpectedConditions.visibilityOfElementLocated(routeListTitle));
    }

    public boolean isRouteListDisplayed() {
        try {
            return !wait.until(ExpectedConditions.presenceOfAllElementsLocatedBy(anyRouteCard)).isEmpty();
        } catch (Exception e) {
            return false;
        }
    }

    public void selectFirstRoute() {
        WebElement firstRoute = wait.until(ExpectedConditions.elementToBeClickable(anyRouteCard));
        ((JavascriptExecutor) driver).executeScript("arguments[0].click();", firstRoute);
        wait.until(ExpectedConditions.visibilityOfElementLocated(detailTitle));
    }
    
    public boolean isRouteDetailDisplayed() {
        try {
            wait.until(ExpectedConditions.visibilityOfElementLocated(detailTitle));
            wait.until(ExpectedConditions.visibilityOfElementLocated(startTimeInput));
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    public boolean hasRouteWithStatus(String status) {
        // Trong danh sách, trạng thái được bọc trong 1 thẻ <div>. Ở chi tiết, nó là <span>.
        By statusDiv = By.xpath("//div[normalize-space()='" + status + "']");
        try {
            return !driver.findElements(statusDiv).isEmpty();
        } catch (Exception e) {
            return false;
        }
    }

    public void selectRouteByStatus(String status) {
        By statusDiv = By.xpath("(//div[normalize-space()='" + status + "'])[1]");
        WebElement statusElement = wait.until(ExpectedConditions.visibilityOfElementLocated(statusDiv));
        
        // Thẻ card là ông nội của thẻ div trạng thái: card -> div (flex) -> div (trạng thái)
        WebElement card = statusElement.findElement(By.xpath("../.."));
        
        ((JavascriptExecutor) driver).executeScript("arguments[0].scrollIntoView({block: 'center'}); arguments[0].click();", card);
        try { Thread.sleep(1000); } catch (InterruptedException e) {}
    }

    public boolean isSelectedRouteStatus(String status) {
        By statusBadge = By.xpath(
                "//h3[contains(normalize-space(), 'Chi tiết lộ trình')]/following-sibling::span[normalize-space()='" + status + "']");
        try {
            return wait.until(ExpectedConditions.visibilityOfElementLocated(statusBadge)).isDisplayed();
        } catch (Exception e) {
            return false;
        }
    }

    public String getSelectedRouteId() {
        WebElement title = wait.until(ExpectedConditions.visibilityOfElementLocated(detailTitle));
        String text = title.getText();
        if (text.contains(":")) {
            return text.split(":")[1].trim();
        }
        return "";
    }

    public void selectRouteById(String routeId) {
        By routeCard = By.xpath("//div[contains(@style,'cursor: pointer') and .//div[normalize-space()='" + routeId + "']]");
        WebElement card = wait.until(ExpectedConditions.elementToBeClickable(routeCard));
        ((JavascriptExecutor) driver).executeScript("arguments[0].scrollIntoView({block: 'center'}); arguments[0].click();", card);
        try { Thread.sleep(1000); } catch (InterruptedException e) {}
    }

    public void updateNote(String note) {
        WebElement noteEl = wait.until(ExpectedConditions.visibilityOfElementLocated(noteTextarea));
        setReactInputValue(noteEl, note);
    }
    
    public String getNote() {
        WebElement noteEl = wait.until(ExpectedConditions.visibilityOfElementLocated(noteTextarea));
        return noteEl.getAttribute("value");
    }

    public void updateStartTime(String datetimeLocalValue) {
        WebElement startTimeEl = wait.until(ExpectedConditions.visibilityOfElementLocated(startTimeInput));
        setReactInputValue(startTimeEl, datetimeLocalValue);
    }

    public String getStartTime() {
        WebElement startTimeEl = wait.until(ExpectedConditions.visibilityOfElementLocated(startTimeInput));
        return startTimeEl.getAttribute("value");
    }

    public boolean isDriverInputReadOnly() {
        try {
            WebElement input = wait.until(ExpectedConditions.visibilityOfElementLocated(driverInput));
            return input.getAttribute("readOnly") != null || input.getAttribute("readonly") != null;
        } catch (Exception e) {
            return false;
        }
    }

    public void clickUpdate() {
        WebElement btn = wait.until(ExpectedConditions.elementToBeClickable(updateButton));
        ((JavascriptExecutor) driver).executeScript("arguments[0].click();", btn);
    }

    public void clickCancel() {
        WebElement btn = wait.until(ExpectedConditions.elementToBeClickable(cancelButton));
        ((JavascriptExecutor) driver).executeScript("arguments[0].click();", btn);
    }
    
    public boolean isConfirmModalDisplayed() {
        try {
            return wait.until(ExpectedConditions.visibilityOfElementLocated(modalTitle)).isDisplayed();
        } catch (Exception e) {
            return false;
        }
    }

    public void confirmModal() {
        WebElement btn = wait.until(ExpectedConditions.elementToBeClickable(modalConfirmButton));
        ((JavascriptExecutor) driver).executeScript("arguments[0].click();", btn);
        try { Thread.sleep(1000); } catch (InterruptedException e) {}
    }

    public void cancelModal() {
        WebElement btn = wait.until(ExpectedConditions.elementToBeClickable(modalCancelButton));
        ((JavascriptExecutor) driver).executeScript("arguments[0].click();", btn);
        try { Thread.sleep(500); } catch (InterruptedException e) {}
    }

    public boolean isSuccessMessageDisplayed() {
        try {
            return wait.until(ExpectedConditions.visibilityOfElementLocated(successMessage)).isDisplayed();
        } catch (Exception e) {
            return false;
        }
    }

    public boolean isErrorMessageDisplayed(String expectedMessage) {
        try {
            WebElement errorEl = wait.until(ExpectedConditions.visibilityOfElementLocated(errorMessage));
            return errorEl.getText().contains(expectedMessage);
        } catch (Exception e) {
            return false;
        }
    }

    public String getErrorMessageText() {
        try {
            WebElement errorEl = wait.until(ExpectedConditions.visibilityOfElementLocated(errorMessage));
            return errorEl.getText();
        } catch (Exception e) {
            return "Không có thông báo lỗi nào trên màn hình";
        }
    }
    
    public boolean isErrorMessageDisplayed() {
        try {
            return wait.until(ExpectedConditions.visibilityOfElementLocated(errorMessage)).isDisplayed();
        } catch (Exception e) {
            return false;
        }
    }

    public void enterSearchKeyword(String keyword) {
        WebElement input = wait.until(ExpectedConditions.visibilityOfElementLocated(searchInput));
        setReactInputValue(input, keyword);
        try { Thread.sleep(1000); } catch (InterruptedException e) {}
    }

    public void clearSearchKeyword() {
        WebElement input = wait.until(ExpectedConditions.visibilityOfElementLocated(searchInput));
        setReactInputValue(input, "");
        try { Thread.sleep(1000); } catch (InterruptedException e) {}
    }

    private void setReactInputValue(WebElement element, String value) {
        JavascriptExecutor js = (JavascriptExecutor) driver;
        js.executeScript(
            "const prototype = arguments[0].tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;" +
            "const nativeInputValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value').set;" +
            "if(nativeInputValueSetter) nativeInputValueSetter.call(arguments[0], arguments[1]);" +
            "else arguments[0].value = arguments[1];" +
            "arguments[0].dispatchEvent(new Event('input', { bubbles: true }));" +
            "arguments[0].dispatchEvent(new Event('change', { bubbles: true }));", 
            element, value);
    }

    public int getDisplayedRouteCount() {
        try {
            return driver.findElements(anyRouteCard).size();
        } catch (Exception e) {
            return 0;
        }
    }

    public boolean isNoResultMessageDisplayed() {
        try {
            return wait.until(ExpectedConditions.visibilityOfElementLocated(noResultMessage)).isDisplayed();
        } catch (Exception e) {
            return false;
        }
    }

    public boolean doAllDisplayedRoutesContainKeyword(String keyword) {
        try {
            java.util.List<WebElement> cards = driver.findElements(anyRouteCard);
            if (cards.isEmpty()) return false;
            
            String lowerKeyword = keyword.toLowerCase();
            for (WebElement card : cards) {
                String text = card.getText().toLowerCase();
                if (!text.contains(lowerKeyword)) {
                    return false;
                }
            }
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
