package pages;

import org.openqa.selenium.By;
import org.openqa.selenium.JavascriptExecutor;
import org.openqa.selenium.Keys;
import org.openqa.selenium.NoSuchElementException;
import org.openqa.selenium.StaleElementReferenceException;
import org.openqa.selenium.TimeoutException;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

public class RoutePlanningPage {
    private static final String STEP_TICKETS = "Ch\u1ecdn v\u00e9";
    private static final String STEP_VEHICLE = "Ch\u1ecdn xe";
    private static final String STEP_DRIVER = "Ch\u1ecdn t\u00e0i x\u1ebf";
    private static final String STEP_CONFIRM = "X\u00e1c nh\u1eadn";
    private static final String VEHICLE_AVAILABLE_TEXT = "\u0110\u1ee7 \u0111i\u1ec1u ki\u1ec7n ph\u00e2n c\u00f4ng";
    private static final String UNAVAILABLE_TEXT = "Kh\u00f4ng kh\u1ea3 d\u1ee5ng";
    private static final String DRIVER_AVAILABLE_TEXT = "R\u1ea3nh";

    private final WebDriver driver;
    private final WebDriverWait wait;
    private final JavascriptExecutor js;

    private final By pageHeading = By.xpath("//h2[contains(normalize-space(.), 'L\u1eadp k\u1ebf ho\u1ea1ch')]");
    private final By stepProgress = By.cssSelector(".step-progress-wrapper");
    private final By searchInput = By.cssSelector("input[type='search']");
    private final By ticketCheckboxes = By.cssSelector(".table-responsive-container input[type='checkbox']");
    private final By ticketContainer = By.cssSelector(".table-responsive-container");
    private final By vehicleCards = By.cssSelector(".cards-grid > div");
    private final By driverCards = By.cssSelector(".cards-grid-drivers > div");
    private final By startTimeInput = By.cssSelector("input[type='datetime-local']");

    private final By nextToVehicleButton = buttonContaining("Ti\u1ebfp theo: Ch\u1ecdn xe trung chuy\u1ec3n");
    private final By nextToDriverButton = buttonContaining("Ti\u1ebfp theo: Ch\u1ecdn t\u00e0i x\u1ebf");
    private final By nextToConfirmButton = buttonContaining("Ti\u1ebfp theo: X\u00e1c nh\u1eadn t\u1ea1o l\u1ed9 tr\u00ecnh");
    private final By confirmCreateButton = buttonContaining("X\u00e1c nh\u1eadn t\u1ea1o l\u1ed9 tr\u00ecnh");
    private final By backButton = buttonContaining("Quay l\u1ea1i");
    private final By successTitle = By.xpath("//*[contains(normalize-space(.), 'T\u1ea1o l\u1ed9 tr\u00ecnh th\u00e0nh c\u00f4ng')]");

    public RoutePlanningPage(WebDriver driver) {
        this.driver = driver;
        this.wait = new WebDriverWait(driver, Duration.ofSeconds(15));
        this.js = (JavascriptExecutor) driver;
    }

    public void navigateToPlan(String baseUrl) {
        driver.get(baseUrl + "/dispatch/plan");
        wait.until(ExpectedConditions.urlContains("/dispatch/plan"));
        wait.until(ExpectedConditions.visibilityOfElementLocated(pageHeading));
        wait.until(ExpectedConditions.visibilityOfElementLocated(stepProgress));
        waitForTicketsStep();
    }

    public void searchTicket(String keyword) {
        setCurrentSearchValue(keyword);
        waitForTicketSearchSettled();
    }

    public void clearSearchTicket() {
        searchTicket("");
    }

    public int getTicketRowCount() {
        return driver.findElements(ticketCheckboxes).size();
    }

    public int getSelectedTicketCount() {
        int selected = 0;
        for (WebElement checkbox : driver.findElements(ticketCheckboxes)) {
            if (isChecked(checkbox)) {
                selected++;
            }
        }
        return selected;
    }

    public void selectFirstTicket() {
        selectTickets(1);
    }

    public void selectTickets(int count) {
        waitUntilTicketsAvailable();
        List<WebElement> checkboxes = driver.findElements(ticketCheckboxes);
        int selected = getSelectedTicketCount();

        for (WebElement checkbox : checkboxes) {
            if (selected >= count) {
                break;
            }

            if (!isChecked(checkbox)) {
                click(checkbox);
                selected++;
            }
        }

        int expected = Math.min(count, checkboxes.size());
        wait.until(driver -> getSelectedTicketCount() >= expected);
    }

    public boolean isNextToVehicleButtonDisplayed() {
        return isDisplayed(nextToVehicleButton);
    }

    public boolean isNextToVehicleButtonEnabled() {
        return isDisplayedAndEnabled(nextToVehicleButton);
    }

    public void clickNextToVehicle() {
        clickButton(nextToVehicleButton);
        waitForVehicleStep();
    }

    public void clickBackToTickets() {
        clickButton(backButton);
        waitForTicketsStep();
    }

    public boolean isTicketsStepDisplayed() {
        return pageContains(STEP_TICKETS) && isDisplayed(ticketContainer);
    }

    public String getFirstTicketCode() {
        String[] lines = firstTicketRowText().split("\\R+");
        for (String line : lines) {
            String trimmed = line.trim();
            if (trimmed.startsWith("VE")) {
                return trimmed;
            }
        }
        throw new NoSuchElementException("No ticket code found in first ticket row");
    }

    public String getFirstCustomerName() {
        String[] lines = firstTicketRowText().split("\\R+");
        if (lines.length < 2) {
            throw new NoSuchElementException("No customer name found in first ticket row");
        }
        return lines[1].trim();
    }

    public boolean isTicketInList(String text) {
        try {
            return driver.findElement(ticketContainer).getText().contains(text);
        } catch (NoSuchElementException e) {
            return false;
        }
    }

    public boolean isTicketNotFoundDisplayed() {
        return pageContains("Kh\u00f4ng t\u00ecm th\u1ea5y v\u00e9");
    }

    public void searchVehicle(String keyword) {
        waitForVehicleStep();
        setCurrentSearchValue(keyword);
        waitForVehicleSearchSettled();
    }

    public int getVehicleCardCount() {
        return driver.findElements(vehicleCards).size();
    }

    public String getFirstVehiclePlate() {
        String[] lines = firstVehicleCardText().split("\\R+");
        if (lines.length == 0 || lines[0].trim().isEmpty()) {
            throw new NoSuchElementException("No vehicle plate found");
        }
        return lines[0].trim();
    }

    public String getFirstVehicleType() {
        return valueAfterPrefix(firstVehicleCardText(), "Lo\u1ea1i xe:");
    }

    public boolean isVehicleInList(String text) {
        return cardsContain(vehicleCards, text);
    }

    public boolean isAnyVehicleAvailable() {
        return cardsContain(vehicleCards, VEHICLE_AVAILABLE_TEXT);
    }

    public boolean isAnyUnavailableVehicleDisplayed() {
        return cardsContain(vehicleCards, UNAVAILABLE_TEXT);
    }

    public boolean isVehicleNotFoundDisplayed() {
        return pageContains("Kh\u00f4ng t\u00ecm th\u1ea5y xe");
    }

    public void selectFirstAvailableVehicle() {
        waitForVehicleStep();
        WebElement card = firstCardContaining(vehicleCards, VEHICLE_AVAILABLE_TEXT);
        click(card);
        wait.until(driver -> isNextToDriverButtonEnabled());
    }

    public void selectFirstUnavailableVehicle() {
        waitForVehicleStep();
        WebElement card = firstCardContaining(vehicleCards, UNAVAILABLE_TEXT);
        click(card);
    }

    public boolean isNextToDriverButtonEnabled() {
        return isDisplayedAndEnabled(nextToDriverButton);
    }

    public void clickNextToDriver() {
        clickButton(nextToDriverButton);
        waitForDriverStep();
    }

    public boolean isVehicleStepDisplayed() {
        return pageContains(STEP_VEHICLE) && isDisplayed(searchInput);
    }

    public void searchDriver(String keyword) {
        waitForDriverStep();
        setCurrentSearchValue(keyword);
        waitForDriverSearchSettled();
    }

    public int getDriverCardCount() {
        return driver.findElements(driverCards).size();
    }

    public String getFirstDriverId() {
        return valueAfterPrefix(firstDriverCardText(), "M\u00e3:");
    }

    public String getFirstDriverName() {
        String[] lines = firstDriverCardText().split("\\R+");
        if (lines.length == 0 || lines[0].trim().isEmpty()) {
            throw new NoSuchElementException("No driver name found");
        }
        return lines[0].trim();
    }

    public boolean isDriverInList(String text) {
        return cardsContain(driverCards, text);
    }

    public boolean isAnyDriverAvailable() {
        return cardsContain(driverCards, DRIVER_AVAILABLE_TEXT);
    }

    public boolean isDriverNotFoundDisplayed() {
        return pageContains("Kh\u00f4ng t\u00ecm th\u1ea5y t\u00e0i x\u1ebf");
    }

    public void selectFirstAvailableDriver() {
        waitForDriverStep();
        WebElement card = firstCardContaining(driverCards, DRIVER_AVAILABLE_TEXT);
        click(card);
        wait.until(driver -> isNextToConfirmButtonEnabled());
    }

    public boolean isNextToConfirmButtonEnabled() {
        return isDisplayedAndEnabled(nextToConfirmButton);
    }

    public void clickNextToConfirm() {
        clickButton(nextToConfirmButton);
        waitForConfirmStep();
    }

    public void clickBackToVehicles() {
        clickButton(backButton);
        waitForVehicleStep();
    }

    public boolean isDriverStepDisplayed() {
        return pageContains(STEP_DRIVER) && isDisplayed(searchInput);
    }

    public boolean isConfirmStepDisplayed() {
        return isDisplayed(startTimeInput) && pageContains(STEP_CONFIRM);
    }

    public void setStartTimeToOneHourFromNow() {
        waitForConfirmStep();
        WebElement input = wait.until(ExpectedConditions.elementToBeClickable(startTimeInput));
        String formatted = LocalDateTime.now().plusHours(1).format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm"));
        js.executeScript(
            "const input = arguments[0];" +
            "const value = arguments[1];" +
            "const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;" +
            "setter.call(input, value);" +
            "input.dispatchEvent(new Event('input', { bubbles: true }));" +
            "input.dispatchEvent(new Event('change', { bubbles: true }));",
            input,
            formatted
        );
        wait.until(ExpectedConditions.attributeToBe(input, "value", formatted));
    }

    public void clickConfirmFinal() {
        clickButton(confirmCreateButton);
        wait.until(ExpectedConditions.visibilityOfElementLocated(successTitle));
    }

    public boolean isSuccessMessageDisplayed() {
        return isDisplayed(successTitle);
    }

    private void waitForTicketsStep() {
        wait.until(ExpectedConditions.visibilityOfElementLocated(searchInput));
        wait.until(driver -> getTicketRowCount() > 0 || isTicketNotFoundDisplayed());
    }

    private void waitForVehicleStep() {
        wait.until(driver -> pageContains(STEP_VEHICLE));
        wait.until(driver -> getVehicleCardCount() > 0 || isVehicleNotFoundDisplayed());
    }

    private void waitForDriverStep() {
        wait.until(driver -> pageContains(STEP_DRIVER));
        wait.until(driver -> getDriverCardCount() > 0 || isDriverNotFoundDisplayed());
    }

    private void waitForConfirmStep() {
        wait.until(ExpectedConditions.visibilityOfElementLocated(startTimeInput));
        wait.until(driver -> pageContains("L\u1ed9 tr\u00ecnh d\u1ef1 ki\u1ebfn"));
    }

    private void waitUntilTicketsAvailable() {
        wait.until(driver -> getTicketRowCount() > 0);
    }

    private void waitForTicketSearchSettled() {
        wait.until(driver -> getTicketRowCount() > 0 || isTicketNotFoundDisplayed());
    }

    private void waitForVehicleSearchSettled() {
        wait.until(driver -> getVehicleCardCount() > 0 || isVehicleNotFoundDisplayed());
    }

    private void waitForDriverSearchSettled() {
        wait.until(driver -> getDriverCardCount() > 0 || isDriverNotFoundDisplayed());
    }

    private void setCurrentSearchValue(String keyword) {
        WebElement input = visibleSearchInput();
        scrollTo(input);
        js.executeScript(
            "const input = arguments[0];" +
            "const value = arguments[1];" +
            "const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;" +
            "setter.call(input, value);" +
            "input.dispatchEvent(new Event('input', { bubbles: true }));" +
            "input.dispatchEvent(new Event('change', { bubbles: true }));",
            input,
            keyword
        );
        wait.until(driver -> isVisibleSearchValue(keyword));
    }

    private WebElement visibleSearchInput() {
        return wait.until(driver -> driver.findElements(searchInput)
            .stream()
            .filter(WebElement::isDisplayed)
            .findFirst()
            .orElse(null));
    }

    private boolean isVisibleSearchValue(String expectedValue) {
        try {
            return driver.findElements(searchInput)
                .stream()
                .filter(WebElement::isDisplayed)
                .anyMatch(element -> expectedValue.equals(element.getAttribute("value")));
        } catch (StaleElementReferenceException e) {
            return false;
        }
    }

    private void clickButton(By locator) {
        WebElement button = wait.until(ExpectedConditions.presenceOfElementLocated(locator));
        click(button);
    }

    private void click(WebElement element) {
        scrollTo(element);
        wait.until(ExpectedConditions.elementToBeClickable(element));
        js.executeScript("arguments[0].click();", element);
    }

    private void scrollTo(WebElement element) {
        js.executeScript("arguments[0].scrollIntoView({block: 'center', inline: 'nearest'});", element);
    }

    private boolean isDisplayed(By locator) {
        try {
            return driver.findElement(locator).isDisplayed();
        } catch (NoSuchElementException | TimeoutException e) {
            return false;
        }
    }

    private boolean isDisplayedAndEnabled(By locator) {
        try {
            WebElement element = driver.findElement(locator);
            return element.isDisplayed() && element.isEnabled();
        } catch (NoSuchElementException e) {
            return false;
        }
    }

    private boolean pageContains(String text) {
        return driver.getPageSource().contains(text);
    }

    private boolean isChecked(WebElement checkbox) {
        return Boolean.TRUE.equals(js.executeScript("return arguments[0].checked === true;", checkbox));
    }

    private String firstTicketRowText() {
        waitUntilTicketsAvailable();
        WebElement checkbox = driver.findElements(ticketCheckboxes).get(0);
        WebElement row = (WebElement) js.executeScript(
            "return arguments[0].closest('div[style*=\"grid-template-columns\"]');",
            checkbox
        );
        return row.getText();
    }

    private String firstVehicleCardText() {
        waitForVehicleStep();
        List<WebElement> cards = driver.findElements(vehicleCards);
        if (cards.isEmpty()) {
            throw new NoSuchElementException("No vehicle cards found");
        }
        return cards.get(0).getText();
    }

    private String firstDriverCardText() {
        waitForDriverStep();
        List<WebElement> cards = driver.findElements(driverCards);
        if (cards.isEmpty()) {
            throw new NoSuchElementException("No driver cards found");
        }
        return cards.get(0).getText();
    }

    private WebElement firstCardContaining(By locator, String text) {
        return wait.until(driver -> driver.findElements(locator)
            .stream()
            .filter(WebElement::isDisplayed)
            .filter(element -> element.getText().contains(text))
            .findFirst()
            .orElse(null));
    }

    private boolean cardsContain(By locator, String text) {
        return driver.findElements(locator)
            .stream()
            .filter(WebElement::isDisplayed)
            .anyMatch(element -> element.getText().contains(text));
    }

    private String valueAfterPrefix(String text, String prefix) {
        for (String line : text.split("\\R+")) {
            String trimmed = line.trim();
            if (trimmed.startsWith(prefix)) {
                return trimmed.substring(prefix.length()).trim();
            }
        }
        throw new NoSuchElementException("No value found after prefix: " + prefix);
    }

    private static By buttonContaining(String text) {
        return By.xpath("//button[contains(normalize-space(.), '" + text + "')]");
    }
}
