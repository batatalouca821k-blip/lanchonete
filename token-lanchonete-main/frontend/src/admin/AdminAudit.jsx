import { useState } from "react";
import { api } from "../services/api.js";
import { useAsync } from "../lib/hooks.js";
import { AUDIT_ACTIONS, dateTime, describeAudit } from "../lib/format.js";
import { Badge, EmptyState, ErrorState, PageHeader, Pagination, Panel, Spinner } from "../components/ui.jsx";

export function AdminAudit() {
  const [tab, setTab] = useState("alteracoes");
  return (
    <section>
      <PageHeader eyebrow="ADMINISTRAÇÃO" title="Auditoria" subtitle="Quem fez o quê e quando: alterações em contas, pagamentos e acessos ao sistema." />
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "alteracoes"} className={tab === "alteracoes" ? "active" : ""} onClick={() => setTab("alteracoes")}>Alterações</button>
        <button role="tab" aria-selected={tab === "acessos"} className={tab === "acessos" ? "active" : ""} onClick={() => setTab("acessos")}>Acessos</button>
      </div>
      {tab === "alteracoes" ? <Changes /> : <Accesses />}
    </section>
  );
}

function Changes() {
  const [filters, setFilters] = useState({ page: 1, entity: "" });
  const { data, loading, error, reload } = useAsync(() => api.adminAudit({ ...filters, pageSize: 20 }), [JSON.stringify(filters)]);
  const set = (key, value) => setFilters({ ...filters, [key]: value, page: 1 });
  return (
    <Panel>
      <div className="filters">
        <div className="field"><label htmlFor="a-entity">Tipo</label>
          <select id="a-entity" value={filters.entity} onChange={event => set("entity", event.target.value)}>
            <option value="">Todos</option><option value="account_item">Itens de conta</option><option value="payment">Pagamentos</option><option value="payment_method">Formas de pagamento</option><option value="user">Usuários</option><option value="product">Produtos</option><option value="session">Logins</option>
          </select></div>
        <div className="field"><label htmlFor="a-from">De</label><input id="a-from" type="date" value={filters.from || ""} onChange={event => set("from", event.target.value)} /></div>
        <div className="field"><label htmlFor="a-to">Até</label><input id="a-to" type="date" value={filters.to || ""} onChange={event => set("to", event.target.value)} /></div>
      </div>
      {loading && !data && <Spinner />}
      {error && !data && <ErrorState message={error} onRetry={reload} />}
      {data && !data.rows.length && <EmptyState title="Nenhum registro encontrado" />}
      {data?.rows.length > 0 && (
        <div className="table-wrap">
          <table className="table responsive">
            <thead><tr><th scope="col">Data e hora</th><th scope="col">Responsável</th><th scope="col">Ação</th><th scope="col">Detalhes</th></tr></thead>
            <tbody>
              {data.rows.map(entry => (
                <tr key={entry.id}>
                  <td data-label="Data e hora">{dateTime(entry.createdAt)}</td>
                  <td data-label="Responsável">{entry.actorName || "sistema"}{entry.actorRole === "admin" && <Badge tone="accent">admin</Badge>}</td>
                  <td data-label="Ação">{AUDIT_ACTIONS[entry.action] || entry.action.replace("legacy:", "Importado: ")}</td>
                  <td data-label="Detalhes" className="wrap">{describeAudit(entry) || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pagination page={data.page} pageSize={data.pageSize} count={data.count} onChange={page => setFilters({ ...filters, page })} />}
    </Panel>
  );
}

function Accesses() {
  const { data, loading, error, reload } = useAsync(() => api.adminAccesses(), []);
  return (
    <Panel title="Últimos acessos">
      {loading && !data && <Spinner />}
      {error && !data && <ErrorState message={error} onRetry={reload} />}
      {data && !data.length && <EmptyState title="Nenhum acesso registrado" />}
      {data?.length > 0 && (
        <div className="table-wrap">
          <table className="table responsive">
            <thead><tr><th scope="col">Usuário</th><th scope="col">E-mail</th><th scope="col">Perfil</th><th scope="col">Data e hora</th><th scope="col">IP</th></tr></thead>
            <tbody>{data.map(access => <tr key={access.id}><td data-label="Usuário"><strong>{access.name}</strong></td><td data-label="E-mail">{access.email}</td><td data-label="Perfil"><Badge tone={access.role === "admin" ? "accent" : "muted"}>{access.role === "admin" ? "Admin" : "Cliente"}</Badge></td><td data-label="Data e hora">{dateTime(access.accessedAt)}</td><td data-label="IP">{access.ip || "—"}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
