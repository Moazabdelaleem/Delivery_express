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

    // Manager Guard: Manager role has read-only access across standard business operations, 
    // BUT is authorized for Executive Manager Account Approvals and System Clean Wipe.
    if (role === 'manager') {
      const isManagerAdminAction = req.path.includes('/approve-manager') || 
                                   req.path.includes('/reject-manager') || 
                                   req.path.includes('/seed/clean');
      if (req.method !== 'GET' && !isManagerAdminAction) {
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
