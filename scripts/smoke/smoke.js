const DEFAULT_API_BASE_URL = process.env.SMOKE_API_BASE_URL || 'http://localhost:5000/api/v1';
const DISPATCHER_USERNAME = process.env.SMOKE_DISPATCHER_USERNAME || 'dieuphoi1';
const DISPATCHER_PASSWORD = process.env.SMOKE_DISPATCHER_PASSWORD || '12345678';
const DRIVER_USERNAME = process.env.SMOKE_DRIVER_USERNAME || 'taixe1';
const DRIVER_PASSWORD = process.env.SMOKE_DRIVER_PASSWORD || '12345678';

async function apiFetch(path, options = {}) {
  const response = await fetch(`${DEFAULT_API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  const payload =
    data &&
    typeof data === 'object' &&
    'success' in data &&
    'data' in data
      ? data.data
      : data;

  if (!response.ok) {
    const error = new Error(data?.message || `Request failed with status ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return payload;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function findAvailableVehicle(vehicles, requiredSeats) {
  return vehicles.filter(
    (vehicle) => vehicle.TrangThaiXe === 'Rảnh' && Number(vehicle.SoCho || 0) >= requiredSeats
  );
}

function findAvailableDriver(drivers) {
  return drivers.filter((driver) => driver.TrangThaiTaiXe === 'Rảnh');
}

function buildFutureIsoDate(minutesAhead) {
  return new Date(Date.now() + minutesAhead * 60 * 1000).toISOString();
}

async function login(username, password) {
  return apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
}

async function main() {
  if (typeof fetch !== 'function') {
    throw new Error('Node.js hiện tại chưa hỗ trợ fetch toàn cục để chạy smoke test');
  }

  let createdRouteId = null;
  let dispatcherToken = null;

  console.log(`[SMOKE] API base: ${DEFAULT_API_BASE_URL}`);

  try {
    const dispatcherSession = await login(DISPATCHER_USERNAME, DISPATCHER_PASSWORD);
    assert(dispatcherSession?.accessToken, 'Đăng nhập điều phối không trả accessToken');
    dispatcherToken = dispatcherSession.accessToken;
    console.log('[SMOKE] Login điều phối: OK');

    const driverSession = await login(DRIVER_USERNAME, DRIVER_PASSWORD);
    assert(driverSession?.accessToken, 'Đăng nhập tài xế không trả accessToken');
    console.log('[SMOKE] Login tài xế: OK');

    const reports = await apiFetch('/reports/summary', {
      headers: { Authorization: `Bearer ${dispatcherToken}` }
    });
    assert(Array.isArray(reports), 'Báo cáo không trả về mảng dữ liệu');
    console.log(`[SMOKE] Báo cáo: OK (${reports.length} bản ghi)`);

    const tickets = await apiFetch('/tickets?status=' + encodeURIComponent('Cần trung chuyển'), {
      headers: { Authorization: `Bearer ${dispatcherToken}` }
    });
    const vehicles = await apiFetch('/vehicles', {
      headers: { Authorization: `Bearer ${dispatcherToken}` }
    });
    const drivers = await apiFetch('/drivers', {
      headers: { Authorization: `Bearer ${dispatcherToken}` }
    });
    const routes = await apiFetch('/routes', {
      headers: { Authorization: `Bearer ${dispatcherToken}` }
    });

    assert(Array.isArray(tickets) && tickets.length > 0, 'Không có vé ở trạng thái "Cần trung chuyển" để test');
    assert(Array.isArray(vehicles) && vehicles.length > 0, 'Không có dữ liệu xe để test');
    assert(Array.isArray(drivers) && drivers.length > 0, 'Không có dữ liệu tài xế để test');

    const activeStatuses = new Set(['Chưa thực hiện', 'Đang thực hiện', 'Đang gặp sự cố']);
    const busyVehicleIds = new Set(
      routes
        .filter((route) => activeStatuses.has(route.TrangThaiLoTrinh))
        .map((route) => Number(route.MaXe))
        .filter(Number.isInteger)
    );
    const busyDriverIds = new Set(
      routes
        .filter((route) => activeStatuses.has(route.TrangThaiLoTrinh))
        .map((route) => Number(route.MaTaiXe))
        .filter(Number.isInteger)
    );

    const ticket = tickets[0];
    const vehicleCandidates = findAvailableVehicle(vehicles, Number(ticket.SoLuongGhe || 1)).filter(
      (vehicle) => !busyVehicleIds.has(Number(vehicle.MaXe))
    );
    const driverCandidates = findAvailableDriver(drivers).filter(
      (driver) => !busyDriverIds.has(Number(driver.MaTaiXe))
    );

    assert(vehicleCandidates.length > 0, 'Không tìm thấy xe rảnh phù hợp cho smoke test');
    assert(driverCandidates.length > 0, 'Không tìm thấy tài xế rảnh phù hợp cho smoke test');

    let createdRoute = null;
    let lastCreateError = null;

    for (const vehicle of vehicleCandidates) {
      for (const driver of driverCandidates) {
        try {
          createdRoute = await apiFetch('/routes', {
            method: 'POST',
            headers: { Authorization: `Bearer ${dispatcherToken}` },
            body: JSON.stringify({
              MaXe: vehicle.MaXe,
              MaTaiXe: driver.MaTaiXe,
              ThoiGianBatDau: buildFutureIsoDate(30),
              GhiChu: 'Smoke test route',
              ticketIds: [ticket.MaVe]
            })
          });
          break;
        } catch (error) {
          lastCreateError = error;
          if (error.status !== 409 && error.status !== 422) {
            throw error;
          }
        }
      }

      if (createdRoute) {
        break;
      }
    }

    if (!createdRoute) {
      throw lastCreateError || new Error('Không tạo được lộ trình smoke test');
    }

    createdRouteId = createdRoute?.route?.MaLoTrinh || null;
    assert(createdRouteId, 'Tạo lộ trình không trả về MaLoTrinh');
    console.log(`[SMOKE] Tạo lộ trình: OK (routeId=${createdRouteId})`);

    console.log('[SMOKE] Kết quả: PASS');
  } finally {
    if (createdRouteId && dispatcherToken) {
      try {
        await apiFetch(`/routes/${createdRouteId}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${dispatcherToken}` },
          body: JSON.stringify({
            TrangThaiLoTrinh: 'Đã hủy',
            GhiChu: 'Đã hủy tự động sau smoke test'
          })
        });
        console.log(`[SMOKE] Cleanup: Đã hủy route ${createdRouteId}`);
      } catch (cleanupError) {
        console.error('[SMOKE] Cleanup thất bại:', cleanupError.message);
      }
    }
  }
}

main().catch((error) => {
  console.error('[SMOKE] FAIL:', error.message);
  process.exit(1);
});
