// Helper function for permission error messages
export const getPermissionErrorMessage = (error, defaultMessage) => {
  // Check for API response error first
  if (error?.response?.data?.error) {
    return error.response.data.error;
  }
  
  // Check for generic error message
  if (error?.message) {
    return error.message;
  }
  
  // Fall back to default message
  return defaultMessage;
};

// Check if user has write permissions (for UI display)
export const hasWritePermission = (permissions, resource) => {
  if (!permissions || !resource) return false;
  
  // Get the permission value
  const access = permissions[resource];
  
  // Handle different permission formats
  if (typeof access === 'string') {
    const normalized = access.toLowerCase();
    return normalized === 'write' || normalized === 'rw';
  }
  
  return false;
};

// Check if user has read permissions
export const hasReadPermission = (permissions, resource) => {
  if (!permissions || !resource) return false;
  
  // Get the permission value
  const access = permissions[resource];
  
  // Handle different permission formats
  if (typeof access === 'string') {
    const normalized = access.toLowerCase();
    return normalized === 'read' || normalized === 'write' || 
           normalized === 'r' || normalized === 'rw';
  }
  
  return false;
};

// Helper to get current user's permissions
export const getUserPermissions = () => {
  // This assumes you store permissions in localStorage or context
  try {
    const userData = localStorage.getItem('user');
    if (userData) {
      const user = JSON.parse(userData);
      return user.permissions || user.role?.permissions || {};
    }
  } catch (error) {
    console.error('Error getting user permissions:', error);
  }
  return {};
};