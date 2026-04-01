const { verifyAccessToken } = require('../utils/auth');

function readBearerToken(req) {
  const authorization = String(req.headers.authorization || '').trim();
  if (!authorization.startsWith('Bearer ')) {
    return null;
  }

  const token = authorization.slice('Bearer '.length).trim();
  return token || null;
}

function requireAuth(req, res, next) {
  const token = readBearerToken(req);
  if (!token) {
    return res.status(401).json({ message: 'Vui lòng đăng nhập để tiếp tục' });
  }

  try {
    req.auth = verifyAccessToken(token);
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn' });
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.auth) {
      return res.status(401).json({ message: 'Vui lòng đăng nhập để tiếp tục' });
    }

    if (!allowedRoles.includes(req.auth.VaiTro)) {
      return res.status(403).json({ message: 'Bạn không có quyền truy cập chức năng này' });
    }

    return next();
  };
}

module.exports = {
  readBearerToken,
  requireAuth,
  requireRole
};
