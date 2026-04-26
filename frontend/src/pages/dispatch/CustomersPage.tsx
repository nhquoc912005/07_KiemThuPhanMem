import React, { useEffect, useMemo, useState } from 'react';

import { DispatcherLayout } from '../../components/DispatcherLayout';
import { SearchInput } from '../../components/SearchInput';
import { CUSTOMER_STATUS } from '../../constants/status';
import { api } from '../../services/api/client';
import { matchesSearchQuery } from '../../utils/search';

interface Customer {
  MaKhachHang: number;
  TenKhachHang: string;
  SoDienThoai: string;
  DiaChiDon: string;
  DiaChiTra: string;
  TrangThai: string | null;
}

interface CustomerForm {
  TenKhachHang: string;
  SoDienThoai: string;
  DiaChiDon: string;
  DiaChiTra: string;
  TrangThai: string;
}

interface CustomerFieldErrors {
  TenKhachHang?: string;
  SoDienThoai?: string;
  DiaChiDon?: string;
  DiaChiTra?: string;
}

const REQUIRED_FIELD_MESSAGE = 'Thông tin bắt buộc không được để trống';
const INVALID_PHONE_MESSAGE = 'Số điện thoại không hợp lệ';

export const CustomersPage: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<CustomerFieldErrors>({});
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [form, setForm] = useState<CustomerForm>({
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

  const filteredCustomers = useMemo(() => {
    return customers.filter((customer) =>
      matchesSearchQuery(
        searchQuery,
        formatCustomerId(customer.MaKhachHang),
        customer.TenKhachHang,
        customer.SoDienThoai,
        customer.DiaChiDon,
        customer.DiaChiTra,
        customer.TrangThai
      )
    );
  }, [customers, searchQuery]);

  const validateForm = (currentForm: CustomerForm) => {
    const nextErrors: CustomerFieldErrors = {};
    const normalizedPhoneNumber = normalizePhoneNumber(currentForm.SoDienThoai);

    if (!currentForm.TenKhachHang.trim()) {
      nextErrors.TenKhachHang = REQUIRED_FIELD_MESSAGE;
    }

    if (!normalizedPhoneNumber) {
      nextErrors.SoDienThoai = REQUIRED_FIELD_MESSAGE;
    } else if (!isValidVietnamPhoneNumber(normalizedPhoneNumber)) {
      nextErrors.SoDienThoai = INVALID_PHONE_MESSAGE;
    }

    if (!currentForm.DiaChiDon.trim()) {
      nextErrors.DiaChiDon = REQUIRED_FIELD_MESSAGE;
    }

    if (!currentForm.DiaChiTra.trim()) {
      nextErrors.DiaChiTra = REQUIRED_FIELD_MESSAGE;
    }

    return nextErrors;
  };

  const handleEditClick = (customer: Customer) => {
    setEditingCustomer(customer);
    setFieldErrors({});
    setForm({
      TenKhachHang: customer.TenKhachHang,
      SoDienThoai: customer.SoDienThoai,
      DiaChiDon: customer.DiaChiDon,
      DiaChiTra: customer.DiaChiTra,
      TrangThai: customer.TrangThai || CUSTOMER_STATUS.ACTIVE
    });
  };

  const closeEditModal = () => {
    setEditingCustomer(null);
    setFieldErrors({});
  };

  const updateFormField = <K extends keyof CustomerForm>(field: K, value: CustomerForm[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSaveEdit = async () => {
    if (!editingCustomer) return;

    const nextErrors = validateForm(form);
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    const normalizedPhoneNumber = normalizePhoneNumber(form.SoDienThoai);

    setSaving(true);
    try {
      const res = await api.put<Customer>(`/customers/${editingCustomer.MaKhachHang}`, {
        ...form,
        SoDienThoai: normalizedPhoneNumber
      });
      setCustomers((prev) =>
        prev.map((customer) => (customer.MaKhachHang === res.data.MaKhachHang ? res.data : customer))
      );
      closeEditModal();
      setNotification({ type: 'success', message: 'Cập nhật thông tin khách hàng thành công' });
    } catch (error: unknown) {
      const err = error as {
        response?: {
          status?: number;
          data?: {
            message?: string;
            data?: {
              fieldErrors?: CustomerFieldErrors;
            };
          };
        };
      };

      const backendFieldErrors = err.response?.data?.data?.fieldErrors;
      if (backendFieldErrors) {
        setFieldErrors((prev) => ({ ...prev, ...backendFieldErrors }));
        return;
      }

      setNotification({
        type: 'error',
        message: err.response?.data?.message ?? 'Cập nhật thông tin không thành công'
      });
    } finally {
      setSaving(false);
    }
  };

  const openDeleteModal = (customer: Customer) => {
    setDeletingCustomer(customer);
    setDeleteError(null);
  };

  const closeDeleteModal = () => {
    setDeletingCustomer(null);
    setDeleteError(null);
  };

  const handleConfirmDelete = async () => {
    if (!deletingCustomer) return;

    try {
      await api.delete(`/customers/${deletingCustomer.MaKhachHang}`);
      setCustomers((prev) => prev.filter((customer) => customer.MaKhachHang !== deletingCustomer.MaKhachHang));
      closeDeleteModal();
      setNotification({ type: 'success', message: 'Đã chuyển khách hàng sang ngừng hoạt động' });
    } catch (error: unknown) {
      const err = error as {
        response?: {
          status?: number;
          data?: {
            message?: string;
          };
        };
      };

      const status = err.response?.status ?? 0;
      const message = err.response?.data?.message ?? 'Không thể cập nhật trạng thái khách hàng';

      if (status > 0 && status < 500) {
        setDeleteError(message);
        return;
      }

      closeDeleteModal();
      setNotification({
        type: 'error',
        message
      });
    }
  };

  return (
    <DispatcherLayout>
      <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 24, gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Tìm theo mã, tên, SĐT, địa chỉ..."
        />
      </div>

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
        ) : filteredCustomers.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Không tìm thấy khách hàng phù hợp</div>
        ) : (
          filteredCustomers.map((customer, index) => (
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
                <button onClick={() => openDeleteModal(customer)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
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
        <div
          style={editModalOverlayStyle}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeEditModal();
            }
          }}
        >
          <div style={editModalStyle} onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" aria-label="Đóng" onClick={closeEditModal} style={editModalCloseButtonStyle}>
              X
            </button>

            <h2 style={editModalTitleStyle}>Chỉnh sửa thông tin</h2>

            <div style={editModalGridStyle}>
              <EditField label="Mã khách hàng" required>
                <input value={formatCustomerId(editingCustomer.MaKhachHang)} disabled style={editModalInputStyle({ disabled: true })} />
              </EditField>

              <EditField label="Từ địa chỉ" required error={fieldErrors.DiaChiDon}>
                <input
                  value={form.DiaChiDon}
                  onChange={(e) => updateFormField('DiaChiDon', e.target.value)}
                  style={editModalInputStyle({ invalid: Boolean(fieldErrors.DiaChiDon) })}
                />
              </EditField>

              <EditField label="Họ và tên" required error={fieldErrors.TenKhachHang}>
                <input
                  value={form.TenKhachHang}
                  onChange={(e) => updateFormField('TenKhachHang', e.target.value)}
                  style={editModalInputStyle({ invalid: Boolean(fieldErrors.TenKhachHang) })}
                />
              </EditField>

              <EditField label="Đến địa chỉ" required error={fieldErrors.DiaChiTra}>
                <input
                  value={form.DiaChiTra}
                  onChange={(e) => updateFormField('DiaChiTra', e.target.value)}
                  style={editModalInputStyle({ invalid: Boolean(fieldErrors.DiaChiTra) })}
                />
              </EditField>

              <EditField label="Số điện thoại" required error={fieldErrors.SoDienThoai}>
                <input
                  value={form.SoDienThoai}
                  onChange={(e) => updateFormField('SoDienThoai', e.target.value)}
                  style={editModalInputStyle({ invalid: Boolean(fieldErrors.SoDienThoai) })}
                />
              </EditField>

              <div style={editModalActionsCellStyle}>
                <button type="button" onClick={handleSaveEdit} disabled={saving} style={editModalPrimaryButtonStyle}>
                  {saving ? 'Đang lưu...' : 'Lưu'}
                </button>
                <button type="button" onClick={closeEditModal} style={editModalSecondaryButtonStyle}>
                  Hủy bỏ
                </button>
              </div>
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
            {deleteError && (
              <div style={{ width: '100%', margin: '0 0 20px 0', textAlign: 'center', color: '#B91C1C', fontWeight: 600 }}>
                {deleteError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 16, width: '100%' }}>
              <button onClick={handleConfirmDelete} style={primaryButtonStyle}>
                Xác nhận
              </button>
              <button onClick={closeDeleteModal} style={secondaryButtonStyle}>
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

function normalizePhoneNumber(raw: string) {
  const compactValue = String(raw || '')
    .trim()
    .replace(/[\s.-]/g, '');

  if (/^\+84\d{9}$/.test(compactValue)) {
    return `0${compactValue.slice(3)}`;
  }

  if (/^84\d{9}$/.test(compactValue)) {
    return `0${compactValue.slice(2)}`;
  }

  return compactValue;
}

function isValidVietnamPhoneNumber(raw: string) {
  return /^0\d{9}$/.test(normalizePhoneNumber(raw));
}

const editModalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.35)',
  backdropFilter: 'blur(2px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  zIndex: 1000
};

const editModalStyle: React.CSSProperties = {
  width: 960,
  maxWidth: '100%',
  background: '#FFFFFF',
  borderRadius: 16,
  padding: '28px 32px 32px',
  boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
  position: 'relative'
};

const editModalTitleStyle: React.CSSProperties = {
  margin: 0,
  marginBottom: 22,
  fontSize: 34,
  fontWeight: 800,
  color: '#111827'
};

const editModalCloseButtonStyle: React.CSSProperties = {
  position: 'absolute',
  top: 18,
  right: 18,
  width: 44,
  height: 44,
  borderRadius: 10,
  border: 'none',
  background: 'transparent',
  fontSize: 34,
  lineHeight: 1,
  cursor: 'pointer',
  color: '#111827'
};

const editModalGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  columnGap: 44,
  rowGap: 28
};

const editModalLabelStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 500,
  color: '#111827',
  marginBottom: 10
};

const requiredMarkStyle: React.CSSProperties = {
  color: '#EF4444',
  fontWeight: 700,
  marginLeft: 6
};

const editModalInputStyle = (options?: { disabled?: boolean; invalid?: boolean }): React.CSSProperties => ({
  width: '100%',
  height: 58,
  boxSizing: 'border-box',
  borderRadius: 12,
  padding: '0 18px',
  fontSize: 22,
  color: '#111827',
  border: `1.5px solid ${options?.invalid ? '#EF4444' : '#9CA3AF'}`,
  background: options?.disabled ? '#F3F4F6' : options?.invalid ? '#FEE2E2' : '#FFFFFF',
  outline: 'none'
});

const fieldErrorTextStyle: React.CSSProperties = {
  marginTop: 12,
  fontSize: 18,
  fontWeight: 600,
  color: '#EF4444'
};

const editModalActionsCellStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  alignItems: 'center',
  gap: 18,
  paddingTop: 42
};

const editModalPrimaryButtonStyle: React.CSSProperties = {
  height: 58,
  minWidth: 220,
  padding: '0 28px',
  background: '#1D4ED8',
  borderRadius: 12,
  border: 'none',
  color: '#FFFFFF',
  fontSize: 22,
  fontWeight: 800,
  cursor: 'pointer'
};

const editModalSecondaryButtonStyle: React.CSSProperties = {
  height: 58,
  minWidth: 200,
  padding: '0 28px',
  background: '#FFFFFF',
  borderRadius: 12,
  border: '1.5px solid #9CA3AF',
  color: '#111827',
  fontSize: 22,
  fontWeight: 800,
  cursor: 'pointer'
};

const EditField: React.FC<{ label: string; required?: boolean; error?: string; children: React.ReactNode }> = ({
  label,
  required,
  error,
  children
}) => (
  <div>
    <div style={editModalLabelStyle}>
      {label}
      {required ? <span style={requiredMarkStyle}>*</span> : null}
    </div>
    {children}
    {error ? <div style={fieldErrorTextStyle}>{error}</div> : null}
  </div>
);
