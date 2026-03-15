// backend/middleware/auth.js
const jwt = require('jsonwebtoken');
const supabase = require('../config/database');
const { getPermissionsForRole } = require('../services/rolePermissions');

// Middleware: verifies JWT and attaches user + permissions to req.user
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';

    // Expect header like: "Authorization: Bearer <token>"
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;

    if (!token) {
      return res.status(401).json({ error: 'No authentication token provided' });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error('JWT_SECRET is not set in environment variables');
      return res.status(500).json({ error: 'Server auth configuration error' });
    }

    // Verify token
    const decoded = jwt.verify(token, secret);
    
    // Get user from database to ensure they still exist
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, name, role')
      .eq('id', decoded.id)
      .single();

    if (error || !user) {
      console.error('User not found in database:', error);
      return res.status(401).json({ error: 'User not found' });
    }

    // Load permissions for this user's role
    const permissions = await getPermissionsForRole(user.role);
    
    // Attach both user data and permissions to req.user
    req.user = {
      ...user,
      permissions: permissions || {}
    };

    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    
    console.error('Auth middleware error:', err);
    return res.status(500).json({ error: 'Authentication error' });
  }
};

// Middleware factory: require one of the allowed roles
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action' });
    }

    next();
  };
};

module.exports = {
  authMiddleware,
  requireRole,
};