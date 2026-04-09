import React, { useEffect, useState } from 'react';
import { api } from '../../services/api/client';
import { DispatcherLayout } from '../../components/DispatcherLayout';
import { DRIVER_STATUS } from '../../constants/status';

interface Driver {
    MaTaiXe: number;
    HoTen: string;
    SoDienThoai: string;
    CCCD: string;
    LoaiBangLai: string;
    TrangThaiTaiXe: string;
}

export const DispatcherDriversPage: React.FC = () => {
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [loading, setLoading] = useState(false);
    const [showAdd, setShowAdd] = useState(false);
    const [showEdit, setShowEdit] = useState<Driver | null>(null);
    const [showDelete, setShowDelete] = useState<Driver | null>(null);
    const [showSuccess, setShowSuccess] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const fetchDrivers = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get<Driver[]>('/drivers');
            setDrivers(res.data);
        } catch (error: unknown) { const err = error as { response?: { data?: { message?: string } }, message?: string };
            setError(err?.response?.data?.message ?? 'Không thể tải danh sách tài xế');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDrivers();
    }, []);

    return (
        <DispatcherLayout>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    marginBottom: 24
                }}
            >
                <button
                    onClick={() => setShowAdd(true)}
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
                    <span style={{ fontSize: 18 }}>+</span> Thêm tài xế
                </button>
            </div>

            {error && (
                <div
                    style={{
                        background: 'rgba(248,113,113,0.15)',
                        borderRadius: 8,
                        padding: '8px 12px',
                        marginBottom: 12,
                        color: '#dc2626'
                    }}
                >
                    {error}
                </div>
            )}

            <div
                style={{
                    background: '#fff',
                    borderRadius: 8,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    overflow: 'hidden'
                }}
            >
                <div
                    style={{
                        background: '#D2EAFF',
                        display: 'grid',
                        gridTemplateColumns: '60px 140px 1fr 140px 180px 140px 160px 100px',
                        padding: '16px',
                        fontWeight: 600,
                        color: '#1E293B',
                        textAlign: 'center'
                    }}
                >
                    <div>STT</div>
                    <div>Mã tài xế</div>
                    <div style={{ textAlign: 'left' }}>Họ tên</div>
                    <div>SĐT</div>
                    <div>CCCD/CMND</div>
                    <div>Loại bằng lái</div>
                    <div>Trạng thái</div>
                    <div>Hành động</div>
                </div>

                {loading ? (
                    <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Đang tải...</div>
                ) : drivers.length === 0 ? (
                    <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Chưa có dữ liệu tài xế</div>
                ) : (
                    drivers.map((d, index) => (
                        <div
                            key={d.MaTaiXe}
                            style={{
                                display: 'grid',
                                gridTemplateColumns: '60px 140px 1fr 140px 180px 140px 160px 100px',
                                padding: '16px',
                                borderTop: '1px solid #E5E7EB',
                                fontSize: 14,
                                alignItems: 'center',
                                textAlign: 'center',
                                color: '#334155'
                            }}
                        >
                            <div>{index + 1}</div>
                            <div>{`TX${String(d.MaTaiXe).padStart(8, '0')}`}</div>
                            <div style={{ textAlign: 'left' }}>{d.HoTen}</div>
                            <div>{d.SoDienThoai}</div>
                            <div>{d.CCCD}</div>
                            <div>{d.LoaiBangLai}</div>
                            <div>{d.TrangThaiTaiXe}</div>
                            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                                <button
                                    onClick={() => setShowEdit(d)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                >
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1e293b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                </button>
                                <button
                                    onClick={() => setShowDelete(d)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                >
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {showAdd && (
                <AddDriverModal
                    onClose={() => setShowAdd(false)}
                    onSuccess={() => {
                        setShowAdd(false);
                        fetchDrivers();
                        setShowSuccess('Thêm tài xế mới thành công');
                    }}
                />
            )}

            {showEdit && (
                <EditDriverModal
                    driver={showEdit}
                    onClose={() => setShowEdit(null)}
                    onSuccess={() => {
                        setShowEdit(null);
                        fetchDrivers();
                        setShowSuccess('Cập nhật tài xế thành công');
                    }}
                />
            )}

            {showDelete && (
                <DeleteDriverModal
                    driver={showDelete}
                    onClose={() => setShowDelete(null)}
                    onSuccess={() => {
                        setShowDelete(null);
                        fetchDrivers();
                        setShowSuccess('Đã chuyển tài xế sang ngừng hoạt động');
                    }}
                />
            )}

            {showSuccess && (
                <SuccessModal
                    message={showSuccess}
                    onClose={() => setShowSuccess(null)}
                />
            )}
        </DispatcherLayout>
    );
};

// --- Shared Styles for Modals ---
const labelStyle: React.CSSProperties = {
    color: '#000',
    fontSize: 20,
    fontFamily: 'Roboto, sans-serif',
    fontWeight: 400,
    marginBottom: 8,
    display: 'block'
};

const inputStyle: React.CSSProperties = {
    width: '100%',
    height: 57,
    background: '#fff',
    borderRadius: 8,
    border: '1px solid #4A4A4A',
    padding: '0 16px',
    fontSize: 20,
    fontFamily: 'Roboto, sans-serif',
    color: '#000',
    boxSizing: 'border-box',
    outline: 'none'
};

const defaultBtnStyle: React.CSSProperties = {
    flex: 1,
    height: 48,
    borderRadius: 8,
    border: '1px solid #4A4A4A',
    background: '#fff',
    color: '#000',
    fontSize: 20,
    fontFamily: 'Roboto, sans-serif',
    fontWeight: 700,
    cursor: 'pointer'
};

const primaryBtnStyle: React.CSSProperties = {
    flex: 1,
    height: 48,
    borderRadius: 8,
    border: 'none',
    background: '#1E5FA8',
    color: '#fff',
    fontSize: 20,
    fontFamily: 'Roboto, sans-serif',
    fontWeight: 700,
    cursor: 'pointer'
};

const ModalOverlay: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
        {children}
    </div>
);


// --- Thêm mới tài xế ---
interface AddDriverModalProps {
    onClose: () => void;
    onSuccess: () => void;
}

const AddDriverModal: React.FC<AddDriverModalProps> = ({ onClose, onSuccess }) => {
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [cccd, setCccd] = useState('');
    const [licenseType, setLicenseType] = useState('C1');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!name || !phone || !cccd) {
            setError('Họ tên, SĐT, CCCD là bắt buộc');
            return;
        }
        setLoading(true);
        try {
            await api.post('/drivers', {
                HoTen: name, SoDienThoai: phone, CCCD: cccd,
                LoaiBangLai: licenseType || null, TrangThaiTaiXe: DRIVER_STATUS.AVAILABLE
            });
            onSuccess();
        } catch (error: unknown) { const err = error as { response?: { data?: { message?: string } }, message?: string };
            setError(err?.response?.data?.message ?? 'Cập nhật thất bại');
        } finally {
            setLoading(false);
        }
    };

    return (
        <ModalOverlay>
            <div style={{ width: 800, background: '#fff', borderRadius: 8, position: 'relative', padding: '32px 48px' }}>
                <button onClick={onClose} style={{ position: 'absolute', right: 24, top: 24, border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6L18 18" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>

                <h2 style={{ fontSize: 24, fontWeight: 700, fontFamily: 'Roboto, sans-serif', color: '#000', marginBottom: 32 }}>
                    Thêm mới tài xế
                </h2>

                <form onSubmit={handleSave} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 48, rowGap: 24 }}>
                    <div>
                        <label style={labelStyle}>Họ tên</label>
                        <input type="text" value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                        <label style={labelStyle}>Mã tài xế</label>
                        <input type="text" disabled value="Hệ thống tự tạo" style={{ ...inputStyle, background: '#f8fafc', color: '#94a3b8' }} />
                    </div>
                    <div>
                        <label style={labelStyle}>Số điện thoại</label>
                        <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                        <label style={labelStyle}>Số CCCD/CMND</label>
                        <input type="text" value={cccd} onChange={e => setCccd(e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                        <label style={labelStyle}>Loại bằng lái</label>
                        <select value={licenseType} onChange={e => setLicenseType(e.target.value)} style={{ ...inputStyle, cursor: 'pointer', appearance: 'none', backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%234A4A4A%22%20d%3D%22M287%2069.4a13.6%2013.6%200%200%200-19.3%200l-121.5%20121.5L24.7%2069.4a13.6%2013.6%200%200%200-19.3%200%2013.6%2013.6%200%200%200%200%2019.3l131.1%20131.1c5.3%205.3%2014%205.3%2019.3%200L287%2088.7a13.6%2013.6%200%200%200%200-19.3z%22%2F%3E%3C%2Fsvg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 16px top 50%', backgroundSize: '16px auto' }}>
                            <option value="B2">B2</option>
                            <option value="C">C</option>
                            <option value="C1">C1</option>
                            <option value="D">D</option>
                            <option value="E">E</option>
                        </select>
                    </div>

                    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end' }}>
                        <button type="submit" disabled={loading} style={{ ...primaryBtnStyle, opacity: loading ? 0.7 : 1 }}>Lưu tài xế</button>
                        <button type="button" onClick={onClose} style={defaultBtnStyle}>Hủy bỏ</button>
                    </div>
                </form>
                {error && <div style={{ color: '#ef4444', marginTop: 16, textAlign: 'center' }}>{error}</div>}
            </div>
        </ModalOverlay>
    );
};

// --- Chỉnh sửa tài xế ---
interface EditDriverModalProps {
    driver: Driver;
    onClose: () => void;
    onSuccess: () => void;
}

const EditDriverModal: React.FC<EditDriverModalProps> = ({ driver, onClose, onSuccess }) => {
    const [name, setName] = useState(driver.HoTen);
    const [phone, setPhone] = useState(driver.SoDienThoai);
    const [cccd, setCccd] = useState(driver.CCCD);
    const [licenseType, setLicenseType] = useState(driver.LoaiBangLai || 'C1');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!name || !phone || !cccd) {
            setError('Họ tên, SĐT, CCCD là bắt buộc');
            return;
        }
        setLoading(true);
        try {
            await api.put(`/drivers/${driver.MaTaiXe}`, {
                HoTen: name, SoDienThoai: phone, CCCD: cccd, LoaiBangLai: licenseType
            });
            onSuccess();
        } catch (error: unknown) { const err = error as { response?: { data?: { message?: string } }, message?: string };
            setError(err?.response?.data?.message ?? 'Cập nhật thất bại');
        } finally {
            setLoading(false);
        }
    };

    return (
        <ModalOverlay>
            <div style={{ width: 800, background: '#fff', borderRadius: 8, position: 'relative', padding: '32px 48px' }}>
                <button onClick={onClose} style={{ position: 'absolute', right: 24, top: 24, border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6L18 18" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>

                <h2 style={{ fontSize: 24, fontWeight: 700, fontFamily: 'Roboto, sans-serif', color: '#000', marginBottom: 32 }}>
                    Chỉnh sửa tài xế
                </h2>

                <form onSubmit={handleSave} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 48, rowGap: 24 }}>
                    <div>
                        <label style={labelStyle}>Họ tên</label>
                        <input type="text" value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                        <label style={labelStyle}>Mã tài xế</label>
                        <input type="text" disabled value={`TX${String(driver.MaTaiXe).padStart(8, '0')}`} style={inputStyle} />
                    </div>
                    <div>
                        <label style={labelStyle}>Số điện thoại</label>
                        <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                        <label style={labelStyle}>CCCD/CMND</label>
                        <input type="text" value={cccd} onChange={e => setCccd(e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                        <label style={labelStyle}>Loại bằng lái</label>
                        <select value={licenseType} onChange={e => setLicenseType(e.target.value)} style={{ ...inputStyle, cursor: 'pointer', appearance: 'none', backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%234A4A4A%22%20d%3D%22M287%2069.4a13.6%2013.6%200%200%200-19.3%200l-121.5%20121.5L24.7%2069.4a13.6%2013.6%200%200%200-19.3%200%2013.6%2013.6%200%200%200%200%2019.3l131.1%20131.1c5.3%205.3%2014%205.3%2019.3%200L287%2088.7a13.6%2013.6%200%200%200%200-19.3z%22%2F%3E%3C%2Fsvg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 16px top 50%', backgroundSize: '16px auto' }}>
                            <option value="B2">B2</option>
                            <option value="C">C</option>
                            <option value="C1">C1</option>
                            <option value="D">D</option>
                            <option value="E">E</option>
                        </select>
                    </div>

                    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end' }}>
                        <button type="submit" disabled={loading} style={{ ...primaryBtnStyle, opacity: loading ? 0.7 : 1 }}>Lưu tài xế</button>
                        <button type="button" onClick={onClose} style={defaultBtnStyle}>Hủy bỏ</button>
                    </div>
                </form>
                {error && <div style={{ color: '#ef4444', marginTop: 16, textAlign: 'center' }}>{error}</div>}
            </div>
        </ModalOverlay>
    );
};

// --- Xóa tài xế (Confirm Modal) ---
interface DeleteDriverModalProps {
    driver: Driver;
    onClose: () => void;
    onSuccess: () => void;
}

const DeleteDriverModal: React.FC<DeleteDriverModalProps> = ({ driver, onClose, onSuccess }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Soft-delete bằng cách cập nhật trạng thái sang "Ngừng hoạt động".
    const handleDelete = async () => {
        setLoading(true);
        setError(null);
        try {
            await api.put(`/drivers/${driver.MaTaiXe}`, { ...driver, TrangThaiTaiXe: DRIVER_STATUS.INACTIVE });
            onSuccess();
        } catch (error: unknown) { const err = error as { response?: { data?: { message?: string } }, message?: string };
            setError(err?.response?.data?.message || 'Không thể cập nhật trạng thái tài xế');
        } finally {
            setLoading(false);
        }
    };

    return (
        <ModalOverlay>
            <div style={{ width: 600, background: '#fff', borderRadius: 8, padding: '48px 32px', textAlign: 'center' }}>
                <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#D2EAFF', display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '0 auto 24px' }}>
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" stroke="#1E5FA8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>

                <h2 style={{ fontSize: 24, fontWeight: 700, fontFamily: 'Roboto, sans-serif', color: '#000', marginBottom: 16 }}>
                    Xác nhận ngừng hoạt động tài xế
                </h2>

                <p style={{ color: '#64748B', margin: '0 0 24px 0' }}>
                    {driver.HoTen} - {`TX${String(driver.MaTaiXe).padStart(8, '0')}`}
                </p>

                {error && (
                    <div style={{ background: 'rgba(248,113,113,0.15)', color: '#dc2626', borderRadius: 8, padding: '10px 12px', marginBottom: 24 }}>
                        {error}
                    </div>
                )}

                <div style={{ display: 'flex', gap: 24, padding: '0 48px', justifyContent: 'center' }}>
                    <button onClick={handleDelete} disabled={loading} style={{ ...primaryBtnStyle, maxWidth: 220 }}>
                        {loading ? 'Đang xử lý...' : 'Xác nhận'}
                    </button>
                    <button onClick={onClose} style={{ ...defaultBtnStyle, maxWidth: 220 }}>
                        Hủy
                    </button>
                </div>
            </div>
        </ModalOverlay>
    );
};

// --- Success Notification Modal ---
interface SuccessModalProps {
    message: string;
    onClose: () => void;
}

const SuccessModal: React.FC<SuccessModalProps> = ({ message, onClose }) => {
    return (
        <ModalOverlay>
            <div style={{ width: 450, background: '#fff', borderRadius: 16, padding: '48px 32px', textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
                <h2 style={{ fontSize: 24, fontWeight: 700, fontFamily: 'Roboto, sans-serif', color: '#000', marginBottom: 32 }}>
                    Thông báo
                </h2>

                <p style={{ fontSize: 20, fontFamily: 'Roboto, sans-serif', color: '#000', marginBottom: 40 }}>
                    {message}
                </p>

                <button onClick={onClose} style={{ ...primaryBtnStyle, maxWidth: 180, height: 50 }}>
                    Đóng
                </button>
            </div>
        </ModalOverlay>
    );
};
