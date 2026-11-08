import { useMemo, useState } from "react";
import { api } from "../services/api.js";
import { useAsync } from "../lib/hooks.js";
import { money, newKey, parseMoneyInput } from "../lib/format.js";
import { Button, Field, Modal, useFeedback } from "./ui.jsx";

/** Lançar (administrador) ou corrigir um item da conta. */
export function ItemFormModal({ mode = "create", userId, item, onClose, onSaved }) {
  const { toast } = useFeedback();
  const { data: products } = useAsync(() => (mode === "create" ? api.listProducts() : Promise.resolve([])), [mode]);
  const [form, setForm] = useState({
    name: item?.name || "", quantity: item?.quantity || 1,
    unitPrice: item ? item.unitPrice.toFixed(2).replace(".", ",") : "", note: item?.note || "", reason: ""
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const price = parseMoneyInput(form.unitPrice);
  const quantity = Number(form.quantity);
  const subtotal = Number.isFinite(price) && Number.isInteger(quantity) && quantity > 0 ? price * quantity : null;
  const set = event => setForm(current => ({ ...current, [event.target.name]: event.target.value }));

  function pickProduct(event) {
    const product = (products || []).find(candidate => candidate.id === event.target.value);
    if (product) setForm(current => ({ ...current, name: product.name, unitPrice: product.price.toFixed(2).replace(".", ","), productId: product.id }));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (!Number.isFinite(price)) return setError("Informe um preço unitário válido, por exemplo 12,50.");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) return setError("A quantidade deve ser um número inteiro entre 1 e 999.");
    setSaving(true);
    try {
      const payload = { name: form.name, quantity, unitPrice: form.unitPrice, note: form.note };
      const result = mode === "create"
        ? await api.adminAddItem(userId, { ...payload, productId: form.productId })
        : await api.adminUpdateItem(item.id, { ...payload, reason: form.reason });
      toast.success(mode === "create" ? "Item lançado na conta." : "Item corrigido.");
      onSaved(result);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={mode === "create" ? "Lançar item na conta" : "Corrigir item"} onClose={onClose} size="sm">
      <form onSubmit={submit} className="form-stack">
        {mode === "create" && (
          <Field label="Escolher do cardápio (opcional)" htmlFor="pick-product">
            <select id="pick-product" defaultValue="" onChange={pickProduct}>
              <option value="">— item avulso —</option>
              {(products || []).map(product => <option key={product.id} value={product.id}>{product.name} · {money(product.price)}</option>)}
            </select>
          </Field>
        )}
        <Field label="Nome do item" htmlFor="item-name"><input id="item-name" name="name" value={form.name} onChange={set} maxLength={160} required /></Field>
        <div className="form-row">
          <Field label="Quantidade" htmlFor="item-qty"><input id="item-qty" name="quantity" type="number" min="1" max="999" step="1" inputMode="numeric" value={form.quantity} onChange={set} required /></Field>
          <Field label="Preço unitário (R$)" htmlFor="item-price"><input id="item-price" name="unitPrice" inputMode="decimal" placeholder="0,00" value={form.unitPrice} onChange={set} required /></Field>
        </div>
        <Field label="Observação" htmlFor="item-note"><input id="item-note" name="note" value={form.note} onChange={set} maxLength={255} placeholder="Opcional" /></Field>
        {mode === "edit" && <Field label="Motivo da correção" htmlFor="item-reason"><input id="item-reason" name="reason" value={form.reason} onChange={set} maxLength={255} placeholder="Opcional, mas fica no histórico" /></Field>}
        <div className="subtotal-line"><span>Subtotal</span><strong>{subtotal === null ? "—" : money(subtotal)}</strong></div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" loading={saving}>{mode === "create" ? "Lançar item" : "Salvar correção"}</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Administrador registra um recebimento já realizado (dinheiro, cartão na maquininha, Pix conferido...). */
export function RecordPaymentModal({ account, onClose, onSaved }) {
  const { toast } = useFeedback();
  const { data: methods } = useAsync(() => api.adminMethods(), []);
  const enabled = (methods || []).filter(method => method.enabled);
  const [amount, setAmount] = useState(account.balance.toFixed(2).replace(".", ","));
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const chosen = method || enabled[0]?.code || "";
  const value = parseMoneyInput(amount);
  const idempotencyKey = useMemo(newKey, [amount, chosen]); // mesma tentativa = mesma chave; valor novo = chave nova
  const remaining = Number.isFinite(value) ? Math.max(0, account.balance - value) : null;

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (!Number.isFinite(value) || value <= 0) return setError("Informe um valor maior que zero, com até 2 casas decimais.");
    if (value > account.balance + 0.0001) return setError(`O valor não pode ser maior que o saldo pendente (${money(account.balance)}).`);
    setSaving(true);
    try {
      await api.adminRecordPayment(account.id, { amount, method: chosen, reference, note, idempotencyKey });
      toast.success(value >= account.balance - 0.0001 ? "Pagamento registrado: conta quitada." : `Pagamento registrado. Saldo restante: ${money(remaining)}.`);
      onSaved();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Registrar pagamento" onClose={onClose} size="sm">
      <form onSubmit={submit} className="form-stack">
        <p className="muted">Conta de <strong>{account.userName}</strong> · saldo pendente <strong>{money(account.balance)}</strong></p>
        <Field label="Valor recebido (R$)" htmlFor="pay-amount" hint={remaining === null ? undefined : `Saldo restante após este pagamento: ${money(remaining)}`}>
          <div className="input-action">
            <input id="pay-amount" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} required />
            <Button type="button" size="sm" onClick={() => setAmount(account.balance.toFixed(2).replace(".", ","))}>Quitar</Button>
          </div>
        </Field>
        <Field label="Forma de pagamento" htmlFor="pay-method">
          <select id="pay-method" value={chosen} onChange={event => setMethod(event.target.value)} required>
            {enabled.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}
          </select>
        </Field>
        <Field label="Referência da transação" htmlFor="pay-ref"><input id="pay-ref" value={reference} onChange={event => setReference(event.target.value)} maxLength={120} placeholder="NSU, ID do Pix... (se houver)" /></Field>
        <Field label="Observação" htmlFor="pay-note"><input id="pay-note" value={note} onChange={event => setNote(event.target.value)} maxLength={255} placeholder="Opcional" /></Field>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" loading={saving} disabled={!chosen}>Registrar pagamento</Button>
        </div>
      </form>
    </Modal>
  );
}
