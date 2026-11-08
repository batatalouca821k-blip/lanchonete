import { useState } from "react";
import { api } from "../services/api.js";

export function TokenSearch() {
  const [token, setToken] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function search(event) {
    event.preventDefault();
    if (!token.trim()) return;
    try {
      setError("");
      setResult(await api.findByToken(token));
    } catch {
      setResult(null);
      setError("Senha não encontrada.");
    }
  }

  return (
    <section className="panel search-panel">
      <span className="eyebrow">CONSULTA</span>
      <h2>Acompanhar pedido</h2>
      <form onSubmit={search} className="search-row">
        <input value={token} onChange={e => setToken(e.target.value)} placeholder="Digite a senha" />
        <button className="secondary-btn">Buscar</button>
      </form>
      {result && (
        <div className="search-result">
          <span>Senha <strong>{result.token}</strong></span>
          <span className={`status status-${result.status}`}>{result.status}</span>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
