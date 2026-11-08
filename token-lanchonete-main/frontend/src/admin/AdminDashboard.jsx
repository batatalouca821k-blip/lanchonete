import { useState } from "react";
import { AlertCircle, Banknote, CircleDollarSign, Receipt, Users } from "lucide-react";
import { api } from "../services/api.js";
import { useAsync } from "../lib/hooks.js";
import { money, shortDay } from "../lib/format.js";
import { BarChart, Button, EmptyState, ErrorState, PageHeader, Panel, Spinner, StatCard } from "../components/ui.jsx";

export function AdminDashboard({ navigate }) {
  const [range, setRange] = useState({ from: "", to: "" });
  const { data, loading, error, reload } = useAsync(() => api.adminReport(range), [range.from, range.to]);

  if (loading && !data) return <Spinner label="Montando o painel..." />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  const { snapshot, movement, topDebtors } = data;
  const status = snapshot.byStatus;
  const chart = movement.byDay.map(day => ({ label: shortDay(day.date), received: day.received, consumed: day.consumed }));

  return (
    <section>
      <PageHeader eyebrow="ADMINISTRAÇÃO" title="Painel financeiro" subtitle="Totais gerais das contas e movimento do período escolhido."
        actions={<Button onClick={reload} loading={loading}>Atualizar</Button>} />

      <div className="stat-grid">
        <StatCard label="Total faturado" value={money(snapshot.billed)} hint="soma de todas as contas" icon={Receipt} />
        <StatCard label="Total recebido" value={money(snapshot.received)} hint="pagamentos confirmados" tone="ok" icon={Banknote} />
        <StatCard label="A receber" value={money(snapshot.outstanding)} hint="saldo em aberto" tone="accent" icon={CircleDollarSign} />
        <StatCard label="Clientes" value={snapshot.customers} hint="usuários cadastrados" icon={Users} />
      </div>

      {snapshot.pendingPayments.count > 0 && (
        <div className="notice notice-warn" role="status">
          <AlertCircle size={18} />
          <span><strong>{snapshot.pendingPayments.count} pagamento(s) aguardando confirmação</strong> ({money(snapshot.pendingPayments.total)}). Confira o recebimento e confirme em Pagamentos.</span>
          <Button size="sm" onClick={() => navigate("admin/pagamentos")}>Abrir</Button>
        </div>
      )}

      <div className="grid-3">
        {[["open", "Em aberto"], ["partial", "Parcialmente pagas"], ["paid", "Pagas"]].map(([key, label]) => (
          <button key={key} className="status-card" onClick={() => navigate("admin/contas")}>
            <span>{label}</span><strong>{status[key].count} {status[key].count === 1 ? "conta" : "contas"}</strong>
            <small>Total {money(status[key].total)} · saldo {money(status[key].balance)}</small>
          </button>
        ))}
      </div>

      <Panel title="Movimento do período" subtitle={`De ${data.period.from?.split("-").reverse().join("/") || "—"} até ${data.period.to?.split("-").reverse().join("/") || "—"}`}
        actions={<div className="inline-filters">
          <label>De<input type="date" value={range.from} onChange={event => setRange({ ...range, from: event.target.value })} /></label>
          <label>Até<input type="date" value={range.to} onChange={event => setRange({ ...range, to: event.target.value })} /></label>
        </div>}>
        <div className="stat-grid compact">
          <StatCard label="Consumo lançado" value={money(movement.consumed)} />
          <StatCard label="Recebido" value={money(movement.received)} tone="ok" hint={`${movement.paymentsCount} pagamento(s)`} />
        </div>
        <BarChart data={chart} series={[{ key: "consumed", name: "Consumo", className: "bar-a" }, { key: "received", name: "Recebido", className: "bar-b" }]} />
      </Panel>

      <div className="grid-3 cols-3">
        <Panel title="Recebido por forma de pagamento">
          {movement.byMethod.length ? <ul className="rank">{movement.byMethod.map(item => <li key={item.method}><span>{item.name}<small>{item.count} pagamento(s)</small></span><strong>{money(item.total)}</strong></li>)}</ul> : <EmptyState title="Sem recebimentos no período" />}
        </Panel>
        <Panel title="Itens mais consumidos">
          {movement.topItems.length ? <ul className="rank">{movement.topItems.map(item => <li key={item.name}><span>{item.name}<small>{item.quantity} un.</small></span><strong>{money(item.total)}</strong></li>)}</ul> : <EmptyState title="Sem consumo no período" />}
        </Panel>
        <Panel title="Maiores saldos em aberto">
          {topDebtors.length ? <ul className="rank">{topDebtors.map(item => <li key={item.id}><span><button className="link" onClick={() => navigate(`admin/usuarios/${item.id}`)}>{item.name}</button><small>{item.accounts} conta(s)</small></span><strong>{money(item.balance)}</strong></li>)}</ul> : <EmptyState title="Ninguém com saldo em aberto" />}
        </Panel>
      </div>
    </section>
  );
}
