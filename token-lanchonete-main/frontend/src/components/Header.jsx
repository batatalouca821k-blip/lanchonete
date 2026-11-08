import { LogOut, Menu } from "lucide-react";

/** Barra superior (aparece no celular/tablet, com o botão do menu). */
export function Header({ user, onMenu, onLogout }) {
  return (
    <header className="topbar">
      <button className="icon-btn" aria-label="Abrir menu" onClick={onMenu}><Menu size={22} /></button>
      <div className="topbar-brand">
        <span>Lanchonete <b>Boca Cheia</b></span>
      </div>
      <span className="topbar-user">Olá, {user.name.split(" ")[0]}</span>
      <button className="icon-btn" aria-label="Sair" onClick={onLogout}><LogOut size={20} /></button>
    </header>
  );
}
