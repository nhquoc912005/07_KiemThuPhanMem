import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { DispatcherLayout } from '../../components/DispatcherLayout';

interface ReportRow {
  MaLoTrinh: number;
  Ngay: string;
  LoaiXe: string | null;
  BienSo: string | null;
  TenTaiXe: string | null;
  TrangThaiLoTrinh: string;
  SoDiemDonTra: number;
  SoKhach: number;
  TongGhe: number;
  KhuVuc: string | null;
  LoTrinhDuKien: string | null;
}

const labelStyle: React.CSSProperties = {
  color: '#0C476F',
  fontSize: 15,
  fontWeight: 600,
  whiteSpace: 'nowrap'
};

const inputStyle: React.CSSProperties = {
  height: 44,
  padding: '0 12px',
  background: 'white',
  borderRadius: 8,
  border: '1px solid #D1D5DB',
  color: '#374151',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box'
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('vi-VN');
}

function escapeCsvValue(value: string | number | null | undefined) {
  const rawValue = String(value ?? '');
  if (/[",\n]/.test(rawValue)) {
    return `"${rawValue.replace(/"/g, '""')}"`;
  }

  return rawValue;
}

function getStatusBadge(status: string) {
  if (status === 'Hoàn thành') {
    return { background: '#DCFCE7', color: '#166534' };
  }
  if (status === 'Đang thực hiện') {
    return { background: '#DBEAFE', color: '#1D4ED8' };
  }
  if (status === 'Đang gặp sự cố') {
    return { background: '#FEE2E2', color: '#B91C1C' };
  }
  if (status === 'Đã hủy') {
    return { background: '#E5E7EB', color: '#374151' };
  }
  return { background: '#FEF3C7', color: '#92400E' };
}

export const ReportsPage: React.FC = () => {
  const [tuNgay, setTuNgay] = useState('');
  const [denNgay, setDenNgay] = useState('');
  const [loaiXe, setLoaiXe] = useState('');
  const [khuVuc, setKhuVuc] = useState('');
  const [bienSoXe, setBienSoXe] = useState('');
  const [tenTaiXe, setTenTaiXe] = useState('');

  const [rawData, setRawData] = useState<ReportRow[]>([]);
  const [filteredData, setFilteredData] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  const applyFilters = (rows: ReportRow[]) => {
    let nextRows = [...rows];

    if (loaiXe) {
      nextRows = nextRows.filter((row) => row.LoaiXe === loaiXe);
    }

    if (khuVuc) {
      nextRows = nextRows.filter((row) => row.KhuVuc === khuVuc);
    }

    if (bienSoXe) {
      nextRows = nextRows.filter((row) => row.BienSo === bienSoXe);
    }

    if (tenTaiXe) {
      nextRows = nextRows.filter((row) => row.TenTaiXe === tenTaiXe);
    }

    setFilteredData(nextRows);
  };

  const fetchReports = async (fromDate?: string, toDate?: string) => {
    setLoading(true);
    setError(null);

    try {
      const res = await api.get<ReportRow[]>('/reports/summary', {
        params: {
          ...(fromDate ? { fromDate } : {}),
          ...(toDate ? { toDate } : {})
        }
      });

      setRawData(res.data);
      return res.data;
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      const message = err.response?.data?.message ?? 'Không thể tải báo cáo tổng hợp';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      const rows = await fetchReports();
      if (rows) {
        setFilteredData(rows);
      }
    };

    void init();
  }, []);

  const handleSearch = async () => {
    if (tuNgay && denNgay && tuNgay > denNgay) {
      setError('Khoảng ngày không hợp lệ: "Từ ngày" phải nhỏ hơn hoặc bằng "Đến ngày".');
      return;
    }

    setNotification(null);
    const rows = await fetchReports(tuNgay, denNgay);
    if (rows) {
      applyFilters(rows);
    }
  };

  const handleRefresh = async () => {
    setTuNgay('');
    setDenNgay('');
    setLoaiXe('');
    setKhuVuc('');
    setBienSoXe('');
    setTenTaiXe('');
    setNotification(null);
    const rows = await fetchReports();
    if (rows) {
      setFilteredData(rows);
    }
  };

  const handleExport = () => {
    if (filteredData.length === 0) {
      setNotification('Không có dữ liệu để xuất file.');
      return;
    }

    const headers = ['STT', 'Ngày', 'Loại xe', 'Khu vực', 'Biển số xe', 'Tên tài xế', 'Trạng thái', 'Tổng ghế'];
    const csvContent = [
      headers.map((header) => escapeCsvValue(header)).join(','),
      ...filteredData.map((row, index) =>
        [
          index + 1,
          formatDate(row.Ngay),
          row.LoaiXe || '',
          row.KhuVuc || '',
          row.BienSo || '',
          row.TenTaiXe || '',
          row.TrangThaiLoTrinh,
          row.TongGhe || 0
        ].map((value) => escapeCsvValue(value)).join(',')
      )
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Bao_Cao_Trung_Chuyen_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setNotification(`Đã xuất ${filteredData.length} dòng báo cáo ra file CSV.`);
  };

  const loaiXeOptions = useMemo(
    () => [...new Set(rawData.map((row) => row.LoaiXe).filter(Boolean))] as string[],
    [rawData]
  );
  const khuVucOptions = useMemo(
    () => [...new Set(rawData.map((row) => row.KhuVuc).filter(Boolean))] as string[],
    [rawData]
  );
  const bienSoOptions = useMemo(
    () => [...new Set(rawData.map((row) => row.BienSo).filter(Boolean))] as string[],
    [rawData]
  );
  const taiXeOptions = useMemo(
    () => [...new Set(rawData.map((row) => row.TenTaiXe).filter(Boolean))] as string[],
    [rawData]
  );

  const completionRate = filteredData.length
    ? Math.round((filteredData.filter((row) => row.TrangThaiLoTrinh === 'Hoàn thành').length / filteredData.length) * 100)
    : 0;

  const avgSeats = filteredData.length
    ? (filteredData.reduce((sum, row) => sum + Number(row.TongGhe || 0), 0) / filteredData.length).toFixed(1)
    : '0.0';

  return (
    <DispatcherLayout>
      <div style={{ background: '#fff', borderRadius: 8, padding: '24px 32px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h2
          style={{
            textAlign: 'center',
            color: '#1E5FA8',
            fontSize: 28,
            fontWeight: 700,
            textTransform: 'uppercase',
            marginBottom: 32
          }}
        >
          Báo cáo tổng hợp vận chuyển
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px 48px', marginBottom: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={labelStyle}>Từ ngày</span>
            <input type="date" value={tuNgay} onChange={(e) => setTuNgay(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={labelStyle}>Loại xe</span>
            <select value={loaiXe} onChange={(e) => setLoaiXe(e.target.value)} style={inputStyle}>
              <option value="">Tất cả</option>
              {loaiXeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={labelStyle}>Khu vực đón</span>
            <select value={khuVuc} onChange={(e) => setKhuVuc(e.target.value)} style={inputStyle}>
              <option value="">Tất cả</option>
              {khuVucOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={labelStyle}>Đến ngày</span>
            <input type="date" value={denNgay} onChange={(e) => setDenNgay(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={labelStyle}>Biển số xe</span>
            <select value={bienSoXe} onChange={(e) => setBienSoXe(e.target.value)} style={inputStyle}>
              <option value="">Tất cả</option>
              {bienSoOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={labelStyle}>Tên tài xế</span>
            <select value={tenTaiXe} onChange={(e) => setTenTaiXe(e.target.value)} style={inputStyle}>
              <option value="">Tất cả</option>
              {taiXeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginBottom: 24, paddingBottom: 24, borderBottom: '1px solid #E5E7EB' }}>
          <button onClick={handleSearch} style={{ background: '#2563EB', color: '#fff', padding: '10px 20px', fontSize: 14, borderRadius: 8, border: 'none', fontWeight: 600, cursor: 'pointer' }}>
            Xem báo cáo
          </button>
          <button onClick={handleExport} style={{ background: '#2563EB', color: '#fff', padding: '10px 20px', fontSize: 14, borderRadius: 8, border: 'none', fontWeight: 600, cursor: 'pointer' }}>
            Xuất file
          </button>
          <button onClick={handleRefresh} style={{ background: '#F1F5F9', color: '#475569', padding: '10px 20px', fontSize: 14, borderRadius: 8, border: 'none', fontWeight: 600, cursor: 'pointer' }}>
            Làm mới
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
          {[
            { label: 'Tổng số chuyến', value: filteredData.length, color: '#2563eb', bg: '#eff6ff' },
            { label: 'Số xe hoạt động', value: new Set(filteredData.map((row) => row.BienSo).filter(Boolean)).size, color: '#059669', bg: '#ecfdf5' },
            { label: 'Tài xế tham gia', value: new Set(filteredData.map((row) => row.TenTaiXe).filter(Boolean)).size, color: '#d97706', bg: '#fffbeb' },
            { label: 'Tỷ lệ hoàn thành', value: `${completionRate}%`, color: '#7c3aed', bg: '#f5f3ff' },
            { label: 'Ghế / chuyến', value: avgSeats, color: '#0284c7', bg: '#f0f9ff' }
          ].map((stat) => (
            <div key={stat.label} style={{ flex: '1 1 180px', background: stat.bg, padding: '16px 20px', borderRadius: 12, border: `1px solid ${stat.color}30` }}>
              <div style={{ color: '#475569', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{stat.label}</div>
              <div style={{ color: stat.color, fontSize: 24, fontWeight: 800 }}>{stat.value}</div>
            </div>
          ))}
        </div>

        {error && (
          <div style={{ background: '#FEE2E2', borderRadius: 8, padding: '12px 16px', color: '#B91C1C', marginBottom: 16 }}>
            {error}
          </div>
        )}

        {notification && (
          <div style={{ background: '#DCFCE7', borderRadius: 8, padding: '12px 16px', color: '#166534', marginBottom: 16 }}>
            {notification}
          </div>
        )}

        <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #E5E7EB', minHeight: 360 }}>
          <div style={{ background: '#D2EAFF', display: 'grid', gridTemplateColumns: '70px 120px 140px 1fr 140px 1fr 140px 110px', padding: '16px', fontWeight: 700, color: '#1E5FA8', textAlign: 'center' }}>
            <div>STT</div>
            <div>Ngày</div>
            <div>Loại xe</div>
            <div>Khu vực</div>
            <div>Biển số xe</div>
            <div>Tên tài xế</div>
            <div>Trạng thái</div>
            <div>Tổng ghế</div>
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 280, color: '#64748b', fontSize: 16 }}>
              Đang tải báo cáo...
            </div>
          ) : filteredData.length === 0 ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 280, color: '#64748b', fontSize: 16 }}>
              Không có dữ liệu báo cáo phù hợp với bộ lọc hiện tại.
            </div>
          ) : (
            filteredData.map((row, index) => {
              const badgeStyle = getStatusBadge(row.TrangThaiLoTrinh);

              return (
                <div key={row.MaLoTrinh} style={{ display: 'grid', gridTemplateColumns: '70px 120px 140px 1fr 140px 1fr 140px 110px', padding: '16px', borderTop: '1px solid #E5E7EB', fontSize: 14, textAlign: 'center', alignItems: 'center', color: '#334155' }}>
                  <div style={{ fontWeight: 600 }}>{index + 1}</div>
                  <div>{formatDate(row.Ngay)}</div>
                  <div>{row.LoaiXe || '--'}</div>
                  <div style={{ textAlign: 'left' }}>{row.KhuVuc || row.LoTrinhDuKien || '--'}</div>
                  <div>{row.BienSo || '--'}</div>
                  <div style={{ textAlign: 'left' }}>{row.TenTaiXe || '--'}</div>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <span style={{ ...badgeStyle, padding: '4px 12px', borderRadius: 999, fontSize: 13, fontWeight: 600 }}>
                      {row.TrangThaiLoTrinh}
                    </span>
                  </div>
                  <div>{row.TongGhe || 0}</div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </DispatcherLayout>
  );
};
