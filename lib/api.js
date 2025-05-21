/**
 * A utility function to handle API requests with proper error handling
 * @param {string} url - The API endpoint URL
 * @param {Object} options - Fetch options (method, headers, body, etc.)
 * @returns {Promise<Object>} - The parsed JSON response
 */
export async function fetchWithErrorHandling(url, options = {}) {
  // Set default headers
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      // Only include body if it's not a GET or HEAD request
      ...(options.body && { body: JSON.stringify(options.body) }),
    });

    // Parse response as JSON if the content-type is JSON
    const contentType = response.headers.get('content-type');
    const isJson = contentType && contentType.includes('application/json');
    const data = isJson ? await response.json() : await response.text();n
    if (!response.ok) {
      // If the response has a JSON error message, use it
      const error = new Error(data.message || `HTTP error! status: ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  } catch (error) {
    console.error('API request failed:', error);
    
    // Handle network errors
    if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
      throw new Error('Unable to connect to the server. Please check your internet connection.');
    }

    // Re-throw the error with additional context if available
    if (error.status) {
      throw error;
    }

    throw new Error('An unexpected error occurred. Please try again later.');
  }
}

/**
 * API client with common methods for the application
 */
export const api = {
  /**
   * Register a new user
   * @param {Object} userData - User registration data
   * @returns {Promise<Object>} - The created user data
   */
  async register(userData) {
    return fetchWithErrorHandling('/api/auth/register', {
      method: 'POST',
      body: userData,
    });
  },

  /**
   * Login a user
   * @param {Object} credentials - User credentials (email, password)
   * @returns {Promise<Object>} - The session data
   */
  async login(credentials) {
    const response = await fetchWithErrorHandling('/api/auth/callback/credentials', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        ...credentials,
        redirect: false,
        callbackUrl: '/',
      }),
    });

    return response;
  },

  /**
   * Logout the current user
   * @returns {Promise<void>}
   */
  async logout() {
    await fetchWithErrorHandling('/api/auth/signout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
  },

  /**
   * Get the current user's session
   * @returns {Promise<Object>} - The current session data
   */
  async getSession() {
    return fetchWithErrorHandling('/api/auth/session');
  },

  /**
   * Update user profile
   * @param {Object} userData - The updated user data
   * @returns {Promise<Object>} - The updated user data
   */
  async updateProfile(userData) {
    return fetchWithErrorHandling('/api/user/profile', {
      method: 'PUT',
      body: userData,
    });
  },

  /**
   * Change user password
   * @param {Object} passwordData - The current and new password
   * @returns {Promise<Object>} - The response data
   */
  async changePassword(passwordData) {
    return fetchWithErrorHandling('/api/user/change-password', {
      method: 'POST',
      body: passwordData,
    });
  },

  /**
   * Request a password reset
   * @param {string} email - The user's email address
   * @returns {Promise<Object>} - The response data
   */
  async requestPasswordReset(email) {
    return fetchWithErrorHandling('/api/auth/forgot-password', {
      method: 'POST',
      body: { email },
    });
  },

  /**
   * Reset password with a token
   * @param {Object} resetData - The reset token and new password
   * @returns {Promise<Object>} - The response data
   */
  async resetPassword(resetData) {
    return fetchWithErrorHandling('/api/auth/reset-password', {
      method: 'POST',
      body: resetData,
    });
  },

  /**
   * Verify an email with a token
   * @param {string} token - The verification token
   * @returns {Promise<Object>} - The response data
   */
  async verifyEmail(token) {
    return fetchWithErrorHandling(`/api/auth/verify-email?token=${token}`, {
      method: 'GET',
    });
  },
};
