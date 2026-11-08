import { useState } from "react";
import { CreditCard } from "lucide-react";
import { api } from "../services/api.js";
import { useAsync, useDebounced } from "../lib/hooks.js";
import { date, money, time } from "../lib/format.js";
import { AccountDetailModal } from "../components/AccountDetail.jsx";
import { rowButtons } from "../components/AccountParts.jsx";
import { Button, EmptyState, ErrorState, PageHeader, PaymentBadge, Pagination, Panel, Spinner, useFeedback } from "../components/ui.jsx";

export function AdminPayments() {
  const { toast, confirm } = useFeedback();
  const [filters, setFilters] = useState({ page: 1, status: "" });
  const debouncedSearch = useDebounced(filters.search || "");
  const params = { ...filters, search: debouncedSearch, pageSize: 15 };
  const { data, loading, error, reload } = useAsync(() => api.adminPayments(params), [JSON.stringify(params)]);
  const { data: methods } = useAsync(() => api.adminMethods(), []);
  const [open, setOpen] = useState(null);
  const set = (key, value) => setFilters({ ...filters, [key]: value, page: 1 });

  async function confirmPayment(payment) {
    const answer = await confirm({ title: "Confirmar recebimento", message: `Confirme apenas se ${money(payment.amount)} de ${payment.userName} já entrou na conta da lanchonete.`, confirmLabel: "Confirmar recebimento", reasonLabel: "ID/comprovante da transação (opcional)" });
    if (!answer) return;
    try { await api.adminConfirmPayment(payment.id, answer.reason); toast.success("Pagamento confirmado e conta atualizada."); reload(); } catch (confirmError) { toast.error(confirmError.message); }
  }
  async function refund(payment) {
    const answer = await confirm({ title: "Estornar pagamento", danger: true, confirmLabel: "Estornar", message: `${money(payment.amount)} voltam a ficar em aberto na conta de ${payment.userName}. O registro permanece no histórico.`, reasonLabel: "Motivo do estorno", reasonRequired: true });
    if (!answer) return;
    try {
      const result = await api.adminRefundPayment(payment.id, answer.reason);
      toast.success("Pagamento estornado.");
      if (result.providerRefundRequired) toast.info("Pagamento online: devolva também o dinheiro pelo painel do provedor.");
      reload();
    } catch (refundError) { toast.error(refundError.message); }
  }

  return (
    <section>
      <PageHeader eyebrow="ADMINISTRAÇÃO" title="Pagamentos" subtitle="Pagamentos de todos os clientes. Confirme os Pix recebidos e estorne lançamentos incorretos." />
      <Panel>
        <div className="filters" role="search">
          <div className="field grow"><label htmlFor="p-search">Buscar</label><input id="p-search" type="search" placeholder="Nome, e-mail ou referência" value={filters.search || ""} onChange={event => set("search", event.target.value)} /></div>
          <div className="field"><label htmlFor="p-status">Situação</label>
            <select id="p-status" value={filters.status} onChange={event => set("status", event.target.value)}>
              <option value="">Todas</option><option value="pending">Aguardando confirmação</option><option value="confirmed">Confirmados</option><option value="refunded">Estornados</option><option value="cancelled">Cancelados</option><option value="failed">Falharam</option>
            </select></div>
          <div className="field"><label htmlFor="p-method">Forma</label>
            <select id="p-method" value={filters.method || ""} onChange={event => set("method", event.target.value)}><option value="">Todas</option>{(methods || []).map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</select></div>
          <div className="field"><label htmlFor="p-from">De</label><input id="p-from" type="date" value={filters.from || ""} onChange={event => set("from", event.target.value)} /></div>
          <div className="field"><label htmlFor="p-to">Até</label><input id="p-to" type="date" value={filters.to || ""} onChange={event => set("to", event.target.value)} /></div>
        </div>
        {loading && !data && <Spinner />}
        {error && !data && <ErrorState message={error} onRetry={reload} />}
        {data && !data.rows.length && <EmptyState icon={CreditCard} title="Nenhum pagamento encontrado" />}
        {data?.rows.length > 0 && (
          <div className="table-wrap">
            <table className="table responsive">
              <thead><tr><th scope="col">Data e hora</th><th scope="col">Cliente</th><th scope="col">Forma</th><th scope="col" className="num">Valor</th><th scope="col">Situação</th><th scope="col">Referência</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
              <tbody>
                {data.rows.map(payment => (
                  <tr key={payment.id}>
                    <td data-label="Data e hora">{date(payment.createdAt)} <small>{time(payment.createdAt)}</small></td>
                    <td data-label="Cliente"><strong>{payment.userName}</strong><small>{payment.userEmail}</small></td>
                    <td data-label="Forma">{payment.methodName}<small>{payment.provider ? "online" : payment.createdByRole === "admin" ? "registrado pela administração" : "iniciado pelo cliente"}</small></td>
                    <td data-label="Valor" className="num money">{money(payment.amount)}</td>
                    <td data-label="Situação"><PaymentBadge status={payment.status} />{payment.note && <small>{payment.note}</small>}{payment.refundReason && <small>{payment.refundReason}</small>}</td>
                    <td data-label="Referência" className="ref" title={payment.reference || ""}>{payment.reference || "—"}</td>
                    <td className="actions">
                      <Button size="sm" onClick={() => setOpen(payment.accountId)}>Conta</Button>
                      {payment.status === "pending" && <rowButtons.Confirm onClick={() => confirmPayment(payment)} />}
                      {payment.status === "confirmed" && <rowButtons.Refund onClick={() => refund(payment)} />}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><th scope="row" colSpan="3">Confirmados no filtro</th><td className="num money text-ok">{money(data.confirmedTotal)}</td><td colSpan="3" /></tr></tfoot>
            </table>
          </div>
        )}
        {data && <Pagination page={data.page} pageSize={data.pageSize} count={data.count} onChange={page => setFilters({ ...filters, page })} />}
      </Panel>
      {open && <AccountDetailModal admin accountId={open} onClose={() => setOpen(null)} onChanged={reload} />}
    </section>
  );
}
