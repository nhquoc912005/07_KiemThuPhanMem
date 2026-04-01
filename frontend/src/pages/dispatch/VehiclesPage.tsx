import React, { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { DispatcherLayout } from '../../components/DispatcherLayout';
import { VEHICLE_STATUS } from '../../constants/status';

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

export const VehiclesPage: React.FC = () => {
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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
            setVehicles(res.data);
        } catch (error: unknown) { const err = error as { response?: { data?: { message?: string } }, message?: string };
            setError(err?.response?.data?.message ?? 'Không thể tải danh sách xe trung chuyển');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchVehicles();
    }, []);

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
        try {
            await api.post('/vehicles', formData);
            fetchVehicles();
            setShowAdd(false);
            setNotification({ type: 'success', message: 'Thêm xe trung chuyển thành công' });
        } catch (error: unknown) { const err = error as { response?: { data?: { message?: string } }, message?: string }; setNotification({ type: 'error', message: err?.response?.data?.message || err.message || 'Không thể thêm xe' }); }
    };

    const handleSaveEdit = async () => {
        if (!showEdit) return;
        try {
            await api.put(`/vehicles/${showEdit.MaXe}`, formData);
            fetchVehicles();
            setShowEdit(null);
            setNotification({ type: 'success', message: 'Cập nhật xe trung chuyển thành công' });
        } catch (error: unknown) { const err = error as { response?: { data?: { message?: string } }, message?: string }; setNotification({ type: 'error', message: err?.response?.data?.message || err.message || 'Không thể cập nhật xe' }); }
    };

    const handleConfirmDelete = async () => {
        if (!showDelete) return;
        try {
            await api.delete(`/vehicles/${showDelete.MaXe}`);
            fetchVehicles();
            setShowDelete(null);
            setNotification({ type: 'success', message: 'Xóa xe trung chuyển thành công' });
        } catch (error: unknown) { const err = error as { response?: { data?: { message?: string } }, message?: string }; setNotification({ type: 'error', message: err?.response?.data?.message || err.message || 'Không thể xóa xe' }); }
    };

    const modalInputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #D1D5DB', outline: 'none', fontSize: 16, marginTop: 4, boxSizing: 'border-box' as const, appearance: 'none' as const };
    const modalLabelStyle = { fontSize: 15, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 };
    const modalTitleStyle = { fontSize: 20, fontWeight: 700, color: '#1F2937', margin: 0 };
    const btnCancelStyle = { padding: '10px 24px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#FFFFFF', color: '#374151', fontWeight: 600, cursor: 'pointer', outline: 'none', flex: 1 };
    
    const renderFormBody = () => (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, padding: 24 }}>
            <div>
                <label style={modalLabelStyle}>Biển số xe <span style={{color: '#EF4444'}}>*</span></label>
                <input type="text" style={modalInputStyle} value={formData.BienSo} onChange={e => setFormData({...formData, BienSo: e.target.value})} placeholder="VD: 43A-12345" />
            </div>
            <div>
                <label style={modalLabelStyle}>Loại xe <span style={{color: '#EF4444'}}>*</span></label>
                <div style={{position: 'relative'}}>
                    <select style={modalInputStyle} value={formData.LoaiXe} onChange={e => setFormData({...formData, LoaiXe: e.target.value})}>
                        <option value="Xe 7 chỗ">Xe 7 chỗ</option>
                        <option value="Xe 9 - 12 chỗ">Xe 9 - 12 chỗ</option>
                        <option value="Xe 16 chỗ">Xe 16 chỗ</option>
                    </select>
                    <div style={{position:'absolute', right:12, top:16, pointerEvents:'none'}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg></div>
                </div>
            </div>
            <div>
                <label style={modalLabelStyle}>Số chỗ ngồi <span style={{color: '#EF4444'}}>*</span></label>
                <input type="number" style={modalInputStyle} value={formData.SoCho} onChange={e => setFormData({...formData, SoCho: Number(e.target.value)})} placeholder="VD: 16" />
            </div>
            <div>
                <label style={modalLabelStyle}>Trạng thái <span style={{color: '#EF4444'}}>*</span></label>
                <div style={{position: 'relative'}}>
                    <select style={modalInputStyle} value={formData.TrangThaiXe} onChange={e => setFormData({...formData, TrangThaiXe: e.target.value})}>
                        <option value={VEHICLE_STATUS.AVAILABLE}>{VEHICLE_STATUS.AVAILABLE}</option>
                        <option value={VEHICLE_STATUS.ASSIGNED}>{VEHICLE_STATUS.ASSIGNED}</option>
                        <option value={VEHICLE_STATUS.RUNNING}>{VEHICLE_STATUS.RUNNING}</option>
                        <option value={VEHICLE_STATUS.MAINTENANCE}>{VEHICLE_STATUS.MAINTENANCE}</option>
                    </select>
                    <div style={{position:'absolute', right:12, top:16, pointerEvents:'none'}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg></div>
                </div>
            </div>
        </div>
    );

    return (
        <DispatcherLayout>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <h2 style={{ fontSize: 24, fontWeight: 700, color: '#1E293B' }}>Quản lý xe trung chuyển</h2>
                <button
                    onClick={() => { setFormData(defaultForm); setShowAdd(true); }}
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

            {error && (
                <div style={{ background: 'rgba(248,113,113,0.15)', borderRadius: 8, padding: '12px', marginBottom: 16, color: '#dc2626' }}>
                    {error}
                </div>
            )}

            {notification && (
                <div style={{ background: notification.type === 'error' ? 'rgba(248,113,113,0.15)' : 'rgba(34,197,94,0.15)', borderRadius: 8, padding: '12px', marginBottom: 16, color: notification.type === 'error' ? '#dc2626' : '#15803d' }}>
                    {notification.message}
                </div>
            )}

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
                ) : (
                    vehicles.map((v, index) => {
                        const statusColor = getStatusColor(v.TrangThaiXe);
                        return (
                            <div key={v.MaXe} style={{ display: 'grid', gridTemplateColumns: '80px 180px 180px 180px 180px 180px 1fr', padding: '16px', borderTop: '1px solid #E5E7EB', fontSize: 14, alignItems: 'center', textAlign: 'center', color: '#334155' }}>
                                <div>{index + 1}</div>
                                <div>{`XE${String(v.MaXe).padStart(8, '0')}`}</div>
                                <div>{v.BienSo}</div>
                                <div>{v.LoaiXe}</div>
                                <div>{v.SoCho}</div>
                                <div style={{ display: 'flex', justifyContent: 'center' }}>
                                    <span style={{ background: statusColor.bg, color: statusColor.text, padding: '4px 12px', borderRadius: 999, fontSize: 13, fontWeight: 500 }}>
                                        {v.TrangThaiXe}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                                    <button onClick={() => { setFormData({BienSo: v.BienSo, LoaiXe: v.LoaiXe, SoCho: v.SoCho, TrangThaiXe: v.TrangThaiXe === 'Hoạt động' ? VEHICLE_STATUS.AVAILABLE : v.TrangThaiXe}); setShowEdit(v); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                    </button>
                                    <button onClick={() => setShowDelete(v)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Modal Add */}
            {showAdd && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                    <div style={{ background: '#FFFFFF', borderRadius: 12, width: '100%', maxWidth: 700, overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #E5E7EB' }}>
                            <h3 style={modalTitleStyle}>Thêm xe trung chuyển mới</h3>
                            <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
                        </div>
                        {renderFormBody()}
                        <div style={{ display: 'flex', gap: 16, padding: '20px 24px', background: '#FFFFFF', borderTop: '1px solid #E5E7EB' }}>
                            <button onClick={() => setShowAdd(false)} style={btnCancelStyle}>Hủy</button>
                            <button onClick={handleSaveAdd} style={{ ...btnCancelStyle, background: '#1E5FA8', color: '#FFFFFF', border: 'none' }}>Thêm</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Edit */}
            {showEdit && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                    <div style={{ background: '#FFFFFF', borderRadius: 12, width: '100%', maxWidth: 700, overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #E5E7EB' }}>
                            <h3 style={modalTitleStyle}>Chỉnh sửa thông tin xe trung chuyển</h3>
                            <button onClick={() => setShowEdit(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
                        </div>
                        {renderFormBody()}
                        <div style={{ display: 'flex', gap: 16, padding: '20px 24px', background: '#FFFFFF', borderTop: '1px solid #E5E7EB' }}>
                            <button onClick={() => setShowEdit(null)} style={btnCancelStyle}>Hủy</button>
                            <button onClick={handleSaveEdit} style={{ ...btnCancelStyle, background: '#10B981', color: '#FFFFFF', border: 'none' }}>Lưu</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Delete */}
            {showDelete && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                    <div style={{ background: '#FFFFFF', borderRadius: 16, width: '100%', maxWidth: 450, padding: 32, textAlign: 'center', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#FEE2E2', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                        </div>
                        <h3 style={{ fontSize: 24, fontWeight: 700, color: '#1F2937', marginBottom: 12 }}>Xác nhận xóa xe</h3>
                        <div style={{ fontSize: 16, color: '#4B5563', lineHeight: 1.5, marginBottom: 32 }}>
                            Bạn có chắc chắn muốn xóa xe có mã <strong style={{color:'#111827'}}>{`XE${String(showDelete.MaXe).padStart(8, '0')}`}</strong>?<br/>
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
