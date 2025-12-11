// backend/middleware/auth.js

const jwt = require('jsonwebtoken');

// Middleware: verifies JWT and attaches user to req.user
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';

  // Expect header like: "Authorization: Bearer <token>"
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: 'No authentication token provided' });
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error('JWT_SECRET is not set in environment variables');
      return res.status(500).json({ error: 'Server auth configuration error' });
    }

    const decoded = jwt.verify(token, secret);

    // decoded should contain: { id, email, role, name, iat, exp }
    req.user = decoded;
    next();
  } catch (err) {
    console.error('JWT verification error:', err.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Middleware factory: require one of the allowed roles
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action' });
    }

    next();
  };
}

module.exports = {
  authMiddleware,
  requireRole,
};
