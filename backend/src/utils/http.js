function sendSuccess(res, data, message = 'OK', status = 200) {
  return res.status(status).json({
    success: true,
    message,
    data,
    errorCode: null
  });
}

function sendError(res, status, message, errorCode = 'REQUEST_ERROR', data = null) {
  return res.status(status).json({
    success: false,
    message,
    data,
    errorCode
  });
}

module.exports = {
  sendError,
  sendSuccess
};
