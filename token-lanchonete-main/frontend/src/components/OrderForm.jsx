import { useState } from "react";

export function OrderForm({ items, onSubmit }) {
  const [customer, setCustomer] = useState("");
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);

  function addItem(item) {
    setSelected(current => {
      const found = current.find(x => x.name === item.name);
      if (found) return current.map(x => x.name === item.name ? { ...x, quantity: x.quantity + 1 } : x);
      return [...current, { ...item, quantity: 1 }];
    });
  }

  function removeItem(name) {
    setSelected(current => current.flatMap(item => {
      if (item.name !== name) return [item];
      if (item.quantity > 1) return [{ ...item, quantity: item.quantity - 1 }];
      return [];
    }));
  }

  const total = selected.reduce((sum, item) => sum + item.price * item.quantity, 0);

  async function submit(event) {
    event.preventDefault();
    if (!selected.length) return;
    setLoading(true);
    try {
      await onSubmit(customer, selected);
      setSelected([]);
      setCustomer("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="panel form-panel" onSubmit={submit}>
      <div className="panel-title">
        <div>
          <span className="eyebrow">BALCÃO</span>
          <h2>Novo pedido</h2>
        </div>
        <span className="step">01</span>
      </div>

      <label>Nome do cliente</label>
      <input
        value={customer}
        onChange={e => setCustomer(e.target.value)}
        placeholder="Ex.: João"
        maxLength={50}
      />

      <label>Adicionar itens</label>
      <div className="product-list">
        {items.map(item => (
          <button type="button" className="product" key={item.name} onClick={() => addItem(item)}>
            <img src={item.image} alt="" />
            <span className="product-info">
              <strong>{item.name}</strong>
              <small>{item.description}</small>
              <b>R$ {item.price.toFixed(2).replace(".", ",")}</b>
            </span>
            <span className="product-add" aria-hidden="true">+</span>
          </button>
        ))}
      </div>

      <div className="selected-list">
        {selected.map(item => (
          <div className="selected-item" key={item.name}>
            <span>{item.quantity}× {item.name}</span>
            <div>
              <strong>R$ {(item.price * item.quantity).toFixed(2).replace(".", ",")}</strong>
              <button type="button" onClick={() => removeItem(item.name)}>−</button>
            </div>
          </div>
        ))}
      </div>

      <div className="total">
        <span>Total</span>
        <strong>R$ {total.toFixed(2).replace(".", ",")}</strong>
      </div>

      <button className="primary-btn" disabled={!selected.length || loading}>
        {loading ? "Gerando..." : "Gerar senha"}
      </button>
    </form>
  );
}
