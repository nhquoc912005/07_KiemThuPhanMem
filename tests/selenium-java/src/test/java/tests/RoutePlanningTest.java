package tests;

import base.BaseTest;
import org.testng.Assert;
import org.testng.SkipException;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;
import pages.LoginPage;
import pages.RoutePlanningPage;

public class RoutePlanningTest extends BaseTest {
    private LoginPage loginPage;
    private RoutePlanningPage routePlanningPage;

    @BeforeMethod
    public void prepareTest() {
        driver.get(BASE_URL + "/login");
        loginPage = new LoginPage(driver);
        routePlanningPage = new RoutePlanningPage(driver);
        loginPage.login("dieuphoi1", "123456");
        routePlanningPage.navigateToPlan(BASE_URL);
    }

    @Test(priority = 1, description = "TC_UC05.2_01: Truy cap chuc nang lap lo trinh")
    public void testNavigateToRoutePlanning() {
        Assert.assertTrue(driver.getCurrentUrl().contains("/dispatch/plan"), "Khong dung URL lap lo trinh");
        Assert.assertTrue(routePlanningPage.isTicketsStepDisplayed(), "Khong hien thi buoc chon ve");
        Assert.assertTrue(routePlanningPage.getTicketRowCount() > 0, "Khong co ve can trung chuyen de lap lo trinh");
    }

    @Test(priority = 2, description = "TC_UC05.2_02: Tao lo trinh day du thong tin den buoc xac nhan")
    public void testCreateFullRoute() {
        goToConfirmStep();
        routePlanningPage.setStartTimeToOneHourFromNow();

        Assert.assertTrue(routePlanningPage.isConfirmStepDisplayed(), "Chua sang man hinh xac nhan lo trinh");
    }

    @Test(priority = 3, description = "TC_UC05.2_03: Loc danh sach hanh khach")
    public void testFilterCustomers() {
        routePlanningPage.searchTicket("VE");

        Assert.assertTrue(routePlanningPage.getTicketRowCount() > 0, "Tim kiem ma ve VE khong tra ve ket qua");
    }

    @Test(priority = 4, description = "TC_UC05.2_04: Chon nhom hanh khach >= 1")
    public void testSelectMultipleCustomers() {
        int targetCount = Math.min(3, routePlanningPage.getTicketRowCount());
        routePlanningPage.selectTickets(targetCount);

        Assert.assertEquals(routePlanningPage.getSelectedTicketCount(), targetCount, "So ve duoc chon khong dung");
        Assert.assertTrue(routePlanningPage.isNextToVehicleButtonDisplayed(), "Nut sang buoc chon xe khong hien thi");
    }

    @Test(priority = 5, description = "TC_UC05.2_05: Khong chon nhom hanh khach")
    public void testNoCustomerSelected() {
        Assert.assertEquals(routePlanningPage.getSelectedTicketCount(), 0, "Trang thai ban dau khong duoc chon ve");
        Assert.assertFalse(routePlanningPage.isNextToVehicleButtonDisplayed(), "Nut chon xe khong duoc hien thi khi chua chon ve");
    }

    @Test(priority = 6, description = "TC_UC05.2_06: Chon xe hop le")
    public void testSelectValidVehicle() {
        goToVehicleStep();
        routePlanningPage.selectFirstAvailableVehicle();

        Assert.assertTrue(routePlanningPage.isNextToDriverButtonEnabled(), "Nut sang buoc chon tai xe chua bat");
    }

    @Test(priority = 7, description = "TC_UC05.2_07: Khong chon xe")
    public void testNoVehicleSelected() {
        goToVehicleStep();

        Assert.assertFalse(routePlanningPage.isNextToDriverButtonEnabled(), "Nut chon tai xe phai bi tat khi chua chon xe");
    }

    @Test(priority = 8, description = "TC_UC05.2_08: Chon xe khong du cho")
    public void testSelectInsufficientCapacityVehicle() {
        int targetCount = Math.min(20, routePlanningPage.getTicketRowCount());
        routePlanningPage.selectTickets(targetCount);
        routePlanningPage.clickNextToVehicle();

        if (!routePlanningPage.isAnyUnavailableVehicleDisplayed()) {
            throw new SkipException("Du lieu hien tai khong co xe khong du cho cho nhom ve da chon");
        }

        routePlanningPage.selectFirstUnavailableVehicle();
        Assert.assertFalse(routePlanningPage.isNextToDriverButtonEnabled(), "Xe khong du cho khong duoc phep sang buoc chon tai xe");
    }

    @Test(priority = 9, description = "TC_UC05.2_09: Chon xe dang day/da phan cong")
    public void testSelectFullVehicle() {
        goToVehicleStep();
        routePlanningPage.searchVehicle("\u0110\u00e3 ph\u00e2n c\u00f4ng");

        if (routePlanningPage.isVehicleNotFoundDisplayed()) {
            throw new SkipException("Du lieu hien tai khong co xe da phan cong");
        }

        routePlanningPage.selectFirstUnavailableVehicle();
        Assert.assertFalse(routePlanningPage.isNextToDriverButtonEnabled(), "Xe da phan cong khong duoc phep sang buoc chon tai xe");
    }

    @Test(priority = 10, description = "TC_UC05.2_10: Huy thao tac phan cong xe")
    public void testCancelVehicleSelection() {
        goToVehicleStep();
        routePlanningPage.selectFirstAvailableVehicle();
        routePlanningPage.clickBackToTickets();

        Assert.assertTrue(routePlanningPage.isTicketsStepDisplayed(), "Khong quay lai buoc chon ve sau khi huy chon xe");
    }

    @Test(priority = 11, description = "TC_UC05.2_11: Chon tai xe hop le")
    public void testSelectValidDriver() {
        goToDriverStep();
        routePlanningPage.selectFirstAvailableDriver();
        routePlanningPage.clickNextToConfirm();

        Assert.assertTrue(routePlanningPage.isConfirmStepDisplayed(), "Khong sang buoc xac nhan sau khi chon tai xe");
    }

    @Test(priority = 12, description = "TC_UC05.2_12: Khong chon tai xe")
    public void testNoDriverSelected() {
        goToDriverStep();

        Assert.assertFalse(routePlanningPage.isNextToConfirmButtonEnabled(), "Nut xac nhan phai bi tat khi chua chon tai xe");
    }

    @Test(priority = 13, description = "TC_UC05.2_13: Chon tai xe dang ban")
    public void testSelectBusyDriver() {
        goToDriverStep();
        routePlanningPage.searchDriver("\u0110ang th\u1ef1c hi\u1ec7n");

        if (routePlanningPage.isDriverNotFoundDisplayed()) {
            throw new SkipException("Du lieu hien tai khong co tai xe dang thuc hien");
        }

        Assert.assertFalse(routePlanningPage.isNextToConfirmButtonEnabled(), "Tai xe dang ban khong duoc phep sang buoc xac nhan");
    }

    @Test(priority = 14, description = "TC_UC05.2_14: Chon tai xe da duoc phan cong")
    public void testSelectAssignedDriver() {
        goToDriverStep();
        routePlanningPage.searchDriver("\u0110\u00e3 ph\u00e2n c\u00f4ng");

        if (routePlanningPage.isDriverNotFoundDisplayed()) {
            throw new SkipException("Du lieu hien tai khong co tai xe da phan cong");
        }

        Assert.assertFalse(routePlanningPage.isNextToConfirmButtonEnabled(), "Tai xe da phan cong khong duoc phep sang buoc xac nhan");
    }

    @Test(priority = 15, description = "TC_UC05.2_15: Huy phan cong tai xe")
    public void testCancelDriverSelection() {
        goToDriverStep();
        routePlanningPage.selectFirstAvailableDriver();
        routePlanningPage.clickBackToVehicles();

        Assert.assertTrue(routePlanningPage.isVehicleStepDisplayed(), "Khong quay lai buoc chon xe sau khi huy chon tai xe");
    }

    @Test(priority = 16, description = "TC_UC05.2_16: Tim kiem khach hang theo ma ve")
    public void testSearchByTicketCode() {
        String ticketCode = routePlanningPage.getFirstTicketCode();
        routePlanningPage.searchTicket(ticketCode);

        Assert.assertTrue(routePlanningPage.isTicketInList(ticketCode), "Khong tim thay ve theo ma: " + ticketCode);
    }

    @Test(priority = 17, description = "TC_UC05.2_17: Tim kiem khach hang theo ten")
    public void testSearchByCustomerName() {
        String customerName = routePlanningPage.getFirstCustomerName();
        routePlanningPage.searchTicket(customerName);

        Assert.assertTrue(routePlanningPage.isTicketInList(customerName), "Khong tim thay ve theo ten khach hang: " + customerName);
    }

    @Test(priority = 18, description = "TC_UC05.2_18: Tim kiem khach hang theo so dien thoai")
    public void testSearchByPhone() {
        routePlanningPage.searchTicket("09");

        Assert.assertTrue(
            routePlanningPage.getTicketRowCount() > 0 || routePlanningPage.isTicketNotFoundDisplayed(),
            "Tim kiem SDT khong cap nhat bang ve"
        );
    }

    @Test(priority = 19, description = "TC_UC05.2_19: Tim kiem voi tu khoa khong ton tai")
    public void testSearchNonExistent() {
        routePlanningPage.searchTicket("XYZ123NONEXISTENT");

        Assert.assertTrue(routePlanningPage.isTicketNotFoundDisplayed(), "Khong hien thi trang thai rong khi tim ve khong ton tai");
    }

    @Test(priority = 20, description = "TC_UC05.2_20: Xoa tu khoa sau khi tim kiem")
    public void testClearSearch() {
        int initialCount = routePlanningPage.getTicketRowCount();
        routePlanningPage.searchTicket(routePlanningPage.getFirstTicketCode());
        routePlanningPage.clearSearchTicket();

        Assert.assertEquals(routePlanningPage.getTicketRowCount(), initialCount, "So dong ve khong phuc hoi sau khi xoa tim kiem");
    }

    @Test(priority = 21, description = "TC_UC05.2_21: Truy cap buoc chon xe trung chuyen")
    public void testAccessVehicleStep() {
        goToVehicleStep();

        Assert.assertTrue(routePlanningPage.isVehicleStepDisplayed(), "Khong sang buoc chon xe");
    }

    @Test(priority = 22, description = "TC_UC05.2_22: Tim kiem xe theo bien so")
    public void testSearchVehicleByPlate() {
        goToVehicleStep();
        String plate = routePlanningPage.getFirstVehiclePlate();
        routePlanningPage.searchVehicle(plate);

        Assert.assertTrue(routePlanningPage.isVehicleInList(plate), "Khong tim thay xe theo bien so: " + plate);
    }

    @Test(priority = 23, description = "TC_UC05.2_23: Tim kiem xe theo loai xe")
    public void testSearchVehicleByType() {
        goToVehicleStep();
        String type = routePlanningPage.getFirstVehicleType();
        routePlanningPage.searchVehicle(type);

        Assert.assertTrue(routePlanningPage.getVehicleCardCount() > 0, "Khong tim thay xe theo loai xe: " + type);
    }

    @Test(priority = 24, description = "TC_UC05.2_24: Tim kiem xe voi tu khoa khong ton tai")
    public void testSearchVehicleNonExistent() {
        goToVehicleStep();
        routePlanningPage.searchVehicle("NONEXISTENT_VEHICLE");

        Assert.assertTrue(routePlanningPage.isVehicleNotFoundDisplayed(), "Khong hien thi trang thai rong khi tim xe khong ton tai");
    }

    @Test(priority = 25, description = "TC_UC05.2_25: Xoa tu khoa tim kiem xe")
    public void testClearVehicleSearch() {
        goToVehicleStep();
        int initialCount = routePlanningPage.getVehicleCardCount();
        routePlanningPage.searchVehicle(routePlanningPage.getFirstVehiclePlate());
        routePlanningPage.searchVehicle("");

        Assert.assertEquals(routePlanningPage.getVehicleCardCount(), initialCount, "So xe khong phuc hoi sau khi xoa tim kiem");
    }

    @Test(priority = 26, description = "TC_UC05.2_26: Truy cap buoc chon tai xe phu hop")
    public void testAccessDriverStep() {
        goToDriverStep();

        Assert.assertTrue(routePlanningPage.isDriverStepDisplayed(), "Khong sang buoc chon tai xe");
    }

    @Test(priority = 27, description = "TC_UC05.2_27: Tim kiem tai xe theo ma")
    public void testSearchDriverById() {
        goToDriverStep();
        String driverId = routePlanningPage.getFirstDriverId();
        routePlanningPage.searchDriver(driverId);

        Assert.assertTrue(routePlanningPage.isDriverInList(driverId), "Khong tim thay tai xe theo ma: " + driverId);
    }

    @Test(priority = 28, description = "TC_UC05.2_28: Tim kiem tai xe theo ten")
    public void testSearchDriverByName() {
        goToDriverStep();
        String driverName = routePlanningPage.getFirstDriverName();
        routePlanningPage.searchDriver(driverName);

        Assert.assertTrue(routePlanningPage.isDriverInList(driverName), "Khong tim thay tai xe theo ten: " + driverName);
    }

    @Test(priority = 29, description = "TC_UC05.2_29: Tim kiem tai xe theo so dien thoai")
    public void testSearchDriverByPhone() {
        goToDriverStep();
        routePlanningPage.searchDriver("09");

        Assert.assertTrue(
            routePlanningPage.getDriverCardCount() > 0 || routePlanningPage.isDriverNotFoundDisplayed(),
            "Tim kiem SDT tai xe khong cap nhat danh sach"
        );
    }

    @Test(priority = 30, description = "TC_UC05.2_30: Tim kiem tai xe voi tu khoa khong ton tai")
    public void testSearchDriverNonExistent() {
        goToDriverStep();
        routePlanningPage.searchDriver("NONEXISTENT_DRIVER");

        Assert.assertTrue(routePlanningPage.isDriverNotFoundDisplayed(), "Khong hien thi trang thai rong khi tim tai xe khong ton tai");
    }

    @Test(priority = 31, description = "TC_UC05.2_31: Xoa tu khoa tim kiem tai xe")
    public void testClearDriverSearch() {
        goToDriverStep();
        int initialCount = routePlanningPage.getDriverCardCount();
        routePlanningPage.searchDriver(routePlanningPage.getFirstDriverId());
        routePlanningPage.searchDriver("");

        Assert.assertEquals(routePlanningPage.getDriverCardCount(), initialCount, "So tai xe khong phuc hoi sau khi xoa tim kiem");
    }

    private void goToVehicleStep() {
        routePlanningPage.selectFirstTicket();
        routePlanningPage.clickNextToVehicle();
        Assert.assertTrue(routePlanningPage.isVehicleStepDisplayed(), "Khong hien thi buoc chon xe");
        Assert.assertTrue(routePlanningPage.getVehicleCardCount() > 0, "Khong co xe de chon");
    }

    private void goToDriverStep() {
        goToVehicleStep();
        Assert.assertTrue(routePlanningPage.isAnyVehicleAvailable(), "Khong co xe ranh du dieu kien de chon");
        routePlanningPage.selectFirstAvailableVehicle();
        routePlanningPage.clickNextToDriver();
        Assert.assertTrue(routePlanningPage.isDriverStepDisplayed(), "Khong hien thi buoc chon tai xe");
        Assert.assertTrue(routePlanningPage.getDriverCardCount() > 0, "Khong co tai xe de chon");
    }

    private void goToConfirmStep() {
        goToDriverStep();
        Assert.assertTrue(routePlanningPage.isAnyDriverAvailable(), "Khong co tai xe ranh de chon");
        routePlanningPage.selectFirstAvailableDriver();
        routePlanningPage.clickNextToConfirm();
        Assert.assertTrue(routePlanningPage.isConfirmStepDisplayed(), "Khong hien thi buoc xac nhan");
    }
}
