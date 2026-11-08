import { Eye } from "lucide-react";
import { date, money, time } from "../lib/format.js";
import { AccountBadge, Button, EmptyState } from "./ui.jsx";
import { Receipt } from "lucide-react";

/** Filtros comuns de contas (situação e período). */
export function AccountFilters({ filters, onChange, showSearch = false, searchPlaceholder = "Buscar por nome ou e-mail", children }) {
  const set = (key, value) => onChange({ ...filters, [key]: value, page: 1 });
  return (
    <div className="filters" role="search">
      {showSearch && (
        <div className="field grow">
          <label htmlFor="f-search">Buscar</label>
          <input id="f-search" type="search" value={filters.search || ""} onChange={event => set("search", event.target.value)} placeholder={searchPlaceholder} />
        </div>
      )}
      <div className="field">
        <label htmlFor="f-status">Situação</label>
        <select id="f-status" value={filters.status || ""} onChange={event => set("status", event.target.value)}>
          <option value="">Todas</option>
          <option value="unpaid">Não quitadas</option>
          <option value="open">Em aberto</option>
          <option value="partial">Parcialmente pagas</option>
          <option value="paid">Pagas</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="f-from">De</label>
        <input id="f-from" type="date" value={filters.from || ""} onChange={event => set("from", event.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="f-to">Até</label>
        <input id="f-to" type="date" value={filters.to || ""} onChange={event => set("to", event.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="f-dateby">Data por</label>
        <select id="f-dateby" value={filters.dateBy || "opened"} onChange={event => set("dateBy", event.target.value)}>
          <option value="opened">Abertura</option>
          <option value="closed">Quitação</option>
        </select>
      </div>
      {children}
      {(filters.status || filters.from || filters.to || filters.search) && <Button variant="ghost" onClick={() => onChange({ page: 1 })}>Limpar filtros</Button>}
    </div>
  );
}

export function AccountsTable({ rows, showUser = false, onOpen, totals }) {
  if (!rows.length) return <EmptyState icon={Receipt} title="Nenhuma conta encontrada">Ajuste os filtros ou aguarde novos lançamentos.</EmptyState>;
  return (
    <div className="table-wrap">
      <table className="table responsive">
        <thead>
          <tr>
            <th scope="col">Data e hora</th>{showUser && <th scope="col">Usuário</th>}<th scope="col">Itens</th>
            <th scope="col" className="num">Total</th><th scope="col" className="num">Pago</th><th scope="col" className="num">Saldo</th><th scope="col">Situação</th><th scope="col"><span className="sr-only">Detalhes</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(account => (
            <tr key={account.id}>
              <td data-label="Data e hora">{date(account.openedAt)} <small>{time(account.openedAt)}</small>{account.closedAt && <small>quitada em {date(account.closedAt)}</small>}</td>
              {showUser && <td data-label="Usuário"><strong>{account.userName}</strong><small>{account.userEmail}</small></td>}
              <td data-label="Itens" className="items-cell"><span title={account.itemsSummary}>{account.itemsSummary || "—"}</span><small>{account.itemCount} {account.itemCount === 1 ? "item" : "itens"}</small></td>
              <td data-label="Total" className="num money">{money(account.totalAmount)}</td>
              <td data-label="Pago" className="num money text-ok">{money(account.paidAmount)}</td>
              <td data-label="Saldo" className="num money">{money(account.balance)}</td>
              <td data-label="Situação"><AccountBadge status={account.status} /></td>
              <td className="actions"><Button size="sm" icon={Eye} onClick={() => onOpen(account)}>Detalhes</Button></td>
            </tr>
          ))}
        </tbody>
        {totals && (
          <tfoot><tr><th scope="row" colSpan={showUser ? 3 : 2}>Totais do filtro</th><td className="num money">{money(totals.totalAmount)}</td><td className="num money text-ok">{money(totals.paidAmount)}</td><td className="num money">{money(totals.balance)}</td><td colSpan="2" /></tr></tfoot>
        )}
      </table>
    </div>
  );
}
