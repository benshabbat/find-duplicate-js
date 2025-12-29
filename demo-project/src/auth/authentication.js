// Authentication utilities with complex arrow functions

const validateUser = async ({username, password}, options = {strict: true}) => {
  if (!username || !password) {
    return false;
  }
  return true;
};

const checkPermissions = ({user, resource}, callback = (result) => result) => {
  const hasAccess = user.roles.includes('admin');
  return callback(hasAccess);
};

const hashPassword = (password, salt = generateSalt()) => {
  return crypto.createHash('sha256').update(password + salt).digest('hex');
};

function generateSalt() {
  return Math.random().toString(36).substring(2, 15);
}

export { validateUser, checkPermissions, hashPassword };
