import axios from "axios";

// Vite usa import.meta.env para variáveis de ambiente
const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

const API_BASE_URL = `${BACKEND_URL}/api`;

// Instância global do Axios
const api = axios.create({
  baseURL: API_BASE_URL,
});

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

// Alertas de estoque baixo
export const fetchLowStockAlerts = async () => {
  const response = await api.get("/alerts/low-stock");
  return response.data;
};

// Resumo do dashboard
export const fetchDashboardSummary = async () => {
  const response = await api.get("/dashboard/summary");
  return response.data;
};

export default api;

