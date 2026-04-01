function isValidPhoneNumber(value) {
  return /^0\d{9}$/.test(String(value || '').trim());
}

function isValidNationalId(value) {
  return /^\d{12}$/.test(String(value || '').trim());
}

function isValidVehiclePlate(value) {
  return /^\d{2}[A-Z]-\d{3}\.\d{2}$/.test(String(value || '').trim().toUpperCase());
}

function normalizeVehiclePlate(value) {
  return String(value || '').trim().toUpperCase();
}

function toPositiveInteger(value) {
  const numericValue = Number(value);
  if (!Number.isInteger(numericValue) || numericValue <= 0) {
    return null;
  }

  return numericValue;
}

function isValidSeatCount(value) {
  const seatCount = toPositiveInteger(value);
  return seatCount != null && seatCount >= 4 && seatCount <= 45;
}

module.exports = {
  isValidNationalId,
  isValidPhoneNumber,
  isValidSeatCount,
  isValidVehiclePlate,
  normalizeVehiclePlate,
  toPositiveInteger
};
