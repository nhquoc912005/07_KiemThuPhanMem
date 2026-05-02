package tests;

import base.BaseTest;
import org.testng.Assert;
import org.testng.SkipException;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;
import pages.LoginPage;
import pages.DieuChinhLoTrinhPage;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

public class DieuChinhLoTrinhTest extends BaseTest {
    private LoginPage loginPage;
    private DieuChinhLoTrinhPage adjustRoutePage;

    @BeforeMethod
    public void setupPages() {
        loginPage = new LoginPage(driver);
        adjustRoutePage = new DieuChinhLoTrinhPage(driver);
    }

    protected void loginAndNavigateToAdjustRoute() {
        driver.get(BASE_URL + "/login");
        loginPage.login("dieuphoi1", "123456");
        
        driver.get(BASE_URL + "/dispatch/adjust");
        adjustRoutePage.waitForPageLoaded();
    }
    
    private void selectRouteByStatusOrSkip(String status) {
        if (!adjustRoutePage.hasRouteWithStatus(status)) {
            throw new SkipException("Không có lộ trình trạng thái: " + status);
        }
        adjustRoutePage.selectRouteByStatus(status);
        
        try { Thread.sleep(1000); } catch (InterruptedException e) {}
        
        if (!adjustRoutePage.isSelectedRouteStatus(status)) {
            adjustRoutePage.selectRouteByStatus(status);
            try { Thread.sleep(1000); } catch (InterruptedException e) {}
        }
        
        Assert.assertTrue(adjustRoutePage.isSelectedRouteStatus(status),
                "Lỗi UI: Không thể chuyển sang lộ trình có trạng thái: " + status);
    }

    private String getFutureTime() {
        return LocalDateTime.now().plusDays(5).format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm"));
    }

    private String getPastTime() {
        return LocalDateTime.now().minusHours(2).format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm"));
    }

    @Test(priority = 1, description = "TC_UC05.1_01: Truy cập chức năng điều chỉnh lộ trình")
    public void testAccessAdjustRouteFunction() {
        loginAndNavigateToAdjustRoute();
        Assert.assertTrue(adjustRoutePage.isRouteListDisplayed(), "Hệ thống không hiển thị danh sách lộ trình!");
    }

    @Test(priority = 2, description = "TC_UC05.1_02: Chọn lộ trình cần điều chỉnh")
    public void testSelectRouteToAdjust() {
        loginAndNavigateToAdjustRoute();
        
        if (!adjustRoutePage.isRouteListDisplayed()) {
            throw new SkipException("Danh sách lộ trình trống!");
        }
        
        adjustRoutePage.selectFirstRoute();
        Assert.assertTrue(adjustRoutePage.isRouteDetailDisplayed(), 
            "Hệ thống không hiển thị đầy đủ thông tin chi tiết!");
    }

    @Test(priority = 3, description = "TC_UC05.1_03: Thay đổi thông tin")
    public void testChangeInfoAndConfirm() {
        loginAndNavigateToAdjustRoute();
        selectRouteByStatusOrSkip("Đang thực hiện");
        
        String routeId = adjustRoutePage.getSelectedRouteId();
        String newNote = "Cập nhật ghi chú " + System.currentTimeMillis();
        adjustRoutePage.updateNote(newNote);
        
        adjustRoutePage.clickUpdate();
        
        if (adjustRoutePage.isConfirmModalDisplayed()) {
            adjustRoutePage.confirmModal();
        }
        
        try { Thread.sleep(1500); } catch (InterruptedException e) {}
        
        driver.navigate().refresh();
        adjustRoutePage.waitForPageLoaded();
        adjustRoutePage.selectRouteById(routeId);
        Assert.assertEquals(adjustRoutePage.getNote(), newNote, "Dữ liệu không được lưu vào hệ thống sau khi tải lại trang!");
    }

    @Test(priority = 4, description = "TC_UC05.1_04: Hủy sau cảnh báo")
    public void testCancelAfterWarning() {
        loginAndNavigateToAdjustRoute();
        selectRouteByStatusOrSkip("Đang thực hiện");
        
        String routeId = adjustRoutePage.getSelectedRouteId();
        String originalNote = adjustRoutePage.getNote();
        String newNote = "Thử hủy cập nhật " + System.currentTimeMillis();
        adjustRoutePage.updateNote(newNote);
        
        adjustRoutePage.clickUpdate();
        
        Assert.assertTrue(adjustRoutePage.isConfirmModalDisplayed(), "Không hiện modal cảnh báo!");
        adjustRoutePage.cancelModal();
        
        Assert.assertEquals(adjustRoutePage.getNote(), newNote, "Dữ liệu trên form bị reset không đúng mong đợi!");
        
        driver.navigate().refresh();
        adjustRoutePage.waitForPageLoaded();
        adjustRoutePage.selectRouteById(routeId);
        
        Assert.assertNotEquals(adjustRoutePage.getNote(), newNote, "Dữ liệu bị lưu trái phép dù đã nhấn Hủy!");
        Assert.assertEquals(adjustRoutePage.getNote(), originalNote, "Dữ liệu gốc bị mất!");
    }

    @Test(priority = 5, description = "TC_UC05.1_05: Hủy chỉnh sửa lộ trình")
    public void testCancelEditRoute() {
        loginAndNavigateToAdjustRoute();
        selectRouteByStatusOrSkip("Chưa thực hiện");
        
        String originalNote = adjustRoutePage.getNote();
        adjustRoutePage.updateNote("Hủy trực tiếp " + System.currentTimeMillis());
        
        adjustRoutePage.clickCancel();
        
        Assert.assertEquals(adjustRoutePage.getNote(), originalNote, "Dữ liệu không được khôi phục về ban đầu sau khi nhấn Hủy!");
    }

    @Test(priority = 6, description = "TC_UC05.1_06: Thay đổi thời gian bắt đầu ở quá khứ ở trạng thái 'Đang thực hiện'")
    public void testPastTimeInProgressRoute() {
        loginAndNavigateToAdjustRoute();
        selectRouteByStatusOrSkip("Đang thực hiện");
        
        adjustRoutePage.updateStartTime(getPastTime());
        adjustRoutePage.clickUpdate();
        
        Assert.assertTrue(adjustRoutePage.isErrorMessageDisplayed("Thời gian không hợp lệ"), 
            "Không hiển thị lỗi 'Thời gian không hợp lệ' khi chọn quá khứ!");
    }

    @Test(priority = 7, description = "TC_UC05.1_07: Thay đổi thời gian bắt đầu hợp lệ ở trạng thái chưa thực hiện")
    public void testValidTimePendingRoute() {
        loginAndNavigateToAdjustRoute();
        selectRouteByStatusOrSkip("Chưa thực hiện");
        
        String routeId = adjustRoutePage.getSelectedRouteId();
        String futureTime = getFutureTime();
        adjustRoutePage.updateStartTime(futureTime);
        adjustRoutePage.clickUpdate();
        
        try { Thread.sleep(1500); } catch (InterruptedException e) {}
        
        driver.navigate().refresh();
        adjustRoutePage.waitForPageLoaded();
        adjustRoutePage.selectRouteById(routeId);
        Assert.assertEquals(adjustRoutePage.getStartTime(), futureTime, "Thời gian không được lưu vào hệ thống sau khi tải lại trang!");
    }

    @Test(priority = 8, description = "TC_UC05.1_08: Thay đổi tài xế")
    public void testChangeDriver() {
        loginAndNavigateToAdjustRoute();
        selectRouteByStatusOrSkip("Chưa thực hiện");
        
        Assert.assertTrue(adjustRoutePage.isDriverInputReadOnly(), "Input tài xế không ở chế độ chỉ đọc. Theo thiết kế hiện tại, tài xế không thể được cập nhật từ màn hình này!");
        Assert.fail("Theo thiết kế phần mềm hiện tại, chức năng thay đổi tài xế không được hỗ trợ tại trang Điều chỉnh lộ trình (Input bị readOnly). Test case failed theo requirement.");
    }

    @Test(priority = 9, description = "TC_UC05.1_09: Thay đổi thời gian bắt đầu ở quá khứ ở trạng thái 'Chưa thực hiện'")
    public void testPastTimePendingRoute() {
        loginAndNavigateToAdjustRoute();
        selectRouteByStatusOrSkip("Chưa thực hiện");
        
        adjustRoutePage.updateStartTime(getPastTime());
        adjustRoutePage.clickUpdate();
        
        Assert.assertTrue(adjustRoutePage.isErrorMessageDisplayed("Thời gian không hợp lệ"), 
            "Không hiển thị lỗi 'Thời gian không hợp lệ'!");
    }


    @Test(priority = 10, description = "TC_UC05.1_10: Thay đổi thời gian bắt đầu hợp lệ ở trạng thái đang thực hiện")
    public void testValidTimeInProgressRoute() {
        loginAndNavigateToAdjustRoute();
        selectRouteByStatusOrSkip("Đang thực hiện");
        
        String routeId = adjustRoutePage.getSelectedRouteId();
        String futureTime = getFutureTime();
        adjustRoutePage.updateStartTime(futureTime);
        adjustRoutePage.clickUpdate();
        
        if (adjustRoutePage.isConfirmModalDisplayed()) {
            adjustRoutePage.confirmModal();
        }
        
        try { Thread.sleep(1500); } catch (InterruptedException e) {}
        
        driver.navigate().refresh();
        adjustRoutePage.waitForPageLoaded();
        adjustRoutePage.selectRouteById(routeId);
        Assert.assertEquals(adjustRoutePage.getStartTime(), futureTime, "Thời gian không được lưu vào hệ thống sau khi tải lại trang!");
    }

    @Test(priority = 11, description = "TC_UC05.1_11: Không cho thay đổi thông tin khi lộ trình đã ở trạng thái hoàn thành")
    public void testCannotEditCompletedRoute() {
        loginAndNavigateToAdjustRoute();
        selectRouteByStatusOrSkip("Hoàn thành");
        
        adjustRoutePage.updateNote("Thử cập nhật lộ trình đã hoàn thành " + System.currentTimeMillis());
        adjustRoutePage.clickUpdate();
        
        Assert.assertTrue(adjustRoutePage.isErrorMessageDisplayed(), "Hệ thống cho phép cập nhật lộ trình Hoàn thành mà không báo lỗi!");
    }

    @Test(priority = 12, description = "TC_UC05.1_12: Tìm kiếm lộ trình theo mã lộ trình")
    public void testSearchByRouteCode() {
        loginAndNavigateToAdjustRoute();
        String keyword = "LT00"; 
        adjustRoutePage.enterSearchKeyword(keyword);

        Assert.assertTrue(adjustRoutePage.getDisplayedRouteCount() > 0, "Không tìm thấy kết quả nào cho mã lộ trình: " + keyword);
        Assert.assertTrue(adjustRoutePage.doAllDisplayedRoutesContainKeyword(keyword), "Có kết quả không khớp với mã tìm kiếm!");
    }

    @Test(priority = 13, description = "TC_UC05.1_13: Tìm kiếm lộ trình theo biển số xe")
    public void testSearchByVehiclePlate() {
        loginAndNavigateToAdjustRoute();
        String keyword = "51A"; 
        adjustRoutePage.enterSearchKeyword(keyword);

        if (adjustRoutePage.getDisplayedRouteCount() > 0) {
            Assert.assertTrue(adjustRoutePage.doAllDisplayedRoutesContainKeyword(keyword), "Hiển thị kết quả sai lệch với biển số xe!");
        } else {
            Assert.assertTrue(adjustRoutePage.isNoResultMessageDisplayed(), "Hệ thống không báo Không tìm thấy kết quả!");
        }
    }

    @Test(priority = 14, description = "TC_UC05.1_14: Tìm kiếm lộ trình theo tên tài xế")
    public void testSearchByDriverName() {
        loginAndNavigateToAdjustRoute();
        String keyword = "Nguyễn"; 
        adjustRoutePage.enterSearchKeyword(keyword);

        if (adjustRoutePage.getDisplayedRouteCount() > 0) {
            Assert.assertTrue(adjustRoutePage.doAllDisplayedRoutesContainKeyword(keyword), "Hiển thị kết quả sai lệch với tên tài xế!");
        } else {
            Assert.assertTrue(adjustRoutePage.isNoResultMessageDisplayed(), "Hệ thống không báo Không tìm thấy kết quả!");
        }
    }

    @Test(priority = 15, description = "TC_UC05.1_15: Tìm kiếm với từ khóa không tồn tại")
    public void testSearchByNonExistentKeyword() {
        loginAndNavigateToAdjustRoute();
        String keyword = "KhongTonTai12345";
        adjustRoutePage.enterSearchKeyword(keyword);

        boolean isListEmpty = adjustRoutePage.getDisplayedRouteCount() == 0;
        boolean isMessageShown = adjustRoutePage.isNoResultMessageDisplayed();

        Assert.assertTrue(isListEmpty || isMessageShown, 
                "Hệ thống vẫn hiển thị lộ trình hoặc không hiển thị thông báo 'Không tìm thấy lộ trình phù hợp.'!");
    }

    @Test(priority = 16, description = "TC_UC05.1_16: Xóa từ khóa sau khi tìm kiếm")
    public void testClearSearchKeyword() {
        loginAndNavigateToAdjustRoute();
        
        int initialCount = adjustRoutePage.getDisplayedRouteCount();
        Assert.assertTrue(initialCount > 0, "Danh sách ban đầu rỗng, không thể test!");

        adjustRoutePage.enterSearchKeyword("LT0");
        Assert.assertTrue(adjustRoutePage.getDisplayedRouteCount() > 0, "Không có kết quả nào cho từ khóa LT0!");

        adjustRoutePage.clearSearchKeyword();
        
        int countAfterClear = adjustRoutePage.getDisplayedRouteCount();
        Assert.assertEquals(countAfterClear, initialCount, "Không hiển thị lại toàn bộ danh sách ban đầu sau khi xóa tìm kiếm!");
    }
}
