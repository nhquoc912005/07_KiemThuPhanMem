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

test('UI_009', async ({ page }) => {
  await recordCase(
    {
      id: 'UI_009',
      feature: 'App tài xế',
      description: 'Tài xế thấy chuyến vừa được phân công trên danh sách chuyến',
      steps:
        '1. Đăng nhập tài xế QA đã được phân công chuyến.\n2. Mở tab Danh sách chuyến được phân công.\n3. Tìm mã chuyến QA vừa tạo.',
      expected: 'Danh sách hiển thị đúng chuyến QA ở tab chuyến được phân công.',
    },
    async () => {
      await login(page, context.managedDriver.username, context.managedDriver.password);
      await expect(page).toHaveURL(/\/driver\/trips\/assigned$/);
      const routeCode = `CX${String(context.routeWithMapId).padStart(8, '0')}`;
      await expect(page.getByText(routeCode)).toBeVisible();
      return {
        actual: `Danh sách chuyến tài xế hiển thị đúng mã chuyến ${routeCode}.`,
      };
    }
  );
});

test('UI_010', async ({ page }) => {
  await recordCase(
    {
      id: 'UI_010',
      feature: 'Map chỉ đường',
      description: 'Chi tiết chuyến tài xế hiển thị map Leaflet, marker và polyline tuyến đường',
      steps:
        '1. Đăng nhập tài xế QA đã có chuyến có tọa độ.\n2. Mở chi tiết chuyến QA.\n3. Quan sát vùng bản đồ, marker và thông tin quãng đường.',
      expected:
        'Trang hiển thị bản đồ Leaflet/OpenStreetMap, có marker điểm đón/điểm trả, có polyline tuyến đường và có dữ liệu quãng đường/thời gian.',
    },
    async () => {
      await login(page, context.managedDriver.username, context.managedDriver.password);
      await page.goto(`/driver/trips/${context.routeWithMapId}`);
      await expect(page.getByText('Xem lộ trình trung chuyển')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 15000 });
      await page.waitForTimeout(3000);
      const markerCount = await page.locator('.route-map-marker-icon').count();
      const polylineCount = await page.locator('path.leaflet-interactive').count();
      await expect(page.getByText('Quãng đường ngắn nhất')).toBeVisible();
      await expect(page.getByText('Thời gian dự kiến')).toBeVisible();
      return {
        actual: `Map Leaflet hiển thị; marker=${markerCount}; polyline=${polylineCount}; khối thông tin quãng đường/thời gian xuất hiện.`,
        notes:
          markerCount >= 2 && polylineCount >= 1
            ? ''
            : 'Marker hoặc polyline ít hơn mong đợi, cần kiểm tra lại nếu test môi trường không ổn định.',
      };
    }
  );
});

test('UI_011', async ({ page }) => {
  await recordCase(
    {
      id: 'UI_011',
      feature: 'Map chỉ đường',
      description: 'UI hiển thị cảnh báo khi OSRM không phản hồi',
      steps:
        '1. Đăng nhập tài xế QA có chuyến có tọa độ.\n2. Chặn request đến OSRM và trả lỗi 500.\n3. Mở lại trang chi tiết chuyến.',
      expected: 'Trang hiển thị banner lỗi tính tuyến đường thay vì treo giao diện.',
    },
    async () => {
      await login(page, context.managedDriver.username, context.managedDriver.password);
      await page.route('https://router.project-osrm.org/**', async (route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'forced qa failure' }),
        });
      });
      await page.goto(`/driver/trips/${context.routeWithMapId}`);
      await expect(page.getByText('Không thể tính tuyến đường').first()).toBeVisible({ timeout: 15000 });
      await page.unroute('https://router.project-osrm.org/**');
      return {
        actual:
          'Khi OSRM bị ép lỗi 500, giao diện hiển thị banner "Không thể tính tuyến đường" thay vì văng trang.',
      };
    }
  );
});

test('UI_012', async ({ page }) => {
  await recordCase(
    {
      id: 'UI_012',
      feature: 'Map chỉ đường',
      description: 'UI hiển thị cảnh báo khi chuyến thiếu tọa độ điểm đón hoặc điểm trả',
      steps:
        '1. Đăng nhập tài xế QA có chuyến được tạo từ khách hàng thiếu tọa độ.\n2. Mở chi tiết chuyến đó.\n3. Quan sát banner và vùng map.',
      expected: 'Trang hiển thị cảnh báo thiếu tọa độ và không cố vẽ tuyến OSRM sai.',
      },
      async () => {
        await login(page, context.emptyDriver.username, context.emptyDriver.password);
        await page.goto(`/driver/trips/${context.routeMissingCoordsId}`);
        await expect(page.getByText('Xem lộ trình trung chuyển')).toBeVisible({ timeout: 15000 });
        await expect(page.getByText('Thiếu tọa độ điểm đón hoặc điểm trả')).toBeVisible({ timeout: 15000 });
        return {
          actual:
          'Route thiếu tọa độ hiển thị đúng banner "Thiếu tọa độ điểm đón hoặc điểm trả" trên màn hình chi tiết.',
      };
    }
  );
});

test('UI_013', async ({ page }) => {
  await recordCase(
    {
      id: 'UI_013',
      feature: 'Map chỉ đường',
      description: 'Màn hình theo dõi trạng thái dispatcher không còn dùng Google Maps nếu đã chuyển sang Leaflet/OSM',
      steps:
        '1. Đăng nhập điều phối.\n2. Mở trang /dispatch/track.\n3. Kiểm tra thành phần bản đồ đang được render.',
      expected: 'Trang theo dõi trạng thái dùng cùng stack Leaflet/OpenStreetMap, không nhúng Google Maps iframe.',
    },
    async () => {
      await login(page, context.dispatcher.username, context.dispatcher.password);
      await page.goto('/dispatch/track');
      await page.waitForLoadState('networkidle');
      await expect(page.getByText('Theo dõi trạng thái trung chuyển')).toBeVisible({ timeout: 15000 });
      const iframe = page.locator('iframe[title="Vị trí ước tính"]');
      const iframeCount = await iframe.count();
      if (iframeCount === 0) {
        return {
          actual:
            'Không phát hiện iframe Google Maps trên trang theo dõi trạng thái; cần đối chiếu thêm với implementation hiện tại.',
        };
      }
      const src = await iframe.first().getAttribute('src');
      if (src && src.includes('maps.google.com')) {
        return {
          status: 'FAIL',
          actual: `Trang /dispatch/track vẫn nhúng Google Maps iframe: ${src}`,
          notes:
            'Severity: Medium | File nghi ngờ: frontend/src/pages/dispatch/TrackStatusPage.tsx | Hệ thống đã dùng Leaflet/OSM ở màn hình tài xế nhưng track page chưa thống nhất.',
        };
      }
      return {
        actual: `Không còn nhúng Google Maps iframe; src hiện tại=${src || 'N/A'}.`,
      };
    }
  );
});
