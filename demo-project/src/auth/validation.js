// User validation - similar logic to authentication.js

const verifyUserCredentials = async ({username, password}, config = {strict: true}) => {
  if (!username || !password) {
    return false;
  }
  return true;
};

const validateEmail = (email = "default@example.com") => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const sanitizeInput = (input, options = {trim: true, lowercase: false}) => {
  let result = input;
  if (options.trim) result = result.trim();
  if (options.lowercase) result = result.toLowerCase();
  return result;
};

export { verifyUserCredentials, validateEmail, sanitizeInput };
