const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('budgetvault_token');
}

async function request(endpoint, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  const data = await res.json();

  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem('budgetvault_token');
      localStorage.removeItem('budgetvault_user');
      window.location.href = '/login';
    }
    throw new Error(data.error || 'Erreur serveur');
  }
  return data;
}

export const api = {
  // Internal request helper (used by sync engine)
  request,
  // Auth
  login: (username, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  changePassword: (currentPassword, newPassword) => request('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
  getMe: () => request('/auth/me'),
  updateSettings: (data) => request('/auth/settings', { method: 'PUT', body: JSON.stringify(data) }),

  // Budget
  getBudget: () => request('/budget'),
  updateBudget: (balance) => request('/budget', { method: 'PUT', body: JSON.stringify({ balance }) }),

  // Expenses
  getExpenses: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/expenses${qs ? '?' + qs : ''}`);
  },
  createExpense: (data) => request('/expenses', { method: 'POST', body: JSON.stringify(data) }),
  updateExpense: (id, data) => request(`/expenses/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteExpense: (id) => request(`/expenses/${id}`, { method: 'DELETE' }),

  // Categories
  getCategories: () => request('/categories'),
  createCategory: (data) => request('/categories', { method: 'POST', body: JSON.stringify(data) }),
  updateCategory: (id, data) => request(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCategory: (id) => request(`/categories/${id}`, { method: 'DELETE' }),

  // Recurring
  getRecurring: () => request('/recurring'),
  createRecurring: (data) => request('/recurring', { method: 'POST', body: JSON.stringify(data) }),
  updateRecurring: (id, data) => request(`/recurring/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRecurring: (id) => request(`/recurring/${id}`, { method: 'DELETE' }),

  // Analytics
  getSummary: (cycle) => request(`/analytics/summary${cycle ? '?cycle=' + cycle : ''}`),
  getByCategory: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/analytics/by-category${qs ? '?' + qs : ''}`);
  },
  getHistory: (limit) => request(`/analytics/history?limit=${limit || 12}`),
  getDaily: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/analytics/daily${qs ? '?' + qs : ''}`);
  },

  // Upload
  uploadReceipt: async (file) => {
    const form = new FormData();
    form.append('image', file);
    const token = getToken();
    const res = await fetch(`${API_BASE}/upload/receipt`, {
      method: 'POST', body: form,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error('Upload échoué');
    return res.json();
  },

  uploadCategoryIcon: async (file) => {
    const form = new FormData();
    form.append('image', file);
    const token = getToken();
    const res = await fetch(`${API_BASE}/upload/category-icon`, {
      method: 'POST', body: form,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error('Upload échoué');
    return res.json();
  },

  // Push
  getVapidKey: () => request('/push/vapid-key'),
  subscribePush: (subscription) => request('/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription }) }),
  unsubscribePush: () => request('/push/unsubscribe', { method: 'DELETE' }),
};
