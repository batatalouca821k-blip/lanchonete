import { Ban, CheckCheck, Pencil, Trash2, Undo2 } from "lucide-react";
import { AUDIT_ACTIONS, date, dateTime, describeAudit, money, time } from "../lib/format.js";
import { AccountBadge, Button, ItemBadge, PaymentBadge } from "./ui.jsx";

export function AccountSummary({ account }) {
  return (
    <div className="summary-grid">
      <div><span>Total da conta</span><strong>{money(account.totalAmount)}</strong></div>
      <div><span>Valor pago</span><strong className="text-ok">{money(account.paidAmount)}</strong></div>
      <div className="highlight"><span>Saldo restante</span><strong>{money(account.balance)}</strong></div>
      <div><span>Situação</span><AccountBadge status={account.status} /></div>
    </div>
  );
}

/**
 * Tabela de itens da conta (itens removidos aparecem riscados para manter o histórico).
 * `actions(item)` devolve os botões de cada linha.
 */
export function ItemsTable({ items, showRemoved = true, actions }) {
  const rows = showRemoved ? items : items.filter(item => item.status === "active");
  if (!rows.length) return <p className="muted pad">Nenhum item lançado.</p>;
  return (
    <div className="table-wrap">
      <table className="table responsive">
        <thead><tr><th scope="col">Item</th><th scope="col">Qtd × preço</th><th scope="col" className="num">Subtotal</th><th scope="col">Lançado em</th><th scope="col">Situação</th>{actions && <th scope="col"><span className="sr-only">Ações</span></th>}</tr></thead>
        <tbody>
          {rows.map(item => (
            <tr key={item.id} className={item.status === "removed" ? "row-removed" : ""}>
              <td data-label="Item">
                <strong>{item.name}</strong>
                {item.note && <small>Obs.: {item.note}</small>}
                <small>por {item.addedByName || "—"}{item.addedByRole === "admin" ? " (administração)" : ""}</small>
                {item.status === "removed" && <small>Removido em {dateTime(item.removedAt)} por {item.removedByName || "—"}{item.removalReason ? ` — ${item.removalReason}` : ""}</small>}
              </td>
              <td data-label="Qtd × preço">{item.quantity} × {money(item.unitPrice)}</td>
              <td data-label="Subtotal" className="num"><span className="money">{money(item.lineTotal)}</span>{item.paymentStatus === "partial" && <small>pago {money(item.paidAmount)}</small>}</td>
              <td data-label="Lançado em">{date(item.createdAt)} <small>{time(item.createdAt)}</small></td>
              <td data-label="Situação"><ItemBadge status={item.paymentStatus} /></td>
              {actions && <td data-label="Ações" className="actions">{item.status === "active" ? actions(item) : null}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PaymentsTable({ payments, actions, onOpen }) {
  if (!payments.length) return <p className="muted pad">Nenhum pagamento registrado.</p>;
  return (
    <div className="table-wrap">
      <table className="table responsive">
        <thead><tr><th scope="col">Data e hora</th><th scope="col">Forma</th><th scope="col" className="num">Valor</th><th scope="col">Situação</th><th scope="col">Referência</th>{actions && <th scope="col"><span className="sr-only">Ações</span></th>}</tr></thead>
        <tbody>
          {payments.map(payment => (
            <tr key={payment.id}>
              <td data-label="Data e hora">{date(payment.createdAt)} <small>{time(payment.createdAt)}</small></td>
              <td data-label="Forma">{payment.methodName}<small>{payment.confirmedByName ? `confirmado por ${payment.confirmedByName}` : payment.createdByName ? `por ${payment.createdByName}` : ""}</small></td>
              <td data-label="Valor" className="num"><span className="money">{money(payment.amount)}</span></td>
              <td data-label="Situação"><PaymentBadge status={payment.status} />{payment.status === "refunded" && <small>{payment.refundReason}</small>}{payment.note && <small>{payment.note}</small>}</td>
              <td data-label="Referência">{payment.reference || "—"}</td>
              {actions && <td data-label="Ações" className="actions">{actions(payment)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ChangesList({ changes }) {
  if (!changes?.length) return <p className="muted pad">Nenhuma alteração registrada.</p>;
  return (
    <ol className="timeline">
      {changes.map(change => (
        <li key={change.id}>
          <div><strong>{AUDIT_ACTIONS[change.action] || change.action}</strong><small>{dateTime(change.createdAt)} · {change.actorName || "sistema"}{change.actorRole === "admin" ? " (admin)" : ""}</small></div>
          <p className="muted">{describeAudit(change)}</p>
        </li>
      ))}
    </ol>
  );
}

export const rowButtons = {
  Edit: props => <Button size="sm" variant="ghost" icon={Pencil} {...props}>Corrigir</Button>,
  Remove: props => <Button size="sm" variant="ghost-danger" icon={Trash2} {...props}>Excluir</Button>,
  Confirm: props => <Button size="sm" variant="ok" icon={CheckCheck} {...props}>Confirmar</Button>,
  Refund: props => <Button size="sm" variant="ghost-danger" icon={Undo2} {...props}>Estornar</Button>,
  Cancel: props => <Button size="sm" variant="ghost" icon={Ban} {...props}>Cancelar</Button>
};
