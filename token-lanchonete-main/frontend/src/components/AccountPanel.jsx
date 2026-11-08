import { useState } from "react";
import { CreditCard, History, RefreshCw, UtensilsCrossed, Wallet } from "lucide-react";
import { api } from "../services/api.js";
import { useAsync } from "../lib/hooks.js";
import { dateTime, money } from "../lib/format.js";
import { AccountSummary, ItemsTable, PaymentsTable, rowButtons } from "./AccountParts.jsx";
import { PaymentModal, reservedAmount } from "./PaymentModal.jsx";
import { Button, EmptyState, ErrorState, PageHeader, Panel, Spinner, useFeedback } from "./ui.jsx";

export function AccountPanel({ navigate }) {
  const { toast, confirm } = useFeedback();
  const { data, loading, error, reload } = useAsync(() => api.getMyAccount(), []);
  const [selected, setSelected] = useState(0);
  const [paying, setPaying] = useState(null);

  const accounts = data ? [data.current, ...data.others].filter(Boolean) : [];
  const account = accounts[Math.min(selected, Math.max(0, accounts.length - 1))];

  async function removeItem(item) {
    const answer = await confirm({
      title: "Excluir item da conta", danger: true, confirmLabel: "Excluir item",
      message: `Remover ${item.quantity}× ${item.name} (${money(item.lineTotal)}) da sua conta? O total será recalculado automaticamente.`
    });
    if (!answer) return;
    try {
      const updated = await api.removeMyItem(item.id);
      toast.success(`Item removido. Novo total: ${money(updated.totalAmount)}.`);
      await reload();
    } catch (removeError) {
      toast.error(removeError.message);
      reload();
    }
  }

  async function cancelPending(payment) {
    try { await api.cancelPayment(payment.id); toast.info("Cobrança cancelada."); await reload(); } catch (cancelError) { toast.error(cancelError.message); }
  }

  if (loading && !data) return <Spinner label="Carregando sua conta..." />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;

  const pending = account ? account.payments.filter(payment => payment.status === "pending" && (!payment.expiresAt || new Date(payment.expiresAt) > new Date())) : [];
  const available = account ? account.balance - reservedAmount(account) : 0;

  return (
    <section>
      <PageHeader
        eyebrow="MINHA CONTA"
        title={account ? "Conta em aberto" : "Sua conta está em dia"}
        subtitle={account ? `Aberta em ${dateTime(account.openedAt)} · os itens ficam registrados até o pagamento.` : "Não há nada pendente no momento."}
        actions={<>
          <Button icon={RefreshCw} onClick={reload} loading={loading}>Atualizar</Button>
          <Button icon={History} onClick={() => navigate?.("historico")}>Histórico</Button>
        </>}
      />

      {!account && (
        <EmptyState icon={Wallet} title="Nenhum valor em aberto" action={<Button variant="primary" icon={UtensilsCrossed} onClick={() => navigate?.("produtos")}>Ver cardápio</Button>}>
          Contas já pagas ficam guardadas no seu histórico.
        </EmptyState>
      )}

      {accounts.length > 1 && (
        <div className="tabs" role="tablist" aria-label="Contas em aberto">
          {accounts.map((item, index) => <button key={item.id} role="tab" aria-selected={index === selected} className={index === selected ? "active" : ""} onClick={() => setSelected(index)}>Conta de {new Date(item.openedAt).toLocaleDateString("pt-BR")} · {money(item.balance)}</button>)}
        </div>
      )}

      {account && (
        <>
          <Panel>
            <AccountSummary account={account} />
            <div className="pay-bar">
              <p className="muted">{data.pendingBalance > account.balance ? `Saldo total em todas as contas abertas: ${money(data.pendingBalance)}. ` : ""}Você escolhe quanto pagar: parcial ou o valor total.</p>
              <Button variant="primary" icon={CreditCard} disabled={available < 0.01} onClick={() => setPaying({})}>Pagar conta</Button>
            </div>
            {pending.length > 0 && (
              <div className="notice notice-info">
                <strong>Pix aguardando confirmação</strong>
                {pending.map(payment => (
                  <div className="pending-row" key={payment.id}>
                    <span>{money(payment.amount)} · gerado em {dateTime(payment.createdAt)}</span>
                    <span><Button size="sm" onClick={() => setPaying({ resume: payment })}>Ver Pix</Button><Button size="sm" variant="ghost-danger" onClick={() => cancelPending(payment)}>Cancelar</Button></span>
                  </div>
                ))}
                <small>O valor só abate o saldo depois da confirmação do pagamento.</small>
              </div>
            )}
          </Panel>

          <Panel title="Itens da conta" subtitle="Você pode excluir os itens que ainda estão pendentes. Itens já pagos só podem ser alterados pela administração.">
            <ItemsTable items={account.items} showRemoved={false} actions={item => item.paymentStatus === "pending" ? <rowButtons.Remove onClick={() => removeItem(item)} /> : <small className="muted">Bloqueado</small>} />
          </Panel>

          <Panel title="Pagamentos desta conta"><PaymentsTable payments={account.payments} /></Panel>
        </>
      )}

      {paying && account && <PaymentModal account={account} resume={paying.resume} onClose={() => { setPaying(null); reload(); }} onDone={reload} />}
    </section>
  );
}
