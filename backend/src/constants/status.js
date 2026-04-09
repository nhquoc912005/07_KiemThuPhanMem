const ROUTE_STATUSES = {
  PENDING: 'Chưa thực hiện',
  IN_PROGRESS: 'Đang thực hiện',
  INCIDENT: 'Đang gặp sự cố',
  COMPLETED: 'Hoàn thành',
  CANCELLED: 'Đã hủy'
};

const ACTIVE_ROUTE_STATUSES = [
  ROUTE_STATUSES.PENDING,
  ROUTE_STATUSES.IN_PROGRESS,
  ROUTE_STATUSES.INCIDENT
];

const FINAL_ROUTE_STATUSES = [ROUTE_STATUSES.COMPLETED, ROUTE_STATUSES.CANCELLED];

const DRIVER_STATUSES = {
  AVAILABLE: 'Rảnh',
  ASSIGNED: 'Đã phân công',
  IN_PROGRESS: 'Đang thực hiện',
  UNAVAILABLE: 'Không sẵn sàng',
  INACTIVE: 'Ngừng hoạt động'
};

const VEHICLE_STATUSES = {
  AVAILABLE: 'Rảnh',
  ASSIGNED: 'Đã phân công',
  RUNNING: 'Đang chạy',
  MAINTENANCE: 'Bảo trì',
  INACTIVE: 'Ngừng hoạt động'
};

const CUSTOMER_STATUSES = {
  ACTIVE: 'Hoạt động',
  INACTIVE: 'Ngừng hoạt động'
};

const TICKET_STATUSES = {
  NEEDS_SHUTTLE: 'Cần trung chuyển',
  ASSIGNED: 'Đã có xe trung chuyển',
  IN_PROGRESS: 'Đang trung chuyển',
  COMPLETED: 'Hoàn tất trung chuyển',
  CANCELLED: 'Hủy'
};

const STOP_STATUSES = {
  ARRIVED_PICKUP: 'Đã đến điểm đón',
  PICKED_UP: 'Đã đón khách',
  DROPPED_OFF: 'Đã trả khách',
  CUSTOMER_CANCELLED: 'Khách hủy'
};

module.exports = {
  ACTIVE_ROUTE_STATUSES,
  CUSTOMER_STATUSES,
  DRIVER_STATUSES,
  FINAL_ROUTE_STATUSES,
  ROUTE_STATUSES,
  STOP_STATUSES,
  TICKET_STATUSES,
  VEHICLE_STATUSES
};
