import React, { useEffect, useMemo, useState } from 'react'

import { DispatcherLayout } from '../../components/DispatcherLayout'
import { SearchInput } from '../../components/SearchInput'
import { DRIVER_STATUS } from '../../constants/status'
import { api } from '../../services/api/client'
import { matchesSearchQuery } from '../../utils/search'

interface Driver {
  MaTaiXe: number
  MaNhanVien: string
  HoTen: string
  SoDienThoai: string
  CCCD: string
  LoaiBangLai: string
  TrangThaiTaiXe: string
}

interface DriverFormValues {
  MaNhanVien: string
  HoTen: string
  SoDienThoai: string
  CCCD: string
  LoaiBangLai: string
}

interface DriverFieldErrors {
  MaNhanVien?: string
  HoTen?: string
  SoDienThoai?: string
  CCCD?: string
  LoaiBangLai?: string
}

interface CreateDriverResponse {
  driver: Driver
  account: {
    TenDangNhap: string
    MatKhauMacDinh?: string | null
  }
}

const LICENSE_OPTIONS = ['B2', 'C', 'C1', 'D', 'E']
const DEFAULT_DRIVER_PASSWORD = '123456'
const BUSY_DRIVER_DELETE_MESSAGE =
  'Tài xế đang được phân công hoặc đang thực hiện chuyến, không thể ngừng hoạt động'

const initialDriverForm: DriverFormValues = {
  MaNhanVien: '',
  HoTen: '',
  SoDienThoai: '',
  CCCD: '',
  LoaiBangLai: ''
}

export const DispatcherDriversPage: React.FC = () => {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showEdit, setShowEdit] = useState<Driver | null>(null)
  const [showDelete, setShowDelete] = useState<Driver | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const fetchDrivers = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await api.get<Driver[]>('/drivers')
      setDrivers(response.data)
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } }
      setError(err.response?.data?.message ?? 'Không thể tải danh sách tài xế')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchDrivers()
  }, [])

  const filteredDrivers = useMemo(() => {
    return drivers.filter((driver) =>
      matchesSearchQuery(
        searchQuery,
        `TX${String(driver.MaTaiXe).padStart(3, '0')}`,
        driver.MaNhanVien,
        driver.HoTen,
        driver.SoDienThoai,
        driver.CCCD,
        driver.LoaiBangLai,
        driver.TrangThaiTaiXe
      )
    )
  }, [drivers, searchQuery])

  return (
    <DispatcherLayout>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 24,
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center'
        }}
      >
        <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Tìm theo mã, họ tên, SĐT, CCCD..." />
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
          <span style={{ fontSize: 18 }}>+</span>
          Thêm tài xế
        </button>
      </div>

      {error && (
        <div
          style={{
            background: 'rgba(248,113,113,0.15)',
            borderRadius: 8,
            padding: '10px 12px',
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
          <div>Mã nhân viên</div>
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
        ) : filteredDrivers.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Không tìm thấy tài xế phù hợp</div>
        ) : (
          filteredDrivers.map((driver, index) => (
            <div
              key={driver.MaTaiXe}
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
              <div>{driver.MaNhanVien || '--'}</div>
              <div style={{ textAlign: 'left' }}>{driver.HoTen}</div>
              <div>{driver.SoDienThoai}</div>
              <div>{driver.CCCD}</div>
              <div>{driver.LoaiBangLai}</div>
              <div>{driver.TrangThaiTaiXe}</div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button
                  onClick={() => setShowEdit(driver)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#1e293b"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
                <button
                  onClick={() => setShowDelete(driver)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
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

      {showAdd && (
        <DriverFormModal
          title="Thêm mới tài xế"
          initialValues={initialDriverForm}
          submitLabel="Lưu tài xế"
          onClose={() => setShowAdd(false)}
          onSubmit={async (values) => {
            const response = await api.post<CreateDriverResponse>('/drivers', {
              ...values,
              TrangThaiTaiXe: DRIVER_STATUS.AVAILABLE
            })
            const defaultPassword = response.data.account?.MatKhauMacDinh || DEFAULT_DRIVER_PASSWORD
            setShowAdd(false)
            await fetchDrivers()
            setSuccessMessage(
              `Thêm tài xế mới thành công. Tài khoản đăng nhập: ${response.data.account?.TenDangNhap} / ${defaultPassword}`
            )
          }}
        />
      )}

      {showEdit && (
        <DriverFormModal
          title="Chỉnh sửa tài xế"
          initialValues={{
            MaNhanVien: showEdit.MaNhanVien || '',
            HoTen: showEdit.HoTen,
            SoDienThoai: showEdit.SoDienThoai,
            CCCD: showEdit.CCCD,
            LoaiBangLai: showEdit.LoaiBangLai || ''
          }}
          submitLabel="Lưu tài xế"
          onClose={() => setShowEdit(null)}
          onSubmit={async (values) => {
            await api.put(`/drivers/${showEdit.MaTaiXe}`, values)
            setShowEdit(null)
            await fetchDrivers()
            setSuccessMessage('Cập nhật tài xế thành công')
          }}
        />
      )}

      {showDelete && (
        <DeleteDriverModal
          driver={showDelete}
          onClose={() => setShowDelete(null)}
          onSuccess={async () => {
            setShowDelete(null)
            await fetchDrivers()
            setSuccessMessage('Đã chuyển tài xế sang ngừng hoạt động')
          }}
        />
      )}

      {successMessage && <SuccessModal message={successMessage} onClose={() => setSuccessMessage(null)} />}
    </DispatcherLayout>
  )
}

interface DriverFormModalProps {
  title: string
  initialValues: DriverFormValues
  submitLabel: string
  onClose: () => void
  onSubmit: (values: DriverFormValues) => Promise<void>
}

const DriverFormModal: React.FC<DriverFormModalProps> = ({
  title,
  initialValues,
  submitLabel,
  onClose,
  onSubmit
}) => {
  const [form, setForm] = useState<DriverFormValues>(initialValues)
  const [fieldErrors, setFieldErrors] = useState<DriverFieldErrors>({})
  const [generalError, setGeneralError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const updateField = <K extends keyof DriverFormValues>(field: K, value: DriverFormValues[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }))
    setGeneralError(null)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const nextErrors = validateDriverForm(form)

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors)
      return
    }

    setSaving(true)
    setGeneralError(null)

    try {
      await onSubmit({
        ...form,
        MaNhanVien: form.MaNhanVien.trim(),
        HoTen: form.HoTen.trim(),
        SoDienThoai: normalizePhoneNumber(form.SoDienThoai),
        CCCD: form.CCCD.trim(),
        LoaiBangLai: form.LoaiBangLai
      })
    } catch (error: unknown) {
      const err = error as {
        response?: {
          data?: {
            message?: string
            data?: {
              fieldErrors?: DriverFieldErrors
            }
          }
        }
      }

      const backendFieldErrors = err.response?.data?.data?.fieldErrors
      if (backendFieldErrors) {
        setFieldErrors((prev) => ({ ...prev, ...backendFieldErrors }))
        return
      }

      setGeneralError(err.response?.data?.message ?? 'Không thể lưu thông tin tài xế')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalOverlay>
      <div style={{ width: 820, background: '#fff', borderRadius: 8, position: 'relative', padding: '32px 48px' }}>
        <button
          onClick={onClose}
          style={{ position: 'absolute', right: 24, top: 24, border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6L18 18" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <h2 style={{ fontSize: 24, fontWeight: 700, fontFamily: 'Roboto, sans-serif', color: '#000', marginBottom: 32 }}>
          {title}
        </h2>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 48, rowGap: 24 }}>
          <FormField label="Họ tên" required error={fieldErrors.HoTen}>
            <input
              type="text"
              value={form.HoTen}
              onChange={(event) => updateField('HoTen', event.target.value)}
              style={inputStyle(Boolean(fieldErrors.HoTen))}
            />
          </FormField>

          <FormField label="Mã nhân viên" required error={fieldErrors.MaNhanVien}>
            <input
              type="text"
              value={form.MaNhanVien}
              onChange={(event) => updateField('MaNhanVien', event.target.value)}
              style={inputStyle(Boolean(fieldErrors.MaNhanVien))}
            />
          </FormField>

          <FormField label="Số điện thoại" required error={fieldErrors.SoDienThoai}>
            <input
              type="tel"
              value={form.SoDienThoai}
              onChange={(event) => updateField('SoDienThoai', event.target.value)}
              style={inputStyle(Boolean(fieldErrors.SoDienThoai))}
            />
          </FormField>

          <FormField label="Số CCCD/CMND" required error={fieldErrors.CCCD}>
            <input
              type="text"
              value={form.CCCD}
              onChange={(event) => updateField('CCCD', event.target.value)}
              style={inputStyle(Boolean(fieldErrors.CCCD))}
            />
          </FormField>

          <FormField label="Loại bằng lái" required error={fieldErrors.LoaiBangLai}>
            <select
              value={form.LoaiBangLai}
              onChange={(event) => updateField('LoaiBangLai', event.target.value)}
              style={selectStyle(Boolean(fieldErrors.LoaiBangLai))}
            >
              <option value="">-- Chọn loại bằng lái --</option>
              {LICENSE_OPTIONS.map((licenseType) => (
                <option key={licenseType} value={licenseType}>
                  {licenseType}
                </option>
              ))}
            </select>
          </FormField>

          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 12, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
            <button type="button" onClick={onClose} style={driverFormSecondaryButtonStyle}>
              Hủy bỏ
            </button>
            <button type="submit" disabled={saving} style={{ ...driverFormPrimaryButtonStyle, opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Đang lưu...' : submitLabel}
            </button>
          </div>
        </form>

        {generalError && <div style={{ color: '#dc2626', marginTop: 16, textAlign: 'center' }}>{generalError}</div>}
      </div>
    </ModalOverlay>
  )
}

interface DeleteDriverModalProps {
  driver: Driver
  onClose: () => void
  onSuccess: () => Promise<void>
}

const DeleteDriverModal: React.FC<DeleteDriverModalProps> = ({ driver, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDelete = async () => {
    setLoading(true)
    setError(null)

    try {
      await api.delete(`/drivers/${driver.MaTaiXe}`)
      await onSuccess()
    } catch (error: unknown) {
      const err = error as {
        response?: {
          status?: number
          data?: {
            message?: string
          }
        }
      }

      const status = err.response?.status ?? 0
      const message = err.response?.data?.message ?? 'Không thể cập nhật trạng thái tài xế'

      if (status > 0 && status < 500) {
        setError(message || BUSY_DRIVER_DELETE_MESSAGE)
        return
      }

      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalOverlay>
      <div style={{ width: 600, background: '#fff', borderRadius: 8, padding: '48px 32px', textAlign: 'center' }}>
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: '#D2EAFF',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            margin: '0 auto 24px'
          }}
        >
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              stroke="#1E5FA8"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h2 style={{ fontSize: 24, fontWeight: 700, fontFamily: 'Roboto, sans-serif', color: '#000', marginBottom: 16 }}>
          Xác nhận ngừng hoạt động tài xế
        </h2>

        <p style={{ color: '#64748B', margin: '0 0 24px 0' }}>
          {driver.HoTen} - {driver.MaNhanVien || '--'}
        </p>

        {error && (
          <div
            style={{
              background: 'rgba(248,113,113,0.15)',
              color: '#dc2626',
              borderRadius: 8,
              padding: '10px 12px',
              marginBottom: 24
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 24, padding: '0 48px', justifyContent: 'center' }}>
          <button onClick={handleDelete} disabled={loading} style={{ ...primaryButtonStyle, maxWidth: 220 }}>
            {loading ? 'Đang xử lý...' : 'Xác nhận'}
          </button>
          <button onClick={onClose} style={{ ...secondaryButtonStyle, maxWidth: 220 }}>
            Hủy
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}

interface SuccessModalProps {
  message: string
  onClose: () => void
}

const SuccessModal: React.FC<SuccessModalProps> = ({ message, onClose }) => {
  return (
    <ModalOverlay>
      <div
        style={{
          width: 450,
          background: '#fff',
          borderRadius: 16,
          padding: '48px 32px',
          textAlign: 'center',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
        }}
      >
        <h2 style={{ fontSize: 24, fontWeight: 700, fontFamily: 'Roboto, sans-serif', color: '#000', marginBottom: 32 }}>
          Thông báo
        </h2>

        <p style={{ fontSize: 20, fontFamily: 'Roboto, sans-serif', color: '#000', marginBottom: 40 }}>{message}</p>

        <button onClick={onClose} style={{ ...primaryButtonStyle, maxWidth: 180, height: 50 }}>
          Đóng
        </button>
      </div>
    </ModalOverlay>
  )
}

interface FormFieldProps {
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
}

const FormField: React.FC<FormFieldProps> = ({ label, required = false, error, children }) => {
  return (
    <div>
      <label style={labelStyle}>
        {label}
        {required ? ' *' : ''}
      </label>
      {children}
      <div style={fieldErrorStyle}>{error || ''}</div>
    </div>
  )
}

function validateDriverForm(values: DriverFormValues) {
  const nextErrors: DriverFieldErrors = {}
  const normalizedPhoneNumber = normalizePhoneNumber(values.SoDienThoai)

  if (!values.MaNhanVien.trim()) {
    nextErrors.MaNhanVien = 'Vui lòng nhập mã nhân viên'
  }

  if (!values.HoTen.trim()) {
    nextErrors.HoTen = 'Vui lòng nhập họ tên'
  }

  if (!normalizedPhoneNumber) {
    nextErrors.SoDienThoai = 'Vui lòng nhập số điện thoại'
  } else if (!/^0\d{9}$/.test(normalizedPhoneNumber)) {
    nextErrors.SoDienThoai = 'Số điện thoại không hợp lệ (10 chữ số, bắt đầu bằng 0)'
  }

  if (!values.CCCD.trim()) {
    nextErrors.CCCD = 'Vui lòng nhập CCCD'
  } else if (!/^\d{12}$/.test(values.CCCD.trim())) {
    nextErrors.CCCD = 'CCCD không hợp lệ (12 chữ số)'
  }

  if (!values.LoaiBangLai) {
    nextErrors.LoaiBangLai = 'Vui lòng chọn loại bằng lái'
  }

  return nextErrors
}

function normalizePhoneNumber(raw: string) {
  const compactValue = String(raw || '')
    .trim()
    .replace(/[\s.-]/g, '')

  if (/^\+84\d{9}$/.test(compactValue)) {
    return `0${compactValue.slice(3)}`
  }

  if (/^84\d{9}$/.test(compactValue)) {
    return `0${compactValue.slice(2)}`
  }

  return compactValue
}

const ModalOverlay: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.4)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000
    }}
  >
    {children}
  </div>
)

const labelStyle: React.CSSProperties = {
  color: '#000',
  fontSize: 18,
  fontFamily: 'Roboto, sans-serif',
  fontWeight: 500,
  marginBottom: 8,
  display: 'block'
}

const fieldErrorStyle: React.CSSProperties = {
  minHeight: 22,
  marginTop: 6,
  color: '#dc2626',
  fontSize: 14
}

const baseInputStyle: React.CSSProperties = {
  width: '100%',
  height: 52,
  background: '#fff',
  borderRadius: 8,
  border: '1px solid #4A4A4A',
  padding: '0 16px',
  fontSize: 18,
  fontFamily: 'Roboto, sans-serif',
  color: '#000',
  boxSizing: 'border-box',
  outline: 'none'
}

const inputStyle = (invalid: boolean): React.CSSProperties => ({
  ...baseInputStyle,
  borderColor: invalid ? '#dc2626' : '#4A4A4A'
})

const selectStyle = (invalid: boolean): React.CSSProperties => ({
  ...inputStyle(invalid),
  cursor: 'pointer',
  appearance: 'none',
  backgroundImage:
    'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%234A4A4A%22%20d%3D%22M287%2069.4a13.6%2013.6%200%200%200-19.3%200l-121.5%20121.5L24.7%2069.4a13.6%2013.6%200%200%200-19.3%200%2013.6%2013.6%200%200%200%200%2019.3l131.1%20131.1c5.3%205.3%2014%205.3%2019.3%200L287%2088.7a13.6%2013.6%200%200%200%200-19.3z%22%2F%3E%3C%2Fsvg%3E")',
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 16px top 50%',
  backgroundSize: '16px auto'
})

const primaryButtonStyle: React.CSSProperties = {
  flex: 1,
  height: 48,
  borderRadius: 8,
  border: 'none',
  background: '#1E5FA8',
  color: '#fff',
  fontSize: 18,
  fontFamily: 'Roboto, sans-serif',
  fontWeight: 700,
  cursor: 'pointer'
}

const secondaryButtonStyle: React.CSSProperties = {
  flex: 1,
  height: 48,
  borderRadius: 8,
  border: '1px solid #4A4A4A',
  background: '#fff',
  color: '#000',
  fontSize: 18,
  fontFamily: 'Roboto, sans-serif',
  fontWeight: 700,
  cursor: 'pointer'
}
