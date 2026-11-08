import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { CheckCircle2, Copy, QrCode } from "lucide-react";
import { api } from "../services/api.js";
import { useAsync } from "../lib/hooks.js";
import { date, money, newKey, parseMoneyInput, time } from "../lib/format.js";
import { Button, Field, Modal, Spinner, useFeedback } from "./ui.jsx";

/** Soma dos pagamentos pendentes ainda válidos (já "reservam" parte do saldo). */
export function reservedAmount(account) {
  return account.payments.filter(payment => payment.status === "pending" && (!payment.expiresAt || new Date(payment.expiresAt) > new Date())).reduce((sum, payment) => sum + payment.amount, 0);
}

export function PaymentModal({ account, resume, onClose, onDone }) {
  const { toast } = useFeedback();
  const { data: methods } = useAsync(() => api.paymentMethods(), []);
  const available = Math.round((account.balance - reservedAmount(account)) * 100) / 100;
  const [amount, setAmount] = useState(available.toFixed(2).replace(".", ","));
  const [method, setMethod] = useState("");
  const [payment, setPayment] = useState(resume || null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const chosen = method || methods?.[0]?.code || "pix";

  const value = parseMoneyInput(amount);
  const valid = Number.isFinite(value) && value > 0 && value <= available + 0.0001;
  const remaining = Number.isFinite(value) ? Math.max(0, Math.round((account.balance - value) * 100) / 100) : null;
  const idempotencyKey = useMemo(newKey, [amount, chosen, account.id]); // mesma tentativa = mesma chave (evita cobrança duplicada)

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (!Number.isFinite(value) || value <= 0) return setError("Informe um valor maior que zero, com até 2 casas decimais.");
    if (value > available + 0.0001) return setError(`O valor máximo agora é ${money(available)}.`);
    setSubmitting(true);
    try {
      setPayment(await api.payMyAccount({ accountId: account.id, amount, method: chosen, idempotencyKey }));
    } catch (payError) {
      setError(payError.message);
    } finally {
      setSubmitting(false);
    }
  }

  // Acompanha o pagamento: só mostramos "pago" quando o servidor confirmar.
  const finished = payment && payment.status !== "pending";
  const paymentRef = useRef(payment);
  paymentRef.current = payment;
  useEffect(() => {
    if (!payment || payment.status !== "pending") return undefined;
    const timer = setInterval(async () => {
      try {
        const current = paymentRef.current;
        const next = current.provider ? await api.refreshPayment(current.id) : await api.getPayment(current.id);
        if (next.status !== "pending") { setPayment(next); if (next.status === "confirmed") onDone(); }
      } catch { /* tenta de novo no próximo ciclo */ }
    }, 5000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payment?.id, payment?.status]);

  async function copy() {
    try { await navigator.clipboard.writeText(payment.pixPayload); setCopied(true); setTimeout(() => setCopied(false), 2200); } catch { toast.error("Não foi possível copiar. Selecione o código e copie manualmente."); }
  }
  async function cancel() {
    try { setPayment(await api.cancelPayment(payment.id)); toast.info("Cobrança cancelada."); onDone(); } catch (cancelError) { toast.error(cancelError.message); }
  }

  if (!payment) {
    return (
      <Modal title="Pagar conta" onClose={onClose} size="sm">
        <form onSubmit={submit} className="form-stack">
          <div className="pay-balance"><span>Saldo pendente</span><strong>{money(account.balance)}</strong>{available < account.balance && <small>{money(account.balance - available)} já em cobrança aguardando confirmação</small>}</div>
          <Field label="Quanto você quer pagar agora? (R$)" htmlFor="pay-value" hint={remaining === null ? "Use vírgula para os centavos, ex.: 25,50" : remaining === 0 ? "Este pagamento quita a conta." : `Saldo restante depois deste pagamento: ${money(remaining)}`}>
            <input id="pay-value" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} aria-invalid={!valid} required autoFocus />
          </Field>
          <div className="chips">
            <button type="button" className="chip" onClick={() => setAmount(available.toFixed(2).replace(".", ","))}>Valor total ({money(available)})</button>
            {available >= 2 && <button type="button" className="chip" onClick={() => setAmount((Math.floor(available * 50) / 100).toFixed(2).replace(".", ","))}>Metade</button>}
          </div>
          {methods?.length > 1 && (
            <Field label="Forma de pagamento" htmlFor="pay-method">
              <select id="pay-method" value={chosen} onChange={event => setMethod(event.target.value)}>{methods.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</select>
            </Field>
          )}
          {methods && !methods.length && <p className="form-error">Nenhuma forma de pagamento disponível. Fale com o atendimento.</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="modal-actions">
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" variant="primary" icon={QrCode} loading={submitting} disabled={!valid || !methods?.length}>Gerar Pix de {valid ? money(value) : "…"}</Button>
          </div>
        </form>
      </Modal>
    );
  }

  return (
    <Modal title={payment.status === "confirmed" ? "Pagamento confirmado" : "Pague com Pix"} onClose={onClose} size="sm">
      <div className="pix-box">
        {payment.status === "confirmed" && (
          <div className="state success"><CheckCircle2 size={44} /><strong>{money(payment.amount)} recebidos</strong><p className="muted">Obrigado! Sua conta já foi atualizada.</p><Button variant="primary" onClick={onClose}>Fechar</Button></div>
        )}
        {payment.status === "pending" && (
          <>
            <p className="pix-amount">{money(payment.amount)}</p>
            {payment.pixPayload ? <div className="qr"><QRCodeSVG value={payment.pixPayload} size={200} marginSize={2} /></div> : <Spinner label="Gerando código..." />}
            <p className="muted center">Abra o app do seu banco e escaneie o QR Code, ou use o Pix copia e cola.</p>
            {payment.pixPayload && (
              <div className="copy-row">
                <input aria-label="Código Pix copia e cola" value={payment.pixPayload} readOnly onFocus={event => event.target.select()} />
                <Button icon={Copy} onClick={copy}>{copied ? "Copiado" : "Copiar"}</Button>
              </div>
            )}
            <div className="notice notice-info" role="status">
              <strong>Aguardando confirmação</strong>
              <span>{payment.provider ? "Assim que o banco confirmar o Pix, o saldo é atualizado automaticamente." : "Sua conta só é atualizada depois que o atendimento confirmar o recebimento do Pix."}</span>
              {payment.expiresAt && <small>Cobrança válida até {date(payment.expiresAt)} {time(payment.expiresAt)}</small>}
            </div>
            <div className="modal-actions"><Button variant="ghost-danger" onClick={cancel}>Cancelar cobrança</Button><Button onClick={onClose}>Fechar</Button></div>
          </>
        )}
        {finished && payment.status !== "confirmed" && (
          <div className="state"><strong>{payment.status === "cancelled" ? "Cobrança cancelada" : "Não foi possível concluir o pagamento"}</strong><p className="muted">O valor continua em aberto na sua conta.</p><Button onClick={onClose}>Fechar</Button></div>
        )}
      </div>
    </Modal>
  );
}
