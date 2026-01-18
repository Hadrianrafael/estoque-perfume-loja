import axios from "axios";

// URL base do backend:
// Em produção vem do VITE_API_URL
// Em desenvolvimento usa localhost
const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// Prefixo da API do backend
const API_BASE_URL = `${BACKEND_URL}/api`;

// Instância global do Axios
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// =========================
// ROTAS DE PRODUTOS
// =========================

// Buscar produtos
export const fetchProducts = async (params = {}) => {
  const response = await api.get("/products", { params });
  return response.data;
};

// Criar produto
export const createProduct = async (data) => {
  const response = await api.post("/products", data);
  return response.data;
};

// Atualizar produto
export const updateProduct = async (id, data) => {
  const response = await api.put(`/products/${id}`, data);
  return response.data;
};

// Deletar produto
export const deleteProduct = async (id) => {
  await api.delete(`/products/${id}`);
};

// =========================
// ALERTAS
// =========================

export const fetchLowStockAlerts = async () => {
  const response = await api.get("/alerts/low-stock");
  return response.data;
};

// =========================
// DASHBOARD
// =========================

export const fetchDashboardSummary = async () => {
  const response = await api.get("/dashboard/summary");
  return response.data;
};

// Export principal para requests genéricos
export default api;

