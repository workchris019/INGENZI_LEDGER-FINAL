/**
 * Ingenzi Ledger — shared API helper.
 * Include this before any page-specific <script> block:
 *   <script src="js/api.js"></script>
 *
 * Change API_BASE if you deploy the backend somewhere other than localhost.
 */
const API_BASE = (window.INGENZI_API_BASE) || 'http://localhost:4000/api';

const TOKEN_KEY = 'ingenzi-token';
const ACCOUNT_KEY = 'ingenzi-account'; // kept in sync so existing profile-panel code keeps working

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  // Map backend user shape -> the shape the existing profile panels already read
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify({
    ownerName: user.ownerName,
    idNumber: user.idNumber,
    telNumber: user.telNumber,
    businessName: user.businessName,
    regNumber: user.regNumber,
    tinNumber: user.tinNumber,
    businessType: user.businessType,
    location: user.location
  }));
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ACCOUNT_KEY);
}

function isLoggedIn() {
  return !!getToken();
}

/**
 * Redirects to the register page if there's no active session.
 * Call this at the top of any protected page (stock.html, sales.html, middlepage.html).
 */
function requireSession() {
  if (!isLoggedIn()) {
    window.location.href = 'login.html';
  }
}

async function apiRequest(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
  }

  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  let data;
  try { data = await res.json(); } catch (e) { data = {}; }

  if (!res.ok) {
    const err = new Error(data.error || 'Request failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// ---- Auth ----
const apiRegister = (accountData) => apiRequest('/auth/register', { method: 'POST', body: accountData, auth: false });
const apiLogin = (telNumber, pin) => apiRequest('/auth/login', { method: 'POST', body: { telNumber, pin }, auth: false });
const apiMe = () => apiRequest('/auth/me');

// ---- Stock ----
const apiSaveStock = (rows) => apiRequest('/stock', { method: 'POST', body: { rows } });
const apiGetStock = () => apiRequest('/stock');
const apiHasAnyStock = () => apiRequest('/stock/has-any');

// ---- Sales ----
const apiCreateSale = (sale) => apiRequest('/sales', { method: 'POST', body: sale });
const apiGetSales = (query = '') => apiRequest('/sales' + query);
const apiGetScore = () => apiRequest('/sales/score');

// ---- Insights ----
const apiGetInsights = () => apiRequest('/insights');
