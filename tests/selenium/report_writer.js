const fs = require('fs');
const path = require('path');

const config = require('./config');

const HEADERS = [
  'TC ID',
  '[Tên Chức Năng]',
  'Mô tả',
  'Bước thực hiện',
  'Kết quả mong đợi',
  'Kết quả thực tế',
  'Trạng thái',
  'Ghi chú'
];

const STATUSES = new Set(['PASS', 'FAIL', 'BLOCKED', 'NOT RUN']);

function ensureReportDirs() {
  fs.mkdirSync(config.reportsDir, { recursive: true });
  fs.mkdirSync(config.screenshotsDir, { recursive: true });
}

function normalizeRow(row) {
  const normalized = {};
  for (const header of HEADERS) {
    normalized[header] = row[header] == null ? '' : String(row[header]);
  }

  if (!STATUSES.has(normalized['Trạng thái'])) {
    normalized['Trạng thái'] = 'FAIL';
    normalized['Ghi chú'] = `${normalized['Ghi chú']} | Harness normalized invalid status`.trim();
  }

  return normalized;
}

function csvEscape(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function writeCsv(rows, filePath = config.reportCsvPath) {
  const normalizedRows = rows.map(normalizeRow);
  const lines = [
    HEADERS.map(csvEscape).join(','),
    ...normalizedRows.map((row) => HEADERS.map((header) => csvEscape(row[header])).join(','))
  ];
  fs.writeFileSync(filePath, `\uFEFF${lines.join('\n')}`, 'utf8');
  return filePath;
}

function writeXlsx(rows, filePath = config.reportXlsxPath) {
  const xlsx = require('xlsx');
  const normalizedRows = rows.map(normalizeRow);
  const workbook = xlsx.utils.book_new();
  const worksheet = xlsx.utils.json_to_sheet(normalizedRows, { header: HEADERS });
  worksheet['!cols'] = [
    { wch: 14 },
    { wch: 24 },
    { wch: 40 },
    { wch: 48 },
    { wch: 42 },
    { wch: 52 },
    { wch: 12 },
    { wch: 56 }
  ];
  xlsx.utils.book_append_sheet(workbook, worksheet, 'Selenium Report');
  xlsx.writeFile(workbook, filePath);
  return filePath;
}

function countStatuses(rows) {
  const counts = { PASS: 0, FAIL: 0, BLOCKED: 0, 'NOT RUN': 0 };
  for (const row of rows) {
    const status = row['Trạng thái'];
    if (Object.prototype.hasOwnProperty.call(counts, status)) {
      counts[status] += 1;
    }
  }
  return counts;
}

function listByStatus(rows, statuses) {
  const allow = new Set(statuses);
  return rows.filter((row) => allow.has(row['Trạng thái']));
}

function extractCriticalFindings(rows) {
  const failed = listByStatus(rows, ['FAIL']);
  if (failed.length === 0) {
    return ['Không ghi nhận lỗi nghiêm trọng trong đợt chạy Selenium này.'];
  }

  return failed.map((row) => {
    const note = row['Ghi chú'] ? ` | ${row['Ghi chú']}` : '';
    return `${row['TC ID']} - ${row['[Tên Chức Năng]']}: ${row['Kết quả thực tế']}${note}`;
  });
}

function extractUnavailableAreas(rows) {
  const blocked = listByStatus(rows, ['BLOCKED', 'NOT RUN']);
  if (blocked.length === 0) {
    return ['Chưa ghi nhận màn hình/chức năng bị chặn automation trong đợt chạy này.'];
  }

  return blocked.map((row) => `${row['TC ID']} - ${row['[Tên Chức Năng]']}: ${row['Ghi chú'] || row['Kết quả thực tế']}`);
}

function buildRepairPriorities(rows) {
  const priorities = [];
  const failed = listByStatus(rows, ['FAIL']);

  if (failed.some((row) => /AUTH|Đăng nhập|Authorization/i.test(`${row['TC ID']} ${row['[Tên Chức Năng]']}`))) {
    priorities.push('Ưu tiên 1: Sửa lỗi đăng nhập/phân quyền trước vì chặn toàn bộ luồng nghiệp vụ.');
  }

  if (failed.some((row) => /ASSIGN|TRIP|DRIVER_APP|MAP/i.test(row['TC ID']))) {
    priorities.push('Ưu tiên 2: Sửa luồng điều phối, chuyến tài xế và map vì ảnh hưởng trực tiếp vận hành trung chuyển.');
  }

  if (failed.some((row) => /CUSTOMER|DRIVER|VEHICLE/i.test(row['TC ID']))) {
    priorities.push('Ưu tiên 3: Sửa CRUD dữ liệu nền khách hàng/tài xế/xe để ổn định dữ liệu cho điều phối.');
  }

  if (priorities.length === 0) {
    priorities.push('Ưu tiên 1: Xử lý các case BLOCKED/NOT RUN bằng cách bổ sung dữ liệu test, selector ổn định hoặc UI còn thiếu.');
    priorities.push('Ưu tiên 2: Mở rộng regression cho các nhánh validation và responsive sau khi luồng chính ổn định.');
  }

  return priorities;
}

function writeSummary(rows, context = {}, filePath = config.summaryPath) {
  const counts = countStatuses(rows);
  const total = rows.length;
  const accounts = context.accounts || [];
  const environment = context.environment || {};

  const lines = [
    '# Selenium Test Summary',
    '',
    `- Thời gian chạy: ${new Date().toLocaleString('vi-VN')}`,
    `- Frontend framework: ${environment.frontendFramework || 'React + TypeScript + Vite'}`,
    `- Backend framework: ${environment.backendFramework || 'Node.js + Express'}`,
    `- Database: ${environment.database || 'SQL Server'}`,
    `- Frontend URL: ${environment.frontendUrl || config.frontendBaseUrl}`,
    `- API Backend URL: ${environment.apiUrl || config.apiBaseUrl}`,
    `- Tổng số test case: ${total}`,
    `- Số PASS: ${counts.PASS}`,
    `- Số FAIL: ${counts.FAIL}`,
    `- Số BLOCKED: ${counts.BLOCKED}`,
    `- Số NOT RUN: ${counts['NOT RUN']}`,
    '',
    '## Tài khoản test',
    ...(accounts.length
      ? accounts.map((account) => `- ${account.role}: ${account.username} / ${account.password}`)
      : ['- Không tạo/đọc được tài khoản test riêng trong đợt chạy này.']),
    '',
    '## Danh sách lỗi nghiêm trọng',
    ...extractCriticalFindings(rows).map((item) => `- ${item}`),
    '',
    '## Danh sách màn hình/chức năng chưa automation được',
    ...extractUnavailableAreas(rows).map((item) => `- ${item}`),
    '',
    '## Đề xuất thứ tự ưu tiên sửa lỗi',
    ...buildRepairPriorities(rows).map((item) => `- ${item}`)
  ];

  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
  return filePath;
}

function writeReports(rows, context = {}) {
  ensureReportDirs();
  let reportPath;
  try {
    reportPath = writeXlsx(rows);
  } catch (error) {
    reportPath = writeCsv(rows);
  }

  const summaryPath = writeSummary(rows, context);
  return {
    reportPath: path.relative(config.rootDir, reportPath),
    summaryPath: path.relative(config.rootDir, summaryPath),
    counts: countStatuses(rows)
  };
}

module.exports = {
  HEADERS,
  ensureReportDirs,
  writeReports,
  writeCsv,
  writeXlsx,
  writeSummary,
  countStatuses
};
