import { AdminAccounts } from "../admin/AdminAccounts.jsx";
import { AdminAudit } from "../admin/AdminAudit.jsx";
import { AdminDashboard } from "../admin/AdminDashboard.jsx";
import { AdminMethods } from "../admin/AdminMethods.jsx";
import { AdminPayments } from "../admin/AdminPayments.jsx";
import { AdminProducts } from "../admin/AdminProducts.jsx";
import { AdminUserDetail, AdminUsers } from "../admin/AdminUsers.jsx";

/** Painel administrativo: escolhe a seção pela rota (#/admin/usuarios, #/admin/usuarios/<id>...). */
export function AdminPanel({ route, navigate }) {
  const [, section = "dashboard", id] = route.split("/");
  switch (section) {
    case "usuarios": return id ? <AdminUserDetail userId={id} navigate={navigate} /> : <AdminUsers navigate={navigate} />;
    case "contas": return <AdminAccounts navigate={navigate} />;
    case "pagamentos": return <AdminPayments />;
    case "produtos": return <AdminProducts />;
    case "formas": return <AdminMethods />;
    case "auditoria": return <AdminAudit />;
    default: return <AdminDashboard navigate={navigate} />;
  }
}
