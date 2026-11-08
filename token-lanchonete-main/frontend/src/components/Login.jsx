import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import "../login.css";

export function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await onLogin(email, password);
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-showcase" aria-label="Ambiente acolhedor do restaurante">
        <div className="showcase-photo" aria-hidden="true" />

        <div className="showcase-copy">
          <h1>
            Feito com
            <br />
            carinho,
            <br />
            servindo em
            <br />
            família
          </h1>
          <p className="tagline">
            Sabor que reúne,
            <br />
            família que faz
          </p>
        </div>

        <div className="showcase-logo-badge" aria-label="Logo e slogan da Lanchonete Boca Cheia">
          <div className="badge-ring">
            <div className="badge-topline">Feito com carinho, servido em família</div>
            <div className="badge-brand">BOCA CHEIA</div>
            <div className="badge-slogan">Sabor que reúne, família que faz</div>
            <div className="badge-date">• Desde 2020 •</div>
          </div>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-panel-inner">
          <div className="login-brand" aria-label="Lanchonete Boca Cheia">
            <span className="brand-mark">✦</span>
            <span>Lanchonete Boca Cheia</span>
          </div>

          <div className="login-heading">
            <span className="eyebrow">BEM-VINDO</span>
            <h2>Entrar na sua conta</h2>
            <p>Acesse o cardápio e acompanhe sua conta.</p>
          </div>

          <form onSubmit={submit} className="login-form">
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              placeholder="seu@email.com"
              autoComplete="email"
              required
            />

            <label htmlFor="password">Senha</label>
            <div className="password-field">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={event => setPassword(event.target.value)}
                placeholder="Digite sua senha"
                autoComplete="current-password"
                required
              />
              <button type="button" className="password-toggle" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {error && <p className="login-error" role="alert">{error}</p>}

            <button className="primary-btn login-button" disabled={loading}>
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>

        </div>
      </section>
    </main>
  );
}
