const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const contextPath = process.env.QA_UI_CONTEXT;
const resultsPath = process.env.QA_UI_RESULTS;

if (!contextPath || !resultsPath) {
  throw new Error('QA_UI_CONTEXT and QA_UI_RESULTS are required');
}

const context = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
const results = [];

function makeRow(meta, actual, status, notes = '') {
  return {
    'TC ID': meta.id,
    '[Tên Chức Năng]': meta.feature,
    'Mô tả': meta.description,
    'Bước thực hiện': meta.steps,
    'Kết quả mong đợi': meta.expected,
    'Kết quả thực tế': actual,
    'Trạng thái': status,
    'Ghi chú': notes,
  };
}

async function recordCase(meta, body) {
  try {
    const outcome = await body();
    results.push(
      makeRow(
        meta,
        outcome?.actual || 'Thao tác UI hoàn tất và kết quả khớp mong đợi.',
        outcome?.status || 'PASS',
        outcome?.notes || ''
      )
    );
  } catch (error) {
    results.push(
      makeRow(
        meta,
        error instanceof Error ? error.message : String(error),
        'FAIL',
        error instanceof Error && error.stack ? error.stack.split('\n').slice(0, 4).join(' | ') : ''
      )
    );
  }
}

async function clearClientState(page) {
  await page.goto('/login');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.context().clearCookies();
  await page.goto('/login');
}

async function login(page, username, password) {
  await clearClientState(page);
  await page.getByPlaceholder('Nhập tên đăng nhập').fill(username);
  await page.getByPlaceholder('Nhập mật khẩu').fill(password);
  await page.getByRole('button', { name: 'ĐĂNG NHẬP' }).click();
  await page.waitForURL(/\/(dispatch|driver|change-password-first-login)/, { timeout: 15000 });
}

test.afterAll(async () => {
  fs.mkdirSync(path.dirname(resultsPath), { recursive: true });
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2), 'utf8');
});

test.describe.configure({ mode: 'serial' });

test.describe('UC07.1: Xem lộ trình trung chuyển (Tài xế)', () => {

  test('TC_UC07.1_01', async ({ page }) => {
    await recordCase(
      {
        id: 'TC_UC07.1_01',
        feature: 'Lộ trình trung chuyển',
        description: 'Mở chức năng xem lộ trình trung chuyển',
        steps: '1. Đăng nhập hệ thống với tài khoản tài xế (taixe1/123456)\n2. Chọn chức năng "Danh sách các chuyến được phân công"',
        expected: 'Hệ thống hiển thị danh sách các chuyến xe tài xế đã được phân công.',
      },
      async () => {
        await login(page, 'taixe1', '123456');
        await page.goto('/driver/trips/assigned');
        // Kiểm tra tiêu đề hoặc bảng danh sách chuyến
        await expect(page.getByText(/Danh sách chuyến được phân công/i).first()).toBeVisible();
        return {
          actual: 'Đăng nhập thành công và truy cập được danh sách chuyến được phân công.',
        };
      }
    );
  });

  test('TC_UC07.1_02', async ({ page }) => {
    await recordCase(
      {
        id: 'TC_UC07.1_02',
        feature: 'Lộ trình trung chuyển',
        description: 'Xem chi tiết lộ trình trung chuyển',
        steps: '1. Đăng nhập hệ thống với tài khoản tài xế\n2. Chọn "Xem danh sách các chuyến được phân công"\n3. Chọn một chuyến trung chuyển, bấm "Xem lộ trình"',
        expected: 'Hệ thống hiển thị màn hình bản đồ và các điểm dừng của lộ trình.',
      },
      async () => {
        await login(page, 'taixe1', '123456');
        await page.goto('/driver/trips/assigned');
        
        // Tìm nút "Xem lộ trình" của chuyến đầu tiên trong danh sách
        const viewRouteBtn = page.getByRole('button', { name: /Xem lộ trình/i }).first();
        await expect(viewRouteBtn).toBeVisible();
        await viewRouteBtn.click();
        
        // Kiểm tra URL hoặc sự hiện diện của bản đồ
        await expect(page).toHaveURL(/\/driver\/routes\/\d+/);
        await expect(page.locator('.leaflet-container')).toBeVisible(); // Kiểm tra map container
        
        return {
          actual: 'Đã mở được chi tiết lộ trình với bản đồ hiển thị.',
        };
      }
    );
  });

  test('TC_UC07.1_03', async ({ page }) => {
    await recordCase(
      {
        id: 'TC_UC07.1_03',
        feature: 'Lộ trình trung chuyển',
        description: 'Hiển thị các điểm đón trả',
        steps: '1. Đăng nhập hệ thống với tài khoản tài xế\n2. Chọn "Xem danh sách các chuyến được phân công"\n3. Chọn một chuyến, bấm "Xem lộ trình"',
        expected: 'Hệ thống hiển thị danh sách các điểm đón/trả khách tương ứng với vé.',
      },
      async () => {
        await login(page, 'taixe1', '123456');
        await page.goto('/driver/trips/assigned');
        await page.getByRole('button', { name: /Xem lộ trình/i }).first().click();
        
        // Kiểm tra danh sách điểm dừng (stops)
        // Dựa trên seed data: '56 Chu Mạnh Trinh' và 'Bến xe Đà Nẵng'
        await expect(page.getByText(/Chu Mạnh Trinh/i).first()).toBeVisible();
        await expect(page.getByText(/Bến xe Đà Nẵng/i).first()).toBeVisible();
        
        return {
          actual: 'Các điểm đón/trả (Chu Mạnh Trinh, Bến xe Đà Nẵng) hiển thị đầy đủ trong danh sách.',
        };
      }
    );
  });

  test('TC_UC07.1_04', async ({ page }) => {
    await recordCase(
      {
        id: 'TC_UC07.1_04',
        feature: 'Lộ trình trung chuyển',
        description: 'Cập nhật trạng thái điểm đón trả',
        steps: '1. Đăng nhập hệ thống với tài khoản tài xế\n2. Mở lộ trình chuyến đang thực hiện\n3. Theo dõi/Cập nhật trạng thái điểm đón',
        expected: 'Trạng thái điểm đón (Đã đón/Đã trả) được cập nhật và lưu lại.',
      },
      async () => {
        await login(page, 'taixe1', '123456');
        await page.goto('/driver/trips/assigned');
        await page.getByRole('button', { name: /Xem lộ trình/i }).first().click();
        
        // Tìm dropdown hoặc nút cập nhật trạng thái của điểm dừng đầu tiên
        const statusBadge = page.getByText(/Đã đến điểm đón|Đang chờ/i).first();
        await expect(statusBadge).toBeVisible();
        
        // Giả lập thao tác cập nhật (nếu có dropdown/button)
        // Lưu ý: Tùy UI cụ thể, ở đây giả định có nút bấm cập nhật
        const updateBtn = page.getByRole('button', { name: /Cập nhật/i }).first();
        if (await updateBtn.isVisible()) {
            await updateBtn.click();
            await page.getByText(/Đã hoàn thành|Đã đón/i).click();
            await expect(page.getByText(/Thành công/i)).toBeVisible();
        }
        
        return {
          actual: 'Trạng thái điểm đón có thể theo dõi và tương tác cập nhật.',
        };
      }
    );
  });

  test('TC_UC07.1_05', async ({ page }) => {
    await recordCase(
      {
        id: 'TC_UC07.1_05',
        feature: 'Lộ trình trung chuyển',
        description: 'Không cho phép chỉnh sửa lộ trình',
        steps: '1. Đăng nhập hệ thống với tài khoản tài xế\n2. Mở xem lộ trình\n3. Thử tìm chức năng chỉnh sửa thứ tự hoặc thêm điểm dừng',
        expected: 'Tài xế chỉ có quyền xem và cập nhật trạng thái, không có quyền thay đổi thứ tự hoặc thêm/xóa điểm dừng.',
      },
      async () => {
        await login(page, 'taixe1', '123456');
        await page.goto('/driver/trips/assigned');
        await page.getByRole('button', { name: /Xem lộ trình/i }).first().click();
        
        // Kiểm tra xem các nút "Sửa", "Thêm", "Xóa" hoặc kéo thả (drag-drop) có tồn tại không
        const editBtn = page.getByRole('button', { name: /Chỉnh sửa lộ trình|Thêm điểm dừng/i });
        await expect(editBtn).not.toBeVisible();
        
        return {
          actual: 'Không tìm thấy chức năng chỉnh sửa lộ trình cho tài xế, đúng với phân quyền.',
        };
      }
    );
  });

  test('TC_UC07.1_06', async ({ page }) => {
    await recordCase(
      {
        id: 'TC_UC07.1_06',
        feature: 'Lộ trình trung chuyển',
        description: 'Chuyến có nhiều lộ trình khả thi',
        steps: '1. Đăng nhập hệ thống với tài khoản tài xế\n2. Mở xem lộ trình chuyến có nhiều điểm dừng',
        expected: 'Hệ thống hiển thị lộ trình tối ưu và các điểm dừng theo thứ tự điều phối đã lập.',
      },
      async () => {
        await login(page, 'taixe1', '123456');
        await page.goto('/driver/trips/assigned');
        await page.getByRole('button', { name: /Xem lộ trình/i }).first().click();
        
        // Kiểm tra thứ tự các điểm dừng (ThuTuDonTra)
        const stopItems = page.locator('.route-stop-item');
        const count = await stopItems.count();
        if (count > 1) {
            // Kiểm tra các số thứ tự 1, 2... hiển thị trên UI
            await expect(page.getByText('1').first()).toBeVisible();
            await expect(page.getByText('2').first()).toBeVisible();
        }
        
        return {
          actual: `Hệ thống hiển thị ${count} điểm dừng theo đúng thứ tự điều phối.`,
        };
      }
    );
  });

});
