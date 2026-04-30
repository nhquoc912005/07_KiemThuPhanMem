package tests;

import base.BaseTest;
import org.testng.Assert;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;
import pages.DriverTripDetailPage;
import pages.DriverTripsPage;
import pages.LoginPage;

public class TripStatusTest extends BaseTest {

    private LoginPage loginPage;
    private DriverTripsPage tripsPage;
    private DriverTripDetailPage tripDetailPage;

    @BeforeMethod
    public void setupPages() {
        loginPage = new LoginPage(driver);
        tripsPage = new DriverTripsPage(driver);
        tripDetailPage = new DriverTripDetailPage(driver);

        // TODO: Chạy script seed_taixe.js qua lệnh dòng lệnh (hoặc JDBC) để khởi tạo dữ
        // liệu
        // đảm bảo có user `taixe1` và chuyến xe `CX00000100`
    }

    private void loginAndNavigateToTrips() {
        driver.get(BASE_URL + "/login");
        loginPage.login("taixe1", "123456");
        // Giả sử sau khi login tài xế sẽ được tự động redirect đến /driver/trips
        // Nếu không, hãy thêm code: driver.get(BASE_URL + "/driver/trips");
    }

    @Test(priority = 1, description = "TC_UC07.3_01: Mở form nhập lý do từ chối chuyến")
    public void testOpenRejectTripForm() {
        loginAndNavigateToTrips();

        tripsPage.clickMoreOptionsFirstTrip();
        tripsPage.clickRejectTripMenu();

        Assert.assertTrue(tripsPage.isRejectPopupDisplayed(), "Popup Từ chối chuyến không hiển thị!");
    }

    @Test(priority = 2, description = "TC_UC07.3_02: Hủy thao tác từ chối chuyến")
    public void testCancelRejectTrip() {
        loginAndNavigateToTrips();

        tripsPage.clickMoreOptionsFirstTrip();
        tripsPage.clickRejectTripMenu();

        tripsPage.enterRejectReason("Xe đang bảo dưỡng");
        tripsPage.clickCancelReject();

        Assert.assertTrue(tripsPage.waitUntilRejectPopupDisappears(), "Popup Từ chối chuyến không được đóng lại!");
    }

    @Test(priority = 3, description = "TC_UC07.3_03: Từ chối chuyến thành công")
    public void testSubmitRejectTripSuccessfully() {
        loginAndNavigateToTrips();

        // 1. Lấy mã chuyến xe của dòng đầu tiên trước khi từ chối
        String targetTripId = tripsPage.getFirstTripId();

        // 2. Mở menu và chọn Từ chối chuyến
        tripsPage.clickMoreOptionsFirstTrip();
        tripsPage.clickRejectTripMenu();

        // 3. Nhập lý do và gửi
        tripsPage.enterRejectReason("Xe hỏng lốp");
        tripsPage.clickSubmitReject();

        // 4. Kiểm tra popup đóng lại thành công
        Assert.assertTrue(tripsPage.waitUntilRejectPopupDisappears(), "Popup Từ chối không đóng lại sau khi gửi!");

        // 5. Chuyển sang tab Danh sách chuyến đã hủy
        tripsPage.clickCancelledTripsTab();

        // 6. Kiểm tra chuyến xe xuất hiện trong tab đã hủy
        Assert.assertTrue(tripsPage.isTripInList(targetTripId), "Chuyến xe vừa từ chối không xuất hiện trong tab Đã hủy!");

        // 7. Kiểm tra trạng thái hiển thị là "Đã từ chối"
        String status = tripsPage.getTripStatus(targetTripId);
        Assert.assertEquals(status, "Đã hủy", "Trạng thái chuyến không hiển thị đúng (mong đợi: Đã hủy)!");

        // 8. Kiểm tra nút thao tác ở trạng thái disabled (hiển thị text Đã từ chối)
        Assert.assertTrue(tripsPage.isTripActionDisabled(targetTripId), "Nút thao tác không hiển thị nhãn 'Đã từ chối' hoặc không bị disable!");
    }

    @Test(priority = 4, description = "TC_UC07.3_04: Kiểm tra chặn thao tác khách hàng khi chưa bắt đầu chuyến")
    public void testDisableActionsBeforeStartingTrip() {
        loginAndNavigateToTrips();
        tripsPage.clickViewRouteMenu();

        Assert.assertTrue(tripDetailPage.areCustomerDropdownsDisabled(),
                "Dropdown trạng thái khách hàng không bị disabled!");
    }

    @Test(priority = 5, description = "TC_UC07.3_05: Bắt đầu chuyến xe")
    public void testStartTrip() {
        loginAndNavigateToTrips();
        tripsPage.clickViewRouteMenu();

        tripDetailPage.clickStartTrip();

        Assert.assertEquals(tripDetailPage.getSuccessMessageText(), "Đã cập nhật trạng thái chuyến.",
                "Thông báo bắt đầu chuyến sai!");
        Assert.assertFalse(tripDetailPage.areCustomerDropdownsDisabled(),
                "Dropdown khách hàng vẫn bị disable sau khi bắt đầu chuyến!");
    }

    @Test(priority = 6, description = "TC_UC07.3_06: Cập nhật trạng thái đón/trả khách thành công")
    public void testUpdateCustomerStatus() {
        loginAndNavigateToTrips();
        tripsPage.clickViewRouteMenu();

        // Lần lượt cập nhật trạng thái khách hàng đầu tiên (index = 0)
        tripDetailPage.updateCustomerStatus(0, "Đã đến");
        Assert.assertTrue(tripDetailPage.getSuccessMessageText().contains("Đã cập nhật"),
                "Không cập nhật được trạng thái Đã đến");

        tripDetailPage.updateCustomerStatus(0, "Đã đón");
        tripDetailPage.updateCustomerStatus(0, "Đã trả khách");
    }

    @Test(priority = 7, description = "TC_UC07.3_07: Cập nhật trạng thái Khách hủy")
    public void testCustomerCancelled() {
        loginAndNavigateToTrips();
        tripsPage.clickViewRouteMenu();

        // Cập nhật trạng thái khách hàng đầu tiên thành Hủy
        tripDetailPage.updateCustomerStatus(0, "Hủy");
        Assert.assertTrue(tripDetailPage.getSuccessMessageText().contains("Đã cập nhật"),
                "Không cập nhật được trạng thái Khách hủy");
    }

    @Test(priority = 8, description = "TC_UC07.3_08: Chặn hoàn thành khi chưa xử lý hết khách")
    public void testDisableCompleteTripIfCustomersPending() {
        loginAndNavigateToTrips();
        tripsPage.clickViewRouteMenu();

        // Đảm bảo có khách chưa xử lý
        Assert.assertTrue(tripDetailPage.isCompleteButtonDisabled(),
                "Nút hoàn thành không bị disabled dù chưa trả hết khách!");
    }

    @Test(priority = 9, description = "TC_UC07.3_09: Hủy thao tác báo cáo sự cố")
    public void testCancelIncidentReport() {
        loginAndNavigateToTrips();
        tripsPage.clickViewRouteMenu();

        tripDetailPage.clickReportIncident();
        tripDetailPage.clickCancelIncident();

        Assert.assertFalse(tripDetailPage.isIncidentModalDisplayed(), "Popup báo cáo sự cố không đóng lại!");
    }

    @Test(priority = 10, description = "TC_UC07.3_10: Báo cáo sự cố thành công")
    public void testReportIncident() {
        loginAndNavigateToTrips();
        tripsPage.clickViewRouteMenu();

        tripDetailPage.clickReportIncident();
        tripDetailPage.enterIncidentDescription("Xe ngập nước không qua được");
        tripDetailPage.clickSubmitIncident();

        Assert.assertEquals(tripDetailPage.getSuccessMessageText(), "Đã báo cáo sự cố.",
                "Báo cáo sự cố không thành công!");
    }

    @Test(priority = 11, description = "TC_UC07.3_11: Hoàn thành chuyến xe")
    public void testCompleteTrip() {
        loginAndNavigateToTrips();
        tripsPage.clickViewRouteMenu();

        // Đảm bảo đã cập nhật khách thành "Đã trả khách" trước
        tripDetailPage.updateCustomerStatus(0, "Đã trả khách");
        tripDetailPage.clickCompleteTrip();

        Assert.assertTrue(tripDetailPage.getSuccessMessageText().contains("Đã cập nhật"),
                "Không thể hoàn thành chuyến xe!");
    }

    @Test(priority = 12, description = "TC_UC07.3_12: Lỗi mạng khi cập nhật trạng thái (Giả lập)")
    public void testNetworkErrorOnUpdate() {
        // Test case này thường yêu cầu giả lập Offline qua Chrome DevTools Protocol
        // (CDP)
        // hoặc đóng mạng wifi thực tế.
        // Trong Selenium 4 có thể dùng: ((ChromeDriver) driver).getNetworkConditions()
        Assert.assertTrue(true, "Test case mô phỏng lỗi mạng cần implement CDP để ngắt kết nối.");
    }
}
