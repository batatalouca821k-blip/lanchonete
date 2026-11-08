export function PublicBoard({ orders }) {
  const visible = orders.filter(order => ["preparando", "pronto"].includes(order.status));
  const ready = visible.filter(order => order.status === "pronto");
  const preparing = visible.filter(order => order.status === "preparando");

  return (
    <section className="board-page">
      <div className="board-head">
        <div>
          <span className="eyebrow">RETIRADA</span>
          <h1>Acompanhe sua senha</h1>
        </div>
        <div className="board-clock">ATENDIMENTO AO VIVO</div>
      </div>

      <div className="board-columns">
        <BoardColumn title="PRONTOS" orders={ready} emphasis />
        <BoardColumn title="EM PREPARO" orders={preparing} />
      </div>

      {!visible.length && (
        <div className="empty board-empty">Aguarde. Nenhum pedido foi chamado ainda.</div>
      )}
    </section>
  );
}

function BoardColumn({ title, orders, emphasis }) {
  return (
    <div className={`board-column ${emphasis ? "emphasis" : ""}`}>
      <h2>{title}</h2>
      <div className="board-tokens">
        {orders.map(order => <div className="board-token" key={order.id}>{order.token}</div>)}
      </div>
    </div>
  );
}
