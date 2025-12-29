// Service layer with similar logic

class UserService {
  async getUser({userId}, config = {cache: true}) {
    const response = await fetch(`/api/users/${userId}`);
    return response.json();
  }

  async addUser({username, email, ...data}, shouldValidate = true) {
    if (shouldValidate && !this.validateUser({username, email})) {
      throw new Error('Invalid user data');
    }
    return fetch('/api/users', {
      method: 'POST',
      body: JSON.stringify({username, email, ...data})
    });
  }

  validateUser({username, email}) {
    return username && email;
  }
}

const makeRequest = async ({method, url, body}, {timeout = 5000} = {}) => {
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

export { UserService, makeRequest };
