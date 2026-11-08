export function Stats({ orders }) {
  const waiting = orders.filter(o => o.status === "aguardando").length;
  const preparing = orders.filter(o => o.status === "preparando").length;
  const ready = orders.filter(o => o.status === "pronto").length;

  return (
    <div className="stats">
      <div className="stat"><span>Aguardando</span><strong>{waiting}</strong></div>
      <div className="stat"><span>Preparando</span><strong>{preparing}</strong></div>
      <div className="stat"><span>Prontos</span><strong>{ready}</strong></div>
    </div>
  );
}
