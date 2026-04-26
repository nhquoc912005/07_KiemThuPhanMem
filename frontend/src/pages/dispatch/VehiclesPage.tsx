import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api/client';
import { DispatcherLayout } from '../../components/DispatcherLayout';
import { SearchInput } from '../../components/SearchInput';
import { VEHICLE_STATUS } from '../../constants/status';
import { matchesSearchQuery } from '../../utils/search';

interface Vehicle {
    MaXe: number;
    BienSo: string;
    LoaiXe: string;
    SoCho: number;
    TrangThaiXe: string;
}

interface VehicleForm {
    BienSo: string;
    LoaiXe: string;
    SoCho: number;
    TrangThaiXe: string;
}

interface NotificationState {
    type: 'success' | 'error';
    message: string;
}

const NOTIFICATION_AUTO_HIDE_MS = 6000;
const TOAST_Z_INDEX = 1400;
const MODAL_Z_INDEX = 1200;

function normalizeVehiclePlate(value: string) {
    return String(value || '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '')
        .replace(/^(\d{2})([A-Z]{1,2})-?(\d{3})\.?(\d{2})$/, '$1$2-$3$4');
}

function isValidVehiclePlate(value: string) {
    return /^\d{2}[A-Z]{1,2}-\d{5}$/.test(normalizeVehiclePlate(value));
}

function validateVehicleForm(form: VehicleForm) {
    const seatCount = Number(form.SoCho);

    if (!String(form.BienSo || '').trim()) {
        return 'Vui lòng nhập biển số xe';
    }

    if (!isValidVehiclePlate(form.BienSo)) {
        return 'Biển số không hợp lệ. Ví dụ: 51A-12345';
    }

    if (!String(form.LoaiXe || '').trim()) {
        return 'Vui lòng chọn loại xe';
    }

    if (!Number.isInteger(seatCount) || seatCount < 4 || seatCount > 45) {
        return 'Số chỗ không hợp lệ';
    }

    return null;
}

function getToastStyle(type: NotificationState['type']) {
    const isError = type === 'error';

    return {
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        width: '100%',
        padding: '14px 16px',
        borderRadius: 14,
        border: `1px solid ${isError ? '#FCA5A5' : '#86EFAC'}`,
        background: '#FFFFFF',
        color: '#0F172A',
        boxShadow: '0 20px 45px rgba(15, 23, 42, 0.18)'
    };
}

export const VehiclesPage: React.FC = () => {
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notification, setNotification] = useState<NotificationState | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const [showAdd, setShowAdd] = useState(false);
    const [showEdit, setShowEdit] = useState<Vehicle | null>(null);
    const [showDelete, setShowDelete] = useState<Vehicle | null>(null);

    const defaultForm: VehicleForm = { BienSo: '', LoaiXe: 'Xe 16 chỗ', SoCho: 16, TrangThaiXe: VEHICLE_STATUS.AVAILABLE };
    const [formData, setFormData] = useState<VehicleForm>(defaultForm);

    const fetchVehicles = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get<Vehicle[]>('/vehicles');
            setVehicles(
                res.data.map((vehicle) => ({
                    ...vehicle,
                    BienSo: normalizeVehiclePlate(vehicle.BienSo)
                }))
            );
        } catch (caughtError: unknown) {
            const err = caughtError as { response?: { data?: { message?: string } }; message?: string };
            setError(err?.response?.data?.message ?? 'Không thể tải danh sách xe trung chuyển');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchVehicles();
    }, []);

    useEffect(() => {
        if (!notification) {
            return undefined;
        }

        const timer = window.setTimeout(() => {
            setNotification(null);
        }, NOTIFICATION_AUTO_HIDE_MS);

        return () => window.clearTimeout(timer);
    }, [notification]);

    const filteredVehicles = useMemo(() => {
        return vehicles.filter((vehicle) =>
            matchesSearchQuery(
                searchQuery,
                `XE${String(vehicle.MaXe).padStart(8, '0')}`,
                vehicle.BienSo,
                vehicle.LoaiXe,
                vehicle.SoCho,
                vehicle.TrangThaiXe
            )
        );
    }, [vehicles, searchQuery]);

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'Hoạt động':
            case VEHICLE_STATUS.AVAILABLE:
                return { bg: '#dcfce7', text: '#16a34a' };
            case VEHICLE_STATUS.MAINTENANCE:
                return { bg: '#fef08a', text: '#ca8a04' };
            case VEHICLE_STATUS.RUNNING:
            case VEHICLE_STATUS.ASSIGNED:
                return { bg: '#dbeafe', text: '#1d4ed8' };
            default:
                return { bg: '#f1f5f9', text: '#475569' };
        }
    };

    const handleSaveAdd = async () => {
        const normalizedForm = { ...formData, BienSo: normalizeVehiclePlate(formData.BienSo) };
        const validationMessage = validateVehicleForm(normalizedForm);
        if (validationMessage) {
            setNotification({ type: 'error', message: validationMessage });
            return;
        }

        try {
            await api.post('/vehicles', normalizedForm);
            fetchVehicles();
            setShowAdd(false);
            setNotification({ type: 'success', message: 'Thêm xe trung chuyển thành công' });
        } catch (caughtError: unknown) {
            const err = caughtError as { response?: { data?: { message?: string } }; message?: string };
            setNotification({ type: 'error', message: err?.response?.data?.message || err.message || 'Không thể thêm xe' });
        }
    };

    const handleSaveEdit = async () => {
        if (!showEdit) {
            return;
        }

        const normalizedForm = { ...formData, BienSo: normalizeVehiclePlate(formData.BienSo) };
        const validationMessage = validateVehicleForm(normalizedForm);
        if (validationMessage) {
            setNotification({ type: 'error', message: validationMessage });
            return;
        }

        try {
            await api.put(`/vehicles/${showEdit.MaXe}`, normalizedForm);
            fetchVehicles();
            setShowEdit(null);
            setNotification({ type: 'success', message: 'Cập nhật xe trung chuyển thành công' });
        } catch (caughtError: unknown) {
            const err = caughtError as { response?: { data?: { message?: string } }; message?: string };
            setNotification({ type: 'error', message: err?.response?.data?.message || err.message || 'Không thể cập nhật xe' });
        }
    };

    const handleConfirmDelete = async () => {
        if (!showDelete) {
            return;
        }

        try {
            await api.delete(`/vehicles/${showDelete.MaXe}`);
            fetchVehicles();
            setShowDelete(null);
            setNotification({ type: 'success', message: 'Xóa xe trung chuyển thành công' });
        } catch (caughtError: unknown) {
            const err = caughtError as { response?: { data?: { message?: string } }; message?: string };
            setNotification({ type: 'error', message: err?.response?.data?.message || err.message || 'Không thể xóa xe' });
        }
    };

    const modalOverlayStyle = {
        position: 'fixed' as const,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: MODAL_Z_INDEX
    };
    const modalInputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #D1D5DB', outline: 'none', fontSize: 16, marginTop: 4, boxSizing: 'border-box' as const, appearance: 'none' as const };
    const modalLabelStyle = { fontSize: 15, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 };
    const modalTitleStyle = { fontSize: 20, fontWeight: 700, color: '#1F2937', margin: 0 };
    const btnCancelStyle = { padding: '10px 24px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#FFFFFF', color: '#374151', fontWeight: 600, cursor: 'pointer', outline: 'none', flex: 1 };

    const renderToast = (type: NotificationState['type'], message: string, onClose: () => void) => {
        const isError = type === 'error';

        return (
            <div style={getToastStyle(type)}>
                <div
                    style={{
                        flexShrink: 0,
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: isError ? '#FEE2E2' : '#DCFCE7',
                        color: isError ? '#DC2626' : '#16A34A',
                        fontWeight: 700
                    }}
                >
                    {isError ? '!' : '✓'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2, color: '#111827' }}>
                        {isError ? 'Thông báo lỗi' : 'Thao tác thành công'}
                    </div>
                    <div style={{ fontSize: 14, lineHeight: 1.5, color: '#334155' }}>{message}</div>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    style={{
                        border: 'none',
                        background: 'transparent',
                        color: '#64748B',
                        cursor: 'pointer',
                        fontSize: 18,
                        lineHeight: 1,
                        padding: 0
                    }}
                    aria-label="Đóng thông báo"
                >
                    ×
                </button>
            </div>
        );
    };

    const renderFormBody = () => (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, padding: 24 }}>
            <div>
                <label style={modalLabelStyle}>Biển số xe <span style={{ color: '#EF4444' }}>*</span></label>
                <input
                    type="text"
                    style={modalInputStyle}
                    value={formData.BienSo}
                    onChange={(e) => setFormData((prev) => ({ ...prev, BienSo: e.target.value.toUpperCase() }))}
                    onBlur={(e) => setFormData((prev) => ({ ...prev, BienSo: normalizeVehiclePlate(e.target.value) }))}
                    placeholder="VD: 51A-12345"
                />
                <div style={{ marginTop: 6, fontSize: 12, color: '#6B7280' }}>Định dạng chuẩn: 51A-12345</div>
            </div>
            <div>
                <label style={modalLabelStyle}>Loại xe <span style={{ color: '#EF4444' }}>*</span></label>
                <div style={{ position: 'relative' }}>
                    <select
                        style={modalInputStyle}
                        value={formData.LoaiXe}
                        onChange={(e) => setFormData((prev) => ({ ...prev, LoaiXe: e.target.value }))}
                    >
                        <option value="Xe 7 chỗ">Xe 7 chỗ</option>
                        <option value="Xe 9 - 12 chỗ">Xe 9 - 12 chỗ</option>
                        <option value="Xe 16 chỗ">Xe 16 chỗ</option>
                    </select>
                    <div style={{ position: 'absolute', right: 12, top: 16, pointerEvents: 'none' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2">
                            <path d="M6 9l6 6 6-6" />
                        </svg>
                    </div>
                </div>
            </div>
            <div>
                <label style={modalLabelStyle}>Số chỗ ngồi <span style={{ color: '#EF4444' }}>*</span></label>
                <input
                    type="number"
                    style={modalInputStyle}
                    value={formData.SoCho}
                    onChange={(e) => setFormData((prev) => ({ ...prev, SoCho: Number(e.target.value) }))}
                    placeholder="VD: 16"
                    min={4}
                    max={45}
                />
            </div>
            <div>
                <label style={modalLabelStyle}>Trạng thái <span style={{ color: '#EF4444' }}>*</span></label>
                <div style={{ position: 'relative' }}>
                    <select
                        style={modalInputStyle}
                        value={formData.TrangThaiXe}
                        onChange={(e) => setFormData((prev) => ({ ...prev, TrangThaiXe: e.target.value }))}
                    >
                        <option value={VEHICLE_STATUS.AVAILABLE}>{VEHICLE_STATUS.AVAILABLE}</option>
                        <option value={VEHICLE_STATUS.ASSIGNED}>{VEHICLE_STATUS.ASSIGNED}</option>
                        <option value={VEHICLE_STATUS.RUNNING}>{VEHICLE_STATUS.RUNNING}</option>
                        <option value={VEHICLE_STATUS.MAINTENANCE}>{VEHICLE_STATUS.MAINTENANCE}</option>
                    </select>
                    <div style={{ position: 'absolute', right: 12, top: 16, pointerEvents: 'none' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2">
                            <path d="M6 9l6 6 6-6" />
                        </svg>
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <DispatcherLayout>
            {(error || notification) && (
                <div
                    style={{
                        position: 'fixed',
                        top: 24,
                        right: 24,
                        width: 'min(420px, calc(100vw - 32px))',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                        zIndex: TOAST_Z_INDEX
                    }}
                >
                    {error && renderToast('error', error, () => setError(null))}
                    {notification && renderToast(notification.type, notification.message, () => setNotification(null))}
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <h2 style={{ fontSize: 24, fontWeight: 700, color: '#1E293B', margin: 0 }}>Quản lý xe trung chuyển</h2>
                    <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Tìm theo mã xe, biển số, loại xe..." />
                </div>
                <button
                    onClick={() => {
                        setFormData(defaultForm);
                        setShowAdd(true);
                    }}
                    style={{
                        background: '#1E5FA8',
                        color: '#fff',
                        padding: '10px 24px',
                        borderRadius: 8,
                        border: 'none',
                        cursor: 'pointer',
                        fontWeight: 500,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8
                    }}
                >
                    <span style={{ fontSize: 18 }}>+</span> Thêm xe trung chuyển
                </button>
            </div>

            <div style={{ background: '#fff', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                <div style={{ background: '#D2EAFF', display: 'grid', gridTemplateColumns: '80px 180px 180px 180px 180px 180px 1fr', padding: '16px', fontWeight: 600, color: '#1E293B', textAlign: 'center' }}>
                    <div>STT</div>
                    <div>Mã xe</div>
                    <div>Biển số xe</div>
                    <div>Loại xe</div>
                    <div>Số chỗ</div>
                    <div>Trạng thái</div>
                    <div>Hành động</div>
                </div>

                {loading ? (
                    <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Đang tải...</div>
                ) : vehicles.length === 0 ? (
                    <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Chưa có dữ liệu xe</div>
                ) : filteredVehicles.length === 0 ? (
                    <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Không tìm thấy xe phù hợp</div>
                ) : (
                    filteredVehicles.map((vehicle, index) => {
                        const statusColor = getStatusColor(vehicle.TrangThaiXe);

                        return (
                            <div
                                key={vehicle.MaXe}
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: '80px 180px 180px 180px 180px 180px 1fr',
                                    padding: '16px',
                                    borderTop: '1px solid #E5E7EB',
                                    fontSize: 14,
                                    alignItems: 'center',
                                    textAlign: 'center',
                                    color: '#334155'
                                }}
                            >
                                <div>{index + 1}</div>
                                <div>{`XE${String(vehicle.MaXe).padStart(8, '0')}`}</div>
                                <div>{vehicle.BienSo}</div>
                                <div>{vehicle.LoaiXe}</div>
                                <div>{vehicle.SoCho}</div>
                                <div style={{ display: 'flex', justifyContent: 'center' }}>
                                    <span style={{ background: statusColor.bg, color: statusColor.text, padding: '4px 12px', borderRadius: 999, fontSize: 13, fontWeight: 500 }}>
                                        {vehicle.TrangThaiXe}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                                    <button
                                        onClick={() => {
                                            setFormData({
                                                BienSo: vehicle.BienSo,
                                                LoaiXe: vehicle.LoaiXe,
                                                SoCho: vehicle.SoCho,
                                                TrangThaiXe: vehicle.TrangThaiXe === 'Hoạt động' ? VEHICLE_STATUS.AVAILABLE : vehicle.TrangThaiXe
                                            });
                                            setShowEdit(vehicle);
                                        }}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                    >
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                        </svg>
                                    </button>
                                    <button onClick={() => setShowDelete(vehicle)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="3 6 5 6 21 6" />
                                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                            <line x1="10" y1="11" x2="10" y2="17" />
                                            <line x1="14" y1="11" x2="14" y2="17" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {showAdd && (
                <div style={modalOverlayStyle}>
                    <div style={{ background: '#FFFFFF', borderRadius: 12, width: '100%', maxWidth: 700, overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #E5E7EB' }}>
                            <h3 style={modalTitleStyle}>Thêm xe trung chuyển mới</h3>
                            <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2">
                                    <path d="M18 6L6 18M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        {renderFormBody()}
                        <div style={{ display: 'flex', gap: 16, padding: '20px 24px', background: '#FFFFFF', borderTop: '1px solid #E5E7EB' }}>
                            <button onClick={() => setShowAdd(false)} style={btnCancelStyle}>Hủy</button>
                            <button onClick={handleSaveAdd} style={{ ...btnCancelStyle, background: '#1E5FA8', color: '#FFFFFF', border: 'none' }}>Thêm</button>
                        </div>
                    </div>
                </div>
            )}

            {showEdit && (
                <div style={modalOverlayStyle}>
                    <div style={{ background: '#FFFFFF', borderRadius: 12, width: '100%', maxWidth: 700, overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #E5E7EB' }}>
                            <h3 style={modalTitleStyle}>Chỉnh sửa thông tin xe trung chuyển</h3>
                            <button onClick={() => setShowEdit(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2">
                                    <path d="M18 6L6 18M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        {renderFormBody()}
                        <div style={{ display: 'flex', gap: 16, padding: '20px 24px', background: '#FFFFFF', borderTop: '1px solid #E5E7EB' }}>
                            <button onClick={() => setShowEdit(null)} style={btnCancelStyle}>Hủy</button>
                            <button onClick={handleSaveEdit} style={{ ...btnCancelStyle, background: '#10B981', color: '#FFFFFF', border: 'none' }}>Lưu</button>
                        </div>
                    </div>
                </div>
            )}

            {showDelete && (
                <div style={modalOverlayStyle}>
                    <div style={{ background: '#FFFFFF', borderRadius: 16, width: '100%', maxWidth: 450, padding: 32, textAlign: 'center', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#FEE2E2', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2">
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                <line x1="12" y1="9" x2="12" y2="13" />
                                <line x1="12" y1="17" x2="12.01" y2="17" />
                            </svg>
                        </div>
                        <h3 style={{ fontSize: 24, fontWeight: 700, color: '#1F2937', marginBottom: 12 }}>Xác nhận xóa xe</h3>
                        <div style={{ fontSize: 16, color: '#4B5563', lineHeight: 1.5, marginBottom: 32 }}>
                            Bạn có chắc chắn muốn xóa xe có mã <strong style={{ color: '#111827' }}>{`XE${String(showDelete.MaXe).padStart(8, '0')}`}</strong>?<br />
                            Hành động này không thể hoàn tác.
                        </div>
                        <div style={{ display: 'flex', gap: 16 }}>
                            <button onClick={() => setShowDelete(null)} style={btnCancelStyle}>Hủy</button>
                            <button onClick={handleConfirmDelete} style={{ ...btnCancelStyle, background: '#DC2626', color: '#FFFFFF', border: 'none' }}>Xóa</button>
                        </div>
                    </div>
                </div>
            )}
        </DispatcherLayout>
    );
};
