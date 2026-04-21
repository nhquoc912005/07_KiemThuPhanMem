export const ROUTE_STATUS = {
  PENDING: 'Chưa thực hiện',
  IN_PROGRESS: 'Đang thực hiện',
  INCIDENT: 'Đang gặp sự cố',
  COMPLETED: 'Hoàn thành',
  CANCELLED: 'Đã hủy'
} as const

export const STOP_STATUS = {
  WAITING: '',
  ARRIVED_PICKUP: 'Đã đến điểm đón',
  PICKED_UP: 'Đã đón khách',
  DROPPED_OFF: 'Đã trả khách',
  CUSTOMER_CANCELLED: 'Khách hủy'
} as const

export const DRIVER_STATUS = {
  AVAILABLE: 'Rảnh',
  ASSIGNED: 'Đã phân công',
  IN_PROGRESS: 'Đang thực hiện',
  INACTIVE: 'Ngừng hoạt động',
} as const

export const VEHICLE_STATUS = {
  AVAILABLE: 'Rảnh',
  ASSIGNED: 'Đã phân công',
  RUNNING: 'Đang chạy',
  MAINTENANCE: 'Bảo trì',
  INACTIVE: 'Ngừng hoạt động',
} as const

export const CUSTOMER_STATUS = {
  ACTIVE: 'Hoạt động',
  INACTIVE: 'Ngừng hoạt động',
} as const

export const TICKET_STATUS = {
  NEEDS_SHUTTLE: 'Cần trung chuyển',
  ASSIGNED: 'Đã có xe trung chuyển',
  IN_PROGRESS: 'Đang trung chuyển',
  COMPLETED: 'Hoàn tất trung chuyển',
  CANCELLED: 'Hủy',
} as const
