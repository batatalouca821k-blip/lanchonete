const nextStatus = {
  aguardando: "preparando",
  preparando: "pronto",
  pronto: "entregue",
  entregue: "entregue"
};

const labels = {
  aguardando: "Aguardando",
  preparando: "Preparando",
  pronto: "Pronto",
  entregue: "Entregue"
};

export function OrderCard({ order, onStatusChange, onDelete, compact = false }) {
  const next = nextStatus[order.status];

  return (
    <article className={`order-card status-${order.status} ${compact ? "compact" : ""}`}>
      <div className="order-top">
        <div>
          <span className="eyebrow">SENHA</span>
          <div className="token">{order.token}</div>
        </div>
        <span className={`status status-${order.status}`}>{labels[order.status]}</span>
      </div>

      <div className="customer">{order.customer}</div>

      <ul className="items">
        {order.items.map((item, index) => (
          <li key={`${item.name}-${index}`}>
            <span>{item.quantity}× {item.name}</span>
            <span>R$ {(item.quantity * item.price).toFixed(2).replace(".", ",")}</span>
          </li>
        ))}
      </ul>

      {!compact && (
        <button
          className="primary-btn small"
          onClick={() => onStatusChange(order.id, next)}
          disabled={order.status === "entregue"}
        >
          {order.status === "aguardando" && "Iniciar preparo"}
          {order.status === "preparando" && "Marcar como pronto"}
          {order.status === "pronto" && "Entregar pedido"}
          {order.status === "entregue" && "Entregue"}
        </button>
      )}

      <div className="order-bottom">
        <strong>R$ {order.total.toFixed(2).replace(".", ",")}</strong>
        <button className="delete-btn" onClick={() => onDelete(order.id)}>Excluir</button>
      </div>
    </article>
  );
}
