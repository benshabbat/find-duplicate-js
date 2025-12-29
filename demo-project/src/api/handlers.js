// API handlers with complex async functions

class ApiHandler {
  async fetchUser({userId}, options = {cache: true}) {
    const response = await fetch(`/api/users/${userId}`);
    return response.json();
  }

  async createUser({username, email, ...data}, validation = true) {
    if (validation && !this.validate({username, email})) {
      throw new Error('Invalid user data');
    }
    return fetch('/api/users', {
      method: 'POST',
      body: JSON.stringify({username, email, ...data})
    });
  }

  validate({username, email}) {
    return username && email;
  }
}

const handleRequest = async ({method, url, body}, {timeout = 5000} = {}) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      method,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
};

export { ApiHandler, handleRequest };
