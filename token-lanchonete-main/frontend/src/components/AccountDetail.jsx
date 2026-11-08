import { useState } from "react";
import { CreditCard, FileClock } from "lucide-react";
import { api } from "../services/api.js";
import { useAsync } from "../lib/hooks.js";
import { dateTime } from "../lib/format.js";
import { ItemFormModal, RecordPaymentModal } from "./AccountForms.jsx";
import { AccountSummary, ChangesList, ItemsTable, PaymentsTable, rowButtons } from "./AccountParts.jsx";
import { Button, ErrorState, Modal, Panel, Spinner, useFeedback } from "./ui.jsx";

/**
 * Detalhe completo de uma conta: itens, pagamentos e histórico de alterações.
 * Com `admin`, mostra as ações administrativas (corrigir/remover itens, registrar/confirmar/estornar pagamentos).
 */
export function AccountDetailModal({ accountId, admin = false, onClose, onChanged }) {
  const { toast, confirm } = useFeedback();
  const { data: account, loading, error, reload } = useAsync(() => (admin ? api.adminAccount(accountId) : api.getAccount(accountId)), [accountId, admin]);
  const [editing, setEditing] = useState(null);
  const [paying, setPaying] = useState(false);
  const [tab, setTab] = useState("itens");

  const changed = async () => { await reload(); onChanged?.(); };
  async function run(action, successMessage) {
    try { await action(); toast.success(successMessage); await changed(); } catch (actionError) { toast.error(actionError.message); }
  }

  async function removeItem(item) {
    const answer = await confirm({
      title: "Excluir item da conta", danger: true, confirmLabel: "Excluir item",
      message: `${item.quantity}× ${item.name} (${item.lineTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}) será removido e o total recalculado. O registro continua no histórico.`,
      reasonLabel: "Motivo da remoção", reasonRequired: item.paymentStatus !== "pending"
    });
    if (answer) run(() => api.adminRemoveItem(item.id, answer.reason), "Item removido e total atualizado.");
  }
  async function confirmPayment(payment) {
    const answer = await confirm({ title: "Confirmar recebimento", message: `Confirme apenas se o valor de ${payment.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} já entrou na conta da lanchonete.`, confirmLabel: "Confirmar recebimento", reasonLabel: "ID/comprovante da transação (opcional)" });
    if (answer) run(() => api.adminConfirmPayment(payment.id, answer.reason), "Pagamento confirmado.");
  }
  async function refund(payment) {
    const answer = await confirm({ title: "Estornar pagamento", danger: true, confirmLabel: "Estornar", message: "O valor volta a ficar em aberto na conta. O pagamento continua registrado no histórico como estornado.", reasonLabel: "Motivo do estorno", reasonRequired: true });
    if (answer) run(async () => {
      const result = await api.adminRefundPayment(payment.id, answer.reason);
      if (result.providerRefundRequired) toast.info("Este pagamento foi feito por um provedor online: devolva também o dinheiro pelo painel do provedor.");
    }, "Pagamento estornado.");
  }

  const canChange = admin && account && account.status !== "paid";

  return (
    <Modal title={account ? `Conta de ${account.userName}` : "Conta"} onClose={onClose} size="lg"
      footer={canChange ? <Button variant="primary" icon={CreditCard} onClick={() => setPaying(true)}>Registrar pagamento</Button> : null}>
      {loading && !account && <Spinner />}
      {error && !account && <ErrorState message={error} onRetry={reload} />}
      {account && (
        <>
          <p className="muted">Aberta em {dateTime(account.openedAt)}{account.closedAt ? ` · quitada em ${dateTime(account.closedAt)}` : ""}{admin ? ` · ${account.userEmail}` : ""}</p>
          <AccountSummary account={account} />
          <div className="tabs" role="tablist">
            {[["itens", `Itens (${account.items.filter(item => item.status === "active").length})`], ["pagamentos", `Pagamentos (${account.payments.length})`], ["historico", "Histórico de alterações"]].map(([key, label]) => (
              <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>
            ))}
          </div>
          {tab === "itens" && (
            <ItemsTable items={account.items} actions={canChange ? item => (<>
              <rowButtons.Edit onClick={() => setEditing(item)} />
              <rowButtons.Remove onClick={() => removeItem(item)} />
            </>) : undefined} />
          )}
          {tab === "pagamentos" && (
            <PaymentsTable payments={account.payments} actions={admin ? payment => (<>
              {payment.status === "pending" && <rowButtons.Confirm onClick={() => confirmPayment(payment)} />}
              {payment.status === "confirmed" && <rowButtons.Refund onClick={() => refund(payment)} />}
            </>) : undefined} />
          )}
          {tab === "historico" && <Panel className="flat" title="Quem alterou o quê" subtitle="Registro permanente de itens e pagamentos desta conta."><ChangesList changes={account.changes} /></Panel>}
          {account.status === "paid" && admin && <p className="muted pad"><FileClock size={14} /> Conta quitada: para corrigi-la, estorne um pagamento.</p>}
        </>
      )}
      {editing && <ItemFormModal mode="edit" item={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await changed(); }} />}
      {paying && <RecordPaymentModal account={account} onClose={() => setPaying(false)} onSaved={async () => { setPaying(false); await changed(); }} />}
    </Modal>
  );
}
