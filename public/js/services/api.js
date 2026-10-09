// SENTINEL API Client Helper with CSRF & Error Handling

function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

export class ApiClient {
  constructor() {
    this.csrfToken = null;
  }

  setCsrfToken(token) {
    this.csrfToken = token;
  }

  getCsrfToken() {
    return this.csrfToken || getCookie('sentinel_csrf');
  }

  async request(endpoint, options = {}) {
    const headers = options.headers || {};
    const method = (options.method || 'GET').toUpperCase();

    // Include CSRF token on state-changing methods
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const token = this.getCsrfToken();
      if (token) {
        headers['x-csrf-token'] = token;
      }
    }

    if (!(options.body instanceof FormData) && !headers['Content-Type'] && options.body) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    const response = await fetch(endpoint, {
      ...options,
      headers,
      credentials: 'same-origin'
    });

    if (response.status === 204) return null;

    let data;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      const errorMessage = data?.error || (typeof data === 'string' ? data : `Request failed (${response.status})`);
      const error = new Error(errorMessage);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  }

  get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  }

  post(endpoint, body) {
    return this.request(endpoint, { method: 'POST', body });
  }

  patch(endpoint, body) {
    return this.request(endpoint, { method: 'PATCH', body });
  }

  put(endpoint, body) {
    return this.request(endpoint, { method: 'PUT', body });
  }

  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }

  upload(endpoint, formData) {
    return this.request(endpoint, {
      method: 'POST',
      body: formData
    });
  }
}

export const api = new ApiClient();
