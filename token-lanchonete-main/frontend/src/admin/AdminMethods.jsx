import { useState } from "react";
import { Plus } from "lucide-react";
import { api } from "../services/api.js";
import { useAsync } from "../lib/hooks.js";
import { Badge, Button, ErrorState, Field, PageHeader, Panel, Spinner, useFeedback } from "../components/ui.jsx";

export function AdminMethods() {
  const { toast } = useFeedback();
  const { data: methods, loading, error, reload } = useAsync(() => api.adminMethods(), []);
  const [name, setName] = useState("");
  const [selfService, setSelfService] = useState(false);
  const [saving, setSaving] = useState(false);

  async function create(event) {
    event.preventDefault();
    setSaving(true);
    try { await api.adminCreateMethod({ name, selfService }); toast.success("Forma de pagamento criada."); setName(""); setSelfService(false); reload(); } catch (createError) { toast.error(createError.message); } finally { setSaving(false); }
  }
  async function toggle(method, patch, message) {
    try { await api.adminUpdateMethod(method.code, patch); toast.success(message); reload(); } catch (updateError) { toast.error(updateError.message); }
  }

  return (
    <section>
      <PageHeader eyebrow="ADMINISTRAÇÃO" title="Formas de pagamento" subtitle="Escolha o que pode ser registrado nas contas. Dinheiro e cartão são registrados pela administração depois de recebidos." />
      <div className="split">
        <Panel title="Nova forma de pagamento">
          <form onSubmit={create} className="form-stack">
            <Field label="Nome" htmlFor="m-name"><input id="m-name" value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Vale-refeição" maxLength={60} required /></Field>
            <label className="check"><input type="checkbox" checked={selfService} onChange={event => setSelfService(event.target.checked)} /> O cliente pode iniciar este pagamento pelo sistema (fica pendente até a administração confirmar)</label>
            <Button type="submit" variant="primary" icon={Plus} loading={saving}>Adicionar</Button>
          </form>
        </Panel>
        <Panel title="Formas cadastradas">
          {loading && !methods && <Spinner />}
          {error && !methods && <ErrorState message={error} onRetry={reload} />}
          <ul className="method-list">
            {(methods || []).map(method => (
              <li key={method.code}>
                <div><strong>{method.name}</strong>
                  <small>{method.selfService ? "Cliente pode iniciar" : "Registrada pela administração"}{method.onlineProvider ? " · confirmação automática (Mercado Pago)" : method.code === "pix" ? " · Pix estático (confirmação manual)" : ""}</small></div>
                <Badge tone={method.enabled ? "ok" : "muted"}>{method.enabled ? "Ativa" : "Desativada"}</Badge>
                <div className="actions">
                  <Button size="sm" onClick={() => toggle(method, { enabled: !method.enabled }, method.enabled ? "Forma desativada." : "Forma ativada.")}>{method.enabled ? "Desativar" : "Ativar"}</Button>
                  <Button size="sm" variant="ghost" onClick={() => toggle(method, { selfService: !method.selfService }, "Configuração atualizada.")}>{method.selfService ? "Só administração" : "Liberar ao cliente"}</Button>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </section>
  );
}
