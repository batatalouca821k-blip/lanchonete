import { useEffect, useState } from "react";
import { CreditCard, History, LayoutDashboard, LogOut, Receipt, ScrollText, Settings2, ShoppingBag, UtensilsCrossed, Users, Wallet, X } from "lucide-react";
import { Header } from "./Header.jsx";

export const defaultRoute = user => (user?.role === "admin" ? "admin/dashboard" : "produtos");

const customerNav = [
  { key: "produtos", label: "Cardápio", icon: UtensilsCrossed },
  { key: "conta", label: "Minha conta", icon: Wallet },
  { key: "historico", label: "Histórico", icon: History }
];

const adminNav = [
  { key: "admin/dashboard", label: "Painel", icon: LayoutDashboard },
  { key: "admin/usuarios", label: "Usuários", icon: Users },
  { key: "admin/contas", label: "Contas", icon: Receipt },
  { key: "admin/pagamentos", label: "Pagamentos", icon: CreditCard },
  { key: "admin/produtos", label: "Produtos", icon: ShoppingBag },
  { key: "admin/formas", label: "Formas de pagamento", icon: Settings2 },
  { key: "admin/auditoria", label: "Auditoria", icon: ScrollText }
];

export function Shell({ user, route, navigate, onLogout, children }) {
  const [open, setOpen] = useState(false);
  const isAdmin = user.role === "admin";
  const groups = isAdmin ? [{ title: "Administração", items: adminNav }, { title: "Minha área", items: customerNav }] : [{ title: "Menu", items: customerNav }];

  useEffect(() => { setOpen(false); }, [route]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [route]);

  const isActive = key => route === key || (key !== "produtos" && route.startsWith(`${key}/`));

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? "open" : ""}`} aria-label="Navegação principal">
        <div className="sidebar-brand">
          <span>Lanchonete <b>Boca Cheia</b></span>
          <button className="icon-btn sidebar-close" aria-label="Fechar menu" onClick={() => setOpen(false)}><X size={20} /></button>
        </div>
        <nav>
          {groups.map(group => (
            <div className="nav-group" key={group.title}>
              <span className="nav-title">{group.title}</span>
              {group.items.map(({ key, label, icon: Icon }) => (
                <a key={key} href={`#/${key}`} className={`nav-item ${isActive(key) ? "active" : ""}`} aria-current={isActive(key) ? "page" : undefined}
                   onClick={event => { event.preventDefault(); navigate(key); }}>
                  <Icon size={18} aria-hidden="true" />{label}
                </a>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-user">
          <div className="avatar" aria-hidden="true">{user.name.slice(0, 1).toUpperCase()}</div>
          <div><strong>{user.name}</strong><small>{isAdmin ? "Administrador" : "Cliente"}</small></div>
          <button className="icon-btn" aria-label="Sair" title="Sair" onClick={onLogout}><LogOut size={18} /></button>
        </div>
      </aside>
      {open && <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />}
      <div className="main">
        <Header user={user} onMenu={() => setOpen(true)} onLogout={onLogout} />
        <main className="content" id="conteudo">{children}</main>
      </div>
    </div>
  );
}

