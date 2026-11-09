const configuredApiUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, "");
const API_URL = configuredApiUrl || (import.meta.env.DEV ? "http://localhost:3000/api" : "");
export const API_ORIGIN = API_URL.replace(/\/api$/i, "");

export function getToken() {
  try { return localStorage.getItem("token-pedidos-token"); } catch { return null; }
}

async function request(path, options = {}) {
  if (!API_URL) {
    throw new Error("A API não foi configurada. Defina VITE_API_URL com o endereço público da API.");
  }

  const token = getToken();
  const isFormData = options.body instanceof FormData;
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        ...(isFormData || !options.body ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers
      }
    });
  } catch {
    throw new Error("Não foi possível conectar à API. Verifique se o backend está publicado e se VITE_API_URL está correto.");
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Erro na requisição." }));
    if (response.status === 401 && token && !path.startsWith("/auth/login")) window.dispatchEvent(new Event("session-expired"));
    throw new Error(error.message || "Erro na requisição.");
  }
  if (response.status === 204) return null;
  return response.json();
}

const qs = params => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== "") search.set(key, value);
  }
  const text = search.toString();
  return text ? `?${text}` : "";
};
const json = (method, body) => ({ method, body: JSON.stringify(body ?? {}) });

export const api = {
  login: data => request("/auth/login", json("POST", data)),
  logout: () => request("/auth/logout", { method: "POST" }),
  me: () => request("/auth/me"),

  listProducts: () => request("/products"),
  createProduct: data => request("/products", { method: "POST", body: productFormData(data) }),
  updateProduct: (id, data) => request(`/products/${id}`, { method: "PATCH", body: productFormData(data) }),
  deleteProduct: id => request(`/products/${id}`, { method: "DELETE" }),

  getMyAccount: () => request("/accounts/me"),
  getMyHistory: params => request(`/accounts/me/history${qs(params)}`),
  getAccount: id => request(`/accounts/${id}`),
  addMyItem: (productId, quantity) => request("/accounts/me/items", json("POST", { productId, quantity })),
  removeMyItem: (itemId, reason) => request(`/accounts/me/items/${itemId}`, json("DELETE", { reason })),
  payMyAccount: data => request("/accounts/me/payments", json("POST", data)),
  getPayment: id => request(`/payments/${id}`),
  refreshPayment: id => request(`/payments/${id}/refresh`, { method: "POST" }),
  cancelPayment: id => request(`/payments/${id}/cancel`, { method: "POST" }),
  paymentMethods: () => request("/payments/methods"),

  adminReport: params => request(`/admin/report${qs(params)}`),
  adminUsers: params => request(`/admin/users${qs(params)}`),
  adminUser: (id, params) => request(`/admin/users/${id}${qs(params)}`),
  archiveUser: id => request(`/admin/users/${id}`, { method: "DELETE" }),
  permanentlyDeleteUser: id => request(`/admin/users/${id}/permanent`, { method: "DELETE" }),
  restoreUser: id => request(`/admin/users/${id}/restore`, { method: "POST" }),
  resetUserPassword: (id, password) => request(`/admin/users/${id}/password`, json("PATCH", { password })),
  createUser: data => request("/admin/users", json("POST", data)),
  confirmUserEmail: id => request(`/admin/users/${id}/confirm-email`, { method: "POST" }),
  adminAccounts: params => request(`/admin/accounts${qs(params)}`),
  adminAccount: id => request(`/admin/accounts/${id}`),
  adminAddItem: (userId, data) => request(`/admin/users/${userId}/items`, json("POST", data)),
  adminUpdateItem: (itemId, data) => request(`/admin/items/${itemId}`, json("PATCH", data)),
  adminRemoveItem: (itemId, reason) => request(`/admin/items/${itemId}`, json("DELETE", { reason })),
  adminRecordPayment: (accountId, data) => request(`/admin/accounts/${accountId}/payments`, json("POST", data)),
  adminPayments: params => request(`/admin/payments${qs(params)}`),
  adminConfirmPayment: (id, reference) => request(`/admin/payments/${id}/confirm`, json("POST", { reference })),
  adminRefundPayment: (id, reason) => request(`/admin/payments/${id}/refund`, json("POST", { reason })),
  adminMethods: () => request("/admin/payment-methods"),
  adminCreateMethod: data => request("/admin/payment-methods", json("POST", data)),
  adminUpdateMethod: (code, data) => request(`/admin/payment-methods/${code}`, json("PATCH", data)),
  adminAudit: params => request(`/admin/audit${qs(params)}`),
  adminAccesses: () => request("/admin/accesses")
};

function productFormData(product) {
  const formData = new FormData();
  formData.append("name", product.name);
  formData.append("description", product.description);
  formData.append("price", product.price);
  if (product.image instanceof File) formData.append("image", product.image);
  else if (product.imageUrl) formData.append("image", product.imageUrl);
  return formData;
}

export const imageUrl = image => (image?.startsWith("/") ? `${API_ORIGIN}${image}` : image);
