import { useState } from "react";
import { ImagePlus, Pencil, Trash2, UtensilsCrossed } from "lucide-react";
import { api, imageUrl } from "../services/api.js";
import { useAsync } from "../lib/hooks.js";
import { money } from "../lib/format.js";
import { Button, EmptyState, ErrorState, Field, PageHeader, Panel, ProductImage, Spinner, useFeedback } from "../components/ui.jsx";

const emptyProduct = { name: "", description: "", price: "", image: null, imageUrl: "" };

export function AdminProducts() {
  const { toast, confirm } = useFeedback();
  const { data: products, loading, error, reload } = useAsync(() => api.listProducts(), []);
  const [form, setForm] = useState(emptyProduct);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const set = event => setForm(current => ({ ...current, [event.target.name]: event.target.value }));

  function edit(product) {
    setEditing(product.id);
    setForm({ name: product.name, description: product.description, price: product.price, image: null, imageUrl: product.image });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function reset() { setEditing(null); setForm(emptyProduct); setFormError(""); }

  async function submit(event) {
    event.preventDefault();
    setFormError("");
    setSaving(true);
    try {
      if (editing) await api.updateProduct(editing, form); else await api.createProduct(form);
      toast.success(editing ? "Produto atualizado." : "Produto cadastrado.");
      reset();
      reload();
    } catch (saveError) {
      setFormError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(product) {
    const answer = await confirm({ title: "Excluir produto", danger: true, confirmLabel: "Excluir", message: `"${product.name}" sai do cardápio. Itens já lançados em contas continuam com nome e preço originais.` });
    if (!answer) return;
    try { await api.deleteProduct(product.id); toast.success("Produto removido do cardápio."); reload(); } catch (removeError) { toast.error(removeError.message); }
  }

  return (
    <section>
      <PageHeader eyebrow="ADMINISTRAÇÃO" title="Produtos" subtitle="Cardápio exibido aos clientes. O preço de cada item lançado é sempre o cadastrado aqui." />
      <div className="split">
        <Panel title={editing ? "Editar produto" : "Novo produto"}>
          <form onSubmit={submit} className="form-stack">
            <Field label="Nome do produto" htmlFor="pr-name"><input id="pr-name" name="name" value={form.name} onChange={set} placeholder="Ex.: Sanduíche especial" required /></Field>
            <Field label="Descrição" htmlFor="pr-desc"><textarea id="pr-desc" name="description" value={form.description} onChange={set} rows="3" placeholder="Ingredientes ou detalhes" required /></Field>
            <Field label="Preço (R$)" htmlFor="pr-price"><input id="pr-price" name="price" type="number" min="0" step="0.01" inputMode="decimal" value={form.price} onChange={set} placeholder="0,00" required /></Field>
            <Field label="Foto do produto" htmlFor="pr-image" hint={`PNG, JPEG, WebP, GIF ou SVG · até 5 MB${form.image ? ` · ${form.image.name}` : editing ? " · mantenha a foto atual ou escolha outra" : ""}`}>
              <input id="pr-image" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" onChange={event => setForm(current => ({ ...current, image: event.target.files[0] || null }))} required={!editing} />
            </Field>
            {formError && <p className="form-error" role="alert">{formError}</p>}
            <Button type="submit" variant="primary" icon={ImagePlus} loading={saving}>{editing ? "Salvar alterações" : "Adicionar ao cardápio"}</Button>
            {editing && <Button type="button" variant="ghost" onClick={reset}>Cancelar edição</Button>}
          </form>
        </Panel>
        <div>
          {loading && !products && <Spinner />}
          {error && !products && <ErrorState message={error} onRetry={reload} />}
          {products && !products.length && <EmptyState icon={UtensilsCrossed} title="Nenhum produto cadastrado" />}
          <div className="admin-products">
            {(products || []).map(product => (
              <article className="product-row" key={product.id}>
                <ProductImage src={imageUrl(product.image)} loading="lazy" />
                <div><strong>{product.name}</strong><p className="muted">{product.description}</p><b className="price">{money(product.price)}</b></div>
                <div className="actions"><Button size="sm" icon={Pencil} onClick={() => edit(product)}>Editar</Button><Button size="sm" variant="ghost-danger" icon={Trash2} onClick={() => remove(product)}>Excluir</Button></div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
