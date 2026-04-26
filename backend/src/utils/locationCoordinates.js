const ADDRESS_COORDINATE_LOOKUP = {
  'ben xe da nang': { lat: 16.0677, lng: 108.1886 },
  'ben xe trung tam da nang': { lat: 16.0677, lng: 108.1886 },
  '56 chu manh trinh': { lat: 16.0612, lng: 108.2218 },
  '36 tu quy': { lat: 16.0755, lng: 108.2422 },
  '12 nguyen van linh': { lat: 16.0548, lng: 108.2195 },
  '34 le duan': { lat: 16.071, lng: 108.22 },
  '56 tran phu': { lat: 16.0678, lng: 108.2245 },
  '78 hung vuong': { lat: 16.0695, lng: 108.2158 },
  '90 dien bien phu': { lat: 16.0616, lng: 108.2016 },
  '123 nguyen tat thanh': { lat: 16.086, lng: 108.2035 },
  '45 bach dang': { lat: 16.0687, lng: 108.2248 },
  '67 tran hung dao': { lat: 16.0638, lng: 108.2302 },
  '89 le loi': { lat: 16.0671, lng: 108.2192 },
  '101 nguyen hoang': { lat: 16.0614, lng: 108.2059 },
  '202 ton duc thang': { lat: 16.0738, lng: 108.1662 },
  '303 nguyen luong bang': { lat: 16.078, lng: 108.1506 },
  '404 pham hung': { lat: 16.025, lng: 108.182 },
  '505 le trong tan': { lat: 16.03, lng: 108.1718 },
  '606 truong chinh': { lat: 16.045, lng: 108.179 },
  '707 dien bien phu': { lat: 16.0548, lng: 108.1914 },
  '808 hai phong': { lat: 16.0697, lng: 108.2054 },
  '909 nui thanh': { lat: 16.0351, lng: 108.2219 },
  '1010 tieu la': { lat: 16.0417, lng: 108.223 },
  '1111 phan dang luu': { lat: 16.0346, lng: 108.2138 },
  'benh vien da nang': { lat: 16.072, lng: 108.2204 },
  'dai hoc bach khoa da nang': { lat: 16.0748, lng: 108.1482 },
  'cau rong': { lat: 16.0616, lng: 108.227 },
  'san bay quoc te da nang': { lat: 16.0439, lng: 108.1997 },
  'cho con': { lat: 16.0676, lng: 108.2117 },
  'cang tien sa': { lat: 16.1219, lng: 108.2394 },
  'bai bien my khe': { lat: 16.0544, lng: 108.2465 },
  'cong vien chau a asia park': { lat: 16.038, lng: 108.2266 },
  'cong vien chau a': { lat: 16.038, lng: 108.2266 },
  'khu du lich ngu hanh son': { lat: 16.0036, lng: 108.2643 },
  'dai hoc kinh te da nang': { lat: 16.054, lng: 108.2284 },
  'benh vien phu san nhi': { lat: 16.0413, lng: 108.2233 },
  'cho han': { lat: 16.0713, lng: 108.2243 },
  'chua linh ung': { lat: 16.1077, lng: 108.2771 },
  'ga da nang': { lat: 16.0739, lng: 108.2114 },
  'vincom plaza ngo quyen': { lat: 16.0614, lng: 108.2314 },
  'dai hoc duy tan': { lat: 16.0609, lng: 108.2097 },
  'benh vien ung buou da nang': { lat: 16.0348, lng: 108.2089 },
  'ben xe buyt xuan dieu': { lat: 16.0829, lng: 108.2081 },
  'cau tran thi ly': { lat: 16.0452, lng: 108.2285 },
  'bao tang dieu khac cham': { lat: 16.0605, lng: 108.2211 },
  'doc duong di': { lat: 16.06, lng: 108.21 }
};

function normalizeAddressKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function lookupAddressCoordinates(address) {
  const normalized = normalizeAddressKey(address);

  if (!normalized) {
    return null;
  }

  if (ADDRESS_COORDINATE_LOOKUP[normalized]) {
    return ADDRESS_COORDINATE_LOOKUP[normalized];
  }

  const matchedKey = Object.keys(ADDRESS_COORDINATE_LOOKUP)
    .sort((left, right) => right.length - left.length)
    .find((key) => normalized.includes(key));

  return matchedKey ? ADDRESS_COORDINATE_LOOKUP[matchedKey] : null;
}

module.exports = {
  lookupAddressCoordinates,
  normalizeAddressKey
};
