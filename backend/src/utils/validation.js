const USERNAME_REGEX = /^[A-Za-z0-9._-]{3,50}$/;

function normalizeUsername(value) {
  return String(value || '').trim();
}

function isValidUsername(value) {
  return USERNAME_REGEX.test(normalizeUsername(value));
}

function isValidPasswordLength(value) {
  return typeof value === 'string' && value.length >= 8;
}

function normalizeVietnamPhoneNumber(value) {
  const trimmed = String(value || '')
    .trim()
    .replace(/[\s.-]/g, '');

  if (/^\+84\d{9}$/.test(trimmed)) {
    return `0${trimmed.slice(3)}`;
  }

  if (/^84\d{9}$/.test(trimmed)) {
    return `0${trimmed.slice(2)}`;
  }

  return trimmed;
}

function isValidPhoneNumber(value) {
  return /^0\d{9}$/.test(normalizeVietnamPhoneNumber(value));
}

function isValidNationalId(value) {
  return /^\d{12}$/.test(String(value || '').trim());
}

function normalizeVehiclePlate(value) {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');

  const compactFormatMatch = normalized.match(/^(\d{2})([A-Z]{1,2})-?(\d{3})\.?(\d{2})$/);
  if (compactFormatMatch) {
    const [, provinceCode, series, firstDigits, lastDigits] = compactFormatMatch;
    return `${provinceCode}${series}-${firstDigits}${lastDigits}`;
  }

  return normalized;
}

function normalizeVehiclePlateLookupKey(value) {
  return normalizeVehiclePlate(value).replace(/[^A-Z0-9]/g, '');
}

function isValidVehiclePlate(value) {
  return /^\d{2}[A-Z]{1,2}-\d{5}$/.test(normalizeVehiclePlate(value));
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
  isValidPasswordLength,
  isValidNationalId,
  isValidPhoneNumber,
  isValidSeatCount,
  isValidUsername,
  isValidVehiclePlate,
  normalizeVietnamPhoneNumber,
  normalizeUsername,
  normalizeVehiclePlate,
  normalizeVehiclePlateLookupKey,
  toPositiveInteger
};
