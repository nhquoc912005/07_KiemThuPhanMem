package tests;

import base.BaseTest;
import org.testng.Assert;
import org.testng.SkipException;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;
import pages.LoginPage;
import pages.TheoDoiTrangThaiTrungChuyenPage;

public class TheoDoiTrangThaiTrungChuyenTest extends BaseTest {
    private LoginPage loginPage;
    private TheoDoiTrangThaiTrungChuyenPage trackStatusPage;

    @BeforeMethod
    public void setupPages() {
        loginPage = new LoginPage(driver);
        trackStatusPage = new TheoDoiTrangThaiTrungChuyenPage(driver);
    }

    protected void loginAndNavigateToTrackStatus() {
        driver.get(BASE_URL + "/login");
        loginPage.login("dieuphoi1", "123456");
        
        // Mặc định login xong điều phối sẽ vào /dispatch. Ta navigate thẳng vào trang theo dõi
        driver.get(BASE_URL + "/dispatch/track");
        trackStatusPage.waitForPageLoaded();
    }

    private void selectRouteByStatusOrSkip(String status) {
        if (!trackStatusPage.hasRouteWithStatus(status)) {
            throw new SkipException("Không có lộ trình trạng thái: " + status);
        }
        trackStatusPage.selectRouteByStatus(status);
        
        // Đợi 1 giây để React gọi API và render lại cột chi tiết bên phải
        try { Thread.sleep(1000); } catch (InterruptedException e) {}
        
        // Cơ chế Double-Check phòng trường hợp click bị hụt
        if (!trackStatusPage.isSelectedRouteStatus(status)) {
            trackStatusPage.selectRouteByStatus(status);
            try { Thread.sleep(1000); } catch (InterruptedException e) {}
        }
        
        Assert.assertTrue(trackStatusPage.isSelectedRouteStatus(status),
                "Lỗi UI: Không thể chuyển sang lộ trình có trạng thái: " + status);
    }

    @Test(priority = 1, description = "TC_UC05.3_01: Truy cập chức năng")
    public void testAccessTrackStatusFunction() {
        loginAndNavigateToTrackStatus();
        
        Assert.assertTrue(trackStatusPage.isRouteListDisplayed(), "Hệ thống không hiển thị danh sách lộ trình!");
    }

    @Test(priority = 2, description = "TC_UC05.3_02: Xem chi tiết lộ trình")
    public void testViewRouteDetails() {
        loginAndNavigateToTrackStatus();
        
        if (!trackStatusPage.isRouteListDisplayed()) {
            throw new SkipException("Danh sách lộ trình trống, không thể thực hiện xem chi tiết!");
        }
        
        trackStatusPage.selectFirstRoute();
        Assert.assertTrue(trackStatusPage.isRouteDetailDisplayed(), 
            "Hệ thống không hiển thị đầy đủ thông tin chi tiết (trạng thái, vị trí xe, thời gian bắt đầu)!");
    }

    @Test(priority = 3, description = "TC_UC05.3_03: Theo dõi lộ trình 'Chưa thực hiện'")
    public void testTrackPendingRoute() {
        loginAndNavigateToTrackStatus();
        selectRouteByStatusOrSkip("Chưa thực hiện");
        
        Assert.assertTrue(trackStatusPage.isSelectedRouteStatus("Chưa thực hiện"), 
            "Hệ thống không hiển thị trạng thái 'Chưa thực hiện' trong chi tiết lộ trình!");
    }

    @Test(priority = 6, description = "TC_UC05.3_06: GPS cập nhật liên tục")
    public void testGPSRealTimeUpdate() {
        loginAndNavigateToTrackStatus();
        selectRouteByStatusOrSkip("Đang thực hiện");
        
        Assert.assertTrue(trackStatusPage.isSelectedRouteStatus("Đang thực hiện"), 
            "Hệ thống không hiển thị trạng thái 'Đang thực hiện' trong chi tiết lộ trình!");
            
        throw new SkipException("Không xác định (Not Applicable): Hệ thống không có thiết bị phần cứng GPS để theo dõi và cập nhật vị trí theo thời gian thực.");
    }

    @Test(priority = 4, description = "TC_UC05.3_04: Theo dõi lộ trình 'Đang thực hiện'")
    public void testTrackRunningRoute() {
        loginAndNavigateToTrackStatus();
        selectRouteByStatusOrSkip("Đang thực hiện");
        
        Assert.assertTrue(trackStatusPage.isSelectedRouteStatus("Đang thực hiện"), 
            "Hệ thống không hiển thị trạng thái 'Đang thực hiện' trong chi tiết lộ trình!");
            
        throw new SkipException("Không xác định (Not Applicable): Hệ thống chỉ hiển thị vị trí ước tính tĩnh, không có module GPS thật để lấy vị trí hiện tại của xe.");
    }

    @Test(priority = 5, description = "TC_UC05.3_05: Theo dõi lộ trình 'Hoàn thành'") //phải cho 1 chuyến hoàn thành có trạng thái đã trả
    public void testTrackCompletedRoute() {
        loginAndNavigateToTrackStatus();
        selectRouteByStatusOrSkip("Hoàn thành");
        
        Assert.assertTrue(trackStatusPage.isSelectedRouteStatus("Hoàn thành"), 
            "Hệ thống không hiển thị trạng thái 'Hoàn thành' trong chi tiết lộ trình!");
            
        Assert.assertTrue(trackStatusPage.hasCompletedStop(), 
            "Lỗi UI: Lộ trình đã hoàn thành nhưng không hiển thị vị trí cuối cùng là 'Đã trả khách'!");
    }

    @Test(priority = 7, description = "TC_UC05.3_07: Tìm kiếm lộ trình theo mã lộ trình")
    public void testSearchByRouteCode() {
        loginAndNavigateToTrackStatus();
        String keyword = "LT001"; // Mã chuẩn trong hệ thống luôn có định dạng LTxxx
        trackStatusPage.enterSearchKeyword(keyword);

        Assert.assertTrue(trackStatusPage.getDisplayedRouteCount() > 0, "Không tìm thấy kết quả nào cho mã lộ trình: " + keyword);
        Assert.assertTrue(trackStatusPage.doAllDisplayedRoutesContainKeyword(keyword), "Có kết quả không khớp với mã tìm kiếm!");
    }

    @Test(priority = 8, description = "TC_UC05.3_08: Tìm kiếm lộ trình theo biển số xe")
    public void testSearchByVehiclePlate() {
        loginAndNavigateToTrackStatus();
        String keyword = "51A"; // Test data
        trackStatusPage.enterSearchKeyword(keyword);

        if (trackStatusPage.getDisplayedRouteCount() > 0) {
            Assert.assertTrue(trackStatusPage.doAllDisplayedRoutesContainKeyword(keyword), "Hiển thị kết quả sai lệch với biển số xe tìm kiếm!");
        } else {
            Assert.assertTrue(trackStatusPage.isNoResultMessageDisplayed(), "Hệ thống không báo Không tìm thấy kết quả!");
        }
    }

    @Test(priority = 9, description = "TC_UC05.3_09: Tìm kiếm lộ trình theo tên tài xế")
    public void testSearchByDriverName() {
        loginAndNavigateToTrackStatus();
        String keyword = "Nguyễn Văn A"; 
        trackStatusPage.enterSearchKeyword(keyword);

        if (trackStatusPage.getDisplayedRouteCount() > 0) {
            Assert.assertTrue(trackStatusPage.doAllDisplayedRoutesContainKeyword(keyword), "Hiển thị kết quả sai lệch với tên tài xế tìm kiếm!");
        } else {
            Assert.assertTrue(trackStatusPage.isNoResultMessageDisplayed(), "Hệ thống không báo Không tìm thấy kết quả!");
        }
    }

    @Test(priority = 10, description = "TC_UC05.3_10: Tìm kiếm với từ khóa không tồn tại")
    public void testSearchByNonExistentKeyword() {
        loginAndNavigateToTrackStatus();
        String keyword = "KhongTonTai12345";
        trackStatusPage.enterSearchKeyword(keyword);

        boolean isListEmpty = trackStatusPage.getDisplayedRouteCount() == 0;
        boolean isMessageShown = trackStatusPage.isNoResultMessageDisplayed();

        Assert.assertTrue(isListEmpty || isMessageShown, 
                "Hệ thống vẫn hiển thị lộ trình hoặc không hiển thị thông báo 'Không tìm thấy lộ trình phù hợp.'!");
    }

    @Test(priority = 11, description = "TC_UC05.3_11: Xóa từ khóa sau khi tìm kiếm")
    public void testClearSearchKeyword() {
        loginAndNavigateToTrackStatus();
        
        int initialCount = trackStatusPage.getDisplayedRouteCount();
        Assert.assertTrue(initialCount > 0, "Danh sách ban đầu rỗng, không thể test!");

        // Tìm từ khóa hợp lệ để có kết quả
        trackStatusPage.enterSearchKeyword("LT0");
        Assert.assertTrue(trackStatusPage.getDisplayedRouteCount() > 0, "Không có kết quả nào cho từ khóa LT0!");

        // Xóa từ khóa
        trackStatusPage.clearSearchKeyword();
        
        // Kiểm tra phục hồi danh sách ban đầu
        int countAfterClear = trackStatusPage.getDisplayedRouteCount();
        Assert.assertEquals(countAfterClear, initialCount, "Không hiển thị lại toàn bộ danh sách ban đầu sau khi xóa tìm kiếm!");
    }
}
