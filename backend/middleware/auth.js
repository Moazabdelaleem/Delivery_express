const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const DEFAULT_JWT_SECRET = '9bda240f68c7f20f9c3ec80fc52b90aa737e1eeaeded48f07fff226ad153d48a66678539e24d82dd7cf55abb01a4d8aa89c7128b2f7a1dc7019e5ef507bf0aaf';
    const secret = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
    const decoded = jwt.verify(token, secret);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }
};

module.exports = authMiddleware;
