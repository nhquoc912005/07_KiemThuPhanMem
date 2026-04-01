import React, { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { DispatcherLayout } from '../../components/DispatcherLayout';
import { CUSTOMER_STATUS } from '../../constants/status';

interface Customer {
  MaKhachHang: number;
  TenKhachHang: string;
  SoDienThoai: string;
  DiaChiDon: string;
  DiaChiTra: string;
  TrangThai: string | null;
}

export const CustomersPage: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [form, setForm] = useState<{
    TenKhachHang: string
    SoDienThoai: string
    DiaChiDon: string
    DiaChiTra: string
    TrangThai: string
  }>({
    TenKhachHang: '',
    SoDienThoai: '',
    DiaChiDon: '',
    DiaChiTra: '',
    TrangThai: CUSTOMER_STATUS.ACTIVE
  });
  const [saving, setSaving] = useState(false);

  const fetchCustomers = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await api.get<Customer[]>('/customers');
      setCustomers(res.data);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      setError(err.response?.data?.message ?? 'Không thể tải danh sách khách hàng');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchCustomers();
  }, []);

  const formatCustomerId = (id: number) => `KH${String(id).padStart(8, '0')}`;

  const handleEditClick = (customer: Customer) => {
    setEditingCustomer(customer);
    setForm({
      TenKhachHang: customer.TenKhachHang,
      SoDienThoai: customer.SoDienThoai,
      DiaChiDon: customer.DiaChiDon,
      DiaChiTra: customer.DiaChiTra,
      TrangThai: customer.TrangThai || CUSTOMER_STATUS.ACTIVE
    });
  };

  const handleSaveEdit = async () => {
    if (!editingCustomer) return;

    setSaving(true);
    try {
      const res = await api.put<Customer>(`/customers/${editingCustomer.MaKhachHang}`, form);
      setCustomers((prev) =>
        prev.map((customer) => (customer.MaKhachHang === res.data.MaKhachHang ? res.data : customer))
      );
      setEditingCustomer(null);
      setNotification({ type: 'success', message: 'Cập nhật thông tin khách hàng thành công' });
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      setNotification({
        type: 'error',
        message: err.response?.data?.message ?? 'Cập nhật thông tin không thành công'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingCustomer) return;

    try {
      await api.delete(`/customers/${deletingCustomer.MaKhachHang}`);
      setCustomers((prev) => prev.filter((customer) => customer.MaKhachHang !== deletingCustomer.MaKhachHang));
      setDeletingCustomer(null);
      setNotification({ type: 'success', message: 'Đã chuyển khách hàng sang ngừng hoạt động' });
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      setDeletingCustomer(null);
      setNotification({
        type: 'error',
        message: err.response?.data?.message ?? 'Không thể cập nhật trạng thái khách hàng'
      });
    }
  };

  return (
    <DispatcherLayout>
      <div style={{ background: '#fff', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        <div style={{ background: '#D2EAFF', display: 'grid', gridTemplateColumns: '80px 160px 220px 160px 1fr 1fr 120px', padding: '16px', fontWeight: 600, color: '#1E293B' }}>
          <div style={{ textAlign: 'center' }}>STT</div>
          <div style={{ textAlign: 'center' }}>Mã khách hàng</div>
          <div>Họ và tên</div>
          <div style={{ textAlign: 'center' }}>Số điện thoại</div>
          <div>Từ địa chỉ</div>
          <div>Đến địa chỉ</div>
          <div style={{ textAlign: 'center' }}>Hành động</div>
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Đang tải...</div>
        ) : error ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#ef4444' }}>{error}</div>
        ) : customers.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Chưa có dữ liệu khách hàng</div>
        ) : (
          customers.map((customer, index) => (
            <div key={customer.MaKhachHang} style={{ display: 'grid', gridTemplateColumns: '80px 160px 220px 160px 1fr 1fr 120px', padding: '16px', borderTop: '1px solid #E5E7EB', fontSize: 14, alignItems: 'center', color: '#334155' }}>
              <div style={{ textAlign: 'center' }}>{index + 1}</div>
              <div style={{ textAlign: 'center', fontWeight: 500 }}>{formatCustomerId(customer.MaKhachHang)}</div>
              <div style={{ fontWeight: 500, color: '#0f172a' }}>{customer.TenKhachHang}</div>
              <div style={{ textAlign: 'center', fontWeight: 500 }}>{customer.SoDienThoai}</div>
              <div>{customer.DiaChiDon}</div>
              <div>{customer.DiaChiTra}</div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button onClick={() => handleEditClick(customer)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1e293b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
                <button onClick={() => setDeletingCustomer(customer)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {editingCustomer && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ width: 720, maxWidth: '95%', background: '#fff', padding: 32, borderRadius: 16, boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <h2 style={{ marginTop: 0, marginBottom: 24, fontSize: 24 }}>Chỉnh sửa thông tin khách hàng</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label="Mã khách hàng">
                <input value={formatCustomerId(editingCustomer.MaKhachHang)} disabled style={fieldInputStyle(true)} />
              </Field>
              <Field label="Họ và tên">
                <input value={form.TenKhachHang} onChange={(e) => setForm((prev) => ({ ...prev, TenKhachHang: e.target.value }))} style={fieldInputStyle()} />
              </Field>
              <Field label="Số điện thoại">
                <input value={form.SoDienThoai} onChange={(e) => setForm((prev) => ({ ...prev, SoDienThoai: e.target.value }))} style={fieldInputStyle()} />
              </Field>
              <Field label="Trạng thái">
                <select
                  value={form.TrangThai}
                  onChange={(e) => setForm((prev) => ({ ...prev, TrangThai: e.target.value }))}
                  style={fieldInputStyle()}
                >
                  <option value={CUSTOMER_STATUS.ACTIVE}>{CUSTOMER_STATUS.ACTIVE}</option>
                  <option value={CUSTOMER_STATUS.INACTIVE}>{CUSTOMER_STATUS.INACTIVE}</option>
                </select>
              </Field>
              <Field label="Từ địa chỉ">
                <input value={form.DiaChiDon} onChange={(e) => setForm((prev) => ({ ...prev, DiaChiDon: e.target.value }))} style={fieldInputStyle()} />
              </Field>
              <Field label="Đến địa chỉ">
                <input value={form.DiaChiTra} onChange={(e) => setForm((prev) => ({ ...prev, DiaChiTra: e.target.value }))} style={fieldInputStyle()} />
              </Field>
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24 }}>
              <button onClick={() => setEditingCustomer(null)} style={secondaryButtonStyle}>
                Hủy bỏ
              </button>
              <button onClick={handleSaveEdit} disabled={saving} style={primaryButtonStyle}>
                {saving ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deletingCustomer && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ width: 440, background: '#fff', borderRadius: 16, padding: '40px 32px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <h2 style={{ margin: '0 0 20px 0', fontSize: 24, fontWeight: 700, color: '#000' }}>
              Bạn muốn ngừng hoạt động khách hàng này?
            </h2>
            <p style={{ margin: '0 0 28px 0', textAlign: 'center', color: '#64748B' }}>
              {deletingCustomer.TenKhachHang} - {formatCustomerId(deletingCustomer.MaKhachHang)}
            </p>
            <div style={{ display: 'flex', gap: 16, width: '100%' }}>
              <button onClick={handleConfirmDelete} style={primaryButtonStyle}>
                Xác nhận
              </button>
              <button onClick={() => setDeletingCustomer(null)} style={secondaryButtonStyle}>
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}

      {notification && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110 }}>
          <div style={{ width: 420, background: '#fff', borderRadius: 16, padding: '32px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <h2 style={{ margin: '0 0 16px 0', fontSize: 28, fontWeight: 700 }}>Thông báo</h2>
            <p style={{ margin: '0 0 28px 0', fontSize: 18, color: notification.type === 'error' ? '#B91C1C' : '#166534', textAlign: 'center' }}>
              {notification.message}
            </p>
            <button onClick={() => setNotification(null)} style={primaryButtonStyle}>
              Đóng
            </button>
          </div>
        </div>
      )}
    </DispatcherLayout>
  );
};

const fieldInputStyle = (disabled = false): React.CSSProperties => ({
  width: '100%',
  height: 44,
  boxSizing: 'border-box',
  background: disabled ? '#F8FAFC' : '#FFFFFF',
  border: '1px solid rgba(0, 0, 0, 0.15)',
  borderRadius: 10,
  padding: '0 14px',
  fontSize: 15,
  color: '#000000'
});

const primaryButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: '12px 0',
  background: '#2563eb',
  color: '#fff',
  borderRadius: 8,
  border: 'none',
  fontSize: 16,
  fontWeight: 700,
  cursor: 'pointer'
};

const secondaryButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: '12px 0',
  background: '#fff',
  color: '#000',
  borderRadius: 8,
  border: '1px solid #9ca3af',
  fontSize: 16,
  fontWeight: 700,
  cursor: 'pointer'
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label style={{ display: 'block', marginBottom: 8, fontSize: 15, fontWeight: 600 }}>{label}</label>
    {children}
  </div>
);
