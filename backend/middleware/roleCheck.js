/**
 * RBAC Middleware
 * Allows specifying roles authorized for an endpoint.
 * Note: Manager has full access to ALL GET endpoints, but is strictly blocked from POST/PUT/DELETE mutations.
 */
const roleCheck = (allowedRoles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized user.' });
    }

    const { role } = req.user;

    // Manager Guard: Manager role has read-only access across GET endpoints,
    // and mutation access for endpoints where 'manager' is explicitly listed in allowedRoles.
    if (role === 'manager') {
      const isExplicitlyAllowed = allowedRoles.length > 0 && allowedRoles.includes('manager');
      if (req.method !== 'GET' && !isExplicitlyAllowed) {
        return res.status(403).json({
          error: 'Access Forbidden: The Manager role has READ-ONLY permissions and cannot perform edit or create actions.'
        });
      }
      return next();
    }

    // Check if user's role is permitted
    if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
      return res.status(403).json({ 
        error: `Access Forbidden: Required role (${allowedRoles.join(' or ')}) not held by user role (${role}).` 
      });
    }

    next();
  };
};

module.exports = roleCheck;
