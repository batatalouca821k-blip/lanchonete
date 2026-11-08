import { useCallback, useEffect, useState } from "react";
import { api } from "./services/api.js";
import { useHashRoute } from "./lib/hooks.js";
import { FeedbackProvider, useFeedback } from "./components/ui.jsx";
import { Login } from "./components/Login.jsx";
import { Shell, defaultRoute } from "./components/Shell.jsx";
import { ProductCatalog } from "./components/ProductCatalog.jsx";
import { AccountPanel } from "./components/AccountPanel.jsx";
import { HistoryPanel } from "./components/HistoryPanel.jsx";
import { AdminPanel } from "./components/AdminPanel.jsx";

function readStoredUser() {
  try { return JSON.parse(localStorage.getItem("token-pedidos-user")) || null; } catch { return null; }
}

export default function App() {
  return (
    <FeedbackProvider>
      <AppContent />
    </FeedbackProvider>
  );
}

function AppContent() {
  const { toast } = useFeedback();
  const [user, setUser] = useState(readStoredUser);
  const [route, navigate] = useHashRoute("");

  const logout = useCallback(async ({ remote = true, expired = false } = {}) => {
    if (remote) await api.logout().catch(() => {});
    try {
      localStorage.removeItem("token-pedidos-user");
      localStorage.removeItem("token-pedidos-token");
    } catch { /* armazenamento indisponível */ }
    setUser(null);
    window.location.hash = "";
    if (expired) toast.info("Sua sessão expirou. Entre novamente.");
  }, [toast]);

  // Confere no servidor se a sessão guardada ainda é válida (e atualiza o perfil/permissão).
  useEffect(() => {
    if (!user) return;
    api.me().then(fresh => { setUser(fresh); localStorage.setItem("token-pedidos-user", JSON.stringify(fresh)); }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onExpired = () => logout({ remote: false, expired: true });
    window.addEventListener("session-expired", onExpired);
    return () => window.removeEventListener("session-expired", onExpired);
  }, [logout]);

  async function login(email, password) {
    const response = await api.login({ email, password });
    localStorage.setItem("token-pedidos-user", JSON.stringify(response.user));
    localStorage.setItem("token-pedidos-token", response.accessToken);
    setUser(response.user);
    window.location.hash = `/${defaultRoute(response.user)}`;
  }

  if (!user) return <Login onLogin={login} />;

  const isAdmin = user.role === "admin";
  const current = route || defaultRoute(user);
  let content;
  if (current.startsWith("admin")) content = isAdmin ? <AdminPanel route={current} navigate={navigate} /> : <ProductCatalog />;
  else if (current === "conta") content = <AccountPanel navigate={navigate} />;
  else if (current === "historico") content = <HistoryPanel />;
  else content = <ProductCatalog navigate={navigate} />;

  return (
    <Shell user={user} route={current} navigate={navigate} onLogout={() => logout()}>
      {content}
    </Shell>
  );
}
