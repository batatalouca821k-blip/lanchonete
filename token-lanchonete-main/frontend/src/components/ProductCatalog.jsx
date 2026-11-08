import { useState } from "react";
import { Minus, Plus, ShoppingCart, UtensilsCrossed } from "lucide-react";
import { api, imageUrl } from "../services/api.js";
import { useAsync } from "../lib/hooks.js";
import { monthYear, money } from "../lib/format.js";
import { Button, EmptyState, ErrorState, PageHeader, ProductImage, Spinner, useFeedback } from "./ui.jsx";

export function ProductCatalog({ navigate }) {
  const { toast } = useFeedback();
  const { data: products, loading, error, reload } = useAsync(() => api.listProducts(), []);
  const [quantities, setQuantities] = useState({});
  const [adding, setAdding] = useState("");

  const quantityOf = id => quantities[id] || 1;
  const change = (id, delta) => setQuantities(current => ({ ...current, [id]: Math.min(99, Math.max(1, (current[id] || 1) + delta)) }));

  async function add(product) {
    setAdding(product.id);
    try {
      const quantity = quantityOf(product.id);
      const account = await api.addMyItem(product.id, quantity);
      setQuantities(current => ({ ...current, [product.id]: 1 }));
      toast.success(`${quantity}× ${product.name} adicionado à sua conta. Total: ${money(account.totalAmount)}.`);
    } catch (addError) {
      toast.error(addError.message);
    } finally {
      setAdding("");
    }
  }

  return (
    <section>
      <PageHeader
        eyebrow="CARDÁPIO"
        title="Escolha o que vai para sua conta"
        subtitle={`Adicione os itens consumidos e acompanhe o total — ${monthYear(new Date())}.`}
        actions={navigate && <Button icon={ShoppingCart} onClick={() => navigate("conta")}>Ver minha conta</Button>}
      />
      {loading && !products && <Spinner label="Carregando cardápio..." />}
      {error && !products && <ErrorState message={error} onRetry={reload} />}
      {products && !products.length && <EmptyState icon={UtensilsCrossed} title="O cardápio está vazio">Peça a um administrador para cadastrar os produtos.</EmptyState>}
      <div className="catalog-grid">
        {(products || []).map(product => (
          <article className="product-card" key={product.id}>
            <ProductImage src={imageUrl(product.image)} alt={product.name} loading="lazy" />
            <div className="product-body">
              <h2>{product.name}</h2>
              <p className="muted">{product.description}</p>
              <div className="product-foot">
                <strong className="price">{money(product.price)}</strong>
                <div className="stepper" role="group" aria-label={`Quantidade de ${product.name}`}>
                  <button type="button" aria-label="Diminuir" onClick={() => change(product.id, -1)} disabled={quantityOf(product.id) <= 1}><Minus size={14} /></button>
                  <output aria-live="polite">{quantityOf(product.id)}</output>
                  <button type="button" aria-label="Aumentar" onClick={() => change(product.id, 1)}><Plus size={14} /></button>
                </div>
              </div>
              <Button variant="primary" icon={Plus} loading={adding === product.id} onClick={() => add(product)}>
                Adicionar · {money(product.price * quantityOf(product.id))}
              </Button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
