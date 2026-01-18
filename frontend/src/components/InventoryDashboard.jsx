import React, { useEffect, useMemo, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import {
  fetchProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  fetchLowStockAlerts,
  fetchDashboardSummary,
} from "../lib/api";

const CATEGORY_OPTIONS = [
  { value: "Perfumes", label: "Perfumes" },
  { value: "Roupas", label: "Roupas" },
];

const PIE_COLORS = ["#ec4899", "#6366f1", "#f97316", "#22c55e", "#eab308", "#0ea5e9"];

const emptySummary = {
  total_produtos: 0,
  total_itens: 0,
  total_alertas: 0,
  por_categoria: [],
  por_loja: [],
};

const initialFormState = {
  nome: "",
  marca: "",
  categoria: "Perfumes",
  loja: "",
  quantidade: 0,
  limite_minimo: 5,
};

// Componentes básicos de UI (botão e card) para não depender de nenhuma lib externa
function Button({ children, variant = "primary", className = "", ...props }) {
  return (
    <button
      {...props}
      className={`btn ${variant === "outline" ? "btn-outline" : "btn-primary"} ${className}`}
    >
      {children}
    </button>
  );
}

function Card({ children, className = "" }) {
  return <div className={`card ${className}`}>{children}</div>;
}

export default function InventoryDashboard() {
  const [products, setProducts] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [summary, setSummary] = useState(emptySummary);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [filters, setFilters] = useState({ categoria: "", loja: "" });

  const [formData, setFormData] = useState(initialFormState);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  const loadData = async (currentFilters = filters) => {
    try {
      setLoading(true);
      setError("");

      const [productsData, alertsData, summaryData] = await Promise.all([
        fetchProducts({
          categoria: currentFilters.categoria || undefined,
          loja: currentFilters.loja || undefined,
        }),
        fetchLowStockAlerts(),
        fetchDashboardSummary(),
      ]);

      setProducts(productsData || []);
      setAlerts((alertsData && alertsData.produtos) || []);
      setSummary(summaryData || emptySummary);
    } catch (err) {
      console.error(err);
      setError("Erro ao carregar dados do estoque. Verifique se o backend está rodando.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lojasDisponiveis = useMemo(() => {
    const lojasSet = new Set();
    products.forEach((p) => p.loja && lojasSet.add(p.loja));
    return Array.from(lojasSet);
  }, [products]);

  const handleFilterChange = (field, value) => {
    const newFilters = { ...filters, [field]: value };
    setFilters(newFilters);
    loadData(newFilters);
  };

  const openCreateForm = () => {
    setEditingProduct(null);
    setFormData(initialFormState);
    setIsFormOpen(true);
  };

  const openEditForm = (product) => {
    setEditingProduct(product);
    setFormData({
      nome: product.nome,
      marca: product.marca,
      categoria: product.categoria,
      loja: product.loja,
      quantidade: product.quantidade,
      limite_minimo: product.limite_minimo,
    });
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingProduct(null);
    setFormData(initialFormState);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === "quantidade" || name === "limite_minimo" ? Number(value) : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError("");

      const payload = {
        ...formData,
        quantidade: Number(formData.quantidade) || 0,
        limite_minimo: Number(formData.limite_minimo) || 0,
      };

      if (!payload.nome || !payload.marca || !payload.loja) {
        setError("Preencha pelo menos Nome, Marca e Loja.");
        return;
      }

      if (editingProduct) {
        await updateProduct(editingProduct.id, payload);
      } else {
        await createProduct(payload);
      }

      closeForm();
      await loadData();
    } catch (err) {
      console.error(err);
      setError("Erro ao salvar produto.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (product) => {
    const confirmed = window.confirm(
      `Tem certeza que deseja remover o produto "${product.nome}"?`,
    );
    if (!confirmed) return;

    try {
      setLoading(true);
      setError("");
      await deleteProduct(product.id);
      await loadData();
    } catch (err) {
      console.error(err);
      setError("Erro ao excluir produto.");
    } finally {
      setLoading(false);
    }
  };

  const pieDataCategorias = useMemo(() => {
    if (!summary.por_categoria || summary.por_categoria.length === 0) return [];
    return summary.por_categoria.map((c) => ({
      name: c.categoria,
      value: c.total_itens,
    }));
  }, [summary]);

  const pieDataAlertasPorLoja = useMemo(() => {
    if (!summary.por_loja || summary.por_loja.length === 0) return [];
    return summary.por_loja
      .filter((l) => l.total_alertas > 0)
      .map((l) => ({
        name: l.loja,
        value: l.total_alertas,
      }));
  }, [summary]);

  const getStatusInfo = (produto) => {
    if (produto.quantidade <= produto.limite_minimo) {
      return { label: "BAIXO", cls: "status status-bad" };
    }
    return { label: "OK", cls: "status status-ok" };
  };

  return (
    <div className="wrap">
      <div className="container">
        {/* HEADER */}
        <header className="header">
          <div>
            <h1 className="title">Gestor de Estoque</h1>
            <p className="subtitle">
              Perfumaria &amp; Moda — controle seus produtos, alertas de reposição
              e desempenho por loja e categoria.
            </p>
          </div>
          <div className="actions">
            <Button variant="outline" onClick={() => loadData()}>
              Recarregar dados
            </Button>
            <Button onClick={openCreateForm}>+ Novo produto</Button>
          </div>
        </header>

        {/* KPIs */}
        <section className="kpis">
          <Card>
            <p className="kpi-label">Produtos cadastrados</p>
            <p className="kpi-value">{summary.total_produtos}</p>
            <p className="kpi-desc">
              Itens diferentes entre perfumaria e vestuário.
            </p>
          </Card>

          <Card>
            <p className="kpi-label">Itens em estoque</p>
            <p className="kpi-value">{summary.total_itens}</p>
            <p className="kpi-desc">
              Soma das quantidades de todos os produtos.
            </p>
          </Card>

          <Card className="card-alert">
            <p className="kpi-label kpi-label-alert">Itens em alerta</p>
            <p className="kpi-value">{summary.total_alertas}</p>
            <p className="kpi-desc">Produtos com quantidade abaixo do limite.</p>
          </Card>
        </section>

        {/* GRÁFICOS */}
        <section className="grid">
          <Card className="chart">
            <div className="card-head">
              <h2>Distribuição por categoria</h2>
              <span>Perfumes x Roupas</span>
            </div>
            <div className="chart-box">
              {pieDataCategorias.length === 0 ? (
                <p className="empty">
                  Nenhum dado ainda. Cadastre seus primeiros produtos.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieDataCategorias}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={85}
                      label
                    >
                      {pieDataCategorias.map((entry, index) => (
                        <Cell
                          key={`cat-${entry.name}`}
                          fill={PIE_COLORS[index % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#020617",
                        borderColor: "#1e293b",
                      }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>

          <Card className="chart chart-alert">
            <div className="card-head">
              <h2>Alertas por loja</h2>
              <span>Somente lojas com itens em alerta</span>
            </div>
            <div className="chart-box">
              {pieDataAlertasPorLoja.length === 0 ? (
                <p className="empty">Nenhuma loja com itens em alerta.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieDataAlertasPorLoja}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={75}
                      label
                    >
                      {pieDataAlertasPorLoja.map((entry, index) => (
                        <Cell
                          key={`loja-${entry.name}`}
                          fill={PIE_COLORS[index % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#020617",
                        borderColor: "#1e293b",
                      }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
        </section>

        {/* PRODUTOS + FILTROS */}
        <section className="products">
          <div className="products-head">
            <div>
              <h2>Produtos</h2>
              <p>Controle detalhado dos itens por loja e categoria.</p>
            </div>

            <div className="filters">
              <div className="field">
                <label>Categoria</label>
                <select
                  value={filters.categoria}
                  onChange={(e) => handleFilterChange("categoria", e.target.value)}
                >
                  <option value="">Todas</option>
                  {CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>Loja</label>
                <select
                  value={filters.loja}
                  onChange={(e) => handleFilterChange("loja", e.target.value)}
                >
                  <option value="">Todas</option>
                  {lojasDisponiveis.map((loja) => (
                    <option key={loja} value={loja}>
                      {loja}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <Card className="table-card">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Marca</th>
                    <th>Categoria</th>
                    <th>Loja</th>
                    <th className="right">Qtd</th>
                    <th className="right">Limite</th>
                    <th className="center">Status</th>
                    <th className="right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {products.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="empty-td">
                        Nenhum produto encontrado. Cadastre seus itens para começar.
                      </td>
                    </tr>
                  ) : (
                    products.map((produto) => {
                      const st = getStatusInfo(produto);
                      return (
                        <tr key={produto.id}>
                          <td className="strong">{produto.nome}</td>
                          <td>{produto.marca}</td>
                          <td>{produto.categoria}</td>
                          <td>{produto.loja}</td>
                          <td className="right">{produto.quantidade}</td>
                          <td className="right">{produto.limite_minimo}</td>
                          <td className="center">
                            <span className={st.cls}>{st.label}</span>
                          </td>
                          <td className="right">
                            <div className="row-actions">
                              <Button
                                variant="outline"
                                onClick={() => openEditForm(produto)}
                              >
                                Editar
                              </Button>
                              <Button
                                variant="outline"
                                className="danger"
                                onClick={() => handleDelete(produto)}
                              >
                                Excluir
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </section>

        {/* ALERTAS */}
        <section className="alerts">
          <h2>Alertas de reposição</h2>
          <p>Itens com quantidade menor ou igual ao limite mínimo.</p>

          <Card className="alerts-card">
            {alerts.length === 0 ? (
              <p className="empty">Nenhum item em alerta no momento.</p>
            ) : (
              <div className="alerts-list">
                {alerts.map((p) => (
                  <div key={p.id} className="alert-item">
                    <div>
                      <div className="alert-title">
                        {p.nome} <span>({p.marca})</span>
                      </div>
                      <div className="alert-sub">
                        {p.loja} • {p.categoria}
                      </div>
                    </div>
                    <div className="alert-right">
                      Qtd: <b>{p.quantidade}</b> | Limite: <b>{p.limite_minimo}</b>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </section>

        {/* ERRO / LOADING */}
        {(error || loading) && (
          <section className="system">
            {error && <div className="msg msg-error">{error}</div>}
            {loading && <div className="msg">Carregando...</div>}
          </section>
        )}

        {/* MODAL FORM */}
        {isFormOpen && (
          <div className="modal-overlay" onClick={closeForm}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <h3>{editingProduct ? "Editar produto" : "Novo produto"}</h3>
                <button className="x" onClick={closeForm}>
                  ✕
                </button>
              </div>

              <form className="form" onSubmit={handleSubmit}>
                <div className="form-grid">
                  <div className="field">
                    <label>Nome do produto</label>
                    <input
                      name="nome"
                      value={formData.nome}
                      onChange={handleFormChange}
                      placeholder="Ex.: Perfume 100ml"
                    />
                  </div>
                  <div className="field">
                    <label>Marca</label>
                    <input
                      name="marca"
                      value={formData.marca}
                      onChange={handleFormChange}
                      placeholder="Ex.: Natura"
                    />
                  </div>
                </div>

                <div className="form-grid">
                  <div className="field">
                    <label>Categoria</label>
                    <select
                      name="categoria"
                      value={formData.categoria}
                      onChange={handleFormChange}
                    >
                      {CATEGORY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Loja</label>
                    <input
                      name="loja"
                      value={formData.loja}
                      onChange={handleFormChange}
                      placeholder="Ex.: Unidade 1"
                    />
                  </div>
                </div>

                <div className="form-grid">
                  <div className="field">
                    <label>Quantidade em estoque</label>
                    <input
                      type="number"
                      min="0"
                      name="quantidade"
                      value={formData.quantidade}
                      onChange={handleFormChange}
                    />
                  </div>
                  <div className="field">
                    <label>Limite mínimo</label>
                    <input
                      type="number"
                      min="0"
                      name="limite_minimo"
                      value={formData.limite_minimo}
                      onChange={handleFormChange}
                    />
                  </div>
                </div>

                <div className="form-actions">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={closeForm}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit">
                    {editingProduct ? "Salvar alterações" : "Cadastrar produto"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* CSS embutido só pra esse componente funcionar bonito */}
      <style>{css}</style>
    </div>
  );
}

const css = `
.wrap{min-height:100vh}
.container{max-width:1100px;margin:0 auto;padding:22px 16px 60px}
.header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap;margin-bottom:14px}
.title{font-size:30px;margin:0;background:linear-gradient(90deg,#fb7185,#e879f9,#fbbf24);-webkit-background-clip:text;color:transparent;font-weight:800}
.subtitle{margin:6px 0 0;color:#cbd5e1;font-size:13px;max-width:720px}
.actions{display:flex;gap:10px;align-items:center}
.btn{border-radius:999px;padding:10px 14px;border:1px solid transparent;cursor:pointer;font-weight:700;font-size:12px}
.btn-primary{background:linear-gradient(90deg,#fb7185,#e879f9,#fbbf24);color:#0b1220;box-shadow:0 18px 45px rgba(248,113,113,.28)}
.btn-outline{background:rgba(2,6,23,.55);border-color:rgba(148,163,184,.45);color:#e5e7eb}
.btn-outline:hover{border-color:rgba(251,113,133,.8)}
.btn-outline.danger{border-color:rgba(244,63,94,.6);color:#fecdd3}
.card{background:rgba(15,23,42,.86);border:1px solid rgba(148,163,184,.25);border-radius:18px;padding:14px 14px;box-shadow:0 18px 45px rgba(0,0,0,.45)}
.card-alert{border-color:rgba(244,63,94,.35);background:rgba(127,29,29,.22)}
.kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:14px 0}
@media (max-width:900px){.kpis{grid-template-columns:1fr}}
.kpi-label{font-size:12px;color:#94a3b8;margin:0}
.kpi-label-alert{color:#fecdd3}
.kpi-value{font-size:28px;font-weight:800;margin:6px 0 4px}
.kpi-desc{font-size:12px;color:#94a3b8;margin:0}
.grid{display:grid;grid-template-columns:2fr 1fr;gap:12px;margin:12px 0 14px}
@media (max-width:900px){.grid{grid-template-columns:1fr}}
.chart{min-height:320px}
.chart-alert{border-color:rgba(244,63,94,.35);background:rgba(127,29,29,.22)}
.card-head{display:flex;justify-content:space-between;align-items:center;color:#e5e7eb}
.card-head h2{font-size:14px;margin:0}
.card-head span{font-size:11px;color:#94a3b8}
.chart-box{height:260px;margin-top:8px}
.empty{color:#94a3b8;font-size:13px;text-align:center;margin-top:26px}
.products-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-top:8px}
.products-head h2{margin:0;font-size:18px}
.products-head p{margin:2px 0 0;font-size:12px;color:#94a3b8}
.filters{display:flex;gap:10px;flex-wrap:wrap}
.field{display:flex;flex-direction:column;gap:6px}
.field label{font-size:11px;color:#cbd5e1}
.field input,.field select{height:36px;border-radius:10px;border:1px solid rgba(148,163,184,.3);background:rgba(2,6,23,.45);color:#e5e7eb;padding:0 10px;outline:none}
.table-card{padding:0}
.table-wrap{overflow:auto}
.table{width:100%;border-collapse:collapse;min-width:880px}
.table thead th{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;background:rgba(2,6,23,.35);padding:12px;border-bottom:1px solid rgba(148,163,184,.18);text-align:left}
.table tbody td{padding:12px;border-bottom:1px solid rgba(148,163,184,.12);color:#e5e7eb;font-size:13px}
.table tbody tr:hover{background:rgba(148,163,184,.06)}
.right{text-align:right}
.center{text-align:center}
.strong{font-weight:800}
.row-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
.empty-td{color:#94a3b8;text-align:center;padding:26px}
.status{display:inline-flex;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:900}
.status-ok{background:rgba(16,185,129,.18);border:1px solid rgba(16,185,129,.45);color:#a7f3d0}
.status-bad{background:rgba(244,63,94,.16);border:1px solid rgba(244,63,94,.5);color:#fecdd3}
.alerts h2{margin:18px 0 4px}
.alerts p{margin:0 0 10px;color:#fecdd3;font-size:12px}
.alerts-card{border-color:rgba(244,63,94,.35);background:rgba(127,29,29,.22)}
.alerts-list{display:flex;flex-direction:column;gap:10px}
.alert-item{display:flex;justify-content:space-between;gap:10px;align-items:center;border:1px solid rgba(244,63,94,.28);background:rgba(2,6,23,.35);padding:10px;border-radius:14px;flex-wrap:wrap}
.alert-title{font-weight:900}
.alert-title span{font-weight:500;color:#fecdd3}
.alert-sub{font-size:11px;color:#fecdd3}
.alert-right{font-size:12px;color:#fecdd3}
.system{margin-top:14px}
.msg{border:1px solid rgba(148,163,184,.25);background:rgba(2,6,23,.35);padding:10px;border-radius:14px;font-size:12px}
.msg-error{border-color:rgba(244,63,94,.55);background:rgba(127,29,29,.22);color:#fecdd3}
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:18px;z-index:50}
.modal{width:100%;max-width:560px;background:rgba(2,6,23,.96);border:1px solid rgba(148,163,184,.25);border-radius:18px;padding:14px;box-shadow:0 30px 80px rgba(0,0,0,.7)}
.modal-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.modal-head h3{margin:0}
.x{background:transparent;border:1px solid rgba(148,163,184,.35);color:#e5e7eb;border-radius:10px;padding:6px 10px;cursor:pointer}
.form{display:flex;flex-direction:column;gap:12px}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media (max-width:700px){.form-grid{grid-template-columns:1fr}}
.form-actions{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap}
`;
