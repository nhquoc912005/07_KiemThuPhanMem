package pages;

import org.openqa.selenium.By;
import org.openqa.selenium.JavascriptExecutor;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.time.Duration;

public class TheoDoiTrangThaiTrungChuyenPage {
    private final WebDriver driver;
    private final WebDriverWait wait;

    private final By pageTitle = By.xpath("//h2[normalize-space()='Theo dõi trạng thái trung chuyển']");
    private final By routeListTitle = By.xpath("//div[normalize-space()='Danh sách lộ trình']");
    private final By firstRouteCard = By.xpath("(//button[contains(@style,'cursor: pointer') and .//div[starts-with(normalize-space(), 'LT')]])[1]");
    private final By detailTitle = By.xpath("//h3[contains(normalize-space(), 'Chi tiết lộ trình')]");
    
    private final By detailVehicle = By.xpath("//div[normalize-space()='Xe trung chuyển']/following-sibling::div");
    private final By detailStatusBadge = By.xpath("//h3[contains(normalize-space(), 'Chi tiết lộ trình')]/following-sibling::span");
    private final By detailStartTime = By.xpath("//div[normalize-space()='Thời gian bắt đầu']/following-sibling::div");
    private final By estimateLocation = By.xpath("//div[normalize-space()='Vị trí ước tính theo điểm đón']");
    
    // Locators cho phần tìm kiếm
    private final By searchInput = By.xpath("//input[@placeholder='Tìm theo mã LT, biển số, tài xế...']");
    private final By noResultMessage = By.xpath("//div[normalize-space()='Không tìm thấy lộ trình phù hợp.']");
    private final By anyRouteCard = By.xpath("//button[contains(@style,'cursor: pointer') and .//div[starts-with(normalize-space(), 'LT')]]");

    public TheoDoiTrangThaiTrungChuyenPage(WebDriver driver) {
        this.driver = driver;
        this.wait = new WebDriverWait(driver, Duration.ofSeconds(10));
    }

    public void waitForPageLoaded() {
        wait.until(ExpectedConditions.visibilityOfElementLocated(pageTitle));
        wait.until(ExpectedConditions.visibilityOfElementLocated(routeListTitle));
    }

    public boolean isRouteListDisplayed() {
        try {
            return !wait.until(ExpectedConditions.presenceOfAllElementsLocatedBy(firstRouteCard)).isEmpty();
        } catch (Exception e) {
            return false;
        }
    }

    public void selectFirstRoute() {
        WebElement firstRoute = wait.until(ExpectedConditions.elementToBeClickable(firstRouteCard));
        ((JavascriptExecutor) driver).executeScript("arguments[0].click();", firstRoute);
        wait.until(ExpectedConditions.visibilityOfElementLocated(detailTitle));
    }

    public boolean isRouteDetailDisplayed() {
        try {
            wait.until(ExpectedConditions.visibilityOfElementLocated(detailTitle));
            wait.until(ExpectedConditions.visibilityOfElementLocated(detailStatusBadge));
            wait.until(ExpectedConditions.visibilityOfElementLocated(detailVehicle));
            wait.until(ExpectedConditions.visibilityOfElementLocated(detailStartTime));
            wait.until(ExpectedConditions.visibilityOfElementLocated(estimateLocation));
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    public boolean hasRouteWithStatus(String status) {
        By routeCardWithStatus = By.xpath(
                "//button[contains(@style,'cursor: pointer') and .//div[starts-with(normalize-space(), 'LT')] and .//span[contains(normalize-space(), '"
                        + status + "')]]");
        try {
            return !driver.findElements(routeCardWithStatus).isEmpty();
        } catch (Exception e) {
            return false;
        }
    }

    public void selectRouteByStatus(String status) {
        By routeCardWithStatus = By.xpath(
                "(//button[contains(@style,'cursor: pointer') and .//div[starts-with(normalize-space(), 'LT')] and .//span[contains(normalize-space(), '"
                        + status + "')]])[1]");
        WebElement card = wait.until(ExpectedConditions.elementToBeClickable(routeCardWithStatus));
        
        ((JavascriptExecutor) driver).executeScript("arguments[0].click();", card);
    }

    public boolean isSelectedRouteStatus(String status) {
        By statusBadge = By.xpath(
                "//h3[contains(normalize-space(), 'Chi tiết lộ trình')]/following-sibling::span[contains(normalize-space(), '"
                        + status + "')]");
        try {
            return wait.until(ExpectedConditions.visibilityOfElementLocated(statusBadge)).isDisplayed();
        } catch (Exception e) {
            return false;
        }
    }

    public void enterSearchKeyword(String keyword) {
        WebElement input = wait.until(ExpectedConditions.visibilityOfElementLocated(searchInput));
        setReactInputValue(input, keyword);
        try { Thread.sleep(1000); } catch (InterruptedException e) { e.printStackTrace(); }
    }

    public void clearSearchKeyword() {
        WebElement input = wait.until(ExpectedConditions.visibilityOfElementLocated(searchInput));
        setReactInputValue(input, "");
        try { Thread.sleep(1000); } catch (InterruptedException e) { e.printStackTrace(); }
    }

    private void setReactInputValue(WebElement element, String value) {
        JavascriptExecutor js = (JavascriptExecutor) driver;
        js.executeScript(
            "const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;" +
            "nativeInputValueSetter.call(arguments[0], arguments[1]);" +
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

    public boolean hasCompletedStop() {
        try {
            By completedLabel = By.xpath("//div[starts-with(normalize-space(), 'Đón:')]/following-sibling::div[starts-with(normalize-space(), 'Trả:')]/following-sibling::div[contains(normalize-space(), 'Đã trả khách')]");
            return !driver.findElements(completedLabel).isEmpty();
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

    public boolean isVehicleLocationDisplayed() {
        try {
            return wait.until(ExpectedConditions.visibilityOfElementLocated(estimateLocation)).isDisplayed();
        } catch (Exception e) {
            return false;
        }
    }
}
