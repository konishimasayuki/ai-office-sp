async function request(path, { method = 'GET', data } = {}) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: data ? { 'Content-Type': 'application/json' } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  });
  let json = {};
  try {
    json = await res.json();
  } catch {
    json = {};
  }
  if (!res.ok) {
    const err = new Error(json.error || `通信エラー（${res.status}）`);
    err.status = res.status;
    throw err;
  }
  return json;
}

export const api = {
  me: () => request('/api/auth'),
  login: (username, password) => request('/api/auth', { method: 'POST', data: { username, password } }),
  logout: () => request('/api/auth', { method: 'DELETE' }),
  users: () => request('/api/users'),
  addUser: (u) => request('/api/users', { method: 'POST', data: u }),
  updateUser: (u) => request('/api/users', { method: 'PUT', data: u }),
  deleteUser: (id) => request(`/api/users?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
  profile: () => request('/api/profile'),
  saveProfile: (p) => request('/api/profile', { method: 'PUT', data: p }),
  tenants: () => request('/api/tenants'),
  addTenant: (t) => request('/api/tenants', { method: 'POST', data: t }),
  updateTenant: (t) => request('/api/tenants', { method: 'PUT', data: t }),
  aiOffice: () => request('/api/ai'),
  aiChat: () => request('/api/ai?view=chat'),
  aiSend: (text) => request('/api/ai?action=chat', { method: 'POST', data: { text } }),
  aiClearChat: () => request('/api/ai?action=clear-chat', { method: 'POST', data: {} }),
  aiCases: () => request('/api/ai?view=cases'),
  aiKick: (caseId) => request('/api/ai?action=kick', { method: 'POST', data: { caseId } }),
  aiAuto: (caseId, on) => request('/api/ai?action=auto', { method: 'POST', data: { caseId, on } }),
  aiRun: (caseId, taskId) => request('/api/ai?action=run', { method: 'POST', data: { caseId, taskId } }),
  aiDeleteCase: (id) => request(`/api/ai?caseId=${encodeURIComponent(id)}`, { method: 'DELETE' }),
  aiInbox: () => request('/api/ai?view=inbox'),
  aiDecide: (id, decision, note) => request('/api/ai?action=decide', { method: 'POST', data: { id, decision, note } }),
  aiOutputs: () => request('/api/ai?view=outputs'),
  aiOutput: (id) => request(`/api/ai?view=output&id=${encodeURIComponent(id)}`),
};
